import { describe, expect, it } from "vitest";
import { Encoder, Profile } from "@garmin/fitsdk";
import { zipSync } from "fflate";
import { extractFit, parseFit, FitParseError } from "@/lib/fit";

/** FIT sintetico costruito con l'encoder ufficiale: 10 minuti di corsa, un punto al secondo. */
function sampleFit(): Uint8Array {
  const enc = new Encoder() as unknown as { onMesg(n: number, m: Record<string, unknown>): void; close(): Uint8Array };
  const t0 = new Date("2026-11-03T02:31:00Z");
  const semi = (deg: number) => Math.round((deg * 2 ** 31) / 180);
  enc.onMesg(Profile.MesgNum.FILE_ID, { type: "activity", manufacturer: "garmin", product: 0, timeCreated: t0, serialNumber: 1 });
  for (let i = 0; i <= 600; i++) {
    enc.onMesg(Profile.MesgNum.RECORD, {
      timestamp: new Date(t0.getTime() + i * 1000), positionLat: semi(-13.68 + i * 1e-5), positionLong: semi(48.45 + i * 1e-5),
      distance: i * 3, enhancedSpeed: 3, enhancedAltitude: 20 + i / 60, heartRate: 140 + (i % 10), cadence: 85, power: 280,
    });
  }
  enc.onMesg(Profile.MesgNum.LAP, { timestamp: new Date(t0.getTime() + 600_000), startTime: t0, totalDistance: 1800, totalElapsedTime: 600, totalTimerTime: 600, avgHeartRate: 145, maxHeartRate: 149, enhancedAvgSpeed: 3, avgCadence: 85, avgPower: 280, totalAscent: 10 });
  enc.onMesg(Profile.MesgNum.SESSION, { timestamp: new Date(t0.getTime() + 600_000), startTime: t0, sport: "running", subSport: "generic", totalDistance: 1800, totalElapsedTime: 600, totalTimerTime: 600, avgHeartRate: 145, maxHeartRate: 149, enhancedAvgSpeed: 3, avgCadence: 85, avgPower: 280, totalAscent: 10, totalDescent: 0 });
  return enc.close();
}

describe("lettura FIT", () => {
  const fit = sampleFit();
  it("sessione, giri e cadenza in passi/min", () => {
    const r = parseFit(fit);
    expect(r.session).toMatchObject({ sport: "running", distance_m: 1800, elapsed_s: 600, avg_hr: 145, avg_cadence: 170, elev_gain_m: 10, start: "2026-11-03T02:31:00.000Z" });
    expect(r.laps).toHaveLength(1);
    expect(r.laps[0]).toMatchObject({ distance_m: 1800, avg_cadence: 170, avg_speed: 3 });
  });
  it("serie ricampionate ogni 2 s con coordinate in gradi", () => {
    const r = parseFit(fit);
    expect(r.streams.t.length).toBe(301);
    expect(r.streams.t[1]).toBe(2);
    expect(r.streams.lat?.[0]).toBeCloseTo(-13.68, 5);
    expect(r.streams.lon?.[300]).toBeCloseTo(48.456, 5);
    expect(r.streams.cad?.[0]).toBe(170);
  });
  it("limite di punti rispettato", () => {
    expect(parseFit(fit, { maxPoints: 100 }).streams.t.length).toBeLessThanOrEqual(100);
  });
  it("ZIP come quello scaricato da Garmin", () => {
    const zip = zipSync({ "12345_ACTIVITY.fit": fit });
    expect(extractFit(zip)).toEqual(fit);
    expect(() => extractFit(zipSync({ "a.txt": new Uint8Array([1, 2]) }))).toThrow(FitParseError);
  });
  it("contenuto non FIT", () => {
    expect(() => parseFit(new Uint8Array(40))).toThrow(FitParseError);
  });
});
