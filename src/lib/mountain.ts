/**
 * Montagna (parere dell'esperto di trail): km-sforzo, VAM sulle salite lunghe, profilo per pendenza,
 * curva personale velocità-pendenza e stima dei tempi di un percorso futuro. Funzioni pure (tests/mountain.test.ts).
 */
export const kmEffort = (distM: number, gainM: number) => distM / 1000 + gainM / 100;

const smooth = (xs: number[], w = 5) => xs.map((_, i) => {
  const a = Math.max(0, i - Math.floor(w / 2)), b = Math.min(xs.length, i + Math.ceil(w / 2));
  let s = 0, n = 0; for (let k = a; k < b; k++) if (Number.isFinite(xs[k])) { s += xs[k]; n++; }
  return n ? s / n : NaN;
});

/** Serie (distanza, quota, tempo) campionata ogni `step` metri di distanza. */
export function byDistance(dist: (number | null)[], alt: (number | null)[], t: (number | null)[] | null, step = 50) {
  const out: { d: number; a: number; t: number | null }[] = [];
  let next = 0;
  for (let i = 0; i < dist.length; i++) {
    const d = dist[i], a = alt[i];
    if (d == null || a == null || !Number.isFinite(d) || !Number.isFinite(a)) continue;
    if (d >= next) { out.push({ d, a, t: t ? t[i] ?? null : null }); next = d + step; }
  }
  const sa = smooth(out.map((p) => p.a));
  return out.map((p, i) => ({ ...p, a: sa[i] }));
}

export type Climb = { fromM: number; toM: number; gain: number; secs: number; grade: number; vam: number };

/** Salite lunghe (≥150 m di dislivello, pendenza media ≥8%), tollerando contropendenze sotto i 20 m. VAM in m/h. */
export function climbs(pts: { d: number; a: number; t: number | null }[]): Climb[] {
  const out: Climb[] = [];
  let lo = 0, hi = 0;
  const close = () => {
    const g = pts[hi].a - pts[lo].a, len = pts[hi].d - pts[lo].d;
    const tA = pts[lo].t, tB = pts[hi].t;
    if (g >= 150 && len > 0 && g / len >= 0.08 && tA != null && tB != null && tB > tA) out.push({ fromM: pts[lo].d, toM: pts[hi].d, gain: g, secs: tB - tA, grade: g / len, vam: g / ((tB - tA) / 3600) });
  };
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].a > pts[hi].a) hi = i;
    if (pts[i].a < pts[lo].a && hi === lo) { lo = i; hi = i; continue; }
    if (pts[hi].a - pts[i].a > 20) { close(); lo = i; hi = i; }
  }
  if (hi > lo) close();
  return out;
}

/** Fasce di pendenza per il profilo colorato. */
export function gradeClass(g: number) {
  return g >= 0.15 ? "su3" : g >= 0.08 ? "su2" : g >= 0.03 ? "su1" : g <= -0.15 ? "giu3" : g <= -0.08 ? "giu2" : g <= -0.03 ? "giu1" : "piano";
}

export const BINS = Array.from({ length: 17 }, (_, i) => -40 + i * 5);   // pendenza in %, da -40 a +40
export type CurvePoint = { g: number; n: number; p25: number | null; p50: number | null; p75: number | null; tobler: number };

/** Tobler (km/h): riferimento quando i tuoi dati su una pendenza sono pochi. */
export const tobler = (gPct: number) => 6 * Math.exp(-3.5 * Math.abs(gPct / 100 + 0.05));

const q = (xs: number[], p: number) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const k = (s.length - 1) * p; const f = Math.floor(k); return s[f] + (s[Math.min(f + 1, s.length - 1)] - s[f]) * (k - f); };

/** Curva personale: velocità orizzontale (km/h) per fascia di pendenza, solo tempo in movimento, tratti da 50 m. */
export function speedCurve(tracks: { d: number; a: number; t: number | null }[][], minN = 8): CurvePoint[] {
  const by = new Map<number, number[]>();
  for (const pts of tracks) for (let i = 1; i < pts.length; i++) {
    const p = pts[i - 1], c = pts[i];
    if (p.t == null || c.t == null) continue;
    const dd = c.d - p.d, dt = c.t - p.t;
    if (dd <= 0 || dt <= 0) continue;
    const v = dd / dt;
    if (v < 0.25 || v > 4) continue;                       // soste e salti del GPS fuori
    const g = ((c.a - p.a) / dd) * 100;
    const bin = Math.max(-40, Math.min(40, Math.round(g / 5) * 5));
    (by.get(bin) ?? by.set(bin, []).get(bin)!).push(v * 3.6);
  }
  return BINS.map((g) => {
    const xs = by.get(g) ?? [];
    const ok = xs.length >= minN;
    return { g, n: xs.length, p25: ok ? q(xs, 0.25) : null, p50: ok ? q(xs, 0.5) : null, p75: ok ? q(xs, 0.75) : null, tobler: tobler(g) };
  });
}

export type GpxPt = { lat: number; lon: number; ele: number | null };

/** Distanza in metri tra due punti (haversine). */
export function hav(a: GpxPt, b: GpxPt) {
  const R = 6371000, r = Math.PI / 180;
  const dLa = (b.lat - a.lat) * r, dLo = (b.lon - a.lon) * r;
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Tempo stimato di un percorso: tratti da 50 m, pendenza smussata, velocità della tua curva per quella pendenza
 * (Tobler dove i dati mancano). Tre scenari: veloce (75° percentile), tipico (mediana), lento (25°).
 * Fatica: +5% sul tempo oltre le 3 ore di cammino. Soste escluse.
 */
export function estimateRoute(pts: GpxPt[], curve: CurvePoint[]) {
  const seg: { len: number; g: number }[] = [];
  let acc = 0, a0 = pts[0], gain = 0, loss = 0, dist = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = hav(pts[i - 1], pts[i]);
    acc += d; dist += d;
    if (acc >= 50 || i === pts.length - 1) {
      const dz = (pts[i].ele ?? a0.ele ?? 0) - (a0.ele ?? 0);
      if (dz > 0) gain += dz; else loss -= dz;
      seg.push({ len: acc, g: acc ? (dz / acc) * 100 : 0 });
      acc = 0; a0 = pts[i];
    }
  }
  const sg = smooth(seg.map((s) => s.g), 3);
  const speed = (g: number, k: "p25" | "p50" | "p75") => {
    const b = Math.max(-40, Math.min(40, Math.round(g / 5) * 5));
    const c = curve.find((x) => x.g === b);
    return (c?.[k] ?? c?.tobler ?? tobler(b)) / 3.6;
  };
  const time = (k: "p25" | "p50" | "p75") => {
    let t = 0;
    seg.forEach((s, i) => { const v = speed(sg[i], k); t += s.len / v; });
    return t > 3 * 3600 ? 3 * 3600 + (t - 3 * 3600) * 1.05 : t;
  };
  const known = seg.filter((s, i) => curve.find((c) => c.g === Math.max(-40, Math.min(40, Math.round(sg[i] / 5) * 5)))?.p50 != null).reduce((z, s) => z + s.len, 0);
  return { dist, gain, loss, effort: kmEffort(dist, gain), fast: time("p75"), mid: time("p50"), slow: time("p25"), coverage: dist ? known / dist : 0 };
}
