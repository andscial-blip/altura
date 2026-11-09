import { catalog, dailySeries } from "@/lib/queries";
import { dec, hm, int, KIND_LABEL, SOURCE_LABEL } from "@/lib/fmt";
import { LineChart } from "@/components/charts";

export const dynamic = "force-dynamic";

const SHOW: { metric: string; color: string; fmt: (v: number) => string; band?: [string, string] }[] = [
  { metric: "hrv_night", color: "var(--s2)", fmt: (v) => dec(v, 0), band: ["hrv_baseline_low", "hrv_baseline_high"] },
  { metric: "resting_hr", color: "var(--s1)", fmt: (v) => dec(v, 0) },
  { metric: "sleep_s", color: "var(--s4)", fmt: (v) => hm(v) },
  { metric: "sleep_score", color: "var(--s4)", fmt: (v) => dec(v, 0) },
  { metric: "body_battery_high", color: "var(--s3)", fmt: (v) => dec(v, 0) },
  { metric: "stress_avg", color: "var(--s0)", fmt: (v) => dec(v, 0) },
  { metric: "steps", color: "var(--s3)", fmt: (v) => int(v) },
  { metric: "vo2max_run", color: "var(--s2)", fmt: (v) => dec(v, 1) },
  { metric: "weight_kg", color: "var(--s0)", fmt: (v) => dec(v, 1) },
  { metric: "hrv_sdnn", color: "var(--s2)", fmt: (v) => dec(v, 0) },
];

export default async function Page({ searchParams }: { searchParams: Promise<{ g?: string }> }) {
  const g = Math.min(365, Math.max(14, Number((await searchParams).g ?? 90) || 90));
  const cat = Object.fromEntries((await catalog()).map((c) => [c.metric, c]));
  const data = await Promise.all(SHOW.map(async (s) => ({ s, pts: await dailySeries(s.metric, g), band: s.band ? await Promise.all(s.band.map((b) => dailySeries(b, g))) : null })));
  const withData = data.filter((d) => d.pts.length > 0);
  return (
    <div className="stack">
      <div className="head">
        <div><h1>Salute</h1><p>Recupero e corpo negli ultimi {g} giorni. Ogni giorno usa la fonte più affidabile per quella metrica.</p></div>
        <nav className="chips">{[30, 90, 180, 365].map((d) => <a key={d} className="chip" aria-current={d === g ? "true" : undefined} href={`/salute?g=${d}`}>{d} giorni</a>)}</nav>
      </div>
      {withData.length === 0 && <div className="panel"><p className="empty">Nessuna metrica giornaliera ancora. Arrivano dalla sincronizzazione Garmin e, se attivata, dall&apos;automazione di Apple Salute.</p></div>}
      <div className="grid g2">
        {withData.map(({ s, pts, band }) => {
          const c = cat[s.metric];
          const srcs = [...new Set(pts.map((p) => p.source))];
          const last = pts[pts.length - 1];
          const lo = band?.[0].at(-1)?.value, hi = band?.[1].at(-1)?.value;
          const vals = pts.map((p) => p.value), mean = vals.reduce((a, b) => a + b, 0) / vals.length;
          return (
            <section key={s.metric} className="panel">
              <div className="row between" style={{ alignItems: "baseline" }}>
                <h2>{c?.label_it ?? s.metric}</h2>
                <span className="metric"><span className="v" style={{ fontSize: "1.25rem" }}>{s.fmt(last.value)}</span><span className="u">{c?.unit === "s" ? "" : c?.unit}</span></span>
              </div>
              <LineChart points={pts.map((p) => ({ x: p.day, y: p.value }))} color={s.color} fmt={s.fmt} band={lo !== undefined && hi !== undefined ? { lo, hi } : null} yLabel={c?.label_it} />
              <p className="note">
                Media del periodo {s.fmt(mean)}. {KIND_LABEL[c?.kind ?? "misura"]}, da {srcs.map((x) => SOURCE_LABEL[x]).join(" e ")}.
                {band && lo !== undefined ? ` La fascia colorata è il tuo intervallo abituale calcolato da Garmin (${dec(lo, 0)}–${dec(hi, 0)} ms).` : ""}
                {s.metric === "hrv_sdnn" ? " SDNN di Apple: non confrontabile con la variabilità notturna Garmin (RMSSD)." : ""}
              </p>
            </section>
          );
        })}
      </div>
    </div>
  );
}
