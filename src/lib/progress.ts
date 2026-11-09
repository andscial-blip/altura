/**
 * Progressi di corsa: record per distanza, stime dei tempi (Riegel) e stato dell'obiettivo. Funzioni pure, testate in tests/progress.test.ts.
 *
 * Fonti degli sforzi: i parziali più veloci che Garmin calcola per ogni corsa (1 km, miglio, 5 km, 10 km, mezza) e i risultati
 * ufficiali inseriti a mano. Un risultato inserito vale più del parziale dell'orologio: se si riferisce alla stessa uscita, lo sostituisce.
 */
import { riegel } from "@/lib/stats";

export const DISTS = [
  { key: "1k", m: 1000, label: "1 km" },
  { key: "mile", m: 1609.344, label: "Miglio" },
  { key: "5k", m: 5000, label: "5 km" },
  { key: "10k", m: 10000, label: "10 km" },
  { key: "hm", m: 21097.5, label: "Mezza maratona" },
  { key: "m", m: 42195, label: "Maratona" },
] as const;
export type DistKey = (typeof DISTS)[number]["key"];

/** Uno sforzo: il tempo impiegato su una distanza standard, in una certa uscita o gara. */
/** race: sforzo di gara o test (risultato ufficiale, gara segnata su Garmin, gara o test di Runna), cioè fatto a fondo. */
export type Effort = { key: DistKey; m: number; s: number; day: string; id: string | null; name: string | null; official: boolean; race: boolean };

/** Riga per corsa con i parziali Garmin; manual: risultati inseriti a mano. */
export type SplitRow = { id: string; day: string; name: string | null; s1: number | null; s1609: number | null; s5: number | null; s10: number | null; s21: number | null; race?: boolean | null };
export type Manual = { id: string; day: string; name: string; dist_m: number; time_s: number; activity_id: string | null };

/** Chiave della distanza standard più vicina (tolleranza 3%), oppure null se il risultato non è su una distanza classica. */
export function distKey(m: number): DistKey | null {
  for (const d of DISTS) if (Math.abs(m - d.m) / d.m <= 0.03) return d.key;
  return null;
}

export function efforts(rows: SplitRow[], manual: Manual[]): Effort[] {
  const out: Effort[] = [];
  const byKey = new Map(DISTS.map((d) => [d.key, d.m]));
  const officialFor = new Set(manual.filter((r) => r.activity_id && distKey(Number(r.dist_m))).map((r) => `${r.activity_id}:${distKey(Number(r.dist_m))}`));
  for (const r of rows) {
    const add = (key: DistKey, s: number | null) => {
      if (!s || !(s > 0) || officialFor.has(`${r.id}:${key}`)) return;
      out.push({ key, m: byKey.get(key)!, s, day: r.day, id: r.id, name: r.name, official: false, race: !!r.race });
    };
    add("1k", r.s1); add("mile", r.s1609); add("5k", r.s5); add("10k", r.s10); add("hm", r.s21);
  }
  for (const r of manual) {
    const key = distKey(Number(r.dist_m));
    if (!key) continue;
    // il tempo ufficiale si riporta alla distanza standard (es. 21,2 km → 21,0975 km) con la stessa formula delle stime
    out.push({ key, m: byKey.get(key)!, s: riegel(Number(r.time_s), Number(r.dist_m), byKey.get(key)!), day: r.day, id: r.activity_id, name: r.name, official: true, race: true });
  }
  return out;
}

/** Miglior sforzo per distanza, eventualmente solo da una data in poi. */
export function records(list: Effort[], from?: string): Partial<Record<DistKey, Effort>> {
  const best: Partial<Record<DistKey, Effort>> = {};
  for (const e of list) {
    if (from && e.day < from) continue;
    const b = best[e.key];
    if (!b || e.s < b.s) best[e.key] = e;
  }
  return best;
}

/** Sforzi che reggono una stima: almeno 5 km (1 km e miglio sovrastimano la resistenza) e non oltre la maratona. */
const BASE_MIN_M = 5000;

export type Estimate = { key: DistKey; m: number; s: number; from: Effort };

/**
 * Stima del tempo su ogni distanza da 5 km in su: per ogni sforzo valido della finestra si applica Riegel verso la distanza
 * e si tiene il tempo più veloce. Restituisce anche lo sforzo da cui nasce, per dichiararlo.
 */
