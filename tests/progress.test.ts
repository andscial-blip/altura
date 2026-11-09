import { describe, expect, it } from "vitest";
import { distKey, efforts, estimates, estimateSeries, goalStatus, records, type SplitRow } from "@/lib/progress";
import { clusters, matches, prepare, resample, routeGap, type RouteRun } from "@/lib/routes";

const row = (id: string, day: string, s5: number | null, s10: number | null, s21: number | null = null, s1 = 240): SplitRow => ({ id, day, name: id, s1, s1609: s1 * 1.65, s5, s10, s21 });

describe("record e stime", () => {
  it("riconosce le distanze classiche con tolleranza", () => {
    expect(distKey(21100)).toBe("hm");
    expect(distKey(10050)).toBe("10k");
    expect(distKey(7000)).toBeNull();
  });
  it("record per distanza e finestra", () => {
    const e = efforts([row("a", "2026-05-01", 1300, 2800), row("b", "2026-10-01", 1340, 2750)], []);
    const all = records(e);
    expect(all["5k"]!.s).toBe(1300);
    expect(all["10k"]!.id).toBe("b");
    expect(records(e, "2026-09-01")["5k"]!.s).toBe(1340);
  });
  it("il risultato ufficiale sostituisce il parziale della stessa uscita, riportato alla distanza standard", () => {
    const e = efforts([row("a", "2026-06-20", 1340, 2720, 5787)], [{ id: "r", day: "2026-06-20", name: "Mezza Sanremo", dist_m: 21100, time_s: 5800, activity_id: "a" }]);
    const hm = e.filter((x) => x.key === "hm");
    expect(hm).toHaveLength(1);
    expect(hm[0].official).toBe(true);
    expect(hm[0].s).toBeLessThan(5800); // 21,0975 < 21,1 km
    expect(hm[0].s).toBeGreaterThan(5798);
  });
  it("le stime usano solo sforzi da 5 km in su e tengono il più veloce", () => {
    const e = efforts([row("a", "2026-10-01", 1500, 3000, null, 200), row("b", "2026-10-10", 1400, null)], []);
    const est = estimates(e, "2026-08-01", "2026-11-09");
    expect(est.map((x) => x.key)).toEqual(["5k", "10k", "hm", "m"]);
    expect(est[0].s).toBe(1400);
    expect(est[0].from.id).toBe("b");
    // 10 km da 5 km in 23:20: Riegel 1400 × 2^1,06
    expect(Math.round(est[1].s)).toBe(Math.round(1400 * 2 ** 1.06));
  });
  it("finestra vuota: nessuna stima", () => {
    expect(estimates(efforts([row("a", "2025-01-01", 1400, null)], []), "2026-08-01", "2026-11-09")).toEqual([]);
  });
  it("andamento: un punto per data, sulla finestra precedente", () => {
    const e = efforts([row("a", "2026-03-01", 1400, null), row("b", "2026-09-01", 1300, null)], []);
    const s = estimateSeries(e, "5k", ["2026-04-01", "2026-07-15", "2026-10-01"]);
    expect(s.map((p) => p.v)).toEqual([1400, null, 1300]);
  });
  it("stato dell'obiettivo", () => {
    const g = goalStatus(5900, 5697, 21100, 98)!;
    expect(g.gap).toBe(203);
    expect(g.onTrack).toBe(false);
    expect(Math.round(g.perKm)).toBe(10);
    expect(goalStatus(5600, 5697, 21100, 98)!.onTrack).toBe(true);
    expect(goalStatus(null, 5697, 21100, 98)).toBeNull();
  });
});

// tracciati sintetici attorno ad Ambanja: un andata e ritorno verso nord e uno verso est, stessa lunghezza
const line = (dLat: number, dLon: number, n = 100, jitter = 0): RouteRun["track"] => {
  const lat: number[] = [], lon: number[] = [];
  for (let i = 0; i < n; i++) {
    const f = i < n / 2 ? i / (n / 2) : (n - i) / (n / 2);
    lat.push(-13.69 + dLat * f + (i % 3 - 1) * jitter);
    lon.push(48.46 + dLon * f + (i % 2) * jitter);
  }
  return { lat, lon };
};

describe("stesso percorso", () => {
  const north = { id: "n1", dist: 9000, track: line(0.04, 0) };
  const north2 = { id: "n2", dist: 9200, track: line(0.04, 0, 140, 0.0003) };
  const east = { id: "e1", dist: 9000, track: line(0, 0.041) };
  const shortN = { id: "n3", dist: 5000, track: line(0.022, 0) };
  it("ricampiona a passo costante", () => {
    expect(resample([[0, 0], [10, 0], [100, 0]], 11).map((p) => Math.round(p[0]))).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
  });
  it("stessa partenza ma direzione diversa: percorsi diversi", () => {
    const p = prepare([north, north2, east, shortN]);
    expect(routeGap(p[0].pts, p[1].pts)).toBeLessThan(80);
    expect(routeGap(p[0].pts, p[2].pts)).toBeGreaterThan(1000);
    expect(matches("n1", p).sort()).toEqual(["n1", "n2"]);
  });
  it("raggruppa solo i percorsi ripetuti", () => {
    const p = prepare([north, north2, east, shortN]);
    expect(clusters(p)).toEqual([["n1", "n2"]]);
  });
});

describe("nome del percorso", () => {
  it("direzione del punto più lontano", async () => {
    const { heading } = await import("@/lib/routes");
    const p = prepare([{ id: "n", dist: 9000, track: line(0.04, 0) }, { id: "e", dist: 9000, track: line(0, 0.041) }]);
    expect(heading(p[0])).toBe("verso nord");
    expect(heading(p[1])).toBe("verso est");
  });
});

describe("stime da gara", () => {
  it("solo gare e test, risultati ufficiali compresi", () => {
    const rows: SplitRow[] = [{ ...row("allen", "2026-10-01", 1400, null), race: false }, { ...row("gara", "2026-06-20", 1340, null), race: true }];
    const e = efforts(rows, [{ id: "r", day: "2026-07-26", name: "Giro di Castelbuono", dist_m: 5000, time_s: 1330, activity_id: null }]);
    const r = estimates(e, "2025-11-09", "2026-11-09", true);
    expect(r.find((x) => x.key === "5k")!.s).toBe(1330);
    expect(r.find((x) => x.key === "5k")!.from.official).toBe(true);
    expect(estimates(e, "2026-08-11", "2026-11-09", true)).toEqual([]);
    expect(estimates(e, "2026-08-11", "2026-11-09")[0].from.id).toBe("allen");
  });
});
