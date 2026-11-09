/**
 * Apple Salute via Comandi Rapidi: l'iPhone invia campioni e allenamenti autorizzati all'endpoint /api/ingest/health.
 * Normalizzazione pura (testata). Nota: Salute raccoglie anche dati scritti da Garmin, Strava e Runna; restano una fonte
 * separata ("apple_health") con la priorità più bassa, così non si contano due volte.
 */
import { z } from "zod";
import { num, sportFromApple, type Norm } from "@/lib/model";
import type { DailyRow } from "@/lib/ingest";

/** Identificatori HealthKit (o nomi brevi) → metrica del catalogo e regola di aggregazione giornaliera. */
const MAP: Record<string, { metric: string; agg: "sum" | "avg" | "last" | "min" }> = {
  HKQuantityTypeIdentifierStepCount: { metric: "steps", agg: "sum" },
  HKQuantityTypeIdentifierRestingHeartRate: { metric: "resting_hr", agg: "avg" },
  HKQuantityTypeIdentifierHeartRateVariabilitySDNN: { metric: "hrv_sdnn", agg: "avg" },
  HKQuantityTypeIdentifierActiveEnergyBurned: { metric: "active_kcal", agg: "sum" },
  HKQuantityTypeIdentifierBasalEnergyBurned: { metric: "resting_kcal", agg: "sum" },
  HKQuantityTypeIdentifierRespiratoryRate: { metric: "respiration", agg: "avg" },
  HKQuantityTypeIdentifierOxygenSaturation: { metric: "spo2", agg: "avg" },
  HKQuantityTypeIdentifierBodyMass: { metric: "weight_kg", agg: "last" },
  HKQuantityTypeIdentifierBodyFatPercentage: { metric: "body_fat_pct", agg: "last" },
  HKQuantityTypeIdentifierVO2Max: { metric: "vo2max_run", agg: "last" },
  HKQuantityTypeIdentifierWalkingHeartRateAverage: { metric: "walking_hr", agg: "avg" },
  HKQuantityTypeIdentifierAppleExerciseTime: { metric: "exercise_min", agg: "sum" },
  HKQuantityTypeIdentifierDistanceWalkingRunning: { metric: "distance_walk_run_m", agg: "sum" },
  HKCategoryTypeIdentifierSleepAnalysis: { metric: "sleep_s", agg: "sum" },
  HKCategoryTypeIdentifierAppleStandHour: { metric: "stand_h", agg: "sum" },
};
const SHORT: Record<string, string> = {
  steps: "HKQuantityTypeIdentifierStepCount", resting_hr: "HKQuantityTypeIdentifierRestingHeartRate", hrv: "HKQuantityTypeIdentifierHeartRateVariabilitySDNN",
  active_energy: "HKQuantityTypeIdentifierActiveEnergyBurned", basal_energy: "HKQuantityTypeIdentifierBasalEnergyBurned", respiration: "HKQuantityTypeIdentifierRespiratoryRate",
  spo2: "HKQuantityTypeIdentifierOxygenSaturation", weight: "HKQuantityTypeIdentifierBodyMass", body_fat: "HKQuantityTypeIdentifierBodyFatPercentage",
  vo2max: "HKQuantityTypeIdentifierVO2Max", walking_hr: "HKQuantityTypeIdentifierWalkingHeartRateAverage", exercise: "HKQuantityTypeIdentifierAppleExerciseTime",
  distance: "HKQuantityTypeIdentifierDistanceWalkingRunning", sleep: "HKCategoryTypeIdentifierSleepAnalysis",
  stand: "HKCategoryTypeIdentifierAppleStandHour",
};

