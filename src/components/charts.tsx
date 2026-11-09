/**
 * Grafici di Altura: SVG resi sul server (nessuna libreria), valori esatti al tocco con <Tip>.
 * Regole: asse del tempo reale (giorni mancanti = linea interrotta, mai interpolata), legenda e unità sempre presenti,
 * il punto di oggi in giallo, assi con valori "tondi".
 */
import { Tip, type TipRow } from "@/components/Tip";
import { Empty } from "@/components/Head";
import { isNum, niceTicks } from "@/lib/stats";
import { day } from "@/lib/fmt";

const W = 300, H = 100, PAD = 6;
const f1 = (v: number) => Math.round(v * 10) / 10;
const dms = (d: string) => Date.parse(d.length === 10 ? d + "T12:00:00Z" : d);

type Axis = { v: number; y: number; label: string };

function yScale(lo: number, hi: number) {
  return (v: number) => PAD + (1 - (v - lo) / (hi - lo || 1)) * (H - 2 * PAD);
}

function Frame({ height, yTicks, xTicks, tips, label, children, after, zoomHref, overlay, xAll = false }: {
  height: number; yTicks: Axis[]; xTicks: { x: number; label: string; hl?: boolean }[]; tips: TipRow[]; label: string; children: React.ReactNode; after?: React.ReactNode; zoomHref?: string;
  overlay?: React.ReactNode; xAll?: boolean;
}) {
  return (
    <Tip tips={tips} label={label} zoomHref={zoomHref}>
      <div className="plot">
        <div className="pl">
          <svg className="c" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ height }} aria-hidden="true">
            <g aria-hidden="true">{yTicks.map((t) => <path key={t.v} d={`M0 ${f1(t.y)}H${W}`} stroke="var(--line-2)" vectorEffect="non-scaling-stroke" />)}</g>
            {children}
          </svg>
          {overlay}
        </div>
        <div className="yax" style={{ height }} aria-hidden="true">{yTicks.map((t) => <span key={t.v} style={{ top: `${t.y}%` }}>{t.label}</span>)}</div>
      </div>
      <div className={`xax${xAll ? " all" : ""}`} aria-hidden="true">{xTicks.map((t, i) => <span key={i} className={t.hl ? "hl" : undefined} style={{ left: `${t.x * 100}%` }}>{t.label}</span>)}</div>
      {after}
    </Tip>
  );
}

function dateTicks(t0: number, t1: number, n = 3) {
  const out: { x: number; label: string }[] = [];
  for (let i = 0; i < n; i++) {
    const t = t0 + ((t1 - t0) * i) / (n - 1);
    out.push({ x: i / (n - 1), label: day(new Date(t).toISOString().slice(0, 10), { day: "numeric", month: "short" }) });
  }
  return out;
}

export type Series = { name: string; pts: { d: string; v: number | null }[]; kind?: "line" | "area" | "dots" | "bars"; color: string; width?: number; dash?: boolean; gapDays?: number; tip?: boolean };

