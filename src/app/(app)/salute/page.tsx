import { dailyLoad, dailyMulti } from "@/lib/queries";
import { isNum, linreg, mean, pearson, rolling, validDaily } from "@/lib/stats";
import { addDays, range } from "@/lib/dates";
import { dec, hm, int, SOURCE_LABEL, todayLocal } from "@/lib/fmt";
import { RangeBars, Scatter, TimeChart } from "@/components/charts";
import { Card, Head, Kpi, Legend, Seg } from "@/components/Head";

export const dynamic = "force-dynamic";

const M = ["hrv_night", "hrv_baseline_low", "hrv_baseline_high", "resting_hr", "sleep_s", "sleep_score", "body_battery_high", "body_battery_low", "stress_avg", "steps", "active_kcal", "vo2max_run", "weight_kg", "hrv_sdnn"];

export default async function Page({ searchParams }: { searchParams: Promise<{ g?: string }> }) {
  const g = [30, 90, 180, 365].includes(Number((await searchParams).g)) ? Number((await searchParams).g) : 90;
  const today = todayLocal(), from = addDays(today, -g + 1);
  const [dm, load] = await Promise.all([dailyMulti(M, g + 7), dailyLoad(g + 1)]);
  const days = range(addDays(from, -6), today);
  const val = (m: string) => { const by = new Map(dm[m].map((p) => [p.day, validDaily(m, p.value)])); return days.map((d) => by.get(d) ?? null); };
  const pts = (m: string, xs = val(m)) => days.map((d, i) => ({ d, v: xs[i] })).filter((p) => p.d >= from);
  const avg7 = (m: string) => rolling(val(m), 7, 4);
  const inP = (m: string) => val(m).slice(6);
  const srcs = (m: string) => [...new Set(dm[m].filter((p) => p.day >= from).map((p) => SOURCE_LABEL[p.source] ?? p.source))].join(" e ");
  const lastOf = (m: string) => { const v = inP(m).filter(isNum); return v.length ? v[v.length - 1] : null; };
  const has = (m: string) => inP(m).filter(isNum).length >= 3;

  const hrvLo = lastOf("hrv_baseline_low"), hrvHi = lastOf("hrv_baseline_high");
  const hrvIn = inP("hrv_night").filter(isNum);
  const pctIn = hrvLo && hrvHi && hrvIn.length ? Math.round((hrvIn.filter((v) => v >= hrvLo && v <= hrvHi).length / hrvIn.length) * 100) : null;

  // carico del giorno → variabilità della notte successiva (Garmin la attribuisce al giorno del risveglio)
  const hrvBy = new Map(dm.hrv_night.map((p) => [p.day, validDaily("hrv_night", p.value)]));
  const sc = load.filter((l) => l.day >= from && l.load > 0).map((l) => ({ x: l.load, y: hrvBy.get(addDays(l.day, 1)) ?? null, d: l.day })).filter((p) => isNum(p.y)) as { x: number; y: number; d: string }[];
  const r = pearson(sc.map((p) => p.x), sc.map((p) => p.y));
  const lr = linreg(sc.map((p) => p.x), sc.map((p) => p.y));
  const rWord = r ? (Math.abs(r.r) < 0.1 ? "nessuna relazione" : Math.abs(r.r) < 0.3 ? "relazione debole" : Math.abs(r.r) < 0.5 ? "relazione moderata" : "relazione forte") : null;

  const bb = days.filter((d) => d >= from).map((d) => { const i = days.indexOf(d); return { d, lo: val("body_battery_low")[i], hi: val("body_battery_high")[i] }; }).filter((p) => isNum(p.lo) && isNum(p.hi)) as { d: string; lo: number; hi: number }[];
  const any = M.some((m) => has(m));

  return (
    <div className="stack-l">
      <Head title="Salute" sub="Recupero e corpo. Un valore al giorno per metrica, dalla fonte più affidabile; i giorni senza dato restano vuoti." />
      <Seg className="inline" label="Periodo" items={[30, 90, 180, 365].map((d) => ({ href: `/salute?g=${d}`, label: d === 365 ? "1 anno" : `${d} giorni`, on: d === g }))} />
      {!any ? <div className="card"><p className="empty">Nessuna metrica giornaliera nel periodo. Arrivano da Garmin e dall&apos;automazione di Apple Salute.</p></div> : (
        <>
          <div className="kpis">
            <Kpi label="Variabilità notte, media" icon="hrv" value={mean(hrvIn) !== null ? int(mean(hrvIn)) : "–"} unit="ms" foot={pctIn !== null ? `${pctIn}% delle notti nella fascia` : undefined} />
            <Kpi label="Battito a riposo, media" icon="heart" value={mean(inP("resting_hr")) !== null ? int(mean(inP("resting_hr"))) : "–"} unit="bpm" foot={lastOf("resting_hr") ? `ultimo ${int(lastOf("resting_hr"))}` : undefined} />
            <Kpi label="Sonno, media" icon="sleep" value={mean(inP("sleep_s")) !== null ? hm(mean(inP("sleep_s"))) : "–"} foot={`${inP("sleep_s").filter(isNum).length} notti registrate`} />
            <Kpi label="Passi, media" icon="steps" value={mean(inP("steps")) !== null ? int(mean(inP("steps"))) : "–"} foot={srcs("steps") || undefined} />
          </div>

          {has("hrv_night") && (
            <Card title="Variabilità cardiaca notturna" icon="hrv" aside="ms">
              <TimeChart from={from} to={today} label="Variabilità cardiaca notturna" fmt={(v) => int(v)} unit="ms" band={hrvLo && hrvHi ? { lo: hrvLo, hi: hrvHi } : null}
                series={[{ name: "Notte", color: "var(--accent)", kind: "dots", width: 5, pts: pts("hrv_night") }, { name: "Media 7 gg", color: "var(--ink)", kind: "line", pts: pts("hrv_night", avg7("hrv_night")) }]} />
              <Legend items={[{ label: "Valore della notte", color: "var(--accent)" }, { label: "Media 7 giorni", color: "var(--ink)", line: true }, ...(hrvLo ? [{ label: `Fascia abituale ${int(hrvLo)}–${int(hrvHi)} ms`, color: "var(--band)" }] : [])]} />
              <p className="note" style={{ marginTop: 6 }}>RMSSD notturno misurato da {srcs("hrv_night")}. La fascia è quella calcolata oggi da Garmin sulle tue ultime settimane. Conta la media su più giorni più della singola notte.{has("hrv_sdnn") ? " Apple misura SDNN, non confrontabile con questo valore: non è mescolata." : ""}</p>
            </Card>
          )}

          <div className="grid g2">
            {has("resting_hr") && (
              <Card title="Battito a riposo" icon="heart" aside="bpm">
                <TimeChart from={from} to={today} label="Battito a riposo" fmt={(v) => int(v)} unit="bpm" height={110}
                  series={[{ name: "Giorno", color: "var(--z5)", kind: "line", width: 1.4, pts: pts("resting_hr") }, { name: "Media 7 gg", color: "var(--ink)", kind: "line", pts: pts("resting_hr", avg7("resting_hr")) }]} />
                <Legend items={[{ label: "Giorno", color: "var(--z5)", line: true }, { label: "Media 7 giorni", color: "var(--ink)", line: true }]} />
                <p className="note" style={{ marginTop: 6 }}>Più basso del solito: in genere buon recupero. Un aumento di 5+ bpm per più giorni merita attenzione. Fonte: {srcs("resting_hr")}.</p>
              </Card>
            )}
            {has("sleep_s") && (
              <Card title="Sonno" icon="sleep" aside="ore">
                <TimeChart from={from} to={today} label="Ore di sonno" fmt={(v) => dec(v, 1)} unit="h" height={110}
                  series={[{ name: "Notte", color: "var(--h2)", kind: "bars", pts: pts("sleep_s").map((p) => ({ d: p.d, v: isNum(p.v) ? p.v / 3600 : null })) }, { name: "Media 7 gg", color: "var(--ink)", kind: "line", pts: pts("sleep_s", avg7("sleep_s")).map((p) => ({ d: p.d, v: isNum(p.v) ? p.v / 3600 : null })) }]} />
                <Legend items={[{ label: "Notte", color: "var(--h2)" }, { label: "Media 7 giorni", color: "var(--ink)", line: true }]} />
                <p className="note" style={{ marginTop: 6 }}>Durata registrata dall&apos;orologio ({srcs("sleep_s")}); le notti senza orologio non compaiono.</p>
              </Card>
            )}
            {bb.length >= 3 && (
              <Card title="Body Battery" icon="battery" aside="minimo–massimo del giorno">
                <RangeBars pts={bb} from={from} to={today} fmt={(v) => int(v)} label="Body Battery minimo e massimo per giorno" />
                <p className="note" style={{ marginTop: 6 }}>Stima proprietaria Garmin (0–100) da variabilità, stress e attività. I giorni senza registrazione sono esclusi.</p>
              </Card>
            )}
            {sc.length >= 5 && r && (
              <Card title="Carico e recupero" icon="load" aside={`r = ${dec(r.r, 2)} · ${r.n} giorni`}>
                <Scatter pts={sc.map((p) => ({ x: p.x, y: p.y, tip: `${p.d.split("-").reverse().join("/")}: carico ${int(p.x)} → ${int(p.y)} ms` }))} trend={lr} xFmt={(v) => int(v)} yFmt={(v) => int(v)} color="var(--accent)" label="Carico del giorno e variabilità della notte seguente" />
                <div className="row between note" style={{ marginTop: 2, marginRight: 42 }}><span>carico Garmin del giorno →</span></div>
                <p className="note" style={{ marginTop: 6 }}>Ogni punto: carico di un giorno di allenamento e variabilità della notte dopo. {rWord && `Correlazione di Pearson ${dec(r.r, 2)}: ${rWord}`}{r.r < 0 ? " (più carico, variabilità più bassa)." : "."} Correlazione, non causa: contano anche sonno, caldo, stress.</p>
              </Card>
            )}
            {has("stress_avg") && (
              <Card title="Stress medio" icon="trend" aside="0–100">
                <TimeChart from={from} to={today} label="Stress medio giornaliero" fmt={(v) => int(v)} height={110}
                  series={[{ name: "Giorno", color: "var(--ride)", kind: "line", width: 1.4, pts: pts("stress_avg") }, { name: "Media 7 gg", color: "var(--ink)", kind: "line", pts: pts("stress_avg", avg7("stress_avg")) }]} />
                <p className="note" style={{ marginTop: 6 }}>Stima Garmin dalla variabilità cardiaca durante il giorno. I giorni con dati insufficienti (valore −1) sono esclusi.</p>
              </Card>
            )}
            {has("steps") && (
              <Card title="Passi" icon="steps">
                <TimeChart from={from} to={today} label="Passi al giorno" fmt={(v) => (v >= 1000 ? `${dec(v / 1000, 0)}k` : int(v))} height={110}
                  series={[{ name: "Passi", color: "var(--h3)", kind: "bars", pts: pts("steps") }, { name: "Media 7 gg", color: "var(--ink)", kind: "line", pts: pts("steps", avg7("steps")) }]} />
                <p className="note" style={{ marginTop: 6 }}>Fonte: {srcs("steps")}. Se arrivano sia Garmin sia iPhone vale la fonte prioritaria, senza sommarle.</p>
              </Card>
            )}
          </div>
        </>
      )}
    </div>
  );
}
