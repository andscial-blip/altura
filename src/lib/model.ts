/**
 * Modello dati comune e regole di fusione. Funzioni pure (testate in tests/model.test.ts).
 *
 * Principi:
 * - ogni fonte conserva il proprio record originale (activity_sources.raw) e i propri valori normalizzati (norm);
 * - i campi dell'attività sono RICALCOLATI dalle fonti collegate secondo una gerarchia trasparente;
 * - una correzione manuale è una fonte in più ("manual"), non una sovrascrittura.
 */

export type SourceId = "garmin" | "strava" | "runna" | "apple_health" | "manual";
export type Sport =
  | "run" | "trail_run" | "treadmill" | "hike" | "walk" | "ride" | "swim" | "strength" | "ski" | "yoga" | "other";

/** Priorità per i campi delle attività: più alto vince. Garmin è il dispositivo che misura. */
export const SOURCE_PRIORITY: Record<SourceId, number> = { manual: 4, garmin: 3, strava: 2, apple_health: 1, runna: 0 };

export const ACTIVITY_FIELDS = [
  "sport", "start_utc", "start_local", "tz", "name",
  "distance_m", "moving_s", "elapsed_s", "elev_gain_m", "elev_loss_m",
  "avg_hr", "max_hr", "avg_cadence", "avg_power", "training_load", "relative_effort", "is_race",
] as const;
export type ActivityField = (typeof ACTIVITY_FIELDS)[number];
export type Norm = Partial<Record<ActivityField, string | number | boolean | null>>;

/** Famiglie per la deduplicazione: la stessa uscita può arrivare come "run" da Garmin e "trail_run" da Strava. */
export function family(s: string | null | undefined): string {
  switch (s) {
    case "run": case "trail_run": case "treadmill": return "run";
    case "hike": case "walk": return "foot";
    default: return s ?? "other";
  }
}

export const DEDUP_WINDOW_S = 180;

/** Due attività sono la stessa uscita se iniziano entro 3 minuti e sono della stessa famiglia. */
export function sameActivity(a: { sport: string; start_utc: string }, b: { sport: string; start_utc: string }): boolean {
  const dt = Math.abs(Date.parse(a.start_utc) - Date.parse(b.start_utc)) / 1000;
  return dt <= DEDUP_WINDOW_S && family(a.sport) === family(b.sport);
}

/**
 * Fonde i valori normalizzati delle fonti collegate.
 * Per ogni campo vince la fonte con priorità più alta che ha un valore non nullo.
 * primary_source = la fonte con priorità più alta tra quelle non manuali (chi ha registrato l'attività).
 */
export function mergeNorms(list: { source: SourceId; norm: Norm }[]): { fields: Norm; primary_source: SourceId; field_source: Partial<Record<ActivityField, SourceId>> } {
  if (!list.length) throw new Error("mergeNorms: nessuna fonte");
  const sorted = [...list].sort((a, b) => SOURCE_PRIORITY[b.source] - SOURCE_PRIORITY[a.source]);
  const fields: Norm = {};
  const field_source: Partial<Record<ActivityField, SourceId>> = {};
  for (const f of ACTIVITY_FIELDS) {
    for (const s of sorted) {
      const v = s.norm[f];
      if (v !== null && v !== undefined && v !== "") {
        fields[f] = v;
        field_source[f] = s.source;
        break;
      }
    }
  }
  const recorder = sorted.find((s) => s.source !== "manual") ?? sorted[0];
  return { fields, primary_source: recorder.source, field_source };
}

// ---------- mappature degli sport ----------

/** activityType.typeKey di Garmin → sport comune. */
export function sportFromGarmin(typeKey: string | null | undefined): Sport {
  const k = (typeKey ?? "").toLowerCase();
  if (k === "treadmill_running" || k === "indoor_running") return "treadmill";
  if (k.includes("trail")) return "trail_run";
  if (k.includes("run")) return "run";
  if (k === "hiking" || k === "mountaineering") return "hike";
  if (k.includes("walk")) return "walk";
  if (k.includes("cycl") || k.includes("bik") || k.includes("ride")) return "ride";
  if (k.includes("swim")) return "swim";
  if (k.includes("strength") || k.includes("hiit") || k.includes("fitness_equipment")) return "strength";
  if (k.includes("ski") || k.includes("snowboard")) return "ski";
  if (k.includes("yoga") || k.includes("pilates")) return "yoga";
  return "other";
}

