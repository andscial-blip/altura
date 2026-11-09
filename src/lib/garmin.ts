import "server-only";
import { decrypt, encrypt } from "@/lib/session";
import { getSetting, setSetting, tx } from "@/lib/db";
import { finishRun, getState, replaceLaps, sanitize, setState, startRun, upsertActivity, upsertDaily, upsertStreams } from "@/lib/ingest";
import { activityList, dailyRows, garminExtras, garminNorm, typeKey, wantsFit, type GarminSummary } from "@/lib/garmin-map";
import { extractFit, parseFit } from "@/lib/fit";

/**
 * Garmin Connect Personal API (accesso personale ufficiale di Garmin, chiave dell'account del proprietario).
 * La chiave sta solo nella variabile d'ambiente GARMIN_API_KEY su Vercel; il token derivato è salvato cifrato.
 */
const BASE = "https://personal.connectapi.garmin.com";
const TOKEN_PATH = "/personalapitoken-service/personal-api/personal-api-key/token";
const PAGE = 50;
const FIRST_DAYS = 120;
const INCR_OVERLAP_DAYS = 2;
const DAILY_FIRST_DAYS = 120;
const DAILY_INCR_DAYS = 14;
const DAILY_CHUNK = 28;
const PACE_MS = 400;

export class GarminError extends Error {
  constructor(message: string, readonly kind: "config" | "auth" | "policy" | "network" | "server" | "budget") { super(message); }
}

type State = {
  last_activity_start?: string;   // inizio dell'attività più recente già vista (UTC ISO)
  backfill_before?: string | null; // per lo storico: data (YYYY-MM-DD) fino a cui si è già scesi
  history_from?: string | null;    // data da cui importare lo storico (scelta in Impostazioni)
  fit_pending?: { id: string; tries: number }[];
  daily_until?: string;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

function jwtExp(t: string): number {
  try { return Number(JSON.parse(Buffer.from(t.split(".")[1]!, "base64url").toString()).exp) * 1000 || 0; } catch { return 0; }
}

async function token(force = false): Promise<string> {
  // la chiave incollata può contenere spazi o caratteri invisibili (a capo, U+2028, BOM): si tolgono
  const key = (process.env.GARMIN_API_KEY ?? "").replace(/[\s\u200b-\u200d\u2060\ufeff]/g, "");
  if (!key) throw new GarminError("Chiave Garmin non configurata su Vercel (GARMIN_API_KEY).", "config");
  if (!force) {
    const c = await getSetting<{ enc: string; exp: number }>("garmin_token");
    if (c && c.exp - Date.now() > 3600_000) { try { return decrypt(c.enc); } catch { /* chiave cambiata: si rigenera */ } }
  }
  const res = await fetch(BASE + TOKEN_PATH, { method: "POST", headers: { Accept: "*/*", Authorization: `ApiKey ${key}` }, cache: "no-store" });
  if (res.status === 401 || res.status === 403) throw new GarminError("Garmin ha rifiutato la chiave: va rigenerata nell'account Garmin.", "auth");
  if (!res.ok) throw new GarminError(`Servizio token Garmin non disponibile (${res.status}).`, "server");
  const t = (await res.text()).trim();
  const exp = jwtExp(t) || Date.now() + 6 * 3600_000;
  if (!/^eyJ/.test(t)) throw new GarminError("Risposta del servizio token Garmin non valida.", "server");
  await setSetting("garmin_token", { enc: encrypt(t), exp });
  return t;
}

class Client {
  private t: string | null = null;
  calls = 0;
  constructor(private deadline: number) {}

  private async raw(path: string, params?: Record<string, string | number>, accept = "application/json"): Promise<Response> {
    const url = BASE + path + (params ? "?" + new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])) : "");
    for (let attempt = 0; attempt < 4; attempt++) {
      if (Date.now() > this.deadline) throw new GarminError("tempo a disposizione esaurito", "budget");
      if (!this.t) this.t = await token(attempt > 0);
      if (this.calls++) await sleep(PACE_MS);
      let res: Response;
      try {
        res = await fetch(url, { headers: { Accept: accept, Authorization: `Bearer ${this.t}` }, cache: "no-store", signal: AbortSignal.timeout(25_000) });
      } catch {
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      if (res.status === 401 && attempt === 0) { this.t = await token(true); continue; }
      if (res.status === 403) throw new GarminError("Garmin nega l'accesso a questo dato con la chiave personale.", "policy");
      if (res.status === 429 || res.status >= 500) {
        const ra = Number(res.headers.get("retry-after"));
        const wait = Math.min(Number.isFinite(ra) && ra > 0 ? ra * 1000 : 2000 * 2 ** attempt, 20_000);
        if (Date.now() + wait > this.deadline) throw new GarminError(`Garmin occupato (${res.status})`, "budget");
        await sleep(wait);
        continue;
      }
      if (!res.ok) throw new GarminError(`Garmin ha risposto ${res.status} su ${path.split("/")[1]}`, "server");
      return res;
    }
    throw new GarminError("Garmin non raggiungibile dopo vari tentativi", "network");
  }

  async json(path: string, params?: Record<string, string | number>): Promise<unknown> {
    const res = await this.raw(path, params);
    const txt = await res.text();
    return txt ? JSON.parse(txt) : null;
  }

  async bytes(path: string): Promise<Uint8Array> {
    const res = await this.raw(path, undefined, "application/zip, application/x-zip-compressed, application/octet-stream");
    return new Uint8Array(await res.arrayBuffer());
  }
}

