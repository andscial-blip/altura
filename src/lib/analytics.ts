/** Calcoli derivati. Funzioni pure, testate (tests/analytics.test.ts). Ogni risultato dichiara metodo e limiti. */

/** Media mobile semplice sugli ultimi n valori (finestre incomplete: null). */
export function rolling(vals: number[], n: number): (number | null)[] {
  const out: (number | null)[] = [];
  let s = 0;
  for (let i = 0; i < vals.length; i++) {
    s += vals[i];
    if (i >= n) s -= vals[i - n];
    out.push(i >= n - 1 ? s / n : null);
  }
  return out;
}

/**
 * Rapporto carico acuto/cronico (media 7 giorni / media 28 giorni) sul carico di allenamento Garmin.
 * Metodo "rolling average" (Gabbett 2016). Indicativo: la letteratura ne discute la validità predittiva sugli infortuni.
 */
export function acwr(load: number[]): { acute: (number | null)[]; chronic: (number | null)[]; ratio: (number | null)[] } {
  const acute = rolling(load, 7), chronic = rolling(load, 28);
  const ratio = acute.map((a, i) => (a === null || chronic[i] === null || !chronic[i] ? null : Math.round((a / chronic[i]!) * 100) / 100));
  return { acute, chronic, ratio };
}

export function acwrZone(r: number | null): { label: string; cls: string } {
  if (r === null) return { label: "dati insufficienti", cls: "" };
  if (r < 0.8) return { label: "carico in calo rispetto al solito", cls: "warn" };
  if (r <= 1.3) return { label: "carico in linea con il solito", cls: "ok" };
  if (r <= 1.5) return { label: "carico in aumento rapido", cls: "warn" };
  return { label: "aumento brusco del carico", cls: "bad" };
}

/** Indice di efficienza aerobica: metri al minuto per battito. Più alto = più veloce allo stesso battito. */
export function efficiency(v_mpm: number, hr: number): number | null {
  if (!(v_mpm > 0) || !(hr > 40)) return null;
  return Math.round((v_mpm / hr) * 1000) / 1000;
}

/** Retta dei minimi quadrati: pendenza per unità di x. */
export function trend(xs: number[], ys: number[]): { slope: number; n: number } | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 4) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
  return den ? { slope: num / den, n } : null;
}