/** Conversione delle unità più comuni restituite da Comandi Rapidi nelle unità del catalogo. */
export function toCatalogUnit(metric: string, value: number, unit?: string | null): number | null {
  const u = (unit ?? "").trim().toLowerCase();
  switch (metric) {
    case "weight_kg": return u === "lb" ? value * 0.45359237 : u === "g" ? value / 1000 : value;
    case "spo2": case "body_fat_pct": return value <= 1 && (u === "" || u === "%" || u === "fraction") ? value * 100 : value;
    case "distance_walk_run_m": return u === "km" ? value * 1000 : u === "mi" ? value * 1609.344 : value;
    case "active_kcal": case "resting_kcal": return u === "kj" ? value / 4.184 : value;
    case "sleep_s": case "exercise_min":
      if (metric === "sleep_s") return u === "min" ? value * 60 : u === "h" || u === "hr" ? value * 3600 : value;
      return u === "s" ? value / 60 : u === "h" || u === "hr" ? value * 60 : value;
    default: return value;
  }
}

const iso = z.string().min(10).max(40);
export const HealthPayload = z.object({
  device: z.string().max(80).optional(),
  tz: z.string().max(60).optional(),
  daily: z.array(z.object({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), metric: z.string().max(60), value: z.coerce.number(), unit: z.string().max(20).optional() })).max(5000).optional(),
  samples: z.array(z.object({
    type: z.string().max(80), start: iso, end: iso.optional(), value: z.coerce.number().optional(), unit: z.string().max(20).optional(),
    category: z.string().max(60).optional(), // per il sonno: asleep/inBed/awake/core/deep/rem
  })).max(20000).optional(),
  workouts: z.array(z.object({
    id: z.string().max(120).optional(), type: z.string().max(80), start: iso, end: iso,
    duration_s: z.coerce.number().optional(), distance: z.coerce.number().optional(), distance_unit: z.string().max(10).optional(),
    energy_kcal: z.coerce.number().optional(), avg_hr: z.coerce.number().optional(), max_hr: z.coerce.number().optional(),
    elevation_gain_m: z.coerce.number().optional(), source_app: z.string().max(80).optional(),
  })).max(2000).optional(),
});
export type HealthPayload = z.infer<typeof HealthPayload>;

/**
 * Formato "a colonne", il più semplice da costruire in Comandi Rapidi: per ogni metrica la lista dei valori e quella
 * delle date (stesso ordine), come escono da "Ottieni dettagli dei campioni di Salute".
 * Allenamenti: liste parallele di tipo, inizio, fine, distanza (km), energia (kcal).
 */
const list = z.union([z.array(z.union([z.string(), z.number(), z.null()])), z.string(), z.number()]).optional();
export const SeriesPayload = z.object({
  tz: z.string().max(60).optional(),
  device: z.string().max(80).optional(),
  series: z.record(z.string().max(40), z.object({ values: list, dates: list, ends: list, unit: z.string().max(20).optional() })).optional(),
  workouts: z.object({ types: list, starts: list, ends: list, distances: list, energies: list, distance_unit: z.string().max(10).optional() }).optional(),
});

/** Comandi Rapidi invia una lista con un solo elemento come valore semplice, e a volte le liste come testo a righe. */
export function asList(v: unknown): string[] {
  if (v === undefined || v === null) return [];
  if (Array.isArray(v)) return v.map((x) => (x === null ? "" : String(x)));
  const t = String(v);
  return t.includes("\n") ? t.split("\n").map((x) => x.trim()).filter(Boolean) : [t];
}

