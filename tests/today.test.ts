import { describe, expect, it } from "vitest";
import { todaySummary } from "@/lib/today";

const base = { today: "2026-11-09", fmtSleep: (s: number) => `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)}` };

describe("sintesi di oggi", () => {
  it("tutto nella norma", () => {
    const r = todaySummary({ ...base, hrv: { day: "2026-11-09", value: 50 }, hrvLo: 31, hrvHi: 57, rhr: { day: "2026-11-09", value: 55 }, rhrMean7: 54, sleep: { day: "2026-11-09", value: 7 * 3600 }, sleepMean7: 7 * 3600, acwr: 0.9, session: { title: "6,5km facile", type: "facile", km: 6.5 } });
    expect(r.level).toBe("ok");
    expect(r.warn).toBe(0);
    expect(r.plan).toContain("In programma");
  });
  it("due segnali e seduta di qualità: invita a valutare, non prescrive", () => {
    const r = todaySummary({ ...base, hrv: { day: "2026-11-09", value: 25 }, hrvLo: 31, hrvHi: 57, rhr: { day: "2026-11-09", value: 62 }, rhrMean7: 55, sleep: { day: "2026-11-09", value: 7 * 3600 }, sleepMean7: 7 * 3600, acwr: 1.0, session: { title: "Ripetute", type: "qualita" } });
    expect(r.level).toBe("more");
    expect(r.warn).toBe(2);
    expect(r.plan).toContain("valuta tu");
  });
  it("dati vecchi non contano", () => {
    const r = todaySummary({ ...base, hrv: { day: "2026-11-07", value: 20 }, hrvLo: 31, rhr: null, sleep: null, acwr: 1.0 });
    expect(r.signals.find((s) => s.key === "hrv")?.state).toBe("na");
    expect(r.level).toBe("na");
  });
  it("sonno corto e carico alto", () => {
    const r = todaySummary({ ...base, sleep: { day: "2026-11-09", value: 5 * 3600 }, sleepMean7: 7 * 3600, acwr: 1.6, rhr: { day: "2026-11-09", value: 55 }, rhrMean7: 55 });
    expect(r.signals.find((s) => s.key === "sleep")?.state).toBe("warn");
    expect(r.signals.find((s) => s.key === "load")?.state).toBe("warn");
    expect(r.level).toBe("more");
  });
});
