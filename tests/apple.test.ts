import { describe, expect, it } from "vitest";
import { HealthPayload, samplesToDaily, toCatalogUnit, workoutNorm } from "@/lib/apple";

describe("Apple Salute", () => {
  it("passi sommati, battito a riposo medio, peso ultimo valore, HRV come SDNN separata", () => {
    const p = HealthPayload.parse({
      samples: [
        { type: "HKQuantityTypeIdentifierStepCount", start: "2026-11-08T06:00:00Z", value: 4000 },
        { type: "steps", start: "2026-11-08T12:00:00Z", value: "3500" },
        { type: "resting_hr", start: "2026-11-08T03:00:00Z", value: 48 },
        { type: "resting_hr", start: "2026-11-08T09:00:00Z", value: 50 },
        { type: "weight", start: "2026-11-08T04:00:00Z", value: 70.2, unit: "kg" },
        { type: "weight", start: "2026-11-08T18:00:00Z", value: 70.8, unit: "kg" },
        { type: "hrv", start: "2026-11-08T02:00:00Z", value: 42 },
      ],
    });
    const rows = samplesToDaily(p, "UTC");
    const get = (m: string) => rows.find((r) => r.metric === m)?.value;
    expect(get("steps")).toBe(7500);
    expect(get("resting_hr")).toBe(49);
    expect(get("weight_kg")).toBe(70.8);
    expect(get("hrv_sdnn")).toBe(42);
    expect(rows.find((r) => r.metric === "hrv_night")).toBeUndefined();
  });
  it("sonno: solo le fasi di sonno, assegnato al giorno del risveglio", () => {
    const rows = samplesToDaily(HealthPayload.parse({ samples: [
      { type: "sleep", start: "2026-11-07T20:00:00Z", end: "2026-11-08T00:00:00Z", category: "core" },
      { type: "sleep", start: "2026-11-08T00:00:00Z", end: "2026-11-08T03:00:00Z", category: "deep" },
      { type: "sleep", start: "2026-11-07T19:30:00Z", end: "2026-11-08T03:30:00Z", category: "inBed" },
    ] }), "UTC");
    expect(rows).toEqual([expect.objectContaining({ day: "2026-11-08", metric: "sleep_s", value: 25200 })]);
  });
  it("unità", () => {
    expect(toCatalogUnit("spo2", 0.97, "%")).toBe(97);
    expect(toCatalogUnit("weight_kg", 154, "lb")).toBeCloseTo(69.85, 2);
    expect(toCatalogUnit("distance_walk_run_m", 5.2, "km")).toBe(5200);
  });
  it("allenamento → attività normalizzata", () => {
    const w = workoutNorm({ type: "HKWorkoutActivityTypeRunning", start: "2026-11-08T03:00:00Z", end: "2026-11-08T03:50:00Z", distance: 9.1, avg_hr: 149.6 });
    expect(w.norm).toMatchObject({ sport: "run", elapsed_s: 3000, distance_m: 9100, avg_hr: 150 });
  });
  it("payload non valido rifiutato", () => {
    expect(HealthPayload.safeParse({ daily: [{ day: "8/11/2026", metric: "steps", value: 1 }] }).success).toBe(false);
  });
});