export function estimates(list: Effort[], from: string, to: string, onlyRaces = false): Estimate[] {
  const pool = list.filter((e) => e.m >= BASE_MIN_M && e.day >= from && e.day <= to && (!onlyRaces || e.race));
  if (!pool.length) return [];
  return DISTS.filter((d) => d.m >= BASE_MIN_M).map((d) => {
    let best: Estimate | null = null;
    for (const e of pool) {
      const s = riegel(e.s, e.m, d.m);
      if (!best || s < best.s) best = { key: d.key, m: d.m, s, from: e };
    }
    return best!;
  });
}

/** Andamento di una stima: un punto a fine mese (e oggi), ciascuno sulla finestra dei 90 giorni precedenti. */
export function estimateSeries(list: Effort[], key: DistKey, ends: string[], windowDays = 90, onlyRaces = false): { d: string; v: number | null; from: Effort | null }[] {
  return ends.map((end) => {
    const start = new Date(Date.parse(end) - windowDays * 86400000).toISOString().slice(0, 10);
    const e = estimates(list, start, end, onlyRaces).find((x) => x.key === key) ?? null;
    return { d: end, v: e ? Math.round(e.s) : null, from: e?.from ?? null };
  });
}

/** Stato rispetto all'obiettivo: scarto totale e al km, e miglioramento settimanale che servirebbe. */
export function goalStatus(estimateS: number | null, targetS: number | null, distM: number, daysLeft: number | null) {
  if (!estimateS || !targetS) return null;
  const gap = estimateS - targetS;                       // > 0: la stima è più lenta dell'obiettivo
  const perKm = gap / (distM / 1000);
  const weeks = daysLeft !== null ? Math.max(1, daysLeft / 7) : null;
  const pctNeeded = gap > 0 ? (gap / estimateS) * 100 : 0;
  return { gap, perKm, pctNeeded, perWeekPct: weeks ? pctNeeded / weeks : null, onTrack: gap <= 0 };
}

/**
 * Stima di gara unica (parere dell'allenatore): ancorata alla gara o al test fatto a fondo più recente degli ultimi 12 mesi,
 * convertita con Riegel. La forbice parte da ±1% e si allarga di 0,5% per ogni mese oltre i primi due (massimo ±5%):
 * più il riferimento è vecchio, meno sappiamo della forma di oggi. Affidabilità: alta entro 8 settimane, media entro 6 mesi.
 * Gli allenamenti non spostano il tempo (non sono sforzi massimali): danno solo la freccia di tendenza.
 */
export type Forecast = { s: number; lo: number; hi: number; pct: number; confidence: "alta" | "media" | "bassa"; anchor: Effort; ageDays: number };

export function forecast(list: Effort[], targetM: number, today: string, windowDays = 365): Forecast | null {
  const from = new Date(Date.parse(today + "T12:00:00Z") - windowDays * 86400000).toISOString().slice(0, 10);
  const races = list.filter((e) => e.race && e.m >= BASE_MIN_M && e.day >= from && e.day <= today);
  if (!races.length) return null;
  const lastDay = races.reduce((d, e) => (e.day > d ? e.day : d), races[0].day);
  // della gara più recente si usa lo sforzo con la distanza più vicina all'obiettivo (meno estrapolazione)
  const same = races.filter((e) => e.day === lastDay);
  const anchor = same.reduce((b, e) => (Math.abs(Math.log(e.m / targetM)) < Math.abs(Math.log(b.m / targetM)) ? e : b));
  const s = riegel(anchor.s, anchor.m, targetM);
  const ageDays = Math.round((Date.parse(today + "T12:00:00Z") - Date.parse(anchor.day + "T12:00:00Z")) / 86400000);
  const months = ageDays / 30.4;
  const pct = Math.min(5, 1 + 0.5 * Math.max(0, months - 2));
  const confidence = ageDays <= 56 ? "alta" : ageDays <= 183 ? "media" : "bassa";
  return { s, lo: s * (1 - pct / 100), hi: s * (1 + pct / 100), pct, confidence, anchor, ageDays };
}

/** Tempo su una distanza di prova che corrisponde all'obiettivo (es. il 5 km che conferma 1:34:57). */
export function equivalent(targetS: number, targetM: number, testM: number): number {
  return riegel(targetS, targetM, testM);
}
