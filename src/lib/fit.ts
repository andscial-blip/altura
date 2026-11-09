/**
 * Lettura dei file FIT originali (ZIP scaricato da Garmin) con l'SDK ufficiale @garmin/fitsdk.
 * Porta TypeScript di fit_parse.py (app attuale, testato). Ogni valore può mancare.
 */
import { Decoder, Stream } from "@garmin/fitsdk";
import { unzipSync } from "fflate";
import type { Lap, Streams } from "@/lib/ingest";

const SEMI = 180 / 2 ** 31;
const MAX_FIT_BYTES = 64 * 1024 * 1024;
export const DEFAULT_STEP_S = 2;
export const DEFAULT_MAX_POINTS = 3000;

export class FitParseError extends Error {}

type Mesg = Record<string, unknown>;

function n(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function first(m: Mesg, ...k: string[]): number | null {
  for (const x of k) { const v = n(m[x]); if (v !== null) return v; }
  return null;
}
function r(v: number | null, nd: number): number | null {
  if (v === null) return null;
  const p = 10 ** nd;
  return Math.round(v * p) / p;
}
/** Il FIT salva la cadenza di corsa in passi di un piede al minuto: raddoppiata per avere passi/min. */
function cadence(m: Mesg, base: string, frac: string, running: boolean): number | null {
  const c = n(m[base]);
  if (c === null) return null;
  const t = c + (n(m[frac]) ?? 0);
  return running ? t * 2 : t;
}

export function extractFit(zip: Uint8Array): Uint8Array {
  // Alcuni download sono già FIT puri: intestazione ".FIT" ai byte 8-11.
  if (zip.length > 12 && String.fromCharCode(zip[8], zip[9], zip[10], zip[11]) === ".FIT") return zip;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(zip, { filter: (f) => f.name.toLowerCase().endsWith(".fit") && f.originalSize <= MAX_FIT_BYTES });
  } catch {
    throw new FitParseError("archivio ZIP non valido");
  }
  const name = Object.keys(files)[0];
  if (!name) throw new FitParseError("nessun file .fit nello ZIP");
  return files[name];
}

export interface FitResult {
  session: {
    sport: string | null; sub_sport: string | null; start: string | null;
    distance_m: number | null; elapsed_s: number | null; moving_s: number | null;
    avg_hr: number | null; max_hr: number | null; avg_speed: number | null; avg_cadence: number | null; avg_power: number | null;
    elev_gain_m: number | null; elev_loss_m: number | null; te_aerobic: number | null; te_anaerobic: number | null; records: number;
  };
  laps: Lap[];
  streams: Streams;
  warnings: string[];
}

