import { describe, expect, it } from "vitest";
import { family, haversine, maskPrivate, mergeNorms, num, pick, sameActivity, sportFromGarmin, sportFromStrava, streamMeta } from "@/lib/model";

describe("fusione delle fonti", () => {
  it("Garmin vince su Strava campo per campo, Strava riempie i buchi", () => {
    const r = mergeNorms([
      { source: "strava", norm: { sport: "trail_run", distance_m: 10100, name: "Corsa serale", relative_effort: 55 } },
      { source: "garmin", norm: { sport: "run", distance_m: 10012.4, name: null, avg_hr: 151 } },
    ]);
    expect(r.fields.distance_m).toBe(10012.4);
    expect(r.fields.sport).toBe("run");
    expect(r.fields.name).toBe("Corsa serale");
    expect(r.fields.relative_effort).toBe(55);
    expect(r.field_source.name).toBe("strava");
    expect(r.primary_source).toBe("garmin");
  });
  it("la correzione manuale prevale ma non diventa la fonte che ha registrato", () => {
    const r = mergeNorms([{ source: "garmin", norm: { sport: "run", is_race: false } }, { source: "manual", norm: { is_race: true, name: "Mezza di Antananarivo" } }]);
    expect(r.fields.is_race).toBe(true);
    expect(r.primary_source).toBe("garmin");
  });
  it("Runna non sovrascrive mai i dati misurati", () => {
    const r = mergeNorms([{ source: "runna", norm: { sport: "run", distance_m: 8000 } }, { source: "garmin", norm: { sport: "run", distance_m: 8123 } }]);
    expect(r.fields.distance_m).toBe(8123);
  });
});

describe("deduplicazione", () => {
  it("stessa uscita entro 3 minuti e stessa famiglia", () => {
    expect(sameActivity({ sport: "run", start_utc: "2026-11-01T05:00:00Z" }, { sport: "trail_run", start_utc: "2026-11-01T05:02:30Z" })).toBe(true);
    expect(sameActivity({ sport: "run", start_utc: "2026-11-01T05:00:00Z" }, { sport: "run", start_utc: "2026-11-01T05:03:30Z" })).toBe(false);
    expect(sameActivity({ sport: "run", start_utc: "2026-11-01T05:00:00Z" }, { sport: "hike", start_utc: "2026-11-01T05:00:00Z" })).toBe(false);
    expect(family("walk")).toBe(family("hike"));
  });
});

describe("mappature e utilità", () => {
  it("tipi Garmin e Strava", () => {
    expect(sportFromGarmin("running")).toBe("run");
    expect(sportFromGarmin("trail_running")).toBe("trail_run");
    expect(sportFromGarmin("treadmill_running")).toBe("treadmill");
    expect(sportFromGarmin("hiking")).toBe("hike");
    expect(sportFromGarmin("strength_training")).toBe("strength");
    expect(sportFromStrava("TrailRun")).toBe("trail_run");
    expect(sportFromStrava("Kitesurf")).toBe("other");
  });
  it("num e pick", () => {
    expect(num("12,5")).toBeNull();
    expect(num("12.456", 1)).toBe(12.5);
    expect(num(true)).toBeNull();
    expect(pick([{ a: { b: 0 } }], "x", "a.b")).toBe(0);
  });
  it("riquadro del tracciato ignora 0,0 e null", () => {
    const m = streamMeta([null, 0, -13.7, -13.8], [null, 0, 48.2, 48.3]);
    expect(m.bbox).toEqual([-13.8, 48.2, -13.7, 48.3]);
    expect(m.start).toEqual([-13.7, 48.2]);
  });
  it("haversine: 1 grado di latitudine ≈ 111,2 km", () => {
    expect(Math.round(haversine([0, 0], [1, 0]) / 100) / 10).toBe(111.2);
  });
  it("zone private: i punti vicini a casa spariscono", () => {
    const r = maskPrivate([45.0, 45.001, 45.02], [9.0, 9.0, 9.0], [{ lat: 45.0, lon: 9.0, radius_m: 200 }]);
    expect(r.lat).toEqual([null, null, 45.02]);
    expect(r.hidden).toBe(2);
  });
});