/** Serie temporali su asse del tempo reale, con fascia di riferimento, linea di riferimento e punto di oggi. */
export function TimeChart({ series, from, to, band, refLine, fmt, unit = "", height = 130, label, maxGapDays = 2.5, today = true, domain, zoomHref, invert = false, step }: {
  series: Series[]; from: string; to: string; band?: { lo: number; hi: number } | null; refLine?: { v: number; dash?: boolean } | null;
  fmt: (v: number) => string; unit?: string; height?: number; label: string; maxGapDays?: number; today?: boolean; domain?: [number, number]; zoomHref?: string;
  /** asse rovesciato: valori bassi in alto (passo, tempi: più in alto = più veloce) */ invert?: boolean;
  /** tacche a multipli di step (es. 300 s = 5 minuti), raddoppiato finché ne restano al massimo 4 */ step?: number;
}) {
  const t0 = dms(from), t1 = dms(to);
  const all = series.flatMap((s) => s.pts.map((p) => p.v)).filter(isNum);
  if (all.length < 2) return <Empty inline icon="chart" title="Dati insufficienti per un andamento" text="Servono almeno due giorni con un valore in questo periodo." />;
  let lo = domain?.[0] ?? Math.min(...all, band?.lo ?? Infinity, refLine?.v ?? Infinity);
  let hi = domain?.[1] ?? Math.max(...all, band?.hi ?? -Infinity, refLine?.v ?? -Infinity);
  if (!domain) { const p = (hi - lo) * 0.08 || 1; lo -= p; hi += p; if (series.some((s) => s.kind === "bars")) lo = Math.min(0, lo); }
  const Y = invert ? yScale(hi, lo) : yScale(lo, hi), X = (d: string) => ((dms(d) - t0) / (t1 - t0 || 1)) * W;
  let tv = niceTicks(lo, hi, 3);
  if (step) { let st = step; const mk = () => { const out: number[] = []; for (let v = Math.ceil(lo / st) * st; v <= hi; v += st) out.push(v); return out; }; tv = mk(); while (tv.length > 4) { st *= 2; tv = mk(); } }
  const ticks = tv.filter((v) => v >= lo && v <= hi).map((v) => ({ v, y: Y(v), label: fmt(v) }));
  const span = Math.max(1, (t1 - t0) / 86400000);
  const barW = Math.max(2, Math.min(14, (300 / span) * 0.6));
  const els: React.ReactNode[] = [];
  if (band) els.push(<rect key="band" x="0" width={W} y={f1(Math.min(Y(band.hi), Y(band.lo)))} height={f1(Math.abs(Y(band.lo) - Y(band.hi)))} fill="var(--band)" />);
  if (refLine) els.push(<path key="ref" d={`M0 ${f1(Y(refLine.v))}H${W}`} stroke="var(--faint)" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />);
  series.forEach((s, si) => {
    const pts = s.pts.filter((p) => isNum(p.v) && dms(p.d) >= t0 - 43200000 && dms(p.d) <= t1 + 43200000) as { d: string; v: number }[];
    if (s.kind === "bars") {
      els.push(<path key={si} d={pts.map((p) => `M${f1(X(p.d))} ${f1(Y(Math.max(lo, 0)))}V${f1(Y(p.v))}`).join("")} stroke={s.color} strokeWidth={barW} vectorEffect="non-scaling-stroke" />);
      return;
    }
    if (s.kind === "dots") {
      els.push(<path key={si} d={pts.map((p) => `M${f1(X(p.d))} ${f1(Y(p.v))}h0`).join("")} stroke={s.color} strokeWidth={s.width ?? 5} strokeLinecap="round" vectorEffect="non-scaling-stroke" />);
      return;
    }
    let d = "", prev: number | null = null;
    for (const p of pts) {
      const t = dms(p.d);
      d += `${prev !== null && (t - prev) / 86400000 <= (s.gapDays ?? maxGapDays) ? "L" : "M"}${f1(X(p.d))} ${f1(Y(p.v))}`;
      prev = t;
    }
    if (s.kind === "area" && pts.length > 1) {
      const base = f1(Y(Math.max(lo, Math.min(hi, 0 < lo ? lo : 0))));
      els.push(<path key={`a${si}`} d={`${d.replace(/M/g, "L").replace(/^L/, "M")}L${f1(X(pts[pts.length - 1].d))} ${base}L${f1(X(pts[0].d))} ${base}Z`} fill={s.color} opacity=".16" />);
    }
    els.push(<path key={si} d={d} fill="none" stroke={s.color} strokeWidth={s.width ?? 2} strokeDasharray={s.dash ? "4 3" : undefined} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />);
  });
  const main = series[0].pts.filter((p) => isNum(p.v)) as { d: string; v: number }[];
  const last = main[main.length - 1];
  if (today && last) els.push(<path key="today" d={`M${f1(X(last.d))} ${f1(Y(last.v))}h0`} stroke="var(--sun)" strokeWidth="9" strokeLinecap="round" vectorEffect="non-scaling-stroke" />);
  const days = [...new Set(series.flatMap((s) => s.pts.filter((p) => isNum(p.v)).map((p) => p.d)))].sort();
  const tips: TipRow[] = days.map((d) => ({
    x: (dms(d) - t0) / (t1 - t0 || 1), d,
    lines: [day(d, { weekday: "short", day: "numeric", month: "short" }), ...series.filter((s) => s.tip !== false).map((s) => { const p = s.pts.find((q) => q.d === d); return p && isNum(p.v) ? `${series.filter((x) => x.tip !== false).length > 1 ? s.name + " " : ""}${fmt(p.v)}${unit ? " " + unit : ""}` : null; }).filter((x): x is string => !!x)],
  }));
  return <Frame height={height} yTicks={ticks} xTicks={dateTicks(t0, t1)} tips={tips} label={label} zoomHref={zoomHref}>{els}</Frame>;
}

