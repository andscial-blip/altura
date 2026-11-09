import { dailyLoad, dailyMulti } from "@/lib/queries";
import { q } from "@/lib/db";
import { cached } from "@/lib/cache";
import { isNum, linreg, mean, pearson, rolling, validDaily } from "@/lib/stats";
import { addDays, daysBetween, range } from "@/lib/dates";
import { day, dec, hm, int, SOURCE_LABEL, todayLocal } from "@/lib/fmt";
import { RangeBars, Scatter, StackBars, TimeChart } from "@/components/charts";
import { Card, Empty, Head, Kpi, Legend, Seg } from "@/components/Head";

export const dynamic = "force-dynamic";

const M = ["hrv_night", "hrv_baseline_low", "hrv_baseline_high", "resting_hr", "sleep_s", "sleep_score", "body_battery_high", "body_battery_low", "stress_avg", "steps", "hrv_sdnn"];
const ISO = /^\d{4}-\d{2}-\d{2}$/;

const firstDay = cached("firstDay", async () => (await q<{ d: string | null }>("select to_char(min(day),'YYYY-MM-DD') as d from sport.daily_metrics"))[0]?.d ?? null);

export default async function Page({ searchParams }: { searchParams: Promise<{ g?: string; from?: string; to?: string }> }) {
  const sp = await searchParams;
  const today = todayLocal();
  const first = (await firstDay()) ?? addDays(today, -90);
  const custom = sp.from && sp.to && ISO.test(sp.from) && ISO.test(sp.to) && sp.from < sp.to;
  const g = sp.g === "tutto" ? "tutto" : [30, 90, 180, 365].includes(Number(sp.g)) ? Number(sp.g) : 90;
  const to = custom ? (sp.to! > today ? today : sp.to!) : today;
  const from = custom ? sp.from! : g === "tutto" ? first : addDays(today, -(g as number) + 1);
  const span = daysBetween(from, to) + 1;
  const prevFrom = addDays(from, -span);
  const [dm, load] = await Promise.all([dailyMulti(M, daysBetween(prevFrom, today) + 8), dailyLoad(daysBetween(from, today) + 1)]);

  const days = range(addDays(from, -6), to);
  const val = (m: string) => { const by = new Map(dm[m].map((p) => [p.day, validDaily(m, p.value)])); return days.map((d) => by.get(d) ?? null); };
  const pts = (m: string, xs = val(m)) => days.map((d, i) => ({ d, v: xs[i] })).filter((p) => p.d >= from);
  const avg = (m: string, n = 7) => rolling(val(m), n, Math.ceil(n / 2));
  const inP = (m: string) => val(m).slice(6);
  const prevP = (m: string) => dm[m].filter((p) => p.day >= prevFrom && p.day < from).map((p) => validDaily(m, p.value));
  const srcs = (m: string) => [...new Set(dm[m].filter((p) => p.day >= from).map((p) => SOURCE_LABEL[p.source] ?? p.source))].join(" e ");
  const lastOf = (m: string) => { const v = inP(m).filter(isNum); return v.length ? v[v.length - 1] : null; };
  const has = (m: string) => inP(m).filter(isNum).length >= 3;
  const zoom = "/salute?";

  const hrvLo = lastOf("hrv_baseline_low"), hrvHi = lastOf("hrv_baseline_high");
  const hrvIn = inP("hrv_night").filter(isNum);
  const pctIn = hrvLo && hrvHi && hrvIn.length ? Math.round((hrvIn.filter((v) => v >= hrvLo && v <= hrvHi).length / hrvIn.length) * 100) : null;

  // sonno: tutto quello che c'è nel periodo, senza riempire le notti mancanti
  const sl = inP("sleep_s"), slN = sl.filter(isNum), slPrev = prevP("sleep_s").filter(isNum);
  const slMean = mean(slN), slPrevMean = mean(slPrev);
  const slSd = slN.length >= 5 ? Math.sqrt(slN.reduce((s, v) => s + (v - slMean!) ** 2, 0) / (slN.length - 1)) : null;
  const months = [...new Set(dm.sleep_s.map((p) => p.day.slice(0, 7)))].sort();
  const monthAvg = months.map((m) => mean(dm.sleep_s.filter((p) => p.day.startsWith(m)).map((p) => validDaily("sleep_s", p.value))));
  const monthN = months.map((m) => dm.sleep_s.filter((p) => p.day.startsWith(m) && validDaily("sleep_s", p.value) !== null).length);

  const hrvBy = new Map(dm.hrv_night.map((p) => [p.day, validDaily("hrv_night", p.value)]));
  const sc = load.filter((l) => l.day >= from && l.day <= to && l.load > 0).map((l) => ({ x: l.load, y: hrvBy.get(addDays(l.day, 1)) ?? null, d: l.day })).filter((p) => isNum(p.y)) as { x: number; y: number; d: string }[];
  const r = pearson(sc.map((p) => p.x), sc.map((p) => p.y));
  const lr = linreg(sc.map((p) => p.x), sc.map((p) => p.y));
  const rWord = r ? (Math.abs(r.r) < 0.1 ? "nessuna relazione" : Math.abs(r.r) < 0.3 ? "relazione debole" : Math.abs(r.r) < 0.5 ? "relazione moderata" : "relazione forte") : null;
  const bb = days.filter((d) => d >= from).map((d) => { const i = days.indexOf(d); return { d, lo: val("body_battery_low")[i], hi: val("body_battery_high")[i] }; }).filter((p) => isNum(p.lo) && isNum(p.hi)) as { d: string; lo: number; hi: number }[];
  const any = M.some((m) => has(m));
  const periodLabel = custom ? `dal ${day(from, { day: "numeric", month: "short" })} al ${day(to, { day: "numeric", month: "short", year: "numeric" })}` : g === "tutto" ? `dal ${day(from, { day: "numeric", month: "short", year: "numeric" })}` : `ultimi ${g} giorni`;
  const d1 = (v: number) => `${v >= 0 ? "▲" : "▼"} ${hm(Math.abs(v))}`;

  return (
    <div className="stack-l">
      <Head icon="heart" title="Salute" sub="Recupero e corpo. Un valore al giorno per metrica, dalla fonte più affidabile; i giorni senza dato restano vuoti." />
      <div className="row between">
        <Seg className="inline" label="Periodo" items={[...[30, 90, 180, 365].map((d) => ({ href: `/salute?g=${d}`, label: d === 365 ? "1 anno" : `${d} gg`, on: !custom && d === g })), { href: "/salute?g=tutto", label: "Tutto", on: !custom && g === "tutto" }]} />
        {custom && <span className="note">Periodo scelto: {periodLabel} · <a href={`/salute?g=90`}>torna a 90 giorni</a></span>}
      </div>
      {!any ? <div className="card"><Empty icon="heart" title="Nessuna metrica in questo periodo" text="Variabilità, sonno e battito arrivano dall'orologio Garmin; passi ed energia anche dall'automazione di Apple Salute." action={{ href: "/impostazioni", label: "Controlla i collegamenti" }} /></div> : (
        <>
          <div className="kpis">
            <Kpi label="Variabilità notte, media" icon="hrv" value={mean(hrvIn) !== null ? int(mean(hrvIn)) : "–"} unit="ms" foot={pctIn !== null ? `${pctIn}% delle notti nella fascia` : periodLabel} />
            <Kpi label="Battito a riposo, media" icon="heart" value={mean(inP("resting_hr")) !== null ? int(mean(inP("resting_hr"))) : "–"} unit="bpm" foot={lastOf("resting_hr") ? `ultimo ${int(lastOf("resting_hr"))}` : undefined} />
            <Kpi label="Sonno, media" icon="sleep" value={slMean !== null ? hm(slMean) : "–"} foot={`${slN.length} notti su ${span}`} delta={slMean !== null && slPrevMean !== null && slPrev.length >= 3 ? { text: `${d1(slMean - slPrevMean)} vs prima`, dir: Math.abs(slMean - slPrevMean) < 600 ? "ne" : slMean > slPrevMean ? "up" : "dn" } : null} />
            <Kpi label="Passi, media" icon="steps" value={mean(inP("steps")) !== null ? int(mean(inP("steps"))) : "–"} foot={srcs("steps") || undefined} />
          </div>

          {has("hrv_night") && (
            <Card title="Variabilità cardiaca notturna" icon="hrv" aside="ms">
              <TimeChart from={from} to={to} zoomHref={zoom} label="Variabilità cardiaca notturna" fmt={(v) => int(v)} unit="ms" band={hrvLo && hrvHi ? { lo: hrvLo, hi: hrvHi } : null}
                series={[{ name: "Notte", color: "var(--accent)", kind: "dots", width: 5, pts: pts("hrv_night") }, { name: "Media 7 gg", color: "var(--ink)", kind: "line", pts: pts("hrv_night", avg("hrv_night")) }]} />
              <Legend items={[{ label: "Valore della notte", color: "var(--accent)" }, { label: "Media 7 giorni", color: "var(--ink)", line: true }, ...(hrvLo ? [{ label: `Fascia abituale ${int(hrvLo)}–${int(hrvHi)} ms`, color: "var(--band)" }] : [])]} />
              <p className="note" style={{ marginTop: 6 }}>RMSSD notturno misurato da {srcs("hrv_night")}. La fascia è quella calcolata oggi da Garmin sulle tue ultime settimane. Conta la media su più giorni più della singola notte.{has("hrv_sdnn") ? " Apple misura SDNN, non confrontabile: non è mescolato." : ""}</p>
            </Card>
          )}

          {slN.length >= 3 && (
            <Card title="Sonno" icon="sleep" id="sonno" aside={`${slN.length} notti registrate · ${periodLabel}`}>
              <TimeChart from={from} to={to} zoomHref={zoom} label="Ore di sonno per notte" fmt={(v) => dec(v, 1)} unit="h" height={140}
                series={[
                  { name: "Notte", color: "var(--h2)", kind: "bars", pts: pts("sleep_s").map((p) => ({ d: p.d, v: isNum(p.v) ? p.v / 3600 : null })) },
                  { name: "Media 7 notti", color: "var(--ink)", kind: "line", pts: pts("sleep_s", avg("sleep_s")).map((p) => ({ d: p.d, v: isNum(p.v) ? p.v / 3600 : null })) },
                  ...(span > 45 ? [{ name: "Media 30 notti", color: "var(--accent)", kind: "line" as const, dash: true, pts: pts("sleep_s", avg("sleep_s", 30)).map((p) => ({ d: p.d, v: isNum(p.v) ? p.v / 3600 : null })) }] : []),
                ]} />
              <Legend items={[{ label: "Notte registrata", color: "var(--h2)" }, { label: "Media 7 notti", color: "var(--ink)", line: true }, ...(span > 45 ? [{ label: "Media 30 notti", color: "var(--accent)", line: true, dash: true }] : [])]} />
              <dl className="kv" style={{ marginTop: 12, maxWidth: 520 }}>
                <dt>Durata media</dt><dd className="mono">{hm(slMean)}</dd>
                <dt>Periodo precedente di pari durata</dt><dd className="mono">{slPrev.length >= 3 ? `${hm(slPrevMean)} (${slPrev.length} notti)` : "dati insufficienti"}</dd>
                <dt>Regolarità (deviazione standard della durata)</dt><dd className="mono">{slSd !== null ? `± ${int(slSd / 60)} min` : "–"}</dd>
                <dt>Notti sotto le 6 ore</dt><dd className="mono">{slN.filter((v) => v < 6 * 3600).length} su {slN.length}</dd>
                <dt>Copertura</dt><dd className="mono">{Math.round((slN.length / span) * 100)}% delle notti</dd>
              </dl>
              {months.length >= 2 && (
                <div style={{ marginTop: 14 }}>
                  <h3 style={{ marginBottom: 6 }}>Media mensile, tutto lo storico</h3>
                  <StackBars cats={months} stacks={[{ name: "Media del mese", color: "var(--h3)", values: monthAvg.map((v) => (v ?? 0) / 3600) }]} fmt={(v) => dec(v, 1)} unit="h" height={90} label="Media mensile delle ore di sonno"
                    catLabel={(m) => day(m + "-15", { month: "short", year: "2-digit" })} />
                  <p className="note">Notti registrate per mese: {months.map((m, i) => `${day(m + "-15", { month: "short" })} ${monthN[i]}`).join(" · ")}.</p>
                </div>
              )}
              <p className="note" style={{ marginTop: 8 }}>Fonte: {srcs("sleep_s")}. Le notti senza orologio non sono stimate né interpolate. L&apos;orario di addormentamento non è disponibile, quindi la regolarità riguarda solo la durata.</p>
            </Card>
          )}

          <div className="grid g2">
            {has("resting_hr") && (
              <Card title="Battito a riposo" icon="heart" aside="bpm">
                <TimeChart from={from} to={to} zoomHref={zoom} label="Battito a riposo" fmt={(v) => int(v)} unit="bpm" height={110}
                  series={[{ name: "Giorno", color: "var(--z5)", kind: "line", width: 1.4, pts: pts("resting_hr") }, { name: "Media 7 gg", color: "var(--ink)", kind: "line", pts: pts("resting_hr", avg("resting_hr")) }]} />
                <Legend items={[{ label: "Giorno", color: "var(--z5)", line: true }, { label: "Media 7 giorni", color: "var(--ink)", line: true }]} />
                <p className="note" style={{ marginTop: 6 }}>Più basso del solito: in genere buon recupero. Un aumento di 5 bpm o più per più giorni merita attenzione. Fonte: {srcs("resting_hr")}.</p>
              </Card>
            )}
            {bb.length >= 3 && (
              <Card title="Body Battery" icon="battery" aside="minimo e massimo del giorno">
                <RangeBars pts={bb} from={from} to={to} fmt={(v) => int(v)} label="Body Battery minimo e massimo per giorno" />
                <p className="note" style={{ marginTop: 6 }}>Stima proprietaria Garmin (0–100) da variabilità, stress e attività. I giorni senza registrazione sono esclusi.</p>
              </Card>
            )}
            {sc.length >= 5 && r && (
              <Card title="Carico e recupero" icon="load" aside={`r = ${dec(r.r, 2)} · ${r.n} giorni`}>
                <Scatter pts={sc.map((p) => ({ x: p.x, y: p.y, tip: `${p.d.split("-").reverse().join("/")}: carico ${int(p.x)} → ${int(p.y)} ms` }))} trend={lr} xFmt={(v) => int(v)} yFmt={(v) => int(v)} color="var(--accent)" label="Carico del giorno e variabilità della notte seguente" />
                <p className="note">Asse orizzontale: carico Garmin del giorno · verticale: variabilità della notte dopo (ms).</p>
                <p className="note" style={{ marginTop: 6 }}>{rWord && `Correlazione di Pearson ${dec(r.r, 2)}: ${rWord}`}{r.r < 0 ? " (più carico, variabilità più bassa)." : "."} Correlazione, non causa: contano anche sonno, caldo, stress.</p>
              </Card>
            )}
            {has("stress_avg") && (
              <Card title="Stress medio" icon="trend" aside="0–100">
                <TimeChart from={from} to={to} zoomHref={zoom} label="Stress medio giornaliero" fmt={(v) => int(v)} height={110}
                  series={[{ name: "Giorno", color: "var(--ride)", kind: "line", width: 1.4, pts: pts("stress_avg") }, { name: "Media 7 gg", color: "var(--ink)", kind: "line", pts: pts("stress_avg", avg("stress_avg")) }]} />
                <p className="note" style={{ marginTop: 6 }}>Stima Garmin dalla variabilità cardiaca durante il giorno. I giorni con dati insufficienti (valore −1) sono esclusi.</p>
              </Card>
            )}
            {has("steps") && (
              <Card title="Passi" icon="steps">
                <TimeChart from={from} to={to} zoomHref={zoom} label="Passi al giorno" fmt={(v) => (v >= 1000 ? `${dec(v / 1000, 0)}k` : int(v))} height={110}
                  series={[{ name: "Passi", color: "var(--h3)", kind: "bars", pts: pts("steps") }, { name: "Media 7 gg", color: "var(--ink)", kind: "line", pts: pts("steps", avg("steps")) }]} />
                <p className="note" style={{ marginTop: 6 }}>Fonte: {srcs("steps")}. Se arrivano sia Garmin sia iPhone vale la fonte prioritaria, senza sommarle.</p>
              </Card>
            )}
          </div>
          <p className="note only-d">Per ingrandire un periodo trascina sopra un grafico (mouse) oppure scegli il periodo in alto.</p>
        </>
      )}
    </div>
  );
}
