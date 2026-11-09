import { describe, expect, it } from "vitest";
import { acwr, acwrZone, efficiency, rolling, trend } from "@/lib/analytics";

describe("calcoli derivati", () => {
  it("media mobile", () => { expect(rolling([1, 2, 3, 4], 2)).toEqual([null, 1.5, 2.5, 3.5]); });
  it("ACWR: carico costante = 1, raddoppio nell'ultima settimana = 1,6", () => {
    const flat = Array(35).fill(50);
    expect(acwr(flat).ratio.at(-1)).toBe(1);
    const jump = [...Array(28).fill(50), ...Array(7).fill(100)];
    // acuta 100, cronica (21×50 + 7×100)/28 = 62,5 → 1,6
    expect(acwr(jump).ratio.at(-1)).toBe(1.6);
    expect(acwr(Array(20).fill(50)).ratio.at(-1)).toBeNull();
    expect(acwrZone(1.6).cls).toBe("bad");
    expect(acwrZone(1.0).cls).toBe("ok");
  });
  it("efficienza: 5:00/km a 150 bpm = 200 m/min / 150 = 1,333", () => {
    expect(efficiency(200, 150)).toBe(1.333);
    expect(efficiency(200, 0)).toBeNull();
  });
  it("tendenza lineare", () => {
    expect(trend([0, 1, 2, 3], [1, 3, 5, 7])?.slope).toBe(2);
    expect(trend([0, 1], [1, 2])).toBeNull();
  });
});

import { niceMax } from "@/components/charts";
describe("assi", () => {
  it("massimi tondi", () => { expect(niceMax(57)).toBe(60); expect(niceMax(43)).toBe(50); expect(niceMax(10.7)).toBe(15); expect(niceMax(2040)).toBe(2500); });
});
