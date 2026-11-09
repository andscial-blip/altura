import { describe, expect, it } from "vitest";
import { readiness, type DayVal } from "@/lib/readiness";
import { forecast, equivalent, efforts, type SplitRow } from "@/lib/progress";
import { intensity, peak, weekChange } from "@/lib/training";
import { byDistance, climbs, estimateRoute, kmEffort, speedCurve, tobler } from "@/lib/mountain";

const T = "2026-11-09";
const days = (n: number, v: (i: number) => number): DayVal[] => Array.from({ length: n }, (_, i) => {
  const d = new Date(T + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() - (n - 1 - i));
  return { day: d.toISOString().slice(0, 10), value: v(i) };
});
const base = { today: T, hrvLo: 31, hrvHi: 57, fmtSleep: (s: number) => `${Math.floor(s / 3600)} h`, session: { title: "Ripetute", type: "qualita" } };

describe("semaforo del recupero", () => {
  it("tutto nella norma: verde", () => {
    const r = readiness({ ...base, hrv: days(10, () => 50), rhr: days(35, () => 55), sleep: days(5, () => 7.5 * 3600), feel: 4, context: [] });
    expect(r.level).toBe("verde");
    expect(r.advice).toContain("Via libera");
  });
  it("una notte bassa non basta, due sì", () => {
    const one = readiness({ ...base, hrv: days(10, (i) => (i === 9 ? 25 : 50)), rhr: days(35, () => 55), sleep: days(5, () => 7.5 * 3600), feel: 4, context: [] });
    expect(one.signals[0].state).toBe("ok");
    const two = readiness({ ...base, hrv: days(10, (i) => (i >= 8 ? 25 : 50)), rhr: days(35, () => 55), sleep: days(5, () => 7.5 * 3600), feel: 4, context: [] });
    expect(two.signals[0].state).toBe("warn");
    expect(two.level).toBe("giallo");
  });
  it("battito +6 per un solo giorno senza HRV bassa: solo da tenere d'occhio", () => {
    const r = readiness({ ...base, hrv: days(10, () => 50), rhr: days(35, (i) => (i === 34 ? 61 : 55)), sleep: days(5, () => 7.5 * 3600), feel: 4, context: [] });
    expect(r.signals[1].state).toBe("ok");
    expect(r.signals[1].text).toContain("d'occhio");
  });
  it("due segnali: rosso; con il caldo diventa giallo", () => {
    const i = { ...base, hrv: days(10, (k) => (k >= 8 ? 25 : 50)), rhr: days(35, () => 55), sleep: days(5, () => 5 * 3600), feel: 4 };
    expect(readiness({ ...i, context: [] }).level).toBe("rosso");
    const h = readiness({ ...i, context: ["caldo"] });
    expect(h.level).toBe("giallo");
    expect(h.softened).toBe(true);
  });
  it("come ti senti 2/5 conta come segnale; febbre sempre rosso", () => {
    const ok = { ...base, hrv: days(10, () => 50), rhr: days(35, () => 55), sleep: days(5, () => 7.5 * 3600) };
    expect(readiness({ ...ok, feel: 2, context: [] }).level).toBe("giallo");
    const f = readiness({ ...ok, feel: 4, context: ["febbre", "caldo"] });
    expect(f.level).toBe("rosso");
    expect(f.advice).toContain("malaria");
  });
  it("seduta già fatta: il consiglio passa al recupero", () => {
    const r = readiness({ ...base, session: { title: "6,5km di corsa facile", type: "facile", done: true }, hrv: days(10, () => 50), rhr: days(35, () => 55), sleep: days(5, () => 7.5 * 3600), feel: 4, context: [] });
    expect(r.advice).toContain("fatta");
  });
  it("senza dati: nessun giudizio inventato", () => {
    expect(readiness({ ...base, hrv: [], rhr: [], sleep: [], feel: null, context: [] }).level).toBe("na");
  });
});

