import "server-only";
import { goals, results, splitRows } from "@/lib/queries";
import { addDays, daysBetween } from "@/lib/dates";
import { efforts, estimates, estimateSeries, goalStatus, records, distKey, DISTS, type DistKey } from "@/lib/progress";

export const WINDOW = 90;
/** finestra per le stime da gara: le gare sono rare, un anno è il compromesso tra attualità e disponibilità */
export const RACE_WINDOW = 365;

/** Tutto quello che serve a Oggi e a Progressi: sforzi, stime di oggi e di 3 mesi fa, record, obiettivo in corso. */
export async function progressData(today: string) {
  const [rows, manual, gl] = await Promise.all([splitRows(), results(), goals(true)]);
  const list = efforts(rows, manual);
  const from = addDays(today, -WINDOW);
  const est = estimates(list, from, today);
  const past = estimates(list, addDays(today, -WINDOW * 2), addDays(today, -WINDOW));
  const estRace = estimates(list, addDays(today, -RACE_WINDOW), today, true);
  const recAll = records(list), rec90 = records(list, from);

  // obiettivo in corso: la gara (o il test) attiva più vicina con distanza e tempo
  const race = gl.filter((g) => (g.kind === "gara" || g.kind === "test") && g.target_date && g.target_date >= today && g.target?.dist_m)
    .sort((a, b) => (a.kind === "gara" ? 0 : 1) - (b.kind === "gara" ? 0 : 1) || a.target_date!.localeCompare(b.target_date!))[0] ?? null;
  let goal = null as null | {
    id: string; name: string; kind: string; date: string; daysLeft: number; distM: number; key: DistKey | null;
    target: number | null; targetMin: number | null; targetMax: number | null; estimate: number | null; basis: (typeof est)[number]["from"] | null;
    status: ReturnType<typeof goalStatus>; series: { d: string; v: number | null }[];
    raceEstimate: number | null; raceBasis: (typeof est)[number]["from"] | null; raceStatus: ReturnType<typeof goalStatus>; raceSeries: { d: string; v: number | null }[];
  };
  if (race) {
    const t = race.target as Record<string, number | null>;
    const distM = Number(t.dist_m);
    const key = distKey(distM);
    const e = key ? est.find((x) => x.key === key) ?? null : null;
    const er = key ? estRace.find((x) => x.key === key) ?? null : null;
    const target = t.time_s ?? (t.time_min_s && t.time_max_s ? (t.time_min_s + t.time_max_s) / 2 : null);
    // stima nel tempo: fine di ogni mese degli ultimi 12 e oggi
    const ends: string[] = [];
    for (let i = 12; i >= 1; i--) { const d = new Date(today + "T12:00:00Z"); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - i + 1); d.setUTCDate(0); ends.push(d.toISOString().slice(0, 10)); }
    ends.push(today);
    const daysLeft = daysBetween(today, race.target_date!);
    goal = {
      id: race.id, name: race.name, kind: race.kind, date: race.target_date!, daysLeft, distM, key,
      target, targetMin: t.time_min_s ?? null, targetMax: t.time_max_s ?? null,
      estimate: e?.s ?? null, basis: e?.from ?? null, status: goalStatus(e?.s ?? null, target, distM, daysLeft),
      series: key ? estimateSeries(list, key, ends, WINDOW) : [],
      raceEstimate: er?.s ?? null, raceBasis: er?.from ?? null, raceStatus: goalStatus(er?.s ?? null, target, distM, daysLeft),
      raceSeries: key ? estimateSeries(list, key, ends, RACE_WINDOW, true) : [],
    };
  }
    // prossimo test (es. cronometro Runna) prima della gara: è lo sforzo che renderà la stima più affidabile
  const nextTest = gl.filter((g) => g.kind === "test" && g.target_date && g.target_date >= today && (!goal || g.target_date <= goal.date))
    .sort((a, b) => a.target_date!.localeCompare(b.target_date!))[0] ?? null;
  return { list, est, past, estRace, recAll, rec90, goal, manual, from, DISTS, nextTest: nextTest ? { name: nextTest.name, date: nextTest.target_date! } : null };
}