/** Numeri come li scrive iOS in italiano: "1.234,5", "7,5 km", "61 ms". */
export function itNumber(v: string): number | undefined {
  const m = /-?[\d.,]+/.exec(v.replace(/\s/g, ""));
  if (!m) return undefined;
  let t = m[0];
  if (t.includes(",") && t.includes(".")) t = t.lastIndexOf(",") > t.lastIndexOf(".") ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  else if (t.includes(",")) t = t.replace(",", ".");
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

const MESI: Record<string, number> = { gen: 1, feb: 2, mar: 3, apr: 4, mag: 5, giu: 6, lug: 7, ago: 8, set: 9, ott: 10, nov: 11, dic: 12, jan: 1, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, dec: 12 };

/** Date ISO 8601 (consigliate) oppure nei formati italiani di iOS: "9 nov 2026, 06:30", "09/11/2026, 06:30". */
export function parseDate(v: string, tz = "Indian/Antananarivo"): string | null {
  const s = v.trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) { const d = new Date(s.length === 10 ? s + "T12:00:00Z" : s); return Number.isNaN(d.getTime()) ? null : d.toISOString(); }
  let y: number, mo: number, da: number;
  const a = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(s);
  const b = /^(\d{1,2})\s+([a-zà-ù]{3})[a-zà-ù]*\.?\s+(\d{4})/i.exec(s);
  if (a) { da = +a[1]; mo = +a[2]; y = +a[3] < 100 ? 2000 + +a[3] : +a[3]; }
  else if (b && MESI[b[2].toLowerCase()]) { da = +b[1]; mo = MESI[b[2].toLowerCase()]; y = +b[3]; }
  else return null;
  const t = /(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?/.exec(s.slice((a ?? b)![0].length));
  const local = `${y}-${String(mo).padStart(2, "0")}-${String(da).padStart(2, "0")}T${String(t ? +t[1] : 12).padStart(2, "0")}:${t ? t[2] : "00"}:${t?.[3] ?? "00"}`;
  // ora locale del fuso indicato → UTC
  const guess = new Date(local + "Z");
  const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
    .formatToParts(guess).reduce<Record<string, string>>((o, x) => ((o[x.type] = x.value), o), {});
  const asTz = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return new Date(guess.getTime() - (asTz - guess.getTime())).toISOString();
}

/** Converte il formato a colonne nel formato a campioni. Restituisce anche gli avvisi (righe scartate). */
export function fromSeries(sp: z.infer<typeof SeriesPayload>): { payload: HealthPayload; warnings: string[] } {
  const tz = sp.tz || "Indian/Antananarivo";
  const warnings: string[] = [];
  const samples: NonNullable<HealthPayload["samples"]> = [];
  for (const [name, col] of Object.entries(sp.series ?? {})) {
    const id = MAP[name] ? name : SHORT[name];
    if (!id) { warnings.push(`metrica sconosciuta: ${name}`); continue; }
    const vals = asList(col.values), dates = asList(col.dates), ends = asList(col.ends);
    if (vals.length !== dates.length) warnings.push(`${name}: ${vals.length} valori ma ${dates.length} date`);
    const n = Math.min(vals.length, dates.length);
    let bad = 0;
    for (let i = 0; i < n; i++) {
      const start = parseDate(dates[i], tz);
      if (!start) { bad++; continue; }
      if (MAP[id].metric === "sleep_s") {
        const end = ends[i] ? parseDate(ends[i], tz) : null;
        if (!end) { bad++; continue; }
        samples.push({ type: id, start, end, category: vals[i] });
      } else {
        const v = itNumber(vals[i]);
        if (v === undefined) { bad++; continue; }
        const u = col.unit ?? (/[a-z%]+/i.exec(vals[i].replace(/^[-\d.,\s]+/, ""))?.[0]);
        samples.push({ type: id, start, value: v, unit: u });
      }
    }
    if (bad) warnings.push(`${name}: ${bad} righe con data o valore non leggibili`);
  }
  const workouts: NonNullable<HealthPayload["workouts"]> = [];
  if (sp.workouts) {
    const ty = asList(sp.workouts.types), st = asList(sp.workouts.starts), en = asList(sp.workouts.ends);
    const di = asList(sp.workouts.distances), ke = asList(sp.workouts.energies);
    for (let i = 0; i < Math.min(ty.length, st.length, en.length); i++) {
      const s = parseDate(st[i], tz), e = parseDate(en[i], tz);
      if (!s || !e) { warnings.push(`allenamento ${i + 1}: date non leggibili`); continue; }
      workouts.push({ type: ty[i], start: s, end: e, distance: di[i] ? itNumber(di[i]) : undefined, distance_unit: sp.workouts.distance_unit ?? (/\bm\b/.test(di[i] ?? "") ? "m" : "km"), energy_kcal: ke[i] ? itNumber(ke[i]) : undefined });
    }
  }
  return { payload: { tz, device: sp.device, samples, workouts }, warnings };
}

function dayIn(isoTs: string, tz: string): string {
  const d = new Date(isoTs);
  if (Number.isNaN(d.getTime())) return isoTs.slice(0, 10);
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** Campioni → righe giornaliere. Il sonno conta solo le fasi di sonno (non "a letto" né "sveglio"). */
export function samplesToDaily(p: HealthPayload, tz = "Indian/Antananarivo"): DailyRow[] {
  const acc = new Map<string, { metric: string; agg: string; vals: number[]; lastT: number; last: number }>();
  for (const s of p.samples ?? []) {
    const id = MAP[s.type] ? s.type : SHORT[s.type];
    const m = id ? MAP[id] : undefined;
    if (!m) continue;
    let value: number | null;
    let day: string;
    if (m.metric === "sleep_s") {
      const cat = (s.category ?? "asleep").toLowerCase();
      if (cat.includes("inbed") || cat.includes("in bed") || cat.includes("awake") || cat.includes("sveglio") || cat.includes("letto")) continue;
      if (!s.end) continue;
      value = (Date.parse(s.end) - Date.parse(s.start)) / 1000;
      day = dayIn(s.end, tz); // la notte appartiene al giorno del risveglio, come in Garmin
    } else {
      if (s.value === undefined) continue;
      value = toCatalogUnit(m.metric, s.value, s.unit);
      day = dayIn(s.start, tz);
    }
    if (value === null || !Number.isFinite(value) || value < 0) continue;
    const k = `${day}|${m.metric}`;
    const t = Date.parse(s.end ?? s.start);
    const cur = acc.get(k) ?? { metric: m.metric, agg: m.agg, vals: [], lastT: -Infinity, last: NaN };
    cur.vals.push(value);
    if (t >= cur.lastT) { cur.lastT = t; cur.last = value; }
    acc.set(k, cur);
  }
  const rows: DailyRow[] = [];
  for (const [k, a] of acc) {
    const day = k.split("|")[0];
    const v = a.agg === "sum" ? a.vals.reduce((x, y) => x + y, 0) : a.agg === "avg" ? a.vals.reduce((x, y) => x + y, 0) / a.vals.length : a.agg === "min" ? Math.min(...a.vals) : a.last;
    rows.push({ day, metric: a.metric, source: "apple_health", value: Math.round(v * 10) / 10, quality: `${a.vals.length} campioni` });
  }
  for (const d of p.daily ?? []) {
    const id = MAP[d.metric] ? d.metric : SHORT[d.metric];
    const metric = id ? MAP[id].metric : d.metric;
    const v = toCatalogUnit(metric, d.value, d.unit);
    if (v !== null && Number.isFinite(v)) rows.push({ day: d.day, metric, source: "apple_health", value: Math.round(v * 10) / 10, quality: "valore giornaliero" });
  }
  return rows;
}

export function workoutNorm(w: NonNullable<HealthPayload["workouts"]>[number]): { external_id: string; norm: Norm } {
  const start = new Date(w.start).toISOString();
  const end = new Date(w.end).toISOString();
  const dist = w.distance === undefined ? null : (w.distance_unit ?? "km").toLowerCase() === "m" ? w.distance : (w.distance_unit ?? "km").toLowerCase() === "mi" ? w.distance * 1609.344 : w.distance * 1000;
  return {
    external_id: w.id ?? `${start}|${w.type}`,
    norm: {
      sport: sportFromApple(w.type), start_utc: start,
      elapsed_s: num(w.duration_s ?? (Date.parse(end) - Date.parse(start)) / 1000, 0),
      distance_m: num(dist, 1), avg_hr: num(w.avg_hr, 0), max_hr: num(w.max_hr, 0), elev_gain_m: num(w.elevation_gain_m, 1),
    },
  };
}
