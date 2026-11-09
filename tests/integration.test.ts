/**
 * Test d'integrazione sul database reale (Postgres locale con lo stesso schema di produzione: db/001 + db/002).
 * Le chiamate esterne (Garmin, Runna) sono simulate con risposte nel formato delle API; tutto il resto è il codice vero.
 * Si attivano con TEST_DATABASE_URL.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Encoder, Profile } from "@garmin/fitsdk";
import { zipSync } from "fflate";

const URL_ = process.env.TEST_DATABASE_URL;
const run = describe.skipIf(!URL_);

function fitBytes(t0: Date): Uint8Array {
  const enc = new Encoder() as unknown as { onMesg(n: number, m: Record<string, unknown>): void; close(): Uint8Array };
  const semi = (d: number) => Math.round((d * 2 ** 31) / 180);
  enc.onMesg(Profile.MesgNum.FILE_ID, { type: "activity", manufacturer: "garmin", product: 0, timeCreated: t0, serialNumber: 1 });
  for (let i = 0; i <= 300; i++) enc.onMesg(Profile.MesgNum.RECORD, { timestamp: new Date(t0.getTime() + i * 1000), positionLat: semi(37.88 + i * 2e-5), positionLong: semi(14.0 + i * 2e-5), distance: i * 3, enhancedSpeed: 3, enhancedAltitude: 600 + i / 10, heartRate: 140, cadence: 85 });
  enc.onMesg(Profile.MesgNum.LAP, { timestamp: new Date(t0.getTime() + 300_000), startTime: t0, totalDistance: 900, totalElapsedTime: 300, totalTimerTime: 300, avgHeartRate: 140, enhancedAvgSpeed: 3, avgCadence: 85, totalAscent: 30 });
  enc.onMesg(Profile.MesgNum.SESSION, { timestamp: new Date(t0.getTime() + 300_000), startTime: t0, sport: "running", totalDistance: 900, totalElapsedTime: 300, totalTimerTime: 300, avgHeartRate: 140, totalAscent: 30 });
  return enc.close();
}

run("integrazione con il database", () => {
  let db: typeof import("@/lib/db");
  beforeAll(async () => {
    process.env.DATABASE_URL = URL_;
    process.env.SESSION_SECRET = "x".repeat(40);
    db = await import("@/lib/db");
    for (const t of ["planned_workouts", "activities", "daily_metrics", "sync_runs", "sync_state", "settings", "change_log", "private_zones"]) await db.q(`delete from sport.${t}`); // sport_app non ha TRUNCATE: solo i permessi minimi
  });
  afterAll(() => { vi.unstubAllGlobals(); });

  it("stessa uscita da Garmin e Strava: una sola attività, campi dalla fonte prioritaria, originali conservati", async () => {
    const { upsertActivity } = await import("@/lib/ingest");
    const g = await upsertActivity({ source: "garmin", external_id: "g1", acquisition: "api", raw: { orig: 1 }, norm: { sport: "run", start_utc: "2026-11-01T05:00:00.000Z", distance_m: 10012, avg_hr: 150, name: null } });
    const s = await upsertActivity({ source: "strava", external_id: "s1", acquisition: "api", raw: { orig: 2 }, norm: { sport: "trail_run", start_utc: "2026-11-01T05:01:10.000Z", distance_m: 10100, name: "Corsa del mattino" } });
    expect(g.created).toBe(true);
    expect(s).toMatchObject({ id: g.id, created: false, linked: true });
    const a = await db.one<{ distance_m: string; name: string; sport: string; primary_source: string }>("select distance_m::text, name, sport, primary_source from sport.activities where id = $1", [g.id]);
    expect(a).toMatchObject({ distance_m: "10012", name: "Corsa del mattino", sport: "run", primary_source: "garmin" });
    const raws = await db.q<{ source: string; raw: unknown }>("select source, raw from sport.activity_sources where activity_id = $1 order by source", [g.id]);
    expect(raws.map((r) => r.raw)).toEqual([{ orig: 1 }, { orig: 2 }]);
    // correzione manuale: prevale, l'originale resta, la modifica è registrata
    await upsertActivity({ source: "manual", external_id: g.id, acquisition: "manual", raw: null, norm: { sport: "run", start_utc: "2026-11-01T05:00:00.000Z", distance_m: 10000 }, link_activity_id: g.id });
    const b = await db.one<{ distance_m: string }>("select distance_m::text from sport.activities where id = $1", [g.id]);
    expect(b?.distance_m).toBe("10000");
    const log = await db.q("select 1 from sport.change_log where row_key = $1", [g.id]);
    expect(log.length).toBeGreaterThan(0);
  });

  it("uscita a 4 minuti di distanza o di altra disciplina: attività separate", async () => {
    const { upsertActivity } = await import("@/lib/ingest");
    const x = await upsertActivity({ source: "strava", external_id: "s2", acquisition: "api", raw: {}, norm: { sport: "run", start_utc: "2026-11-01T05:04:30.000Z" } });
    const y = await upsertActivity({ source: "apple_health", external_id: "a1", acquisition: "shortcut", raw: {}, norm: { sport: "ride", start_utc: "2026-11-01T05:00:30.000Z" } });
    expect(x.created).toBe(true);
    expect(y.created).toBe(true);
  });

  it("sincronizzazione Garmin completa con API simulate: token, attività, metriche, FIT, stato", { timeout: 90_000 }, async () => {
    process.env.GARMIN_API_KEY = "test-key-123456";
    const t0 = new Date(Date.now() - 2 * 86400_000);
    const gmt = t0.toISOString().replace("T", " ").slice(0, 19);
    const zip = zipSync({ "777_ACTIVITY.fit": fitBytes(t0) });
    const jwt = "eyJhbGciOiJIUzI1NiJ9." + Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 86400 })).toString("base64url") + ".sig";
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (input: string, init?: RequestInit) => {
      const u = new URL(input);
      calls.push(u.pathname);
      if (u.pathname.includes("personal-api-key/token")) {
        expect((init?.headers as Record<string, string>).Authorization).toBe("ApiKey test-key-123456");
        return new Response(jwt);
      }
      expect((init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${jwt}`);
      if (u.pathname.includes("activities/search")) {
        return Response.json(Number(u.searchParams.get("start")) === 0 ? [{ activityId: 777, activityName: "Isnello Corsa", activityType: { typeKey: "running" }, startTimeGMT: gmt, startTimeLocal: gmt, distance: 905.2, duration: 300, movingDuration: 298, averageHR: 141, activityTrainingLoad: 40, vO2MaxValue: 52 }] : []);
      }
      if (u.pathname.includes("dailysummaries")) return Response.json([{ calendarDate: t0.toISOString().slice(0, 10), restingHeartRate: 48, totalSteps: 9000 }]);
      if (u.pathname.includes("hrv-service")) return Response.json({ hrvSummaries: [{ calendarDate: t0.toISOString().slice(0, 10), lastNightAvg: 60, status: "BALANCED" }] });
      if (u.pathname.includes("download-service")) return new Response(zip as unknown as BodyInit);
      return Response.json([]);
    });
    const { syncGarmin } = await import("@/lib/garmin");
    const r = await syncGarmin({ budgetMs: 30_000 });
    expect(r.status).toBe("ok");
    expect(r.counts).toMatchObject({ activities: 1, created: 1, fit: 1, fit_failed: 0 });
    const a = await db.one<{ id: string; distance_m: string; name: string; training_load: string }>("select id, distance_m::text, name, training_load::text from sport.activities where name = 'Isnello Corsa'");
    expect(a?.distance_m).toBe("905.2");
    const st = await db.one<{ n_points: number; start_lat: string }>("select n_points, start_lat::text from sport.activity_streams where activity_id = $1", [a!.id]);
    expect(st?.n_points).toBeGreaterThan(100);
    expect(Number(st?.start_lat)).toBeCloseTo(37.88, 3);
    const laps = await db.q("select * from sport.activity_laps where activity_id = $1", [a!.id]);
    expect(laps).toHaveLength(1);
    const d = await db.q<{ metric: string; value: string; quality: string | null }>("select metric, value::text, quality from sport.daily_metrics order by metric");
    expect(d).toEqual(expect.arrayContaining([expect.objectContaining({ metric: "resting_hr", value: "48" }), expect.objectContaining({ metric: "hrv_night", value: "60", quality: "BALANCED" })]));
    const tok = await db.one<{ value: { enc: string } }>("select value from sport.settings where key = 'garmin_token'");
    expect(JSON.stringify(tok)).not.toContain(jwt); // salvato cifrato
    const run2 = await syncGarmin({ budgetMs: 30_000 });
    expect(run2.counts).toMatchObject({ created: 0, fit: 0 }); // incrementale, niente doppioni
    expect(calls.filter((c) => c.includes("token"))).toHaveLength(1); // token riusato
  });

  it("Runna: programma, spostamento, rimozione, eseguito collegato all'attività Garmin", async () => {
    process.env.RUNNA_ICS_URL = "webcal://example.invalid/feed.ics?secret=abc";
    const gid = "888";
    const startUtc = new Date(Date.now() - 86400_000);
    startUtc.setUTCHours(3, 0, 0, 0);
    const { upsertActivity } = await import("@/lib/ingest");
    const act = await upsertActivity({ source: "garmin", external_id: gid, acquisition: "api", raw: {}, norm: { sport: "run", start_utc: startUtc.toISOString(), distance_m: 8050 } });
    const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");
    const local = new Intl.DateTimeFormat("en-CA", { timeZone: "Indian/Antananarivo" }).format(startUtc).replace(/-/g, "");
    const later = new Date(Date.now() + 3 * 86400_000), later2 = new Date(Date.now() + 2 * 86400_000); // la seduta tolta cade dentro la finestra del feed
    const ics = (movedTo: Date, includeSecond: boolean) => [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT", "UID:p1@runna", `DTSTART;VALUE=DATE:${local}`, "SUMMARY:🏃 Corsa facile - 8 km", "DESCRIPTION:Corsa facile - 8 km - 45m - 50m\\n8 km a ritmo conversazionale\\n📲 Runna plan_week_2_EASY_RUN_1", "END:VEVENT",
      "BEGIN:VEVENT", "UID:p2@runna", `DTSTART;VALUE=DATE:${ymd(movedTo)}`, "SUMMARY:🏃 Lungo - 14 km", "DESCRIPTION:Lungo - 14 km - 1h20m - 1h30m\\n14 km facili\\n📲 Runna plan_week_2_LONG_RUN_2", "END:VEVENT",
      ...(includeSecond ? ["BEGIN:VEVENT", "UID:p3@runna", `DTSTART;VALUE=DATE:${ymd(later2)}`, "SUMMARY:🏃 Ripetute - 9 km", "DESCRIPTION:Ripetute - 9 km - 50m - 55m\\n1 km riscaldamento\\n📲 Runna plan_week_2_INTERVALS_3", "END:VEVENT"] : []),
      "BEGIN:VEVENT", "UID:c1@runna", `DTSTART:${startUtc.toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`, "SUMMARY:🏃 Corsa facile", `DESCRIPTION:Fatto con Runna\\n📊 In sintesi:\\nDistanza: 8\\,05 km\\nOra: 45:10\\n🔗 activityId=garmin-${gid}`, "END:VEVENT",
      "END:VCALENDAR"].join("\r\n");
    let body = ics(later, true);
    vi.stubGlobal("fetch", async (input: string) => { expect(input.startsWith("https://")).toBe(true); return new Response(body); });
    const { syncRunna } = await import("@/lib/runna");
    const r1 = await syncRunna();
    expect(r1.status).toBe("ok");
    expect(r1.counts).toMatchObject({ planned: 3, new: 3, completed: 1, linked_garmin: 1, matched: 1 });
    const p1 = await db.one<{ state: string; completed_activity: string }>("select state, completed_activity from sport.planned_workouts where key = 'w2_EASY_RUN_1'");
    expect(p1).toEqual({ state: "completato", completed_activity: act.id });
    const srcs = await db.q<{ source: string }>("select source from sport.activity_sources where activity_id = $1 order by source", [act.id]);
    expect(srcs.map((x) => x.source)).toEqual(["garmin", "runna"]);
    const dist = await db.one<{ distance_m: string }>("select distance_m::text from sport.activities where id = $1", [act.id]);
    expect(dist?.distance_m).toBe("8050"); // Runna non sovrascrive Garmin
    // Runna sposta il lungo e toglie le ripetute
    body = ics(new Date(Date.now() + 4 * 86400_000), false);
    const r2 = await syncRunna();
    expect(r2.counts).toMatchObject({ moved: 1, removed: 1, new: 0 });
    const moved = await db.one<{ history: unknown[] }>("select history from sport.planned_workouts where key = 'w2_LONG_RUN_2'");
    expect(moved?.history).toHaveLength(1);
    const runs = await db.q<{ message: string | null }>("select message from sport.sync_runs where source = 'runna'");
    expect(JSON.stringify(runs)).not.toContain("secret=abc");
  });

  it("errore Runna: il messaggio non contiene l'indirizzo segreto", async () => {
    vi.stubGlobal("fetch", async () => { throw new Error("fetch failed for https://example.invalid/feed.ics?secret=abc"); });
    const { syncRunna } = await import("@/lib/runna");
    const r = await syncRunna();
    expect(r.status).toBe("error");
    expect(r.message).not.toContain("secret=abc");
  });

  it("metriche Apple: righe separate per fonte, la priorità sceglie Garmin", async () => {
    const { upsertDaily } = await import("@/lib/ingest");
    const { samplesToDaily, HealthPayload } = await import("@/lib/apple");
    const day0 = new Date(Date.now() - 2 * 86400_000).toISOString().slice(0, 10);
    await upsertDaily(samplesToDaily(HealthPayload.parse({ samples: [{ type: "resting_hr", start: `${day0}T06:00:00Z`, value: 52 }, { type: "steps", start: `${day0}T08:00:00Z`, value: 9100 }] }), "UTC"));
    const { latestDaily } = await import("@/lib/queries");
    const l = await latestDaily(["resting_hr"]);
    expect(l[0]).toMatchObject({ source: "garmin", value: "48" });
    const both = await db.q("select source from sport.daily_metrics where metric = 'resting_hr' and day = $1", [day0]);
    expect(both).toHaveLength(2);
  });

  it("zone private: nessun punto entro il raggio arriva al browser", async () => {
    await db.q("insert into sport.private_zones(label, lat, lon, radius_m) values ('casa', 37.88, 14.0, 300)");
    const { publicTrack } = await import("@/lib/track");
    const lat = Array.from({ length: 300 }, (_, i) => 37.88 + i * 2e-5), lon = Array.from({ length: 300 }, (_, i) => 14.0 + i * 2e-5);
    const segs = await publicTrack(lat, lon);
    const { haversine } = await import("@/lib/model");
    for (const s of segs) for (const p of s) expect(haversine(p, [37.88, 14.0])).toBeGreaterThan(300);
    expect(segs.flat().length).toBeGreaterThan(0);
  });
});
