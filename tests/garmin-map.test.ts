import { describe, expect, it } from "vitest";
import { dailyRows, extractDaily, garminNorm, gmtToIso, wantsFit } from "@/lib/garmin-map";

describe("attività Garmin", () => {
  const s = {
    activityId: 1234, activityName: "Ambanja Corsa", activityType: { typeKey: "running" },
    startTimeLocal: "2026-11-03 05:31:02", startTimeGMT: "2026-11-03 02:31:02",
    distance: 10012.37, duration: 3301.2, elapsedDuration: 3400.9, movingDuration: 3290.1,
    elevationGain: 41.0, elevationLoss: 39.6, averageHR: 148.2, maxHR: 171, averageRunningCadenceInStepsPerMinute: 171.4,
    avgPower: 288.7, activityTrainingLoad: 95.33,
  };
  it("riepilogo → valori normalizzati in unità SI", () => {
    const n = garminNorm(s);
    expect(n).toMatchObject({ sport: "run", name: "Ambanja Corsa", start_utc: "2026-11-03T02:31:02.000Z", start_local: "2026-11-03 05:31:02",
      distance_m: 10012.4, elapsed_s: 3400.9, moving_s: 3290.1, avg_hr: 148, max_hr: 171, avg_cadence: 171.4, avg_power: 289, training_load: 95.3 });
  });
  it("orari GMT in vari formati", () => {
    expect(gmtToIso("2026-11-03 02:31:02.0")).toBe("2026-11-03T02:31:02.000Z");
    expect(gmtToIso(1762137062000)).toBe("2025-11-03T02:31:02.000Z");
    expect(gmtToIso("x")).toBeNull();
  });
  it("FIT solo per corse ed escursioni", () => {
    expect(wantsFit("trail_running")).toBe(true);
    expect(wantsFit("hiking")).toBe(true);
    expect(wantsFit("strength_training")).toBe(false);
  });
});

describe("metriche giornaliere Garmin", () => {
  it("riepilogo + HRV + sonno + body battery, le fonti specifiche correggono il riepilogo", () => {
    const rows = dailyRows({
      summary: [{ calendarDate: "2026-11-02", restingHeartRate: 47, totalSteps: 11234, averageStressLevel: 28, sleepingSeconds: 25000 }],
      hrv: { hrvSummaries: [{ calendarDate: "2026-11-02", lastNightAvg: 61, weeklyAvg: 58, status: "BALANCED", baseline: { balancedLow: 52, balancedUpper: 66 } }] },
      sleep: [{ calendarDate: "2026-11-02", dailySleepDTO: { sleepTimeSeconds: 26100, sleepScores: { overall: { value: 81 } } } }],
      body_battery: [{ date: "2026-11-02", charged: 60, drained: 55, bodyBatteryValuesArray: [[1, 30], [2, 92], [3, 41]] }],
    });
    const get = (m: string) => rows.find((r) => r.metric === m);
    expect(get("resting_hr")?.value).toBe(47);
    expect(get("sleep_s")?.value).toBe(26100);
    expect(get("sleep_score")?.value).toBe(81);
    expect(get("hrv_night")).toMatchObject({ value: 61, quality: "BALANCED" });
    expect(get("hrv_baseline_low")?.value).toBe(52);
    expect(get("body_battery_high")).toMatchObject({ value: 92, quality: "dalla serie intraday" });
    expect(rows.every((r) => r.source === "garmin")).toBe(true);
  });
  it("campi annidati non documentati: ricerca profonda entro intervalli plausibili", () => {
    const ex = extractDaily("summary", [{ calendarDate: "2026-11-01", heartRate: { restingValue: 49, maxValue: 160 } }]);
    expect(ex["2026-11-01"].resting_hr.value).toBe(49);
  });
});