/** Barre per categoria (settimane), impilate per disciplina, con linea opzionale (media mobile). */
export function StackBars({ cats, stacks, line, fmt, unit = "", height = 130, label, catLabel, highlight, valueFmt }: {
  cats: string[]; stacks: { name: string; color: string; values: number[] }[]; line?: { name: string; values: (number | null)[] } | null;
  fmt: (v: number) => string; unit?: string; height?: number; label: string; catLabel: (c: string) => string; highlight?: number; valueFmt?: (v: number) => string;
}) {
  const n = cats.length;
  const labels = n <= 16;
  const tot = cats.map((_, i) => stacks.reduce((a, s) => a + (s.values[i] ?? 0), 0));
  const hi = Math.max(...tot, ...(line?.values.filter(isNum) ?? []), 1) * (labels ? 1.2 : 1.08);
  const Y = yScale(0, hi);
  const bw = W / n, sw = Math.max(3, Math.min(18, (300 / n) * 0.62));
  const ticks = niceTicks(0, hi, 3).filter((v) => v > 0 && v <= hi).map((v) => ({ v, y: Y(v), label: fmt(v) }));
  const els: React.ReactNode[] = [];
  const acc = new Array(n).fill(0);
  stacks.forEach((s, si) => {
    let d = "";
    s.values.forEach((v, i) => { if (v > 0) { const y0 = Y(acc[i]), y1 = Y(acc[i] + v); d += `M${f1(i * bw + bw / 2)} ${f1(y0 - (acc[i] > 0 ? 1.2 : 0))}V${f1(y1)}`; acc[i] += v; } });
    if (d) els.push(<path key={si} d={d} stroke={s.color} strokeWidth={sw} vectorEffect="non-scaling-stroke" />);
  });
  if (!labels && highlight !== undefined && tot[highlight] > 0) els.push(<path key="hl" d={`M${f1(highlight * bw + bw / 2)} ${f1(Y(tot[highlight]) - 3)}h0`} stroke="var(--sun)" strokeWidth="8" strokeLinecap="round" vectorEffect="non-scaling-stroke" />);
  if (line) {
    let d = "", pen = false;
    line.values.forEach((v, i) => { if (!isNum(v)) { pen = false; return; } d += `${pen ? "L" : "M"}${f1(i * bw + bw / 2)} ${f1(Y(v))}`; pen = true; });
    els.push(<path key="ln" d={d} fill="none" stroke="var(--ink)" strokeWidth="2" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />);
  }
  const every = n <= 8 ? 1 : n <= 16 ? 2 : 0;
  const xt = every ? cats.map((c, i) => ({ i, x: (i + 0.5) / n, label: catLabel(c), hl: i === highlight })).filter((t) => (n - 1 - t.i) % every === 0)
    : [0, Math.floor((n - 1) / 2), n - 1].map((i) => ({ x: (i + 0.5) / n, label: catLabel(cats[i]) }));
  // valori scritti sopra le barre (leggibili senza asse e senza toccare)
  const vf = valueFmt ?? ((v: number) => (v >= 10000 ? `${(v / 1000).toLocaleString("it-IT", { maximumFractionDigits: 0 })}k` : v >= 1000 ? `${(v / 1000).toLocaleString("it-IT", { maximumFractionDigits: 1 })}k` : fmt(v)));
  const overlay = labels ? <div className="vlab" aria-hidden="true">{tot.map((v, i) => (v > 0 ? <span key={i} className={i === highlight ? "hl" : undefined} style={{ left: `${((i + 0.5) / n) * 100}%`, top: `${Y(v)}%` }}>{vf(v)}</span> : null))}</div> : null;
  const tips: TipRow[] = cats.map((c, i) => ({ x: (i + 0.5) / n, lines: [catLabel(c), ...stacks.filter((s) => s.values[i] > 0).map((s) => `${s.name} ${fmt(s.values[i])}${unit ? " " + unit : ""}`), ...(stacks.length > 1 ? [`Totale ${fmt(tot[i])}${unit ? " " + unit : ""}`] : []), ...(line && isNum(line.values[i]) ? [`${line.name} ${fmt(line.values[i] as number)}`] : [])] }));
  return <Frame height={height} yTicks={ticks} xTicks={xt} tips={tips} label={label} overlay={overlay} xAll={!!every}>{els}</Frame>;
}

