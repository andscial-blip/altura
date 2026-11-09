import { Fragment } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { activity, routeRuns, sameRouteIds, similar } from "@/lib/queries";
import { publicTrack } from "@/lib/track";
import { day, dec, dur, hm, int, km, pace, paceS, sportLabel, when, SOURCE_LABEL } from "@/lib/fmt";
import { ACTIVITY_FIELDS, mergeNorms, type Norm, type SourceId } from "@/lib/model";
import { compare, type Step } from "@/lib/runna-parse";
import { isNum, rolling, splitsFromStreams, type Split } from "@/lib/stats";
import { Profiles, TimeChart, Zones } from "@/components/charts";
import { addDays } from "@/lib/dates";
import { Card, Head, Info, Kpi, Num } from "@/components/Head";
import { byDistance, climbs, gradeClass, kmEffort } from "@/lib/mountain";
import { DataTable } from "@/components/DataTable";
import { SPORT_COLOR, StructBar } from "@/components/Act";
import { Icon, SportIcon, sportMeta } from "@/components/Icon";
import { TrackMap } from "@/components/TrackMap";

export const dynamic = "force-dynamic";

const FIELD_LABEL: Partial<Record<(typeof ACTIVITY_FIELDS)[number], string>> = {
  name: "Nome", sport: "Disciplina", distance_m: "Distanza", moving_s: "Tempo in movimento", elapsed_s: "Tempo totale", elev_gain_m: "Dislivello positivo",
  avg_hr: "FC media", max_hr: "FC massima", avg_cadence: "Cadenza", avg_power: "Potenza media", training_load: "Carico di allenamento",
};
const ON_FOOT = ["run", "trail_run", "treadmill", "hike", "walk"];

