import { describe, expect, it } from "vitest";
import { linreg, mean, niceTicks, pctDelta, pearson, riegel, rolling, splitsFromStreams, validDaily } from "@/lib/stats";

describe("statistiche", () => {
  it("media, media mobile, variazione", () => {
    expect(mean([1, null, 3])).toBe(2);
    expect(rolling([1, 2, 3, null, 5], 3, 2)).toEqual([null, 1.5, 2, 2.5, 4]);
    expect(pctDelta(110, 100)).toBeCloseTo(10);
    expect(pctDelta(5, 0)).toBeNull();
  });
  it("retta e correlazione", () => {
    const xs = [0, 1, 2, 3, 4, 5], ys = [1, 3, 5, 7, 9, 11];
    expect(linreg(xs, ys)).toMatchObject({ a: 1, b: 2, n: 6 });
    expect(pearson(xs, ys)?.r).toBeCloseTo(1);
    expect(pearson(xs, ys.map((y) => -y))?.r).toBeCloseTo(-1);
    expect(pearson([1, 2], [3, 4])).toBeNull();
  });
  it("Riegel: dai 10 km in 44:30 alla mezza", () => {
    const t = riegel(2670, 10000, 21097.5);
    expect(Math.round(t)).toBe(5891); // 1:38:11
  });
  it("valori di 'dato insufficiente' di Garmin esclusi", () => {
    expect(validDaily("stress_avg", -1)).toBeNull();
    expect(validDaily("stress_avg", 31)).toBe(31);
    expect(validDaily("body_battery_low", 0)).toBeNull();
    expect(validDaily("hrv_night", 41)).toBe(41);
  });
  it("parziali al km da serie a 1 Hz, con interpolazione e parziale finale", () => {
    // 2,5 km a 5:00/km esatti (3,333 m/s), un punto al secondo
    const t = Array.from({ length: 751 }, (_, i) => i);
    const dist = t.map((s) => (s * 1000) / 300);
    const sp = splitsFromStreams(dist, t, t.map(() => 150), t.map((s) => s / 30));
    expect(sp).toHaveLength(3);
    expect(sp[0].pace_s).toBeCloseTo(300, 0);
    expect(sp[1].pace_s).toBeCloseTo(300, 0);
    expect(sp[2].dist_m).toBeCloseTo(500, 0);
    expect(sp[2].pace_s).toBeCloseTo(300, 0);
    expect(sp[0].hr).toBe(150);
    expect(sp[0].gain_m).toBeCloseTo(10, 0);
  });
  it("tacche degli assi", () => {
    expect(niceTicks(28, 61)).toEqual([40, 60]);
    expect(niceTicks(28, 61, 4)).toEqual([30, 40, 50, 60]);
    expect(niceTicks(0, 1.3)).toEqual([0, 0.5, 1]);
  });
});