/** Diagramma a dispersione con retta dei minimi quadrati. */
export function Scatter({ pts, xDomain, yDomain, trend, xFmt, yFmt, color = "var(--run)", height = 130, label, xTicksN = 3 }: {
  pts: { x: number; y: number; tip: string }[]; xDomain?: [number, number]; yDomain?: [number, number]; trend?: { a: number; b: number } | null;
  xFmt: (v: number) => string; yFmt: (v: number) => string; color?: string; height?: number; label: string; xTicksN?: number;
}) {
  if (pts.length < 3) return <Empty inline icon="chart" title="Dati insufficienti per un confronto" text="Servono almeno tre punti." />;
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const [x0, x1] = xDomain ?? [Math.min(...xs), Math.max(...xs)];
  let [lo, hi] = yDomain ?? [Math.min(...ys), Math.max(...ys)];
  if (!yDomain) { const p = (hi - lo) * 0.1 || 1; lo -= p; hi += p; }
  const Y = yScale(lo, hi), X = (v: number) => ((v - x0) / (x1 - x0 || 1)) * W;
  const ticks = niceTicks(lo, hi, 3).filter((v) => v >= lo && v <= hi).map((v) => ({ v, y: Y(v), label: yFmt(v) }));
  const els: React.ReactNode[] = [<path key="p" d={pts.map((p) => `M${f1(X(p.x))} ${f1(Y(p.y))}h0`).join("")} stroke={color} strokeWidth="7" strokeOpacity=".75" strokeLinecap="round" vectorEffect="non-scaling-stroke" />];
  if (trend) els.push(<path key="t" d={`M0 ${f1(Y(trend.a + trend.b * x0))}L${W} ${f1(Y(trend.a + trend.b * x1))}`} stroke="var(--ink)" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />);
  const xt = Array.from({ length: xTicksN }, (_, i) => ({ x: i / (xTicksN - 1), label: xFmt(x0 + ((x1 - x0) * i) / (xTicksN - 1)) }));
  const tips = pts.map((p) => ({ x: (p.x - x0) / (x1 - x0 || 1), lines: [p.tip] }));
  return <Frame height={height} yTicks={ticks} xTicks={xt} tips={tips} label={label}>{els}</Frame>;
}

/** Barre minimo–massimo per giorno (es. Body Battery). */
export function RangeBars({ pts, from, to, fmt, height = 110, label, color = "var(--h2)", domain = [0, 100] }: {
  pts: { d: string; lo: number; hi: number }[]; from: string; to: string; fmt: (v: number) => string; height?: number; label: string; color?: string; domain?: [number, number];
}) {
  if (pts.length < 2) return <Empty inline icon="chart" title="Dati insufficienti" text="Servono almeno due giorni con un valore." />;
  const t0 = dms(from), t1 = dms(to), Y = yScale(domain[0], domain[1]), X = (d: string) => ((dms(d) - t0) / (t1 - t0 || 1)) * W;
  const span = Math.max(1, (t1 - t0) / 86400000);
  const ticks = niceTicks(domain[0], domain[1], 2).map((v) => ({ v, y: Y(v), label: fmt(v) }));
  const d = pts.map((p) => `M${f1(X(p.d))} ${f1(Y(p.lo))}V${f1(Y(p.hi))}`).join("");
  const tips = pts.map((p) => ({ x: (dms(p.d) - t0) / (t1 - t0 || 1), lines: [day(p.d), `min ${fmt(p.lo)} · max ${fmt(p.hi)}`] }));
  return <Frame height={height} yTicks={ticks} xTicks={dateTicks(t0, t1)} tips={tips} label={label}><path d={d} stroke={color} strokeWidth={Math.max(3, Math.min(11, (300 / span) * 0.55))} strokeLinecap="round" vectorEffect="non-scaling-stroke" /></Frame>;
}