/** sport_type di Strava → sport comune. */
export function sportFromStrava(t: string | null | undefined): Sport {
  switch (t) {
    case "Run": case "VirtualRun": return "run";
    case "TrailRun": return "trail_run";
    case "Hike": return "hike";
    case "Walk": return "walk";
    case "Ride": case "MountainBikeRide": case "GravelRide": case "EBikeRide": case "VirtualRide": case "EMountainBikeRide": return "ride";
    case "Swim": return "swim";
    case "WeightTraining": case "Crossfit": case "Workout": case "HighIntensityIntervalTraining": return "strength";
    case "AlpineSki": case "BackcountrySki": case "NordicSki": case "Snowboard": return "ski";
    case "Yoga": case "Pilates": return "yoga";
    default: return "other";
  }
}

/** HKWorkoutActivityType (nome inglese mandato da Comandi Rapidi) → sport comune. */
export function sportFromApple(t: string | null | undefined): Sport {
  const k = (t ?? "").toLowerCase();
  if (k.includes("run") || k.includes("corsa")) return k.includes("trail") ? "trail_run" : "run";
  if (k.includes("hik") || k.includes("escursion")) return "hike";
  if (k.includes("walk") || k.includes("cammin")) return "walk";
  if (k.includes("cycl") || k.includes("cicl") || k.includes("bici")) return "ride";
  if (k.includes("swim") || k.includes("nuoto")) return "swim";
  if (k.includes("strength") || k.includes("functional") || k.includes("hiit") || k.includes("core") || k.includes("forza") || k.includes("funzional")) return "strength";
  if (k.includes("ski") || k.includes("sci") || k.includes("snowboard")) return "ski";
  if (k.includes("yoga") || k.includes("pilates")) return "yoga";
  return "other";
}

export const SPORT_LABEL: Record<Sport, string> = {
  run: "Corsa", trail_run: "Trail", treadmill: "Tapis roulant", hike: "Escursione", walk: "Camminata",
  ride: "Bici", swim: "Nuoto", strength: "Forza", ski: "Sci", yoga: "Yoga", other: "Altro",
};

// ---------- utilità numeriche ----------

export function num(v: unknown, nd?: number): number | null {
  if (typeof v === "boolean" || v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return null;
  if (nd === undefined) return n;
  const p = 10 ** nd;
  return Math.round(n * p) / p;
}

/** Legge un valore per percorso "a.b.c". */
export function at(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const k of path.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}

/** Primo valore non nullo tra più oggetti e più percorsi. */
export function pick(objs: unknown[], ...paths: string[]): unknown {
  for (const o of objs) for (const p of paths) {
    const v = at(o, p);
    if (v !== null && v !== undefined && v !== "") return v;
  }
  return undefined;
}

/** Riquadro e punti estremi di un tracciato. */
export function streamMeta(lat: (number | null)[] = [], lon: (number | null)[] = []) {
  let minLat = Infinity, minLon = Infinity, maxLat = -Infinity, maxLon = -Infinity;
  let first: [number, number] | null = null, last: [number, number] | null = null;
  const n = Math.min(lat.length, lon.length);
  for (let i = 0; i < n; i++) {
    const a = lat[i], o = lon[i];
    if (a === null || o === null || a === undefined || o === undefined) continue;
    if (Math.abs(a) < 1e-9 && Math.abs(o) < 1e-9) continue; // 0,0 = nessun fix GPS
    if (!first) first = [a, o];
    last = [a, o];
    if (a < minLat) minLat = a; if (a > maxLat) maxLat = a;
    if (o < minLon) minLon = o; if (o > maxLon) maxLon = o;
  }
  if (!first || !last) return { bbox: null, start: null, end: null };
  return { bbox: [minLat, minLon, maxLat, maxLon] as number[], start: first, end: last };
}

/** Distanza in metri (haversine). */
export function haversine(a: [number, number], b: [number, number]): number {
  const R = 6371008.8, r = Math.PI / 180;
  const dLat = (b[0] - a[0]) * r, dLon = (b[1] - a[1]) * r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * Zone private: i punti entro il raggio di una zona vengono tolti prima di mostrare o esportare il tracciato.
 * Restituisce copie degli array con null al posto dei punti nascosti.
 */
export function maskPrivate(lat: (number | null)[], lon: (number | null)[], zones: { lat: number; lon: number; radius_m: number }[]) {
  if (!zones.length) return { lat, lon, hidden: 0 };
  const L = [...lat], O = [...lon];
  let hidden = 0;
  for (let i = 0; i < L.length; i++) {
    const a = L[i], o = O[i];
    if (a === null || o === null) continue;
    if (zones.some((z) => haversine([a, o], [z.lat, z.lon]) <= z.radius_m)) { L[i] = null; O[i] = null; hidden++; }
  }
  return { lat: L, lon: O, hidden };
}