describe("stima di gara unica", () => {
  const row = (id: string, day: string, s5: number | null, s10: number | null, s21: number | null, race: boolean): SplitRow => ({ id, day, name: id, s1: 240, s1609: 400, s5, s10, s21, race });
  it("ancora sulla gara più recente, distanza più vicina all'obiettivo, forbice per età", () => {
    const e = efforts([row("sanremo", "2026-06-20", 1342, 2721, 5787, true), row("allenamento", "2026-10-08", 1424, null, null, false)], []);
    const f = forecast(e, 21097.5, T)!;
    expect(f.anchor.id).toBe("sanremo");
    expect(f.anchor.key).toBe("hm");
    expect(Math.round(f.s)).toBe(5787);
    expect(f.confidence).toBe("media");
    expect(f.pct).toBeGreaterThan(2);
    expect(f.pct).toBeLessThan(2.6);
    expect(f.lo).toBeLessThan(f.s);
  });
  it("niente gare: nessuna stima (gli allenamenti non bastano)", () => {
    expect(forecast(efforts([row("a", "2026-10-08", 1424, null, null, false)], []), 21097.5, T)).toBeNull();
  });
  it("5 km equivalente all'obiettivo", () => {
    expect(Math.round(equivalent(5697, 21097.5, 5000))).toBe(Math.round(5697 * (5000 / 21097.5) ** 1.06));
  });
});

describe("allenamento", () => {
  it("intensità 80/20", () => {
    const r = intensity([{ day: T, z: [600, 3000, 300, 300, 0] }])!;
    expect(Math.round(r.easy * 100)).toBe(93);   // Z1–Z3 = facile
    expect(r.ok).toBe(true);
    const hot = intensity([{ day: T, z: [0, 70, 350, 240, 60] }])!;   // le ultime 4 settimane reali: molto Z4
    expect(Math.round(hot.easy * 100)).toBe(58);
    expect(hot.ok).toBe(false);
    expect(intensity([{ day: T, z: [100, 100, 100, 0, 0] }])).toBeNull();
  });
  it("picco oltre il 10%", () => {
    const runs = [{ day: "2026-10-20", dist: 15000 }, { day: "2026-11-02", dist: 12000 }, { day: "2026-09-01", dist: 21000 }];
    expect(peak(runs, "2026-11-15", 18000)!.warn).toBe(true);
    expect(Math.round(peak(runs, "2026-11-15", 18000)!.pct)).toBe(20);
    expect(peak(runs, "2026-11-15", 16000)!.warn).toBe(false);
  });
  it("volume rispetto alle 4 settimane precedenti", () => {
    expect(Math.round(weekChange([20, 30, 30, 30, 30, 33])!.pct)).toBe(10);
  });
});

describe("montagna", () => {
  // salita regolare di 400 m in 4 km a 3 km/h, poi discesa
  const dist: number[] = [], alt: number[] = [], t: number[] = [];
  for (let i = 0; i <= 160; i++) { const d = i * 50; dist.push(d); alt.push(i <= 80 ? 500 + i * 5 : 900 - (i - 80) * 5); t.push(d / (3 / 3.6)); }
  const pts = byDistance(dist, alt, t);
  it("km-sforzo", () => expect(kmEffort(10000, 800)).toBe(18));
  it("trova la salita e la VAM", () => {
    const c = climbs(pts);
    expect(c).toHaveLength(1);
    expect(c[0].gain).toBeGreaterThan(380);
    expect(c[0].vam).toBeGreaterThan(280); // 10% a 3 km/h = 300 m/h (la quota smussata toglie qualche metro in cima)
    expect(c[0].vam).toBeLessThan(310);
  });
  it("curva personale e stima di un percorso con forbice", () => {
    const curve = speedCurve([pts], 3);
    expect(curve.find((c) => c.g === 10)!.p50).toBeCloseTo(3, 1);
    const gpx = dist.map((d, i) => ({ lat: 37.9 + d / 111320, lon: 14.0, ele: alt[i] }));
    const r = estimateRoute(gpx, curve);
    expect(r.dist).toBeGreaterThan(7900);
    expect(r.fast).toBeLessThanOrEqual(r.mid);
    expect(r.mid).toBeLessThanOrEqual(r.slow);
    expect(r.mid / 3600).toBeGreaterThan(2.3);
    expect(r.mid / 3600).toBeLessThan(3);
  });
  it("Tobler sul piano circa 5 km/h", () => expect(tobler(0)).toBeCloseTo(5.04, 1));
});
