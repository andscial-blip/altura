/**
 * Strava API v3 → modello comune. Funzioni pure (testate in tests/strava.test.ts).
 * Formati: SummaryActivity di GET /athlete/activities e StreamSet di GET /activities/{id}/streams?key_by_type=true.
 */
import { family, num, sportFromStrava, type Norm } from "@/lib/model";
import type { Streams } from "@/lib/ingest";

export type StravaSummary = {
  id: number | string; name?: string; sport_type?: string; type?: string;
  start_date?: string; start_date_local?: string; timezone?: string;
  distance?: number; moving_time?: number; elapsed_time?: number; total_elevation_gain?: number;
  elev_high?: number; elev_low?: number;
  average_heartrate?: number; max_heartrate?: number; has_heartrate?: boolean;
  average_cadence?: number; average_watts?: number; suffer_score?: number | null;
  workout_type?: number | null; manual?: boolean; trainer?: boolean; device_name?: string;
  map?: { summary_polyline?: string | null } | null;
};

/** "(GMT+03:00) Indian/Antananarivo" → "Indian/Antananarivo". */
export function stravaTz(tz: string | undefined): string | null {
  const m = /\)\s*(\S+)$/.exec(tz ?? "");
  return m ? m[1] : null;
}

/** Strava conta la cadenza di corsa per una gamba sola: Garmin e Altura usano passi al minuto (due gambe). */
const cadenceFactor = (sport: string) => (family(sport) === "run" ? 2 : 1);

export function stravaNorm(s: StravaSummary): Norm {
  const sport = sportFromStrava(s.sport_type ?? s.type);
  const f = cadenceFactor(sport);
  const local = s.start_date_local ? s.start_date_local.replace("T", " ").replace(/Z$/, "").slice(0, 19) : null;
  return {
    sport,
    start_utc: s.start_date ? new Date(s.start_date).toISOString() : null,
    start_local: local,
    tz: stravaTz(s.timezone),
    name: s.name?.trim() || null,
    distance_m: num(s.distance, 1),
    moving_s: num(s.moving_time, 0),
    elapsed_s: num(s.elapsed_time, 0),
    elev_gain_m: num(s.total_elevation_gain, 1),
    avg_hr: s.has_heartrate === false ? null : num(s.average_heartrate, 0),
    max_hr: s.has_heartrate === false ? null : num(s.max_heartrate, 0),
    avg_cadence: s.average_cadence == null ? null : num(s.average_cadence * f, 0),
    avg_power: num(s.average_watts, 0),
    relative_effort: num(s.suffer_score, 0),
    // workout_type: 1 = gara di corsa, 11 = gara in bici
    is_race: s.workout_type === 1 || s.workout_type === 11 ? true : null,
  };
}

type StreamCol = { data?: unknown[] };
export type StravaStreamSet = Partial<Record<"time" | "distance" | "latlng" | "altitude" | "heartrate" | "velocity_smooth" | "cadence" | "watts", StreamCol>>;

const MAX_POINTS = 3000;

/** Serie temporali Strava → formato comune, ridotte a ~3000 punti come i FIT Garmin. */
export function stravaStreams(set: StravaStreamSet, sport: string): Streams | null {
  const time = set.time?.data as number[] | undefined;
  if (!time?.length) return null;
  const n = time.length;
  const step = Math.max(1, Math.ceil(n / MAX_POINTS));
  const idx: number[] = [];
  for (let i = 0; i < n; i += step) idx.push(i);
  if (idx[idx.length - 1] !== n - 1) idx.push(n - 1);
  const col = (k: keyof StravaStreamSet, f = 1, nd = 1) => {
    const d = set[k]?.data as (number | null)[] | undefined;
    return d?.length === n ? idx.map((i) => (d[i] == null ? null : num((d[i] as number) * f, nd))) : undefined;
  };
  const ll = set.latlng?.data as ([number, number] | null)[] | undefined;
  const out: Streams = { t: idx.map((i) => time[i]) };
  if (ll?.length === n) {
    out.lat = idx.map((i) => (ll[i] ? num(ll[i]![0], 6) : null));
    out.lon = idx.map((i) => (ll[i] ? num(ll[i]![1], 6) : null));
  }
  const add = (k: keyof Streams, v: (number | null)[] | undefined) => { if (v) (out as unknown as Record<string, unknown>)[k] = v; };
  add("dist", col("distance"));
  add("alt", col("altitude"));
  add("hr", col("heartrate", 1, 0));
  add("v", col("velocity_smooth", 1, 2));
  add("cad", col("cadence", cadenceFactor(sport), 0));
  add("pw", col("watts", 1, 0));
  return out;
}

/** Ambito concesso nella pagina di autorizzazione: senza activity:read_all le attività private non arrivano. */
export function scopeOk(scope: string | null): { ok: boolean; all: boolean } {
  const s = new Set((scope ?? "").split(/[,\s]+/).filter(Boolean));
  return { ok: s.has("activity:read") || s.has("activity:read_all"), all: s.has("activity:read_all") };
}
