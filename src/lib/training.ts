/**
 * Allenamento: volume settimanale, ripartizione dell'intensità e controllo dei picchi. Funzioni pure (tests/training.test.ts).
 * - Volume: questa settimana rispetto alla media delle 4 precedenti (al posto dell'ACWR, criticato in letteratura: Impellizzeri 2020).
 * - Intensità: tempo nelle zone Garmin (predefinite sulla FC massima). Facile = Z1–Z3, cioè sotto circa l'80% della massima,
 *   dove sta la soglia aerobica della maggior parte degli amatori; medio = Z4; duro = Z5. Riferimento: circa 80% facile (Seiler 2010).
 * - Picchi: una corsa più lunga del 10% rispetto alla più lunga degli ultimi 30 giorni è associata a più infortuni
 *   (coorte di 5.205 runner Garmin, BJSM 2025).
 */
const addDays = (d: string, n: number) => { const x = new Date(d + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

export type ZoneRow = { day: string; z: number[] };      // secondi nelle 5 zone

export function intensity(rows: ZoneRow[]) {
  const t = [0, 0, 0, 0, 0];
  for (const r of rows) r.z.forEach((v, k) => { t[k] += Number(v) || 0; });
  const tot = t.reduce((a, b) => a + b, 0);
  if (tot < 600) return null;
  const easy = (t[0] + t[1] + t[2]) / tot, mid = t[3] / tot, hard = t[4] / tot;
  const verdict = easy >= 0.75 ? "in linea con l'80/20" : easy >= 0.65 ? "un po' più intenso del riferimento" : "molto tempo sopra la soglia aerobica";
  return { easy, mid, hard, tot, ok: easy >= 0.65, verdict };
}

export type Run = { day: string; dist: number };

/** Controllo picchi: la seduta (fatta o in programma) rispetto alla corsa più lunga dei 30 giorni precedenti. */
export function peak(runs: Run[], day: string, distM: number) {
  const prev = runs.filter((r) => r.day < day && r.day >= addDays(day, -30));
  const longest = prev.reduce((m, r) => Math.max(m, r.dist), 0);
  if (!longest) return null;
  const pct = (distM / longest - 1) * 100;
  return { longest, pct, warn: pct > 10 };
}

/** Volume della settimana in corso rispetto alla media delle 4 settimane precedenti. */
export function weekChange(weeksKm: number[]) {
  if (weeksKm.length < 5) return null;
  const cur = weeksKm[weeksKm.length - 1];
  const prev = weeksKm.slice(-5, -1);
  const avg = prev.reduce((a, b) => a + b, 0) / 4;
  if (!avg) return null;
  return { cur, avg, pct: (cur / avg - 1) * 100 };
}
