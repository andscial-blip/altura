import Link from "next/link";
import { revalidatePath } from "next/cache";
import { invalidate } from "@/lib/cache";
import { q } from "@/lib/db";
import { periodActs, routeGroups, routeRuns, runnaDone } from "@/lib/queries";
import { progressData, WINDOW } from "@/lib/progress-server";
import { addDays, monday } from "@/lib/dates";
import { day, dec, dur, int, km, paceS, todayLocal } from "@/lib/fmt";
import { TimeChart } from "@/components/charts";
import { Card, Empty, Head, Kpi, Legend, Num } from "@/components/Head";
import { DataTable } from "@/components/DataTable";
import { Icon } from "@/components/Icon";

export const dynamic = "force-dynamic";

const RUN = ["run", "trail_run", "treadmill"];
const PRESET: Record<string, number> = { "5": 5000, "10": 10000, "21": 21097.5, "42": 42195 };

/** Tempo da "h:mm:ss", "mm:ss" o minuti decimali; null se non leggibile. */
function parseTime(t: string): number | null {
  const p = t.trim().replace(/[.,]/g, ":").split(":").map((x) => Number(x));
  if (!p.length || p.some((x) => !Number.isFinite(x) || x < 0)) return null;
  const s = p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p.length === 2 ? p[0] * 60 + p[1] : p[0] * 60;
  return s > 0 ? s : null;
}

async function addResult(fd: FormData) {
  "use server";
  const name = String(fd.get("name") ?? "").trim().slice(0, 80);
  const dayS = String(fd.get("day") ?? "");
  const preset = String(fd.get("dist") ?? "");
  const other = Number(String(fd.get("km") ?? "").replace(",", "."));
  const dist = PRESET[preset] ?? (other > 0 ? other * 1000 : 0);
  const time = parseTime(String(fd.get("time") ?? ""));
  const kind = String(fd.get("kind") ?? "gara") === "test" ? "test" : "gara";
  if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(dayS) || !(dist > 0) || !time) return;
  // abbinamento automatico alla corsa dello stesso giorno con distanza simile (±8%)
  const [act] = await q<{ id: string }>(
    `select a.id from sport.activities a where not a.hidden and a.sport = any($1) and coalesce(a.start_local, a.start_utc at time zone 'Indian/Antananarivo')::date = $2::date
      order by abs(a.distance_m - $3) limit 1`, [RUN, dayS, dist]);
  let actId: string | null = act?.id ?? null;
  if (actId) {
    const [d] = await q<{ m: number }>("select distance_m::float8 as m from sport.activities where id = $1", [actId]);
    if (!d || Math.abs(d.m - dist) / dist > 0.08) actId = null;
  }
  await q("insert into sport.results(id, day, name, kind, dist_m, time_s, activity_id) values (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6)", [dayS, name, kind, dist, time, actId]);
  invalidate();
  revalidatePath("/progressi");
}
async function delResult(fd: FormData) {
  "use server";
  await q("delete from sport.results where id = $1", [String(fd.get("id"))]);
  invalidate();
  revalidatePath("/progressi");
}

