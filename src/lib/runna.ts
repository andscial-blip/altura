import "server-only";
import { q, tx } from "@/lib/db";
import { finishRun, sanitize, startRun, upsertActivity } from "@/lib/ingest";
import { goalFromPlanned, icsEvents, normTitle, parseEvent, type Completed, type Planned } from "@/lib/runna-parse";

/**
 * Runna: sola lettura del feed iCal ufficiale (RUNNA_ICS_URL, solo su Vercel). Nessuna API Runna esiste o viene simulata.
 * - sedute programmate → planned_workouts (con storico degli spostamenti di data);
 * - sedute registrate da Runna → fonte "runna" collegata all'attività Garmin corrispondente (Runna riporta l'id Garmin).
 */
export const HOME_TZ = "Indian/Antananarivo";

export function localDate(utcIso: string, tz: string | null | undefined): string {
  const d = new Date(utcIso);
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz || HOME_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  } catch {
    return new Intl.DateTimeFormat("en-CA", { timeZone: HOME_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  }
}

/** "2026-11-03T05:30:00" nel fuso tz → ISO UTC. */
export function zonedToUtc(local: string, tz: string): string {
  const guess = new Date(local + "Z");
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
    .formatToParts(guess).reduce<Record<string, string>>((o, p) => ((o[p.type] = p.value), o), {});
  const asTz = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return new Date(guess.getTime() - (asTz - guess.getTime())).toISOString();
}

export function completedUtc(c: Completed): string {
  if (c.start_utc.endsWith("Z")) return new Date(c.start_utc).toISOString();
  return zonedToUtc(c.start_utc, c.tz || HOME_TZ);
}

/** Abbina un eseguito al programmato: stessa data (±1 giorno) e stesso titolo, altrimenti stesso tipo. */
export function linkPlanned(c: { date: string; title: string; type: string }, planned: { key: string; day: string; title: string; type: string; taken: boolean }[]) {
  let best: [number, string] | null = null;
  for (const p of planned) {
    if (p.taken) continue;
    const dd = Math.abs((Date.parse(p.day) - Date.parse(c.date)) / 86400_000);
    if (dd > 1) continue;
    const score = (normTitle(p.title) === normTitle(c.title) ? 0 : p.type === c.type ? 1 : 9) * 10 + dd;
    if (score < 20 && (!best || score < best[0])) best = [score, p.key];
  }
  return best?.[1] ?? null;
}

export function runnaConfigured(): boolean {
  return !!process.env.RUNNA_ICS_URL;
}

export async function syncRunna(): Promise<{ status: string; counts: Record<string, number>; message: string }> {
  const runId = await startRun("runna");
  const counts = { events: 0, planned: 0, new: 0, moved: 0, removed: 0, completed: 0, linked_garmin: 0, matched: 0, skipped: 0, goals: 0, goals_archived: 0 };
  try {
    const raw = process.env.RUNNA_ICS_URL;
    if (!raw) throw new Error("Indirizzo iCal di Runna non configurato su Vercel (RUNNA_ICS_URL).");
    const url = raw.replace(/[\s\u200b-\u200d\u2060\ufeff]/g, "").replace(/^webcal:\/\//i, "https://");
    const res = await fetch(url, { headers: { "User-Agent": "altura/1.0", Accept: "text/calendar" }, cache: "no-store", signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`Runna ha risposto ${res.status} al feed del calendario`);
    const text = await res.text();
    if (!text.includes("BEGIN:VCALENDAR")) throw new Error("Il feed Runna non è un calendario iCal");
    const events = icsEvents(text).filter((e) => e.status !== "cancelled");
    counts.events = events.length;
    const planned: Planned[] = [], completed: Completed[] = [];
    let skipped = 0;
    for (const e of events) {
      try {
        const [k, v] = parseEvent(e);
        if (k === "planned") { if (!/^\d{4}-\d{2}-\d{2}$/.test(v.date)) { skipped++; continue; } planned.push(v); }
        else if (k === "completed") { completedUtc(v); completed.push(v); }
      } catch { skipped++; }
    }
    counts.skipped = skipped;
    const now = new Date().toISOString();

    // sedute registrate (una per orario di partenza, come nell'app attuale)
    const byStart = new Map<string, Completed>();
    for (const c of completed.sort((a, b) => (a.updated ?? "").localeCompare(b.updated ?? ""))) byStart.set(completedUtc(c), c);
    const doneRows: { aid: string; date: string; title: string; type: string }[] = [];
    for (const [startUtc, c] of byStart) {
      let link: string | null = null;
      if (c.garmin_id) {
        const r = await q<{ activity_id: string }>("select activity_id from sport.activity_sources where source='garmin' and external_id=$1", [c.garmin_id]);
        link = r[0]?.activity_id ?? null;
        if (link) counts.linked_garmin++;
      }
      const r = await upsertActivity({
        source: "runna", external_id: c.event_id ?? startUtc, acquisition: "ical", raw: c, link_activity_id: link,
        norm: { sport: "run", start_utc: startUtc, name: c.title, distance_m: c.km ? Math.round(c.km * 1000) : null, elapsed_s: c.time_s },
      });
      counts.completed++;
      doneRows.push({ aid: r.id, date: localDate(startUtc, c.tz), title: c.title, type: c.type });
    }

    // sedute programmate
    await tx(async (cl) => {
      const cur = await cl.query<{ key: string; day: string; state: string; history: unknown[] }>(
        "select key, to_char(day,'YYYY-MM-DD') as day, state, history from sport.planned_workouts where source = 'runna'");
      const old = new Map(cur.rows.map((r) => [r.key, r]));
      const seen = new Set<string>();
      for (const p of planned) {
        seen.add(p.key);
        const o = old.get(p.key);
        const hist = (o?.history ?? []) as unknown[];
        if (!o) counts.new++;
        else if (o.day !== p.date) { hist.push({ date: o.day, until: now }); counts.moved++; }
        await cl.query(
          `insert into sport.planned_workouts(key, source, plan_id, week, day, title, type, km, duration_min_s, duration_max_s, description, structure, state, history, updated_at)
           values ($1,'runna',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,'programmato',$12::jsonb, now())
           on conflict (key) do update set week=excluded.week, day=excluded.day, title=excluded.title, type=excluded.type, km=excluded.km,
             duration_min_s=excluded.duration_min_s, duration_max_s=excluded.duration_max_s, description=excluded.description,
             structure=excluded.structure, history=excluded.history,
             state = case when sport.planned_workouts.completed_activity is null then 'programmato' else sport.planned_workouts.state end,
             updated_at = case when sport.planned_workouts.day is distinct from excluded.day or sport.planned_workouts.structure is distinct from excluded.structure then now() else sport.planned_workouts.updated_at end`,
          [p.key, p.kind, p.week, p.date, p.title, p.type, p.km, p.dur_min_s, p.dur_max_s, p.text, JSON.stringify({ header: p.header, steps: p.steps }), JSON.stringify(hist)]);
        counts.planned++;
      }
      // finestra letta: le sedute che ricadono qui ma non ci sono più sono state tolte da Runna
      const days = planned.map((p) => p.date).sort();
      if (days.length) {
        const r = await cl.query(
          `update sport.planned_workouts set state = 'rimosso', updated_at = now()
            where source = 'runna' and state = 'programmato' and completed_activity is null and day between $1 and $2 and not (key = any($3))`,
          [days[0], days[days.length - 1], [...seen]]);
        counts.removed = r.rowCount ?? 0;
      }
      // abbinamento eseguito ↔ programmato
      const pl = await cl.query<{ key: string; day: string; title: string; type: string; completed_activity: string | null }>(
        "select key, to_char(day,'YYYY-MM-DD') as day, title, type, completed_activity from sport.planned_workouts where source='runna'");
      const list = pl.rows.map((r) => ({ ...r, taken: !!r.completed_activity }));
      const already = new Set(pl.rows.map((r) => r.completed_activity).filter(Boolean));
      for (const d of doneRows.sort((a, b) => a.date.localeCompare(b.date))) {
        if (already.has(d.aid)) continue;
        const key = linkPlanned(d, list);
        if (!key) continue;
        await cl.query("update sport.planned_workouts set completed_activity = $2, state = 'completato', updated_at = now() where key = $1", [key, d.aid]);
        const it = list.find((x) => x.key === key); if (it) it.taken = true;
        counts.matched++;
      }
      // obiettivi ricavati dal piano: gara e test; quelli tolti da Runna vengono archiviati
      const gw = await cl.query<{ key: string; day: string; title: string; type: string; km: string | null; description: string | null; state: string }>(
        "select key, to_char(day,'YYYY-MM-DD') as day, title, type, km::text, description, state from sport.planned_workouts where source='runna' and type in ('gara','test')");
      const live: string[] = [];
      for (const w of gw.rows) {
        const g = goalFromPlanned(w);
        if (!g || w.state === "rimosso") continue;
        live.push(g.id);
        await cl.query(
          `insert into sport.goals(id, name, kind, sport, target_date, target, active) values ($1,$2,$3,'run',$4,$5::jsonb,true)
           on conflict (id) do update set name = excluded.name, kind = excluded.kind, target_date = excluded.target_date, target = excluded.target`,
          [g.id, g.name, g.kind, g.target_date, JSON.stringify(g.target)]);
      }
      const off = await cl.query("update sport.goals set active = false where id like 'runna:%' and active and not (id = any($1))", [live]);
      counts.goals = live.length;
      counts.goals_archived = off.rowCount ?? 0;
    });
    await finishRun(runId, "ok", counts);
    return { status: "ok", counts, message: "ok" };
  } catch (e) {
    const message = sanitize(e);
    await finishRun(runId, "error", counts, message);
    return { status: "error", counts, message };
  }
}