export type GarminCounts = { activities: number; created: number; linked: number; fit: number; fit_failed: number; daily_rows: number; calls: number };

/**
 * Sincronizzazione incrementale con tempo massimo (le funzioni Vercel hanno un limite).
 * Riprende da dove si era fermata: il lavoro non fatto resta in sync_state.
 */
export async function syncGarmin(opts: { budgetMs?: number; backfillDays?: number } = {}): Promise<{ status: string; counts: GarminCounts; message: string }> {
  const runId = await startRun("garmin");
  const deadline = Date.now() + (opts.budgetMs ?? 50_000);
  const counts: GarminCounts = { activities: 0, created: 0, linked: 0, fit: 0, fit_failed: 0, daily_rows: 0, calls: 0 };
  const st = (await getState<State>("garmin")) as State;
  const c = new Client(deadline);
  const notes: string[] = [];
  const info: string[] = [];
  let status: "ok" | "partial" | "error" = "ok";
  try {
    // 1) elenco attività: dall'ultima vista (meno 2 giorni di sovrapposizione) a oggi; prima volta 120 giorni
    const now = new Date();
    const from = st.last_activity_start
      ? new Date(Date.parse(st.last_activity_start) - INCR_OVERLAP_DAYS * 86400_000)
      : new Date(now.getTime() - (opts.backfillDays ?? FIRST_DAYS) * 86400_000);
    const pending = new Map((st.fit_pending ?? []).map((p) => [p.id, p]));
    let newest = st.last_activity_start ?? null;
    for (let start = 0; start < PAGE * 40; start += PAGE) {
      const list = activityList(await c.json("/activitylist-service/activities/search/activities",
        { start, limit: PAGE, startDate: isoDay(from), endDate: isoDay(new Date(now.getTime() + 86400_000)) }));
      for (const s of list) {
        const id = String(s.activityId ?? "");
        if (!id) continue;
        const norm = garminNorm(s);
        if (!norm.start_utc) continue;
        const r = await upsertActivity({ source: "garmin", external_id: id, acquisition: "api", raw: { summary: s, extras: garminExtras(s) }, norm });
        counts.activities++; if (r.created) counts.created++; if (r.linked) counts.linked++;
        if (wantsFit(typeKey(s)) && !(await hasGarminStreams(r.id))) pending.set(id, pending.get(id) ?? { id, tries: 0 });
        if (!newest || String(norm.start_utc) > newest) newest = String(norm.start_utc);
      }
      if (list.length < PAGE) break;
    }
    st.last_activity_start = newest ?? undefined;
    if (!st.backfill_before) st.backfill_before = isoDay(from);
    st.fit_pending = [...pending.values()];
    await setState("garmin", st);

    // 1b) storico: un blocco di 60 giorni all'indietro per volta, fino alla data scelta
    if (st.history_from && st.backfill_before && st.backfill_before > st.history_from && Date.now() < deadline - 20_000) {
      const end = new Date(st.backfill_before + "T00:00:00Z");
      const startD = new Date(Math.max(Date.parse(st.history_from + "T00:00:00Z"), end.getTime() - 60 * 86400_000));
      for (let start = 0; start < PAGE * 10; start += PAGE) {
        const list = activityList(await c.json("/activitylist-service/activities/search/activities",
          { start, limit: PAGE, startDate: isoDay(startD), endDate: isoDay(end) }));
        for (const s of list) {
          const id = String(s.activityId ?? "");
          const norm = garminNorm(s);
          if (!id || !norm.start_utc) continue;
          const r = await upsertActivity({ source: "garmin", external_id: id, acquisition: "api", raw: { summary: s, extras: garminExtras(s) }, norm });
          counts.activities++; if (r.created) counts.created++; if (r.linked) counts.linked++;
          if (wantsFit(typeKey(s)) && !(await hasGarminStreams(r.id))) pending.set(id, pending.get(id) ?? { id, tries: 0 });
        }
        if (list.length < PAGE) break;
      }
      st.backfill_before = isoDay(startD);
      st.fit_pending = [...pending.values()];
      info.push(`storico importato fino al ${st.backfill_before}`);
      await setState("garmin", st);
    }

    // 2) metriche giornaliere
    const dEnd = now;
    const dStart = st.daily_until ? new Date(Date.parse(st.daily_until) - DAILY_INCR_DAYS * 86400_000) : new Date(now.getTime() - DAILY_FIRST_DAYS * 86400_000);
    for (let a = new Date(dStart); a <= dEnd; a = new Date(a.getTime() + DAILY_CHUNK * 86400_000)) {
      const b = new Date(Math.min(a.getTime() + (DAILY_CHUNK - 1) * 86400_000, dEnd.getTime()));
      const s = isoDay(a), e = isoDay(b);
      const payloads: Record<string, unknown> = {};
      const calls: [string, () => Promise<unknown>][] = [
        ["summary", () => c.json("/usersummary-service/v2/dailysummaries", { startDate: s, endDate: e })],
        ["hrv", () => c.json(`/hrv-service/hrv/daily/${s}/${e}`)],
        ["sleep", () => c.json("/sleep-service/sleep/dailySleepSummariesByDate", { startDate: s, endDate: e })],
        ["body_battery", () => c.json("/wellness-service/wellness/bodyBattery/reports/daily", { startDate: s, endDate: e })],
        ["stress", () => c.json(`/usersummary-service/stats/stress/daily/${s}/${e}`)],
      ];
      for (const [k, fn] of calls) {
        try { payloads[k] = await fn(); } catch (err) {
          if (err instanceof GarminError && (err.kind === "budget" || err.kind === "auth")) throw err;
          notes.push(`${k}: ${sanitize(err, 80)}`);
        }
      }
      counts.daily_rows += await upsertDaily(dailyRows(payloads));
      st.daily_until = e;
      await setState("garmin", st);
    }

    // 3) file FIT originali (tracciato, altimetria, giri), finché c'è tempo
    const queue = (st.fit_pending ?? []).filter((p) => p.tries < 5);
    for (const p of queue) {
      if (Date.now() > deadline - 8000) { status = "partial"; notes.push(`FIT in attesa: ${queue.length - counts.fit - counts.fit_failed}`); break; }
      try {
        const zip = await c.bytes(`/download-service/files/activity/${p.id}`);
        const fit = parseFit(extractFit(zip));
        await tx(async (cl) => {
          const r = await cl.query<{ activity_id: string }>("select activity_id from sport.activity_sources where source='garmin' and external_id=$1", [p.id]);
          const aid = r.rows[0]?.activity_id;
          if (!aid) return;
          await upsertStreams(cl, aid, "garmin", fit.streams);
          await replaceLaps(cl, aid, "garmin", fit.laps);
          await cl.query("update sport.activity_sources set raw = jsonb_set(raw, '{fit_session}', $3::jsonb) where source = $1 and external_id = $2",
            ["garmin", p.id, JSON.stringify(fit.session)]);
        });
        counts.fit++;
        st.fit_pending = (st.fit_pending ?? []).filter((x) => x.id !== p.id);
      } catch (err) {
        if (err instanceof GarminError && err.kind === "budget") { status = "partial"; break; }
        counts.fit_failed++;
        p.tries++;
        notes.push(`FIT ${p.id}: ${sanitize(err, 60)}`);
      }
      await setState("garmin", st);
    }
    if (notes.length && status === "ok") status = "partial";
  } catch (err) {
    const budget = err instanceof GarminError && err.kind === "budget";
    status = budget ? "partial" : "error";
    notes.unshift(budget ? "tempo esaurito: riprende alla prossima sincronizzazione" : sanitize(err));
    await setState("garmin", st).catch(() => {});
  }
  counts.calls = c.calls;
  const message = [...notes.slice(0, 6), ...info].join("; ") || "ok";
  await finishRun(runId, status, counts, message);
  return { status, counts, message };
}

async function hasGarminStreams(activityId: string): Promise<boolean> {
  const { one } = await import("@/lib/db");
  const r = await one<{ ok: boolean }>("select exists(select 1 from sport.activity_streams where activity_id = $1 and source = 'garmin') as ok", [activityId]);
  return !!r?.ok;
}

/** Imposta la data da cui importare lo storico (le sincronizzazioni successive scendono a blocchi di 60 giorni). */
export async function setGarminHistory(from: string | null): Promise<void> {
  const st = (await getState<State>("garmin")) as State;
  st.history_from = from;
  await setState("garmin", st);
}

export async function garminHistoryState(): Promise<{ history_from: string | null; backfill_before: string | null; fit_pending: number }> {
  const st = (await getState<State>("garmin")) as State;
  return { history_from: st.history_from ?? null, backfill_before: st.backfill_before ?? null, fit_pending: (st.fit_pending ?? []).filter((p) => p.tries < 5).length };
}

export function garminConfigured(): boolean {
  return !!process.env.GARMIN_API_KEY;
}

export type { GarminSummary };