export function parseFit(bytes: Uint8Array, opts: { running?: boolean; stepS?: number; maxPoints?: number } = {}): FitResult {
  const stepS = opts.stepS ?? DEFAULT_STEP_S, maxPoints = opts.maxPoints ?? DEFAULT_MAX_POINTS;
  let messages: Record<string, Mesg[]>, errors: unknown[];
  try {
    const dec = new Decoder(Stream.fromByteArray(Array.from(bytes)));
    if (!dec.isFIT()) throw new FitParseError("il contenuto non è un file FIT");
    const out = dec.read({ convertDateTimesToDates: true, mergeHeartRates: true }) as unknown as { messages: Record<string, Mesg[]>; errors: unknown[] };
    messages = out.messages; errors = out.errors ?? [];
  } catch (e) {
    if (e instanceof FitParseError) throw e;
    throw new FitParseError("decodifica FIT fallita");
  }
  const s: Mesg = messages.sessionMesgs?.[0] ?? {};
  const sport = s.sport == null ? null : String(s.sport);
  const running = opts.running ?? (sport ?? "").toLowerCase().includes("running");

  const laps: Lap[] = (messages.lapMesgs ?? []).map((l) => ({
    distance_m: r(first(l, "totalDistance"), 1),
    duration_s: r(first(l, "totalTimerTime", "totalElapsedTime"), 1),
    avg_hr: r(first(l, "avgHeartRate"), 0),
    max_hr: r(first(l, "maxHeartRate"), 0),
    avg_speed: r(first(l, "enhancedAvgSpeed", "avgSpeed"), 3),
    avg_cadence: r(cadence(l, "avgCadence", "avgFractionalCadence", running), 1),
    avg_power: r(first(l, "avgPower"), 0),
    elev_gain_m: r(first(l, "totalAscent"), 1),
  }));

  const records = (messages.recordMesgs ?? []).filter((m) => m.timestamp instanceof Date) as (Mesg & { timestamp: Date })[];
  const streams = downsample(records, s.startTime instanceof Date ? s.startTime : null, running, stepS, maxPoints);
  const start = s.startTime instanceof Date ? s.startTime.toISOString() : null;
  return {
    session: {
      sport, sub_sport: s.subSport == null ? null : String(s.subSport), start,
      distance_m: r(first(s, "totalDistance"), 1),
      elapsed_s: r(first(s, "totalElapsedTime"), 1),
      moving_s: r(first(s, "totalMovingTime", "totalTimerTime"), 1),
      avg_hr: r(first(s, "avgHeartRate"), 0), max_hr: r(first(s, "maxHeartRate"), 0),
      avg_speed: r(first(s, "enhancedAvgSpeed", "avgSpeed"), 3),
      avg_cadence: r(cadence(s, "avgCadence", "avgFractionalCadence", running), 1),
      avg_power: r(first(s, "avgPower"), 0),
      elev_gain_m: r(first(s, "totalAscent"), 1), elev_loss_m: r(first(s, "totalDescent"), 1),
      te_aerobic: r(first(s, "totalTrainingEffect"), 1), te_anaerobic: r(first(s, "totalAnaerobicTrainingEffect"), 1),
      records: records.length,
    },
    laps,
    streams,
    warnings: errors.slice(0, 5).map((e) => (e instanceof Error ? e.name : "errore")),
  };
}

function downsample(recs: (Mesg & { timestamp: Date })[], t0d: Date | null, running: boolean, stepS: number, maxPoints: number): Streams {
  const out: Required<Streams> = { t: [], dist: [], lat: [], lon: [], alt: [], hr: [], v: [], cad: [], pw: [] };
  if (!recs.length) return out;
  const t0 = (t0d ?? recs[0].timestamp).getTime();
  const span = (recs[recs.length - 1].timestamp.getTime() - t0) / 1000;
  const step = Math.max(stepS, maxPoints ? span / maxPoints : stepS);
  let next: number | null = null;
  for (const m of recs) {
    const t = (m.timestamp.getTime() - t0) / 1000;
    if (next !== null && t < next) continue;
    if (out.t.length >= maxPoints) break;
    next = (next === null ? t : next) + step;
    while (next <= t) next += step;
    const la = n(m.positionLat), lo = n(m.positionLong);
    out.t.push(r(t, 0));
    out.hr.push(r(first(m, "heartRate"), 0));
    out.v.push(r(first(m, "enhancedSpeed", "speed"), 3));
    out.cad.push(r(cadence(m, "cadence", "fractionalCadence", running), 0));
    out.pw.push(r(first(m, "power"), 0));
    out.alt.push(r(first(m, "enhancedAltitude", "altitude"), 1));
    out.lat.push(la === null ? null : r(la * SEMI, 6));
    out.lon.push(lo === null ? null : r(lo * SEMI, 6));
    out.dist.push(r(first(m, "distance"), 1));
  }
  // colonne completamente vuote: tolte per risparmiare spazio
  for (const k of Object.keys(out) as (keyof Streams)[]) {
    if (k !== "t" && out[k].every((x) => x === null)) delete (out as Partial<Streams>)[k];
  }
  return out;
}
