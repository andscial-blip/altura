/**
 * Mappature Garmin Connect Personal API → modello comune. Funzioni pure, porta di garmin_sync.py (app attuale).
 * Le chiavi alternative coprono le varianti dei payload viste nei collegamenti reali.
 */
import { num, pick, sportFromGarmin, type Norm } from "@/lib/model";
import type { DailyRow } from "@/lib/ingest";

export type GarminSummary = Record<string, unknown>;

export function typeKey(s: GarminSummary): string {
  const t = s.activityType;
  if (t && typeof t === "object") return String((t as Record<string, unknown>).typeKey ?? "");
  if (typeof t === "string") return t;
  return String(s.activityTypeKey ?? pick([s], "activityTypeDTO.typeKey") ?? "");
}

/** Corse ed escursioni: si scarica il FIT originale (GPS, altimetria). Le altre: solo riepilogo. */
export function wantsFit(tk: string): boolean {
  const t = tk.toLowerCase();
  return t.includes("running") || ["hiking", "walking", "mountaineering", "trail"].some((k) => t.includes(k));
}

/** "YYYY-MM-DD HH:MM:SS[.f]" (GMT), ISO o epoch ms → ISO UTC. */
export function gmtToIso(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return new Date(v > 1e11 ? v : v * 1000).toISOString();
  const s = String(v).trim().replace(" ", "T").replace(/Z$/, "").split(".")[0];
  if (s.length < 10) return null;
  const d = new Date(s.length === 10 ? s + "T00:00:00Z" : s + "Z");
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function localToTs(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().replace("T", " ").split(".")[0];
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(s) ? s : null;
}

export function activityList(payload: unknown): GarminSummary[] {
  if (Array.isArray(payload)) return payload.filter((r) => r && typeof r === "object");
  if (payload && typeof payload === "object") {
    for (const k of ["activities", "activityList", "data", "results"]) {
      const v = (payload as Record<string, unknown>)[k];
      if (Array.isArray(v)) return v.filter((r) => r && typeof r === "object");
    }
  }
  return [];
}

/** Riepilogo (+ dettagli se presenti) → valori normalizzati. */
export function garminNorm(summary: GarminSummary, details?: Record<string, unknown> | null): Norm {
  const src = [summary, details ?? {}, pick([details], "summaryDTO") ?? {}, pick([details], "metadataDTO") ?? {}];
  const tk = typeKey(summary) || typeKey(details ?? {});
  return {
    sport: sportFromGarmin(tk),
    name: (pick(src, "activityName", "name") as string | undefined) ?? null,
    start_utc: gmtToIso(pick(src, "startTimeGMT", "startTimeGmt", "beginTimestamp")),
    start_local: localToTs(pick(src, "startTimeLocal")),
    distance_m: num(pick(src, "distance"), 1),
    elapsed_s: num(pick(src, "elapsedDuration", "duration"), 1),
    moving_s: num(pick(src, "movingDuration", "duration"), 1),
    elev_gain_m: num(pick(src, "elevationGain"), 1),
    elev_loss_m: num(pick(src, "elevationLoss"), 1),
    avg_hr: num(pick(src, "averageHR", "averageHr", "avgHr"), 0),
    max_hr: num(pick(src, "maxHR", "maxHr"), 0),
    avg_cadence: num(pick(src, "averageRunningCadenceInStepsPerMinute", "averageRunCadence", "avgRunCadence", "averageBikingCadenceInRevPerMinute"), 1),
    avg_power: num(pick(src, "avgPower", "averagePower"), 0),
    training_load: num(pick(src, "activityTrainingLoad", "trainingLoad"), 1),
  };
}

/** Metriche extra dell'attività (non nei campi comuni): restano consultabili da raw, qui estratte per l'analisi. */
export function garminExtras(summary: GarminSummary): Record<string, number | null> {
  const s = [summary];
  return {
    vo2max: num(pick(s, "vO2MaxValue", "vo2MaxValue"), 1),
    te_aerobic: num(pick(s, "aerobicTrainingEffect"), 1),
    te_anaerobic: num(pick(s, "anaerobicTrainingEffect"), 1),
    gct_ms: num(pick(s, "avgGroundContactTime"), 0),
    vo_cm: num(pick(s, "avgVerticalOscillation"), 1),
    vratio_pct: num(pick(s, "avgVerticalRatio"), 1),
    stride_cm: num(pick(s, "avgStrideLength"), 1),
    gap_mps: num(pick(s, "avgGradeAdjustedSpeed"), 3),
  };
}

// ---------- metriche giornaliere ----------

const DATE_KEYS = ["calendarDate", "date", "summaryDate", "calendar_date"];

function dayOf(d: Record<string, unknown>): string | null {
  for (const k of DATE_KEYS) {
    const v = d[k];
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  }
  return null;
}

function hasDatedChildren(d: Record<string, unknown>): boolean {
  return Object.values(d).some((v) => Array.isArray(v) && v.length > 0 && v[0] && typeof v[0] === "object" && dayOf(v[0] as Record<string, unknown>));
}

/** Tutti gli oggetti con una data di calendario, ovunque siano nel payload. */
export function* dayRecords(p: unknown, depth = 0): Generator<Record<string, unknown>> {
  if (depth > 4 || p === null || typeof p !== "object") return;
  if (Array.isArray(p)) { for (const x of p) yield* dayRecords(x, depth + 1); return; }
  const d = p as Record<string, unknown>;
  if (dayOf(d) && !hasDatedChildren(d)) { yield d; return; }
  for (const v of Object.values(d)) if (v && typeof v === "object") yield* dayRecords(v, depth + 1);
}

function deepFind(o: unknown, rx: RegExp, lo: number, hi: number, depth = 0): number | null {
  if (depth > 4 || !o || typeof o !== "object" || Array.isArray(o)) return null;
  for (const [k, v0] of Object.entries(o)) {
    if (rx.test(k)) {
      const v = v0 && typeof v0 === "object" ? (v0 as Record<string, unknown>).value : v0;
      const n = num(v);
      if (n !== null && n >= lo && n <= hi) return n;
    }
  }
  for (const v of Object.values(o)) {
    const r = deepFind(v, rx, lo, hi, depth + 1);
    if (r !== null) return r;
  }
  return null;
}

type FieldSpec = { metric: string; paths: string[]; nd?: number; deep?: [RegExp, number, number] };

/** Fonte Garmin → metriche del catalogo. L'ordine conta: le fonti specifiche (sonno, HRV…) vengono dopo il riepilogo e lo correggono. */
export const DAILY_SOURCES: Record<string, FieldSpec[]> = {
  summary: [
    { metric: "resting_hr", paths: ["restingHeartRate", "restingHeartRateValue", "restingHR"], nd: 0, deep: [/^resting(HeartRate|Value|HR)?(Value)?$|restingHeartRate/i, 25, 120] },
    { metric: "steps", paths: ["totalSteps", "steps"], nd: 0, deep: [/^(totalSteps|steps|totalStepCount)$/i, 0, 200000] },
    { metric: "stress_avg", paths: ["averageStressLevel", "avgStressLevel", "stressAvg"], nd: 0, deep: [/^(averageStressLevel|avgStressLevel|average)$/i, 0, 100] },
    { metric: "body_battery_high", paths: ["bodyBatteryHighestValue", "bodyBatteryHigh"], nd: 0 },
    { metric: "body_battery_low", paths: ["bodyBatteryLowestValue", "bodyBatteryLow"], nd: 0 },
    { metric: "body_battery_charged", paths: ["bodyBatteryChargedValue", "bodyBatteryCharged"], nd: 0 },
    { metric: "body_battery_drained", paths: ["bodyBatteryDrainedValue", "bodyBatteryDrained"], nd: 0 },
    { metric: "sleep_s", paths: ["sleepingSeconds", "sleepTimeSeconds"], nd: 0 },
    { metric: "active_kcal", paths: ["activeKilocalories"], nd: 0 },
    { metric: "resting_kcal", paths: ["bmrKilocalories"], nd: 0 },
  ],
  hrv: [
    { metric: "hrv_night", paths: ["lastNightAvg", "hrvSummary.lastNightAvg"], nd: 1 },
    { metric: "hrv_week", paths: ["weeklyAvg", "hrvSummary.weeklyAvg"], nd: 1 },
    { metric: "hrv_baseline_low", paths: ["baseline.balancedLow", "hrvSummary.baseline.balancedLow"], nd: 1 },
    { metric: "hrv_baseline_high", paths: ["baseline.balancedUpper", "hrvSummary.baseline.balancedUpper"], nd: 1 },
  ],
  sleep: [
    { metric: "sleep_s", paths: ["sleepTimeSeconds", "dailySleepDTO.sleepTimeSeconds", "totalSleepSeconds", "sleepDurationSeconds", "durationInSeconds"], nd: 0,
      deep: [/^(sleepTimeSeconds|totalSleepSeconds|sleepSeconds|totalSleepTimeInSeconds|durationInSeconds)$/i, 600, 64800] },
    { metric: "sleep_score", paths: ["sleepScores.overall.value", "dailySleepDTO.sleepScores.overall.value", "overallSleepScore.value", "sleepScore", "overallScore", "score"], nd: 0,
      deep: [/^(overallScore|sleepScore|overall)$/i, 1, 100] },
  ],
  body_battery: [
    { metric: "body_battery_charged", paths: ["charged", "bodyBatteryCharged"], nd: 0 },
    { metric: "body_battery_drained", paths: ["drained", "bodyBatteryDrained"], nd: 0 },
    { metric: "body_battery_high", paths: ["highest", "bodyBatteryHighestValue"], nd: 0 },
    { metric: "body_battery_low", paths: ["lowest", "bodyBatteryLowestValue"], nd: 0 },
  ],
  stress: [
    { metric: "stress_avg", paths: ["values.overallStressLevel", "overallStressLevel", "averageStressLevel", "avgStressLevel"], nd: 0 },
  ],
};

function bbFromArray(rec: Record<string, unknown>): [number | null, number | null] {
  const arr = rec.bodyBatteryValuesArray;
  const vals: number[] = [];
  if (Array.isArray(arr)) for (const row of arr) if (Array.isArray(row) && typeof row[1] === "number") vals.push(row[1]);
  return vals.length ? [Math.max(...vals), Math.min(...vals)] : [null, null];
}

/**
 * Estrae le metriche giornaliere da un payload Garmin.
 * Ritorna {giorno: {metrica: {value, quality}}}; i valori derivati dalla serie intraday della Body Battery
 * sono solo un ripiego e non sostituiscono quelli dichiarati.
 */
export function extractDaily(source: keyof typeof DAILY_SOURCES, payload: unknown): Record<string, Record<string, { value: number; quality: string | null }>> {
  const out: Record<string, Record<string, { value: number; quality: string | null }>> = {};
  for (const rec of dayRecords(payload)) {
    const day = dayOf(rec);
    if (!day) continue;
    const vals: Record<string, { value: number; quality: string | null }> = {};
    for (const f of DAILY_SOURCES[source]) {
      let v = num(pick([rec], ...f.paths), f.nd);
      if (v === null && f.deep) v = num(deepFind(rec, ...f.deep), f.nd);
      if (v !== null) vals[f.metric] = { value: v, quality: null };
    }
    if (source === "hrv") {
      const st = pick([rec], "status", "hrvSummary.status");
      if (st && vals.hrv_night) vals.hrv_night.quality = String(st);
    }
    if (source === "body_battery") {
      const [hi, lo] = bbFromArray(rec);
      if (!vals.body_battery_high && hi !== null) vals.body_battery_high = { value: hi, quality: "dalla serie intraday" };
      if (!vals.body_battery_low && lo !== null) vals.body_battery_low = { value: lo, quality: "dalla serie intraday" };
    }
    out[day] = { ...(out[day] ?? {}), ...vals };
  }
  return out;
}

/** Fonde le fonti Garmin nell'ordine di DAILY_SOURCES e produce le righe per daily_metrics. */
export function dailyRows(bySource: Partial<Record<keyof typeof DAILY_SOURCES, unknown>>): DailyRow[] {
  const merged: Record<string, Record<string, { value: number; quality: string | null }>> = {};
  for (const src of Object.keys(DAILY_SOURCES)) {
    if (!(src in bySource)) continue;
    const ex = extractDaily(src, bySource[src]);
    for (const [day, vals] of Object.entries(ex)) {
      const cur = (merged[day] ??= {});
      for (const [m, v] of Object.entries(vals)) {
        // un ripiego non sostituisce un valore dichiarato già presente
        if (v.quality === "dalla serie intraday" && cur[m]) continue;
        cur[m] = v;
      }
    }
  }
  const rows: DailyRow[] = [];
  for (const [day, vals] of Object.entries(merged)) for (const [metric, v] of Object.entries(vals)) {
    rows.push({ day, metric, source: "garmin", value: v.value, quality: v.quality });
  }
  return rows;
}
