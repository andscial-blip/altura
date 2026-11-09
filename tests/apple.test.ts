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

import { SeriesPayload, fromSeries, itNumber, parseDate, asList } from "@/lib/apple";
describe("formato a colonne di Comandi Rapidi", () => {
  it("numeri e date in italiano", () => {
    expect(itNumber("1.234,5")).toBe(1234.5);
    expect(itNumber("7,5 km")).toBe(7.5);
    expect(itNumber("12.450")).toBe(12450);
    expect(itNumber("61 ms")).toBe(61);
    expect(parseDate("2026-11-08T06:30:00+03:00")).toBe("2026-11-08T03:30:00.000Z");
    expect(parseDate("8 nov 2026, 06:30", "Indian/Antananarivo")).toBe("2026-11-08T03:30:00.000Z");
    expect(parseDate("08/11/2026, 06:30", "Europe/Rome")).toBe("2026-11-08T05:30:00.000Z");
    expect(parseDate("ieri")).toBeNull();
    expect(asList("a\nb")).toEqual(["a", "b"]);
    expect(asList(5)).toEqual(["5"]);
  });
  it("passi raggruppati per giorno, battito, sonno e allenamenti", () => {
    const sp = SeriesPayload.parse({
      tz: "UTC",
      series: {
        steps: { values: ["8.120", "11.034"], dates: ["2026-11-07T00:00:00Z", "2026-11-08T00:00:00Z"] },
        resting_hr: { values: [48], dates: "2026-11-08T07:00:00Z" },
        sleep: { values: ["Core", "Deep", "In letto"], dates: ["2026-11-07T21:00:00Z", "2026-11-08T01:00:00Z", "2026-11-07T20:30:00Z"], ends: ["2026-11-08T01:00:00Z", "2026-11-08T03:00:00Z", "2026-11-08T04:00:00Z"] },
        boh: { values: [1], dates: ["2026-11-08"] },
      },
      workouts: { types: ["Corsa", "Allenamento funzionale per la forza"], starts: ["2026-11-08T03:00:00Z", "2026-11-08T15:00:00Z"], ends: ["2026-11-08T03:50:00Z", "2026-11-08T15:40:00Z"], distances: ["9,2 km", ""] },
    });
    const { payload, warnings } = fromSeries(sp);
    const rows = samplesToDaily(payload, "UTC");
    const g = (m: string, d: string) => rows.find((r) => r.metric === m && r.day === d)?.value;
    expect(g("steps", "2026-11-08")).toBe(11034);
    expect(g("resting_hr", "2026-11-08")).toBe(48);
    expect(g("sleep_s", "2026-11-08")).toBe(6 * 3600);
    expect(warnings).toContain("metrica sconosciuta: boh");
    expect(payload.workouts?.map((w) => workoutNorm(w).norm.sport)).toEqual(["run", "strength"]);
    expect(workoutNorm(payload.workouts![0]).norm.distance_m).toBe(9200);
  });
});

import { flatToSeries, numberStyle } from "@/lib/apple";
describe("una metrica per richiesta", () => {
  it("passi e allenamenti nel formato piatto", () => {
    const a = fromSeries(SeriesPayload.parse(flatToSeries({ metric: "steps", values: ["9.001"], dates: ["2026-11-08T00:00:00Z"], tz: "UTC" })));
    expect(samplesToDaily(a.payload, "UTC")[0]).toMatchObject({ metric: "steps", value: 9001 });
    const w = fromSeries(SeriesPayload.parse(flatToSeries({ metric: "workouts", types: "Corsa", starts: "2026-11-08T03:00:00Z", ends: "2026-11-08T03:40:00Z", distances: "8 km" })));
    expect(w.payload.workouts?.[0]).toMatchObject({ type: "Corsa", distance: 8 });
  });
  it("calorie con punto decimale come le manda l'iPhone (caso reale del 9/11)", () => {
    const vals = "2449.1\n875.484\n89\n947.5\n988.6\n41.556\n1519.2\n19.112";
    const dates = ["02", "03", "04", "05", "06", "07", "08", "09"].map((d) => `2026-11-${d}T00:00:00Z`).join("\n");
    const a = fromSeries(SeriesPayload.parse(flatToSeries({ metric: "active_energy", values: vals, dates, tz: "UTC" })));
    const r = samplesToDaily(a.payload, "UTC");
    expect(r.find((x) => x.day === "2026-11-03")?.value).toBe(875.5);
    expect(r.find((x) => x.day === "2026-11-07")?.value).toBe(41.6);
    expect(Math.max(...r.map((x) => x.value))).toBeLessThan(3000);
  });
  it("stile dei numeri deciso sulla lista", () => {
    expect(numberStyle(["875.484"], "active_kcal")).toBe("dot");
    expect(numberStyle(["8.120"], "steps")).toBe("it");
    expect(numberStyle(["1.234,5", "7,5"])).toBe("it");
    expect(numberStyle(["8.120", "947.5"], "steps")).toBe("dot");
    expect(itNumber("875.484", "dot")).toBe(875.484);
    expect(itNumber("1.234,5", "it")).toBe(1234.5);
  });
});