/** Blocchi ripetuti raggruppati: 24 righe "200 m veloce / 200 m lento" diventano "12 × Lavoro + Recupero". */
function groupBlocks<T extends { label: string; m: number | null; pace: number | null; limit: number | null }>(list: T[]): { unit: T[]; times: number }[] {
  const same = (a: T, b: T) => a.label === b.label && a.m === b.m && a.pace === b.pace && a.limit === b.limit;
  const out: { unit: T[]; times: number }[] = [];
  let i = 0;
  while (i < list.length) {
    let best = { u: 1, k: 1 };
    for (const u of [1, 2]) {
      let k = 1;
      while (i + (k + 1) * u <= list.length && list.slice(i + k * u, i + (k + 1) * u).every((b, j) => same(b, list[i + j]))) k++;
      if (k > 1 && k * u > best.k * best.u) best = { u, k };
    }
    out.push({ unit: list.slice(i, i + best.u), times: best.k });
    i += best.u * best.k;
  }
  return out;
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await activity(id);
  if (!d) notFound();
  const { a, sources, streams, laps, planned } = d;
  const s = streams?.streams ?? {};
  const meta = sportMeta(a.sport);
  const color = SPORT_COLOR[meta.fam] ?? "var(--run)";
  const track = await publicTrack(s.lat ?? [], s.lon ?? []);
  const isRun = ["run", "trail_run", "treadmill"].includes(a.sport);
  const foot = ON_FOOT.includes(a.sport);
  const swim = a.sport === "swim";
  const t = Number(a.moving_s ?? a.elapsed_s ?? 0), dist = Number(a.distance_m ?? 0);
  const { field_source } = mergeNorms(sources.map((x) => ({ source: x.source as SourceId, norm: x.norm as Norm })));
  const garmin = sources.find((x) => x.source === "garmin");
  const ex = (garmin?.extras ?? {}) as Record<string, number | null>;
  const sum = (garmin?.summary ?? {}) as Record<string, unknown>;
  const place = typeof sum.locationName === "string" ? sum.locationName : null;
  const runna = sources.find((x) => x.source === "runna")?.runna as { steps?: Step[]; segments?: [number, number][] } | null | undefined;
  const KIND: Record<string, string> = { warm: "Riscaldamento", cool: "Defaticamento", work: "Lavoro", rest: "Recupero", easy: "Facile", float: "Costante" };
  const stepsSrc = (runna?.steps ?? (planned?.structure?.steps as Step[] | undefined) ?? []) as Step[];
  const blocks = stepsSrc.map((b) => ({ label: KIND[b.kind] ?? b.kind, m: b.m ?? null, s: b.s ?? null, pace: b.pace ?? null, limit: b.limit ?? null, est: b.m ? (b.m / 1000) * (b.pace ?? b.limit ?? 330) : null }));
  const runnaPlanKm = stepsSrc.reduce((a, b) => a + (b.m ?? 0), 0) / 1000 || null;
  const segPaces = (runna?.segments ?? []).filter((x) => x[0] >= 900).map((x) => x[1] / (x[0] / 1000)).sort((a, b) => a - b);
  const segMed = segPaces.length ? segPaces[Math.floor(segPaces.length / 2)] : 0;
  const cmp = runna?.steps && runna.segments ? compare(runna.steps, runna.segments, planned?.km ? Number(planned.km) : null, planned ? [planned.duration_min_s, planned.duration_max_s] : null, dist ? dist / 1000 : null, t || null) : null;

  // parziali al km: dalle serie se ci sono, altrimenti dai giri del dispositivo
  let splits: Split[] = s.dist && s.t ? splitsFromStreams(s.dist, s.t, s.hr, s.alt) : [];
  const splitSrc = splits.length ? "serie" : laps.length ? "giri" : null;
  if (!splits.length && laps.length) splits = laps.map((l, i) => ({ km: i + 1, dist_m: Number(l.distance_m), time_s: Number(l.duration_s), pace_s: Number(l.duration_s) / (Number(l.distance_m) / 1000), hr: l.avg_hr ? Number(l.avg_hr) : null, gain_m: Number(l.elev_gain_m ?? 0) }));
  const full = splits.filter((x) => x.dist_m >= 500 && isNum(x.pace_s));
  const pMin = Math.min(...full.map((x) => x.pace_s)), pMax = Math.max(...full.map((x) => x.pace_s));
  const whole = full.filter((x) => x.dist_m >= 990);
  const best = whole.length > 1 ? whole.reduce((b, x) => (x.pace_s < b.pace_s ? x : b)) : null;

  // zone di battito misurate da Garmin
  const zones = [1, 2, 3, 4, 5].map((i) => Number(sum[`hrTimeInZone_${i}`] ?? 0));

  // profili: passo (media mobile su 5 punti), battito, quota
  const paceSer = s.v ? rolling(s.v.map((v) => (isNum(v) && v > 0.5 ? 1000 / v : null)), 5, 3) : [];
  // stesso percorso (forma del tracciato): se c'è, sostituisce le "uscite simili" per distanza
  const routeIds = isRun && track.length ? await sameRouteIds(a.id) : [];
  const route = routeIds.length ? await routeRuns(routeIds) : [];
  const sim = !route.length && dist > 0 ? await similar(a.id, a.sport, dist) : [];

  // montagna: km-sforzo, salite lunghe (VAM) e pendenza ogni 100 m per escursioni, camminate e trail
  const mnt = ["hike", "walk", "trail_run"].includes(a.sport) && s.dist && s.alt ? (() => {
    const pts = byDistance(s.dist, s.alt, s.t ?? null);
    const c = climbs(pts);
    const strip: number[] = [];
    for (let i = 2; i < pts.length; i += 2) strip.push((pts[i].a - pts[i - 2].a) / Math.max(1, pts[i].d - pts[i - 2].d));
    return { effort: kmEffort(dist, Number(a.elev_gain_m ?? 0)), climbs: c, best: c.length ? c.reduce((b, x) => (x.vam > b.vam ? x : b)) : null, strip };
  })() : null;
  const myPace = dist && t ? t / (dist / 1000) : null;

  const tech: [string, string][] = [];
  if (a.avg_cadence) tech.push(["Cadenza media", `${int(a.avg_cadence)} ${isRun ? "passi/min" : "rpm"}`]);
  if (a.avg_power) tech.push(["Potenza media", `${int(a.avg_power)} W`]);
  if (ex.gap_mps && foot) tech.push(["Passo corretto per la pendenza", `${paceS(1000 / ex.gap_mps)} /km`]);
  if (ex.stride_cm) tech.push(["Lunghezza del passo", `${dec(ex.stride_cm / 100, 2)} m`]);
  if (ex.gct_ms) tech.push(["Tempo di contatto", `${int(ex.gct_ms)} ms`]);
  if (ex.vo_cm) tech.push(["Oscillazione verticale", `${dec(ex.vo_cm)} cm`]);
  if (ex.te_aerobic) tech.push(["Effetto allenante aerobico / anaerobico", `${dec(ex.te_aerobic)} / ${dec(ex.te_anaerobic ?? 0)}`]);
  if (ex.vo2max) tech.push(["VO2max stimato da Garmin", dec(ex.vo2max)]);
  if (isNum(sum.minTemperature) && isNum(sum.maxTemperature)) tech.push(["Temperatura (sensore orologio)", `${int(sum.minTemperature)}–${int(sum.maxTemperature)} °C`]);
  if (isNum(sum.calories)) tech.push(["Calorie (stima Garmin)", `${int(sum.calories)} kcal`]);
  if (a.elapsed_s && a.moving_s && Number(a.elapsed_s) - Number(a.moving_s) > 30) tech.push(["Tempo totale con soste", dur(a.elapsed_s)]);
  if (swim) {
    const ty = (sum.activityType as { typeKey?: string } | undefined)?.typeKey;
    if (ty) tech.unshift(["Tipo", ty === "open_water_swimming" ? "acque libere" : ty === "lap_swimming" ? "piscina" : ty]);
    if (isNum(sum.poolLength)) tech.push(["Lunghezza vasca", `${int(sum.poolLength)} m`]);
    if (isNum(sum.activeLengths)) tech.push(["Vasche", int(sum.activeLengths)]);
    if (isNum(sum.strokes)) tech.push(["Bracciate", int(sum.strokes)]);
    if (isNum(sum.averageSwimCadenceInStrokesPerMinute)) tech.push(["Frequenza di bracciata", `${int(sum.averageSwimCadenceInStrokesPerMinute)} al minuto`]);
    if (isNum(sum.averageSwolf)) tech.push(["SWOLF medio", `${int(sum.averageSwolf)} (bracciate + secondi per vasca)`]);
  }

  return (
    <div className="stack-l">
      <Head back={{ href: "/attivita", label: "Attività" }}
        title={<span className="row" style={{ flexWrap: "nowrap", gap: 12 }}><SportIcon sport={a.sport} />{a.name ?? sportLabel(a.sport)}</span>}
        sub={<>{sportLabel(a.sport)} · {when(a.start_utc)}{place ? ` · ${place}` : ""}{a.is_race ? " · gara" : ""}</>}
        acts={<div className="row" style={{ gap: 10 }}>{sources.map((x) => <span key={x.source} className="src" data-s={x.source}><i />{SOURCE_LABEL[x.source]}</span>)}</div>} />

      <div className="kpis">
        <Kpi label="Distanza" icon="distance" value={dist ? (swim ? int(dist) : km(dist, 2)) : "–"} unit={swim ? "m" : "km"} />
        <Kpi label="Tempo" icon="clock" value={dur(t)} />
        <Kpi label={foot || swim ? "Passo medio" : "Velocità media"} icon="trend" value={dist && t ? (swim ? paceS(t / (dist / 100)) : foot ? pace(dist, t) : dec((dist / t) * 3.6)) : "–"} unit={swim ? "/100 m" : foot ? "/km" : "km/h"} />
        <Kpi label={Number(a.elev_gain_m ?? 0) > 30 || !a.avg_hr ? "Dislivello" : "Battito medio"} icon={Number(a.elev_gain_m ?? 0) > 30 || !a.avg_hr ? "gain" : "heart"}
          value={Number(a.elev_gain_m ?? 0) > 30 || !a.avg_hr ? int(a.elev_gain_m) : int(a.avg_hr)} unit={Number(a.elev_gain_m ?? 0) > 30 || !a.avg_hr ? "m" : "bpm"}
          foot={a.avg_hr && Number(a.elev_gain_m ?? 0) > 30 ? `FC ${int(a.avg_hr)}/${int(a.max_hr)}` : a.training_load ? `carico ${int(a.training_load)}` : undefined} />
      </div>

      {track.length > 0 && <TrackMap lines={track} color={color} />}

      {s.dist && (paceSer.length || s.hr || s.alt) ? (
        <Card title="Andamento lungo il percorso" icon="activity" aside="tocca o passa sopra per i valori">
          <Profiles x={s.dist} label="Profili dell'attività" rows={[
            ...(foot && paceSer.length ? [{ name: "Passo (min/km)", ys: paceSer, color, fmt: (v: number) => paceS(v), invert: true }] : []),
            ...(s.hr ? [{ name: "Battito (bpm)", ys: s.hr, color: "var(--z5)", fmt: (v: number) => int(v) }] : []),
            ...(s.alt ? [{ name: "Quota (m)", ys: s.alt, color: "var(--faint)", fmt: (v: number) => int(v), area: true }] : []),
          ]} />
          <p className="note">Passo: media mobile su 5 punti, asse invertito (più in alto = più veloce). Valori estremi dell&apos;1% esclusi dalla scala. Fonte: {streams?.source ? SOURCE_LABEL[streams.source] : "–"}.</p>
        </Card>
      ) : null}

      {mnt && (
        <Card title="Salite e pendenze" icon="gain" aside={<Info title="Km-sforzo, VAM, pendenze"><p>Km-sforzo = km + dislivello positivo / 100 (ITRA). VAM = metri di dislivello all&apos;ora sulle salite lunghe (almeno 150 m e 8%), dal tempo registrato. La striscia mostra la pendenza ogni 100 m: verdi le salite, viola le discese, più scuro = più ripido.</p></Info>}>
          <div className="kpis k3">
            <Kpi label="Km-sforzo" icon="mountain" value={dec(mnt.effort, 1)} foot={`${km(dist)} km + ${int(a.elev_gain_m ?? 0)} m D+`} />
            <Kpi label="Miglior VAM" icon="gain" value={mnt.best ? int(mnt.best.vam) : "–"} unit={mnt.best ? "m/h" : undefined} foot={mnt.best ? `salita di ${int(mnt.best.gain)} m al ${int(mnt.best.grade * 100)}%` : "nessuna salita lunga"} />
            <Kpi label="Salite lunghe" icon="hike" value={String(mnt.climbs.length)} foot={mnt.climbs.length ? `${int(mnt.climbs.reduce((z, c) => z + c.gain, 0))} m in salita` : "sotto 150 m o 8%"} />
          </div>
          {mnt.strip.length > 3 && (
            <div className="gstrip" role="img" aria-label="Pendenza lungo il percorso, ogni 100 metri" style={{ marginTop: 12 }}>
              {mnt.strip.map((g, i) => <i key={i} className={gradeClass(g)} title={`${int(g * 100)}%`} />)}
            </div>
          )}
          {mnt.climbs.length > 0 && (
            <DataTable caption="Salite lunghe" pinned={false}
              cols={[{ key: "k", label: "Salita", lead: true }, { key: "g", label: "Dislivello", r: true }, { key: "p", label: "Pendenza", r: true }, { key: "v", label: "VAM", r: true }]}
              rows={mnt.climbs.map((c, i) => ({ key: String(i), cells: {
                k: { t: `Dal km ${dec(c.fromM / 1000, 1)} al ${dec(c.toM / 1000, 1)}`, sub: dur(c.secs) },
                g: { t: `${int(c.gain)} m`, v: c.gain }, p: { t: `${int(c.grade * 100)}%`, v: c.grade }, v: { t: `${int(c.vam)} m/h`, v: c.vam },
              } }))} />
          )}
        </Card>
      )}

      <div className={`grid${full.length > 1 && zones.some((z) => z > 0) ? " g2" : ""}`}>
        {full.length > 1 && (
          <Card title="Parziali" icon="clock" aside={splitSrc === "serie" ? "al chilometro" : "giri del dispositivo"}>
            <div className="tscroll">
              <table className="t">
                <caption className="sr">Parziali</caption>
                <thead><tr><th>{splitSrc === "serie" ? "Km" : "Giro"}</th><th className="r">Passo</th><th style={{ width: "40%" }}><span className="sr">confronto</span></th><th className="r">FC</th><th className="r">D+</th></tr></thead>
                <tbody>{splits.map((x) => (
                  <tr key={x.km}>
                    <td className="mono">{x.dist_m < 990 ? `${dec(x.dist_m / 1000, 2)}` : x.km}</td>
                    <td className="r mono" style={{ fontWeight: best === x ? 700 : undefined }}>{paceS(x.pace_s)}{best === x && <span className="sr"> (parziale migliore)</span>}</td>
                    <td><div className="pbar"><i style={{ width: `${pMax > pMin ? 30 + (70 * (pMax - x.pace_s)) / (pMax - pMin) : 100}%`, background: best === x ? "var(--sun)" : color }} /></div></td>
                    <td className="r mono">{x.hr ? int(x.hr) : "–"}</td>
                    <td className="r mono">{int(x.gain_m)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <p className="note" style={{ marginTop: 8 }}>Barra più lunga = più veloce; in giallo il parziale migliore.{splitSrc === "serie" ? " Tempo al km interpolato tra i punti registrati." : ""}</p>
          </Card>
        )}
        {zones.some((z) => z > 0) && (
          <Card title="Zone di battito" icon="heart" aside="tempo in zona, Garmin">
            <Zones secs={zones} />
            <p className="note" style={{ marginTop: 8 }}>Zone calcolate dall&apos;orologio Garmin con le soglie impostate nel tuo profilo Garmin.</p>
          </Card>
        )}
      </div>

      {(planned || runna?.steps) && (
        <Card title={`Seduta Runna${planned ? `: ${planned.title}` : ""}`} icon="calendar" aside="previsto e registrato">
          <div className="stack">
            <dl className="kv" style={{ maxWidth: 560 }}>
              <dt>Distanza prevista · effettiva</dt><dd className="mono">{planned?.km ? `${dec(planned.km)} km` : runnaPlanKm ? `${dec(runnaPlanKm)} km` : "non indicata"} · {km(dist, 2)} km</dd>
              <dt>Durata prevista (Runna) · effettiva</dt><dd className="mono">{planned?.duration_min_s ? `${hm(planned.duration_min_s)}–${hm(planned.duration_max_s)}` : "non indicata"} · {dur(t)}</dd>
            </dl>
            {blocks.length > 0 && (
              <>
                <div>
                  <p className="note" style={{ marginBottom: 4 }}>Previsto: blocchi in proporzione alla durata stimata (distanza × passo obiettivo)</p>
                  <StructBar steps={runna?.steps ?? planned?.structure?.steps} />
                </div>
                {runna?.segments?.length ? (
                  <div>
                    <p className="note" style={{ marginBottom: 4 }}>Registrato da Runna: un blocco per parziale, largo quanto la sua durata reale</p>
                    <div className="struct rec" role="img" aria-label={`Registrato: ${runna.segments.length} parziali, ${dur(runna.segments.reduce((a, x) => a + x[1], 0))}`}>
                      {runna.segments.map((x, i) => <span key={i} className={x[0] >= 900 && x[1] / (x[0] / 1000) < segMed ? "f" : undefined} style={{ flex: `${x[1]} 0 0`, height: "100%" }} />)}
                    </div>
                    <p className="note" style={{ marginTop: 4 }}>Blocchi pieni: parziali più veloci della mediana della seduta.</p>
                  </div>
                ) : null}
                <div className="tscroll">
                  <table className="t">
                    <caption className="sr">Blocchi previsti della seduta</caption>
                    <thead><tr><th scope="col">Blocco</th><th scope="col" className="r">Distanza</th><th scope="col" className="r">Passo</th><th scope="col" className="r">Durata</th></tr></thead>
                    <tbody>{groupBlocks(blocks).map((g, i) => {
                      const mTxt = (m: number | null) => (m ? (m >= 1000 ? `${dec(m / 1000, m % 1000 ? 1 : 0)} km` : `${m} m`) : "–");
                      const pTxt = (b: (typeof blocks)[number]) => (b.pace ? paceS(b.pace) : b.limit ? `>${paceS(b.limit)}` : "libero");
                      const secs = g.unit.reduce((z, b) => z + (b.s ?? b.est ?? 0), 0) * g.times;
                      const exact = g.unit.every((b) => b.s);
                      return <tr key={i}><td>{g.times > 1 ? `${g.times} × ` : ""}{g.unit.map((b) => b.label).join(" + ")}</td><td className="r mono">{g.unit.map((b) => mTxt(b.m)).join(" + ")}</td><td className="r mono">{g.unit.map(pTxt).join(" / ")}</td><td className="r mono">{secs ? `${exact ? "" : "≈ "}${dur(secs)}` : "–"}</td></tr>;
                    })}</tbody>
                  </table>
                </div>
              </>
            )}
            {cmp ? (
              <>
                <p>Esito: <b>{String(cmp.verdict)}</b>{typeof cmp.km_diff_pct === "number" ? `, distanza ${cmp.km_diff_pct > 0 ? "+" : ""}${dec(cmp.km_diff_pct)}% rispetto al previsto` : ""}.</p>
                {cmp.work.length > 0 && (
                  <div className="tscroll"><table className="t">
                    <caption className="sr">Ripetute: passo registrato e obiettivo</caption>
                    <thead><tr><th scope="col">Ripetuta</th><th scope="col" className="r">Passo</th><th scope="col" className="r">Obiettivo</th><th scope="col">Esito</th></tr></thead>
                    <tbody>{cmp.work.map((w, i) => <tr key={i}><td>{i + 1} · {w.m} m</td><td className="r mono">{paceS(w.pace)}</td><td className="r mono">{paceS(w.lo)}–{paceS(w.hi)}</td><td><span className={`badge ${w.ok ? "ok" : "warn"}`}>{w.ok ? "nel ritmo" : w.fast ? "più veloce" : "più lenta"}</span></td></tr>)}</tbody>
                  </table></div>
                )}
              </>
            ) : null}
            <p className="note">Runna indica distanza, passo obiettivo e (non sempre) durata di ogni blocco: dove manca, la durata è stimata come distanza × passo obiettivo (segnata ≈) o con 5:30/km per i blocchi a passo libero. Il registrato viene dai parziali che Runna salva con l&apos;uscita.{cmp ? ` Confronto: tolleranza 3 s/km oltre la forbice (5 s/km senza forbice). ${cmp.notes.join(" ")}` : ""}</p>
          </div>
        </Card>
      )}

      {route.length > 1 && (() => {
        const rows = route.map((x) => ({ ...x, pace: x.time / (x.dist / 1000), eff: x.hr ? x.dist / ((x.time / 60) * x.hr) : null }));
        const me = rows.find((x) => x.id === a.id)!;
        const byPace = [...rows].sort((p, q) => p.pace - q.pace);
        const rank = byPace.findIndex((x) => x.id === a.id) + 1;
        const best = byPace[0], avg = rows.reduce((z, x) => z + x.pace, 0) / rows.length;
        const sgn = (v: number) => (Math.abs(v) < 1 ? "uguale" : `${v > 0 ? "+" : "−"}${int(Math.abs(v))} s/km`);
        const first = rows[0].day, last = rows[rows.length - 1].day;
        const places = rows.map((x) => x.place).filter(Boolean) as string[];
        return (
          <Card title="Stesso percorso" icon="map" aside={`${rows.length} volte${places.length ? ` · ${places[places.length - 1]}` : ""}`}>
            <dl className="kv">
              <dt className="note">Questa volta</dt><dd><Num v={paceS(me.pace)} unit="/km" /> <span className="note">{rank === 1 ? "la più veloce" : `${rank}ª su ${rows.length}`}</span></dd>
              <dt className="note">Migliore</dt><dd><Num v={paceS(best.pace)} unit="/km" /> <span className="note">{best.id === a.id ? "questa" : `${day(best.day, { day: "numeric", month: "short", year: "2-digit" })}, ${sgn(me.pace - best.pace)} oggi`}</span></dd>
              <dt className="note">Media del percorso</dt><dd><Num v={paceS(avg)} unit="/km" /> <span className="note">{sgn(me.pace - avg)} oggi</span></dd>
            </dl>
            <TimeChart label="Passo sullo stesso percorso, uscita per uscita" from={addDays(first, -7)} to={addDays(last, 7)} today={false} invert step={15} fmt={(v) => paceS(v)} unit="/km" height={120}
              series={[
                { name: "Passo", color, kind: "line", width: 1.5, gapDays: 3650, pts: rows.map((x) => ({ d: x.day, v: Math.round(x.pace) })) },
                { name: "Altre uscite", color, kind: "dots", width: 6, tip: false, pts: rows.filter((x) => x.id !== a.id).map((x) => ({ d: x.day, v: Math.round(x.pace) })) },
                { name: "Questa", color: "var(--sun)", kind: "dots", width: 10, tip: false, pts: [{ d: me.day, v: Math.round(me.pace) }] },
              ]} />
            <DataTable caption="Uscite sullo stesso percorso" initial={{ key: "d", dir: "desc" }}
              cols={[{ key: "d", label: "Uscita", lead: true, sort: true }, { key: "t", label: "Tempo", r: true, sort: true }, { key: "p", label: "Passo", r: true, sort: true }, { key: "hr", label: "FC", r: true, sort: true }, { key: "e", label: "m/battito", r: true, sort: true }, { key: "g", label: "D+", r: true, sort: true }]}
              rows={rows.map((x) => ({ key: x.id, hl: x.id === a.id, cells: {
                d: { t: x.id === a.id ? "Questa uscita" : x.name ?? "Corsa", href: x.id === a.id ? undefined : `/attivita/${x.id}`, sub: `${x.day.split("-").reverse().join("/")} · ${km(x.dist)} km`, v: x.day },
                t: { t: dur(x.time), v: x.time },
                p: { t: paceS(x.pace), v: x.pace, sub: x.id === a.id ? undefined : sgn(x.pace - me.pace) },
                hr: { t: x.hr ? int(x.hr) : "–", v: x.hr },
                e: { t: x.eff ? dec(x.eff, 2) : "–", v: x.eff },
                g: { t: x.gain ? int(x.gain) : "–", v: x.gain },
              } }))} />
            <p className="note" style={{ marginTop: 8 }}>Stesso percorso: partenza vicina, distanza entro ±10% e tracciati che si sovrappongono (scarto medio sotto 150 m, in qualunque verso). Sotto il passo: differenza rispetto a questa uscita (+ = quella era più lenta). m/battito = metri percorsi per battito cardiaco: a parità di percorso, se sale a parità di passo l&apos;efficienza aerobica migliora. Nel grafico più in alto = più veloce. Il tipo di seduta (facile, ripetute, lungo) cambia il passo: leggilo insieme al nome.</p>
          </Card>
        );
      })()}

      {sim.length > 0 && myPace && (
        <Card title="Uscite simili" icon="trend" aside={`${sportLabel(a.sport)}, ${swim ? `${int(dist * 0.8)}–${int(dist * 1.2)} m` : `${km(dist * 0.8, 0)}–${km(dist * 1.2, 0)} km`}`}>
          <DataTable caption="Uscite simili a questa" initial={undefined}
            cols={[{ key: "n", label: "Uscita", lead: true, sort: true }, { key: "km", label: swim ? "Metri" : "Km", r: true, sort: true }, { key: "p", label: foot ? "Passo" : swim ? "Passo /100 m" : "Tempo", r: true, sort: true }, { key: "hr", label: "FC", r: true, sort: true }, { key: "g", label: "D+", r: true, sort: true }]}
            rows={[
              { key: "this", hl: true, cells: { n: { t: "Questa uscita", v: "0" }, km: { t: swim ? int(dist) : km(dist), v: dist }, p: { t: foot ? paceS(myPace) : swim ? paceS(t / (dist / 100)) : dur(t), v: foot ? myPace : t }, hr: { t: a.avg_hr ? int(a.avg_hr) : "–", v: a.avg_hr ? Number(a.avg_hr) : null }, g: { t: a.elev_gain_m ? int(a.elev_gain_m) : "–", v: a.elev_gain_m ? Number(a.elev_gain_m) : null } } },
              ...sim.map((x) => {
                const p = x.time / (x.dist / 1000), dd = p - myPace;
                return { key: x.id, cells: {
                  n: { t: x.name ?? "Uscita", href: `/attivita/${x.id}`, sub: x.day.split("-").reverse().join("/"), v: x.day },
                  km: { t: swim ? int(x.dist) : km(x.dist), v: x.dist },
                  p: { t: foot ? paceS(p) : swim ? paceS(x.time / (x.dist / 100)) : dur(x.time), v: foot ? p : x.time, sub: foot ? (Math.abs(dd) < 2 ? "come questa" : `${dd > 0 ? "+" : "−"}${int(Math.abs(dd))} s/km`) : undefined },
                  hr: { t: x.hr ? int(x.hr) : "–", v: x.hr },
                  g: { t: x.gain ? int(x.gain) : "–", v: x.gain },
                } };
              }),
            ]} />
          <p className="note" style={{ marginTop: 8 }}>Stesso sport, distanza entro ±20%, le 8 più recenti. Sotto il passo: differenza rispetto a questa uscita (+ = quella era più lenta). Il passo dipende anche da dislivello e tipo di seduta: confronta guardando FC e D+. Tocca un&apos;intestazione per ordinare.</p>
        </Card>
      )}

      {tech.length > 0 && (
        <Card title="Dati tecnici" icon="chart">
          <dl className="kv">{tech.map(([l, v]) => <Fragment key={l}><dt>{l}</dt><dd>{v}</dd></Fragment>)}</dl>
        </Card>
      )}

      <details className="card more">
        <summary>Da dove arrivano i dati <Icon name="next" size={16} /></summary>
        <p className="note" style={{ margin: "4px 0 10px" }}>Per ogni campo vale la fonte più affidabile che lo fornisce: correzione manuale, poi Garmin (il dispositivo che misura), poi Strava, poi Apple Salute. Il nome viene da Strava. I record originali restano conservati e non vengono mai modificati.</p>
        <div className="tscroll">
          <table className="t">
            <thead><tr><th>Campo</th><th>Usato</th>{sources.map((x) => <th key={x.source}>{SOURCE_LABEL[x.source]}</th>)}</tr></thead>
            <tbody>
              {(Object.keys(FIELD_LABEL) as (keyof typeof FIELD_LABEL)[]).filter((f) => sources.some((x) => x.norm[f] !== null && x.norm[f] !== undefined)).map((f) => (
                <tr key={f}><td>{FIELD_LABEL[f]}</td><td>{field_source[f] ? SOURCE_LABEL[field_source[f]!] : "–"}</td>{sources.map((x) => { const v = x.norm[f]; return <td key={x.source}>{v === null || v === undefined ? "–" : typeof v === "number" ? v.toLocaleString("it-IT") : f === "sport" ? sportLabel(String(v)) : String(v)}</td>; })}</tr>
              ))}
              <tr><td>Acquisizione</td><td></td>{sources.map((x) => <td key={x.source}>{x.acquisition}, {when(x.fetched_at)}</td>)}</tr>
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
