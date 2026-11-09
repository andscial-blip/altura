/**
 * Calcoli statistici puri usati dalle schermate (testati in tests/stats.test.ts).
 * Nessuna metrica proprietaria: ogni funzione ha un metodo dichiarato.
 */

export const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function mean(xs: (number | null | undefined)[]): number | null {
  const v = xs.filter(isNum);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

/** Media mobile "all'indietro" su una finestra di n elementi; i vuoti non contano. Null finché la finestra ha meno di minN valori. */
export function rolling(xs: (number | null)[], n: number, minN = Math.ceil(n / 2)): (number | null)[] {
  return xs.map((_, i) => {
    const w = xs.slice(Math.max(0, i - n + 1), i + 1).filter(isNum);
    return w.length >= minN ? w.reduce((a, b) => a + b, 0) / w.length : null;
  });
}

/** Retta dei minimi quadrati y = a + b·x. */
export function linreg(xs: number[], ys: number[]): { a: number; b: number; n: number } | null {
  const pts = xs.map((x, i) => [x, ys[i]] as const).filter(([x, y]) => isNum(x) && isNum(y));
  const n = pts.length;
  if (n < 3) return null;
  const mx = pts.reduce((s, p) => s + p[0], 0) / n, my = pts.reduce((s, p) => s + p[1], 0) / n;
  const sxx = pts.reduce((s, p) => s + (p[0] - mx) ** 2, 0);
  if (sxx === 0) return null;
  const b = pts.reduce((s, p) => s + (p[0] - mx) * (p[1] - my), 0) / sxx;
  return { a: my - b * mx, b, n };
}

/** Correlazione di Pearson. Null sotto i 5 punti (troppo pochi per dire qualcosa). */
export function pearson(xs: number[], ys: number[]): { r: number; n: number } | null {
  const pts = xs.map((x, i) => [x, ys[i]] as const).filter(([x, y]) => isNum(x) && isNum(y));
  const n = pts.length;
  if (n < 5) return null;
  const mx = pts.reduce((s, p) => s + p[0], 0) / n, my = pts.reduce((s, p) => s + p[1], 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (const [x, y] of pts) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2; }
  if (!sxx || !syy) return null;
  return { r: sxy / Math.sqrt(sxx * syy), n };
}

/** Previsione di Riegel (1977): T2 = T1 · (D2/D1)^e, con e = 1,06. */
export function riegel(timeS: number, distM: number, targetM: number, e = 1.06): number {
  return timeS * (targetM / distM) ** e;
}

/** Variazione percentuale; null se il periodo precedente è vuoto. */
export function pctDelta(cur: number, prev: number): number | null {
  return prev > 0 ? ((cur - prev) / prev) * 100 : null;
}

/**
 * Valori giornalieri che Garmin usa per "dato insufficiente" e che non vanno né disegnati né mediati:
 * stress −1/−2, Body Battery 0 come minimo o massimo di un giorno senza registrazione, sonno e variabilità a 0.
 */
export function validDaily(metric: string, v: number | null | undefined): number | null {
  if (!isNum(v)) return null;
  if (metric === "stress_avg" && v < 0) return null;
  if (metric.startsWith("body_battery") && v <= 0) return null;
  if ((metric === "sleep_s" || metric === "sleep_score" || metric.startsWith("hrv") || metric === "resting_hr" || metric === "steps") && v <= 0) return null;
  return v;
}

export type Split = { km: number; dist_m: number; time_s: number; pace_s: number; hr: number | null; gain_m: number };

/** Parziali al chilometro dalle serie (distanza cumulata in m, tempo in s, battito, quota). Tempo al km interpolato; l'ultimo parziale può essere più corto (≥100 m). */
export function splitsFromStreams(dist: (number | null)[], t: (number | null)[], hr?: (number | null)[], alt?: (number | null)[]): Split[] {
  const out: Split[] = [];
  const n = Math.min(dist.length, t.length);
  let mark = 1000, lastT: number | null = null, pD: number | null = null, pT: number | null = null, lastA: number | null = null;
  let hrSum = 0, hrN = 0, gain = 0;
  for (let i = 0; i < n; i++) {
    const d = dist[i], tt = t[i];
    if (!isNum(d) || !isNum(tt)) continue;
    if (lastT === null) lastT = tt;
    const h = hr?.[i]; if (isNum(h)) { hrSum += h; hrN++; }
    const a = alt?.[i]; if (isNum(a)) { if (lastA !== null && a > lastA) gain += a - lastA; lastA = a; }
    while (d >= mark && pD !== null && pT !== null) {
      const tm = d === pD ? tt : pT + ((tt - pT) * (mark - pD)) / (d - pD);
      const ts = tm - lastT;
      out.push({ km: out.length + 1, dist_m: 1000, time_s: ts, pace_s: ts, hr: hrN ? hrSum / hrN : null, gain_m: gain });
      lastT = tm; mark += 1000; hrSum = 0; hrN = 0; gain = 0;
    }
    pD = d; pT = tt;
  }
  if (pD !== null && pT !== null && lastT !== null) {
    const rest = pD - (mark - 1000);
    if (rest >= 100) {
      const ts = pT - lastT;
      out.push({ km: out.length + 1, dist_m: rest, time_s: ts, pace_s: ts / (rest / 1000), hr: hrN ? hrSum / hrN : null, gain_m: gain });
    }
  }
  return out;
}

/** Valori "tondi" per gli assi: 1; 2; 2,5; 5 × 10^n. */
export function niceStep(range: number, target = 3): number {
  if (!(range > 0)) return 1;
  const raw = range / target, e = 10 ** Math.floor(Math.log10(raw)), f = raw / e;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e;
}
export function niceTicks(lo: number, hi: number, target = 3): number[] {
  const s = niceStep(hi - lo, target), out: number[] = [];
  for (let v = Math.ceil(lo / s) * s; v <= hi + 1e-9; v += s) out.push(Math.round(v / s) * s || 0);
  return out;
}
