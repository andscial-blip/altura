import "server-only";
import { checkins, checkinsReady, dailyMulti, planned } from "@/lib/queries";
import { readiness, type Context, type DayVal } from "@/lib/readiness";
import { validDaily } from "@/lib/stats";
import { addDays } from "@/lib/dates";
import { hm } from "@/lib/fmt";

export const BODY_METRICS = ["hrv_night", "hrv_baseline_low", "hrv_baseline_high", "resting_hr", "sleep_s", "steps"];

/** Dati del corpo e semaforo di oggi: usati da Oggi e da Corpo, così il giudizio è lo stesso nei due posti. */
export async function bodyData(today: string, days = 70) {
  const [dm, ck, plan, ready] = await Promise.all([dailyMulti(BODY_METRICS, days), checkins(addDays(today, -60)), planned(today, today), checkinsReady()]);
  const ser = (m: string): DayVal[] => (dm[m] ?? []).map((p) => ({ day: p.day, value: validDaily(m, p.value) })).filter((p): p is DayVal => p.value !== null);
  const last = (m: string) => { const s = ser(m); return s[s.length - 1] ?? null; };
  const todayCk = ck.find((c) => c.day === today) ?? null;
  const session = plan.find((p) => p.day === today && p.state === "programmato") ?? null;
  const r = readiness({
    today, hrv: ser("hrv_night"), hrvLo: last("hrv_baseline_low")?.value ?? null, hrvHi: last("hrv_baseline_high")?.value ?? null,
    rhr: ser("resting_hr"), sleep: ser("sleep_s"), feel: todayCk?.feel ?? null, context: (todayCk?.context ?? []) as Context[],
    session: session ? { title: session.title, type: session.type } : null, fmtSleep: hm,
  });
  return { r, ser, last, checkin: todayCk, checkins: ck, session, checkinAvailable: ready };
}
