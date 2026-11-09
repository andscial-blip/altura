/** Grafici SVG resi sul server: niente librerie, niente JavaScript nel browser. Il passaggio del mouse usa <title>. */
import { day } from "@/lib/fmt";

type P = { x: string; y: number | null; tip?: string };

export function LineChart({ points, height = 160, color = "var(--s2)", band, fmt = (v: number) => String(Math.round(v)), yLabel }: {
  points: P[]; height?: number; color?: string; band?: { lo: number; hi: number } | null; fmt?: (v: number) => string; yLabel?: string;
}) {
  const W = 640, H = height, L = 40, R = 10, T = 10, B = 22;
  const ys = points.map((p) => p.y).filter((v): v is number => v !== null);
  if (ys.length < 2) return <p className="empty">Dati insufficienti per un andamento.</p>;
  let lo = Math.min(...ys, band?.lo ?? Infinity), hi = Math.max(...ys, band?.hi ?? -Infinity);
  const pad = (hi - lo) * 0.12 || 1; lo -= pad; hi += pad;
  const x = (i: number) => L + (i / Math.max(1, points.length - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  let d = "", pen = false;
  points.forEach((p, i) => { if (p.y === null) { pen = false; return; } d += `${pen ? "L" : "M"}${x(i).toFixed(1)} ${y(p.y).toFixed(1)} `; pen = true; });
  const ticks = [lo + pad, (lo + hi) / 2, hi - pad];
  const lastI = points.map((p) => p.y).lastIndexOf(ys[ys.length - 1]);
  const xt = [0, Math.floor((points.length - 1) / 2), points.length - 1];
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={yLabel ?? "andamento"}>
      <g className="grid">{ticks.map((t, i) => <line key={i} x1={L} x2={W - R} y1={y(t)} y2={y(t)} />)}</g>
      {ticks.map((t, i) => <text key={i} x={L - 6} y={y(t) + 4} textAnchor="end">{fmt(t)}</text>)}
      {xt.map((i) => points[i] && <text key={i} x={x(i)} y={H - 4} textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}>{day(points[i].x, { day: "numeric", month: "short" })}</text>)}
      {band && <rect x={L} width={W - L - R} y={y(band.hi)} height={Math.max(0, y(band.lo) - y(band.hi))} fill={color} opacity="0.1" />}
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => p.y === null ? null : (
        <g key={i}><circle cx={x(i)} cy={y(p.y)} r="7" fill="transparent"><title>{`${day(p.x)}: ${p.tip ?? fmt(p.y)}`}</title></circle></g>
      ))}
      <circle cx={x(lastI)} cy={y(ys[ys.length - 1])} r="4" fill={color} stroke="var(--surface)" strokeWidth="2" />
    </svg>
  );
}

export const FAM_COLOR: Record<string, string> = { corsa: "var(--s1)", montagna: "var(--s2)", bici: "var(--s3)", forza: "var(--s4)", altro: "var(--s0)" };
export const FAM_LABEL: Record<string, string> = { corsa: "Corsa", montagna: "Montagna e cammino", bici: "Bici", forza: "Forza", altro: "Altro" };

/** Barre impilate per settimana. value(r) dà il valore della riga; fmt lo formatta. */
export function WeekBars<R extends { week: string; fam: string }>({ rows, weeks, value, fmt, height = 180, label }: {
  rows: R[]; weeks: string[]; value: (r: R) => number; fmt: (v: number) => string; height?: number; label: string;
}) {
  const W = 640, H = height, L = 40, R = 6, T = 8, B = 22;
  const fams = Object.keys(FAM_COLOR).filter((f) => rows.some((r) => r.fam === f && value(r) > 0));
  const tot = weeks.map((w) => rows.filter((r) => r.week === w).reduce((a, r) => a + value(r), 0));
  const max = Math.max(1, ...tot) * 1.1;
  const bw = (W - L - R) / weeks.length;
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  return (
    <div>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        <g className="grid">{[0.5, 1].map((f) => <line key={f} x1={L} x2={W - R} y1={y(max / 1.1 * f)} y2={y(max / 1.1 * f)} />)}</g>
        {[0.5, 1].map((f) => <text key={f} x={L - 6} y={y(max / 1.1 * f) + 4} textAnchor="end">{fmt(max / 1.1 * f)}</text>)}
        {weeks.map((w, i) => {
          let acc = 0;
          return (
            <g key={w}>
              {fams.map((f) => {
                const r = rows.find((x) => x.week === w && x.fam === f);
                const v = r ? value(r) : 0;
                if (v <= 0) return null;
                const y0 = y(acc), y1 = y(acc + v); acc += v;
                return <rect key={f} x={L + i * bw + 2} width={Math.max(2, bw - 4)} y={y1} height={Math.max(0, y0 - y1 - 2)} rx="3" fill={FAM_COLOR[f]}><title>{`Settimana del ${day(w, { day: "numeric", month: "short" })} · ${FAM_LABEL[f]}: ${fmt(v)}`}</title></rect>;
              })}
              {(i % Math.ceil(weeks.length / 6) === 0 || i === weeks.length - 1) && <text x={L + i * bw + bw / 2} y={H - 4} textAnchor="middle">{day(w, { day: "numeric", month: "short" })}</text>}
            </g>
          );
        })}
      </svg>
      {fams.length > 1 && <div className="legend">{fams.map((f) => <span key={f}><i style={{ background: FAM_COLOR[f] }} />{FAM_LABEL[f]}</span>)}</div>}
    </div>
  );
}

/** Profilo (altimetria o battito) lungo la distanza. */
export function Profile({ xs, ys, color = "var(--s2)", unit, height = 140 }: { xs: (number | null)[]; ys: (number | null)[]; color?: string; unit: string; height?: number }) {
  const pts = xs.map((x, i) => [x, ys[i]] as const).filter((p): p is readonly [number, number] => p[0] !== null && p[1] !== null);
  if (pts.length < 5) return null;
  const W = 640, H = height, L = 40, R = 8, T = 8, B = 20;
  const x0 = pts[0][0], x1 = pts[pts.length - 1][0];
  let lo = Math.min(...pts.map((p) => p[1])), hi = Math.max(...pts.map((p) => p[1]));
  const pad = (hi - lo) * 0.1 || 1; lo -= pad; hi += pad;
  const X = (v: number) => L + ((v - x0) / (x1 - x0 || 1)) * (W - L - R);
  const Y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${X(p[0]).toFixed(1)} ${Y(p[1]).toFixed(1)}`).join(" ");
  const area = `${d} L${X(x1).toFixed(1)} ${H - B} L${X(x0).toFixed(1)} ${H - B} Z`;
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`profilo in ${unit}`}>
      <path d={area} fill={color} opacity="0.12" />
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      <text x={L - 6} y={Y(hi - pad) + 4} textAnchor="end">{Math.round(hi - pad)}</text>
      <text x={L - 6} y={Y(lo + pad) + 4} textAnchor="end">{Math.round(lo + pad)}</text>
      <text x={L} y={H - 4}>0</text>
      <text x={W - R} y={H - 4} textAnchor="end">{((x1 - x0) / 1000).toFixed(1)} km</text>
    </svg>
  );
}