export default async function Page() {
  const today = todayLocal();
  const [{ est, past, estRace, recAll, rec90, goal, manual, DISTS, nextTest }, last28, done, groups] = await Promise.all([
    progressData(today), periodActs(addDays(today, -27)), runnaDone(addDays(monday(today), -7 * 4)), routeGroups(),
  ]);
  const routeData = groups.length ? await routeRuns(groups.flatMap((g) => g.ids)) : [];

  const runs28 = last28.filter((a) => RUN.includes(a.sport));
  const longest = runs28.reduce<(typeof runs28)[number] | null>((b, a) => (!b || a.dist > b.dist ? a : b), null);
  const km28 = runs28.reduce((s, a) => s + a.dist, 0) / 1000;
  const pastBy = new Map(past.map((p) => [p.key, p]));

  const goalPace = goal?.target ? goal.target / (goal.distM / 1000) : null;
  const seriesPts = [...(goal?.series ?? []), ...(goal?.raceSeries ?? [])].filter((p) => p.v !== null).sort((a, b) => a.d.localeCompare(b.d));
  const gapTxt = (st: NonNullable<typeof goal>["status"]) => st ? (st.onTrack ? `${dur(Math.abs(st.gap))} sotto l'obiettivo` : `+${dur(st.gap)} dall'obiettivo (${int(st.perKm)} s/km)`) : "";
  const label = (k: string) => DISTS.find((d) => d.key === k)!.label;
  const raceBy = new Map(estRace.map((e) => [e.key, e]));

  // percorsi ricorrenti: un riga per gruppo con migliore, ultima e tendenza
  const byId = new Map(routeData.map((r) => [r.id, r]));
  const routes = groups.map((g, i) => {
    const rs = g.ids.map((id) => byId.get(id)).filter((x): x is NonNullable<typeof x> => !!x).map((x) => ({ ...x, pace: x.time / (x.dist / 1000) }));
    if (rs.length < 2) return null;
    rs.sort((a, b) => a.day.localeCompare(b.day));
    const best = rs.reduce((b, x) => (x.pace < b.pace ? x : b));
    const last = rs[rs.length - 1];
    const prev = rs.slice(0, -1).reduce((s, x) => s + x.pace, 0) / (rs.length - 1);
    const place = rs.map((x) => x.place).filter(Boolean).pop() ?? "Percorso";
    const distAvg = rs.reduce((s, x) => s + x.dist, 0) / rs.length;
    return { key: `r${i}`, name: `${place}, ${km(distAvg)} km ${g.dir}`, n: rs.length, best, last, delta: last.pace - prev };
  }).filter((x): x is NonNullable<typeof x> => !!x).sort((a, b) => b.last.day.localeCompare(a.last.day));

  return (
    <div className="stack-l">
      <Head icon="trend" title="Progressi" sub="Obiettivo in corso, stime dei tempi, record e percorsi ricorrenti. Tutto calcolato dalle tue corse."
        back={{ href: "/analisi", label: "Analisi" }} acts={<Link href="/obiettivi" className="btn sm"><Icon name="target" size={16} />Obiettivi</Link>} />

      {goal ? (
        <section className="card goal" aria-label={`Obiettivo in corso: ${goal.name}`}>
          <div className="row between" style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
            <div style={{ minWidth: 0 }}>
              <p className="note" style={{ fontWeight: 600 }}><Icon name={goal.kind === "test" ? "test" : "race"} size={14} /> Obiettivo in corso · {day(goal.date, { day: "numeric", month: "long", year: "numeric" })}</p>
              <h2 style={{ marginTop: 4 }}>{goal.name}</h2>
            </div>
            <div className="count"><Num v={String(goal.daysLeft)} unit="giorni" /></div>
          </div>
          <div className="kpis" style={{ marginTop: 12 }}>
            <Kpi label="Obiettivo Runna" icon="target" value={goal.target ? <Num v={dur(goal.target)} /> : "–"} foot={goalPace ? `${paceS(goalPace)} /km${goal.targetMin && goal.targetMax && goal.targetMin !== goal.targetMax ? ` · forbice ${dur(goal.targetMin)}–${dur(goal.targetMax)}` : ""}` : undefined} />
            <Kpi label="Stima da gara, 12 mesi" icon="race" value={goal.raceEstimate ? <Num v={dur(goal.raceEstimate)} /> : "–"}
              foot={goal.raceBasis ? `${gapTxt(goal.raceStatus)} · da ${goal.raceBasis.name ?? label(goal.raceBasis.key)}, ${day(goal.raceBasis.day, { day: "numeric", month: "short" })}` : "nessuna gara o test negli ultimi 12 mesi"} />
            <Kpi label="Stima recente, 90 giorni" icon="clock" value={goal.estimate ? <Num v={dur(goal.estimate)} /> : "–"}
              foot={goal.basis ? `${gapTxt(goal.status)} · da ${label(goal.basis.key)} del ${day(goal.basis.day, { day: "numeric", month: "short" })}` : "nessuno sforzo da 5 km in su negli ultimi 90 giorni"} />
            <Kpi label="Lungo più lungo, 4 settimane" icon="long" value={longest ? <Num v={km(longest.dist)} unit="km" /> : "–"} foot={`${dec(km28 / 4, 0)} km a settimana · ${done.length} sedute Runna in 4 sett.`} />
          </div>
          {seriesPts.length >= 2 ? (
            <div style={{ marginTop: 12 }}>
              <TimeChart label={`Stime sulla ${goal.key === "hm" ? "mezza maratona" : "distanza dell'obiettivo"} nel tempo`} from={seriesPts[0].d} to={today} today={false} invert
                fmt={(v) => dur(v)} height={150} refLine={goal.target ? { v: goal.target, dash: true } : null}
                series={[
                  { name: "Recente", color: "var(--run)", kind: "line", gapDays: 40, pts: goal.series },
                  { name: "Da gara", color: "var(--night, #2E3D52)", kind: "line", dash: true, gapDays: 40, pts: goal.raceSeries },
                ]} />
              <Legend items={[{ label: "Recente (90 giorni)", color: "var(--run)" }, { label: "Da gara o test (12 mesi)", color: "var(--night, #2E3D52)" }, { label: "Obiettivo (tratteggio grigio)", color: "var(--faint)" }]} />
            </div>
          ) : null}
          <p className="note" style={{ marginTop: 8 }}>Le due stime sono il limite alto e il limite basso della tua forma. Quella da gara viene da uno sforzo fatto a fondo, ma può essere vecchia; quella recente è attuale, ma i parziali vengono quasi sempre da sedute non tirate, quindi è prudente. Più in alto nel grafico = più veloce.{nextTest ? <> Il prossimo riferimento affidabile sarà il <b>{nextTest.name}</b> del {day(nextTest.date, { day: "numeric", month: "long" })}: inserisci il tempo qui sotto, se Garmin non lo segna come gara.</> : null}</p>
        </section>
      ) : (
        <div className="card"><Empty icon="target" title="Nessun obiettivo in corso" text="Le gare e i test arrivano da Runna; puoi aggiungerne uno a mano negli Obiettivi." action={{ href: "/obiettivi", label: "Vai agli obiettivi" }} /></div>
      )}

      <div className="grid g2">
        <Card title="Stime dei tempi" icon="clock" aside={`recente ${WINDOW} gg · gara 12 mesi`}>
          {est.length || estRace.length ? (
            <DataTable caption="Stime dei tempi sulle distanze classiche" pinned={false}
              cols={[{ key: "d", label: "Distanza", lead: true }, { key: "s", label: "Recente", r: true }, { key: "g", label: "Da gara", r: true }, { key: "c", label: "3 mesi fa", r: true }]}
              rows={DISTS.filter((d) => d.m >= 5000 && (est.some((e) => e.key === d.key) || raceBy.has(d.key))).map((d) => {
                const e = est.find((x) => x.key === d.key), p = pastBy.get(d.key), rc = raceBy.get(d.key);
                const dd = p && e ? e.s - p.s : null;
                const src = e ?? rc!;
                return { key: d.key, hl: goal?.key === d.key, cells: {
                  d: { t: d.label, sub: `da ${label(src.from.key)} del ${day(src.from.day, { day: "numeric", month: "short" })}` },
                  s: { t: e ? dur(e.s) : "–", v: e?.s ?? null, sub: e ? `${paceS(e.s / (d.m / 1000))} /km` : undefined },
                  g: { t: rc ? dur(rc.s) : "–", v: rc?.s ?? null, sub: rc ? `${paceS(rc.s / (d.m / 1000))} /km` : undefined },
                  c: { t: p ? dur(p.s) : "–", v: p?.s ?? null, sub: dd === null ? undefined : Math.abs(dd) < 3 ? "uguale" : `${dd < 0 ? "−" : "+"}${dur(Math.abs(dd))} oggi`, cls: dd === null ? undefined : dd < -2 ? "good" : dd > 2 ? "warn" : undefined },
                } };
              })} />
          ) : <Empty inline icon="clock" title="Nessuna stima" text="Servono corse da almeno 5 km negli ultimi 90 giorni con i parziali di Garmin, oppure un risultato inserito qui sotto." />}
          <p className="note" style={{ marginTop: 8 }}>Formula di Riegel (tempo × (distanza / distanza dello sforzo)^1,06) applicata a ogni sforzo da 5 km in su; si tiene il tempo più veloce. Recente: tutti gli sforzi degli ultimi 90 giorni, quasi sempre parziali di sedute non tirate, quindi stima prudente. Da gara: gare segnate su Garmin, gare e test di Runna e risultati inseriti qui, ultimi 12 mesi. Sulla maratona Riegel tende a essere ottimista se il lungo non supera i 30 km.</p>
        </Card>

        <Card title="Record personali" icon="check" aside="tutto lo storico">
          {Object.keys(recAll).length ? (
            <DataTable caption="Record personali per distanza" pinned={false}
              cols={[{ key: "d", label: "Distanza", lead: true }, { key: "s", label: "Record", r: true }, { key: "p", label: "Passo", r: true }, { key: "r", label: "90 gg", r: true }]}
              rows={DISTS.filter((d) => recAll[d.key]).map((d) => {
                const r = recAll[d.key]!, n = rec90[d.key];
                return { key: d.key, cells: {
                  d: { t: d.label, sub: `${day(r.day, { day: "numeric", month: "short", year: "numeric" })}${r.official ? " · ufficiale" : ""}`, href: r.id ? `/attivita/${r.id}` : undefined },
                  s: { t: dur(r.s), v: r.s },
                  p: { t: paceS(r.s / (d.m / 1000)), v: r.s / d.m },
                  r: { t: n ? dur(n.s) : "–", v: n?.s ?? null, sub: n ? (n.s <= r.s + 0.5 ? "record" : `+${dur(n.s - r.s)}`) : undefined },
                } };
              })} />
          ) : <Empty inline icon="check" title="Nessun record" text="I record arrivano dai parziali più veloci che Garmin calcola per ogni corsa." />}
          <p className="note" style={{ marginTop: 8 }}>Parziale più veloce misurato da Garmin dentro una corsa (anche un allenamento), oppure il tempo ufficiale che inserisci tu.</p>
        </Card>
      </div>

      <Card title="Percorsi ricorrenti" icon="map" aside="stesso tracciato, almeno 2 volte">
        {routes.length ? (
          <DataTable caption="Percorsi ricorrenti" initial={{ key: "n", dir: "desc" }} pinned={false}
            cols={[{ key: "r", label: "Percorso", lead: true, sort: true }, { key: "n", label: "Volte", r: true, sort: true }, { key: "b", label: "Migliore", r: true, sort: true }, { key: "l", label: "Ultima", r: true, sort: true }]}
            rows={routes.map((r) => ({ key: r.key, cells: {
              r: { t: r.name, v: r.name, href: `/attivita/${r.last.id}`, sub: `ultima ${day(r.last.day, { day: "numeric", month: "short" })}` },
              n: { t: String(r.n), v: r.n },
              b: { t: `${paceS(r.best.pace)} /km`, v: r.best.pace, sub: day(r.best.day, { day: "numeric", month: "short", year: "2-digit" }) },
              l: { t: `${paceS(r.last.pace)} /km`, v: r.last.pace, sub: Math.abs(r.delta) < 2 ? "come la media" : `${r.delta < 0 ? "−" : "+"}${int(Math.abs(r.delta))} s/km vs media`, cls: r.delta < -2 ? "good" : r.delta > 2 ? "warn" : undefined },
            } }))} />
        ) : <Empty inline icon="map" title="Nessun percorso ripetuto" text="Quando corri due volte lo stesso giro (stesso tracciato GPS, distanza entro ±10%) compare qui, con il confronto tra le uscite." />}
        <p className="note" style={{ marginTop: 8 }}>Tocca un percorso per aprire l&apos;ultima uscita: lì trovi il confronto con tutte le altre volte. &quot;vs media&quot;: passo dell&apos;ultima rispetto alla media delle precedenti (− = più veloce).</p>
      </Card>

      <Card title="Risultati ufficiali" icon="race" aside="gare e test">
        {manual.length ? (
          <DataTable caption="Risultati inseriti" initial={{ key: "d", dir: "desc" }} pinned={false}
            cols={[{ key: "n", label: "Gara o test", lead: true, sort: true }, { key: "d", label: "Data", r: true, sort: true }, { key: "k", label: "Distanza", r: true, sort: true }, { key: "t", label: "Tempo", r: true, sort: true }]}
            rows={manual.map((r) => ({ key: r.id, cells: {
              n: { t: r.name, href: r.activity_id ? `/attivita/${r.activity_id}` : undefined, sub: r.activity_id ? "abbinato alla corsa" : "senza corsa abbinata" },
              d: { t: day(r.day, { day: "numeric", month: "short", year: "numeric" }), v: r.day },
              k: { t: `${km(r.dist_m, 2)} km`, v: r.dist_m },
              t: { t: dur(r.time_s), v: r.time_s, sub: `${paceS(r.time_s / (r.dist_m / 1000))} /km` },
            } }))} />
        ) : <p className="note">Nessun risultato inserito. Il tempo ufficiale di una gara vale più del parziale dell&apos;orologio: entra nei record e nelle stime.</p>}
        {manual.length > 0 && (
          <details className="data" style={{ marginTop: 8 }}>
            <summary>Elimina un risultato</summary>
            <div className="stack" style={{ marginTop: 8 }}>
              {manual.map((r) => (
                <form key={r.id} action={delResult} className="row between">
                  <input type="hidden" name="id" value={r.id} />
                  <span>{r.name} · {day(r.day, { day: "numeric", month: "short", year: "numeric" })}</span>
                  <button className="btn sm" type="submit">Elimina</button>
                </form>
              ))}
            </div>
          </details>
        )}
        <form action={addResult} className="grid g3" style={{ alignItems: "end", marginTop: 14 }}>
          <label className="fld">Nome<input className="in" name="name" required placeholder="Run for the Whales, Sanremo" /></label>
          <label className="fld">Data<input className="in" type="date" name="day" required max={today} /></label>
          <label className="fld">Tipo<select className="in" name="kind"><option value="gara">Gara</option><option value="test">Test</option></select></label>
          <label className="fld">Distanza<select className="in" name="dist" defaultValue="21"><option value="5">5 km</option><option value="10">10 km</option><option value="21">Mezza maratona</option><option value="42">Maratona</option><option value="">Altra (scrivi i km)</option></select></label>
          <label className="fld">Altra distanza (km)<input className="in" name="km" inputMode="decimal" placeholder="es. 15" /></label>
          <label className="fld">Tempo ufficiale (h:mm:ss)<input className="in" name="time" required placeholder="1:36:27" inputMode="numeric" /></label>
          <button className="btn primary" type="submit">Aggiungi risultato</button>
        </form>
        <p className="note" style={{ marginTop: 8 }}>Se quel giorno c&apos;è una corsa con distanza simile (±8%), il risultato si abbina da solo e sostituisce il parziale dell&apos;orologio. Le distanze non classiche (es. 15 km) restano in elenco ma non entrano in record e stime.</p>
      </Card>
    </div>
  );
}