/** Minigrafico per i riquadri indicatore (ultimi 7–14 valori). */
export function Spark({ values, color = "var(--on-night-good)" }: { values: (number | null)[]; color?: string }) {
  const v = values.filter(isNum);
  if (v.length < 2) return <svg className="spark" viewBox="0 0 100 30" aria-hidden="true" />;
  const lo = Math.min(...v), hi = Math.max(...v);
  const Y = (x: number) => 3 + (1 - (x - lo) / (hi - lo || 1)) * 24;
  let d = "", pen = false, lastX = 0, lastY = 0;
  values.forEach((x, i) => { if (!isNum(x)) { pen = false; return; } lastX = (i / (values.length - 1)) * 100; lastY = Y(x); d += `${pen ? "L" : "M"}${f1(lastX)} ${f1(lastY)}`; pen = true; });
  return (
    <svg className="spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
      <path d={d} fill="none" stroke={color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
      <path d={`M${f1(lastX)} ${f1(lastY)}h0`} stroke="var(--sun)" strokeWidth="7" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Misuratore a semicerchio per un rapporto con fascia di riferimento dichiarata. */
export function Gauge({ value, lo, hi, bandLo, bandHi, label }: { value: number | null; lo: number; hi: number; bandLo: number; bandHi: number; label: string }) {
  const pt = (v: number, r: number) => {
    const a = Math.PI - ((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * Math.PI;
    return [100 + r * Math.cos(a), 100 - r * Math.sin(a)].map((x) => f1(x));
  };
  const [bx0, by0] = pt(bandLo, 80), [bx1, by1] = pt(bandHi, 80);
  return (
    <svg className="gauge" viewBox="0 0 200 108" width="128" height="69" role="img" aria-label={label} style={{ flex: "none" }}>
      <path d="M20 100A80 80 0 0 1 180 100" fill="none" stroke="var(--surface-2)" strokeWidth="16" />
      <path d={`M${bx0} ${by0}A80 80 0 0 1 ${bx1} ${by1}`} fill="none" stroke="var(--h2)" strokeWidth="16" />
      {value !== null && (() => { const [nx, ny] = pt(value, 68); return <><path d={`M100 100L${nx} ${ny}`} stroke="var(--ink)" strokeWidth="3" strokeLinecap="round" /><circle cx="100" cy="100" r="6" fill="var(--ink)" /></>; })()}
    </svg>
  );
}

/** Profili sincronizzati lungo la distanza (passo, battito, quota…): un cursore e un'etichetta per tutti. */
export function Profiles({ x, rows, label }: {
  x: (number | null)[]; label: string;
  rows: { name: string; ys: (number | null)[]; color: string; fmt: (v: number) => string; invert?: boolean; area?: boolean; band?: { lo: number; hi: number } | null }[];
}) {
  const idx = x.map((v, i) => (isNum(v) ? i : -1)).filter((i) => i >= 0);
  if (idx.length < 10) return null;
  const x0 = x[idx[0]] as number, x1 = x[idx[idx.length - 1]] as number;
  const X = (v: number) => ((v - x0) / (x1 - x0 || 1)) * W;
  const usable = rows.filter((r) => r.ys.filter(isNum).length > 10);
  const step = Math.max(1, Math.floor(idx.length / 60));
  const tips: TipRow[] = idx.filter((_, k) => k % step === 0).map((i) => ({
    x: ((x[i] as number) - x0) / (x1 - x0 || 1),
    lines: [`km ${((x[i] as number) / 1000).toLocaleString("it-IT", { maximumFractionDigits: 1 })}`, ...usable.map((r) => (isNum(r.ys[i]) ? `${r.name} ${r.fmt(r.ys[i] as number)}` : null)).filter((s): s is string => !!s)],
  }));
  return (
    <Tip tips={tips} label={label}>
      {usable.map((r) => {
        const vals = idx.map((i) => r.ys[i]).filter(isNum).sort((a, b) => a - b);
        // estremi robusti (1°–99° percentile): un picco GPS non schiaccia il grafico
        let lo = vals[Math.floor(vals.length * 0.01)], hi = vals[Math.ceil(vals.length * 0.99) - 1];
        const p = (hi - lo) * 0.1 || 1; lo -= p; hi += p;
        const Yn = yScale(lo, hi), Y = (v: number) => (r.invert ? H - Yn(v) : Yn(v));
        let d = "", pen = false, first = "", lastX = 0;
        for (const i of idx) {
          const v = r.ys[i];
          if (!isNum(v)) { pen = false; continue; }
          const px = f1(X(x[i] as number)), py = f1(Y(Math.min(hi, Math.max(lo, v))));
          d += `${pen ? "L" : "M"}${px} ${py}`; if (!first) first = `${px}`; lastX = px; pen = true;
        }
        const ticks = niceTicks(lo, hi, 2).filter((v) => v >= lo && v <= hi).map((v) => ({ v, y: Y(v), label: r.fmt(v) }));
        return (
          <div key={r.name} style={{ marginBottom: 6 }}>
            <div className="note" style={{ fontWeight: 600, color: "var(--ink-2)" }}>{r.name}</div>
            <div className="plot">
              <svg className="c" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ height: 70 }} aria-hidden="true">
                {ticks.map((t) => <path key={t.v} d={`M0 ${f1(t.y)}H${W}`} stroke="var(--line-2)" vectorEffect="non-scaling-stroke" />)}
                {r.band && <rect x="0" width={W} y={f1(Math.min(Y(r.band.lo), Y(r.band.hi)))} height={f1(Math.abs(Y(r.band.lo) - Y(r.band.hi)))} fill="var(--warn-bg)" />}
                {r.area && <path d={`${d}L${lastX} ${H}L${first} ${H}Z`} fill={r.color} opacity=".15" />}
                <path d={d} fill="none" stroke={r.color} strokeWidth="1.6" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
              </svg>
              <div className="yax" style={{ height: 70 }} aria-hidden="true">{ticks.map((t) => <span key={t.v} style={{ top: `${t.y}%` }}>{t.label}</span>)}</div>
            </div>
          </div>
        );
      })}
      <div className="xax" aria-hidden="true"><span style={{ left: 0 }}>0</span><span style={{ left: "50%" }}>{(x1 / 2000).toLocaleString("it-IT", { maximumFractionDigits: 1 })}</span><span style={{ left: "100%" }}>{(x1 / 1000).toLocaleString("it-IT", { maximumFractionDigits: 1 })} km</span></div>
    </Tip>
  );
}

/** Calendario a caldo: righe = giorni della settimana, colonne = settimane. levels 0–4. */
export function Heatmap({ weeks, label }: { weeks: { start: string; days: { d: string; level: number; tip: string }[] }[]; label: string }) {
  const L = ["L", "M", "M", "G", "V", "S", "D"];
  return (
    <div className="chart">
      <div className="heat" role="img" aria-label={label} style={{ gridTemplateColumns: `16px repeat(${weeks.length}, minmax(0, 1fr))` }}>
        {L.map((l, r) => [<em key={`l${r}`}>{l}</em>, ...weeks.map((w) => { const c = w.days[r]; return <span key={`${w.start}${r}`} title={c?.tip} style={{ background: c ? `var(--h${c.level})` : "transparent" }} />; })])}
      </div>
      <div className="xax" style={{ marginRight: 0, marginLeft: 19 }} aria-hidden="true">
        <span style={{ left: 0 }}>{day(weeks[0].start, { day: "numeric", month: "short" })}</span>
        <span style={{ left: "100%" }}>{day(weeks[weeks.length - 1].start, { day: "numeric", month: "short" })}</span>
      </div>
      <details className="data">
        <summary>Giorni attivi in elenco ({weeks.flatMap((w) => w.days).filter((c) => c.level > 0).length})</summary>
        <div className="dtab" tabIndex={0} role="region" aria-label="Giorni attivi">
          <table><tbody>{weeks.flatMap((w) => w.days).filter((c) => c.level > 0).map((c) => <tr key={c.d}><td>{c.tip}</td></tr>)}</tbody></table>
        </div>
      </details>
    </div>
  );
}

/** Distribuzione nelle zone di battito Z1–Z5 (tempo in secondi). */
export function Zones({ secs }: { secs: number[] }) {
  const tot = secs.reduce((a, b) => a + b, 0);
  if (!tot) return <Empty inline icon="heart" title="Nessun dato di zona" text="Il dispositivo non ha registrato il tempo nelle zone di battito." />;
  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
  return (
    <div role="img" aria-label={`Zone di battito: ${secs.map((s, i) => `Z${i + 1} ${Math.round((s / tot) * 100)}%`).join(", ")}`}>
      {secs.map((s, i) => (
        <div key={i} className="zrow" aria-hidden="true">
          <span>Z{i + 1}</span>
          <div className="b"><i style={{ width: `${(s / tot) * 100}%`, background: `var(--z${i + 1})` }} /></div>
          <span className="r">{s >= 3600 ? `${Math.floor(s / 3600)}:${mmss(s % 3600).padStart(5, "0")}` : mmss(s)}</span>
          <span className="r">{Math.round((s / tot) * 100)}%</span>
        </div>
      ))}
    </div>
  );
}
