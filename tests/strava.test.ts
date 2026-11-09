import { describe, expect, it } from "vitest";
import { stravaNorm, stravaStreams, stravaTz, scopeOk } from "@/lib/strava-map";

describe("Strava → modello comune", () => {
  it("riassunto attività (formato SummaryActivity)", () => {
    const n = stravaNorm({ id: 12185274316, name: "Huawei Health activity", sport_type: "Hike", start_date: "2024-08-18T05:46:15Z", start_date_local: "2024-08-18T08:46:15Z", timezone: "(GMT+03:00) Indian/Antananarivo", distance: 6832.5, moving_time: 6753, elapsed_time: 10652, total_elevation_gain: 144.3, has_heartrate: false, average_heartrate: 0 });
    expect(n).toMatchObject({ sport: "hike", start_utc: "2024-08-18T05:46:15.000Z", start_local: "2024-08-18 08:46:15", tz: "Indian/Antananarivo", distance_m: 6832.5, moving_s: 6753, elapsed_s: 10652, elev_gain_m: 144.3, avg_hr: null });
  });
  it("cadenza di corsa raddoppiata (Strava conta una gamba), gara riconosciuta", () => {
    const n = stravaNorm({ id: 1, sport_type: "TrailRun", start_date: "2026-11-01T03:00:00Z", average_cadence: 84.6, average_heartrate: 151.2, has_heartrate: true, workout_type: 1, suffer_score: 88 });
    expect(n).toMatchObject({ sport: "trail_run", avg_cadence: 169, avg_hr: 151, is_race: true, relative_effort: 88 });
    expect(stravaNorm({ id: 2, sport_type: "Ride", start_date: "2026-11-01T03:00:00Z", average_cadence: 85 }).avg_cadence).toBe(85);
  });
  it("serie temporali ridotte e allineate", () => {
    const n = 7000;
    const s = stravaStreams({
      time: { data: Array.from({ length: n }, (_, i) => i) },
      latlng: { data: Array.from({ length: n }, (_, i) => [-13.68 + i * 1e-6, 48.45]) },
      heartrate: { data: Array.from({ length: n }, () => 140) },
      cadence: { data: Array.from({ length: n }, () => 85) },
      altitude: { data: Array.from({ length: 10 }, () => 1) }, // lunghezza diversa: scartata
    }, "run")!;
    expect(s.t.length).toBeLessThanOrEqual(3001);
    expect(s.t[s.t.length - 1]).toBe(n - 1);
    expect(s.lat!.length).toBe(s.t.length);
    expect(s.cad![0]).toBe(170);
    expect(s.alt).toBeUndefined();
    expect(stravaStreams({}, "run")).toBeNull();
  });
  it("fuso orario e permessi", () => {
    expect(stravaTz("(GMT+01:00) Europe/Rome")).toBe("Europe/Rome");
    expect(stravaTz(undefined)).toBeNull();
    expect(scopeOk("read,activity:read_all")).toEqual({ ok: true, all: true });
    expect(scopeOk("read").ok).toBe(false);
  });
});
