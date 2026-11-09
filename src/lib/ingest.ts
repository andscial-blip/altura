import "server-only";
import type { PoolClient } from "pg";
import { q, tx } from "@/lib/db";
import { ACTIVITY_FIELDS, DEDUP_WINDOW_S, SOURCE_PRIORITY, family, mergeNorms, streamMeta, type Norm, type SourceId } from "@/lib/model";

export type Acquisition = "api" | "file_fit" | "ical" | "shortcut" | "import" | "manual";

export interface IncomingActivity {
  source: SourceId;
  external_id: string;
  acquisition: Acquisition;
  raw: unknown;          // record originale, conservato tale e quale
  norm: Norm;            // valori normalizzati (unità SI: m, s, bpm, W)
  link_activity_id?: string | null; // collegamento esplicito già noto (es. Runna riporta l'id Garmin dell'uscita)
}

export type UpsertResult = { id: string; created: boolean; linked: boolean };

/**
 * Inserisce o aggiorna un'attività di una fonte.
 * 1) stessa fonte + stesso id esterno → aggiorna quella fonte;
 * 2) altrimenti cerca un'uscita già nota (±3 min, stessa famiglia di sport) e collega la fonte;
 * 3) altrimenti crea l'attività.
 * In tutti i casi i campi dell'attività vengono ricalcolati dalla gerarchia delle fonti.
 */
export async function upsertActivity(a: IncomingActivity, c?: PoolClient): Promise<UpsertResult> {
  if (!a.norm.start_utc || !a.norm.sport) throw new Error("attività senza inizio o sport");
  const run = async (cl: PoolClient): Promise<UpsertResult> => {
    let created = false, linked = false;
    const ex = await cl.query<{ activity_id: string }>(
      "select activity_id from sport.activity_sources where source = $1 and external_id = $2", [a.source, a.external_id]);
    let id: string | undefined = ex.rows[0]?.activity_id;
    if (!id && a.link_activity_id) { id = a.link_activity_id; linked = true; }
    if (!id) {
      const cand = await cl.query<{ id: string; sport: string }>(
        `select a.id, a.sport from sport.activities a
          where a.start_utc between $1::timestamptz - make_interval(secs => $2) and $1::timestamptz + make_interval(secs => $2)
            and not exists (select 1 from sport.activity_sources s where s.activity_id = a.id and s.source = $3)
          order by abs(extract(epoch from a.start_utc - $1::timestamptz)) limit 5`,
        [a.norm.start_utc, DEDUP_WINDOW_S, a.source]);
      id = cand.rows.find((r) => family(r.sport) === family(String(a.norm.sport)))?.id;
      if (id) linked = true;
    }
    if (!id) {
      const ins = await cl.query<{ id: string }>(
        "insert into sport.activities(sport, start_utc, primary_source) values ($1, $2, $3) returning id",
        [a.norm.sport, a.norm.start_utc, a.source]);
      id = ins.rows[0].id;
      created = true;
    }
    await cl.query(
      `insert into sport.activity_sources(activity_id, source, external_id, raw, norm, acquisition, fetched_at)
       values ($1,$2,$3,$4::jsonb,$5::jsonb,$6, now())
       on conflict (source, external_id) do update set raw = excluded.raw, norm = excluded.norm, acquisition = excluded.acquisition, fetched_at = now()`,
      [id, a.source, a.external_id, JSON.stringify(a.raw ?? null), JSON.stringify(a.norm), a.acquisition]);
    await recompute(cl, id);
    return { id, created, linked };
  };
  return c ? run(c) : tx(run);
}

/** Ricalcola i campi di un'attività dalle sue fonti. Scrive solo se qualcosa cambia (il trigger registra la modifica). */
export async function recompute(c: PoolClient, id: string): Promise<void> {
  const src = await c.query<{ source: SourceId; norm: Norm }>("select source, norm from sport.activity_sources where activity_id = $1", [id]);
  if (!src.rows.length) return;
  const { fields, primary_source } = mergeNorms(src.rows);
  const cols = ACTIVITY_FIELDS.filter((f) => fields[f] !== undefined);
  const sets = cols.map((f, i) => `${f} = $${i + 3}`).join(", ");
  const vals = cols.map((f) => fields[f]);
  const changed = cols.map((f, i) => `${f} is distinct from $${i + 3}`).join(" or ");
  await c.query(
    `update sport.activities set ${sets}${sets ? ", " : ""}primary_source = $2, updated_at = now()
      where id = $1 and (primary_source is distinct from $2${changed ? " or " + changed : ""})`,
    [id, primary_source, ...vals]);
}

export interface Streams {
  t: (number | null)[]; dist?: (number | null)[]; lat?: (number | null)[]; lon?: (number | null)[];
  alt?: (number | null)[]; hr?: (number | null)[]; v?: (number | null)[]; cad?: (number | null)[]; pw?: (number | null)[];
}

/** Salva le serie temporali; una fonte con priorità più bassa non sostituisce quelle di una fonte più affidabile. */
export async function upsertStreams(c: PoolClient, activityId: string, source: SourceId, s: Streams): Promise<boolean> {
  const cur = await c.query<{ source: SourceId }>("select source from sport.activity_streams where activity_id = $1", [activityId]);
  if (cur.rows[0] && SOURCE_PRIORITY[cur.rows[0].source] > SOURCE_PRIORITY[source]) return false;
  const m = streamMeta(s.lat, s.lon);
  await c.query(
    `insert into sport.activity_streams(activity_id, source, n_points, streams, bbox, start_lat, start_lon, end_lat, end_lon, updated_at)
     values ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9, now())
     on conflict (activity_id) do update set source = excluded.source, n_points = excluded.n_points, streams = excluded.streams,
       bbox = excluded.bbox, start_lat = excluded.start_lat, start_lon = excluded.start_lon, end_lat = excluded.end_lat, end_lon = excluded.end_lon, updated_at = now()`,
    [activityId, source, s.t.length, JSON.stringify(s), m.bbox, m.start?.[0] ?? null, m.start?.[1] ?? null, m.end?.[0] ?? null, m.end?.[1] ?? null]);
  return true;
}

export interface Lap { distance_m?: number | null; duration_s?: number | null; avg_hr?: number | null; max_hr?: number | null; avg_speed?: number | null; avg_cadence?: number | null; avg_power?: number | null; elev_gain_m?: number | null }

export async function replaceLaps(c: PoolClient, activityId: string, source: SourceId, laps: Lap[]): Promise<boolean> {
  const cur = await c.query<{ source: SourceId }>("select source from sport.activity_laps where activity_id = $1 limit 1", [activityId]);
  if (cur.rows[0] && SOURCE_PRIORITY[cur.rows[0].source] > SOURCE_PRIORITY[source]) return false;
  await c.query("delete from sport.activity_laps where activity_id = $1", [activityId]);
  for (let i = 0; i < laps.length; i++) {
    const l = laps[i];
    await c.query(
      `insert into sport.activity_laps(activity_id, idx, source, distance_m, duration_s, avg_hr, max_hr, avg_speed, avg_cadence, avg_power, elev_gain_m)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [activityId, i, source, l.distance_m ?? null, l.duration_s ?? null, l.avg_hr ?? null, l.max_hr ?? null, l.avg_speed ?? null, l.avg_cadence ?? null, l.avg_power ?? null, l.elev_gain_m ?? null]);
  }
  return true;
}

export interface DailyRow { day: string; metric: string; source: SourceId; value: number; quality?: string | null }

/** Metriche giornaliere: una riga per (giorno, metrica, fonte). Le fonti non si sovrascrivono a vicenda. */
export async function upsertDaily(rows: DailyRow[]): Promise<number> {
  const ok = rows.filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.day) && Number.isFinite(r.value));
  if (!ok.length) return 0;
  const CH = 400;
  for (let i = 0; i < ok.length; i += CH) {
    const part = ok.slice(i, i + CH);
    await q(
      `insert into sport.daily_metrics(day, metric, source, value, quality, recorded_at)
       select x.day::date, x.metric, x.source, x.value::numeric, x.quality, now()
         from jsonb_to_recordset($1::jsonb) as x(day text, metric text, source text, value float8, quality text)
         where exists (select 1 from sport.metric_catalog m where m.metric = x.metric)
       on conflict (day, metric, source) do update set value = excluded.value, quality = excluded.quality, recorded_at = now()
         where sport.daily_metrics.value is distinct from excluded.value or sport.daily_metrics.quality is distinct from excluded.quality`,
      [JSON.stringify(part)]);
  }
  return ok.length;
}

// ---------- registro delle sincronizzazioni ----------

export async function startRun(source: string): Promise<number> {
  const r = await q<{ id: string }>("insert into sport.sync_runs(source, status) values ($1, 'running') returning id", [source]);
  return Number(r[0].id);
}

export async function finishRun(id: number, status: "ok" | "partial" | "error" | "skipped", counts: Record<string, unknown>, message?: string): Promise<void> {
  await q("update sport.sync_runs set finished_at = now(), status = $2, counts = $3::jsonb, message = $4 where id = $1",
    [id, status, JSON.stringify(counts), message ? message.slice(0, 400) : null]);
}

export async function getState<T extends object>(source: string): Promise<Partial<T>> {
  const r = await q<{ state: T }>("select state from sport.sync_state where source = $1", [source]);
  return r[0]?.state ?? {};
}

export async function setState(source: string, state: object): Promise<void> {
  await q(`insert into sport.sync_state(source, state, updated_at) values ($1, $2::jsonb, now())
           on conflict (source) do update set state = excluded.state, updated_at = now()`, [source, JSON.stringify(state)]);
}

/** Toglie dai messaggi qualunque cosa somigli a un segreto (chiavi, token, URL con parametri). */
export function sanitize(msg: unknown, limit = 300): string {
  let s = msg instanceof Error ? msg.message : String(msg);
  for (const k of ["GARMIN_API_KEY", "RUNNA_ICS_URL", "STRAVA_CLIENT_SECRET", "DATABASE_URL", "SESSION_SECRET"]) {
    const v = process.env[k];
    if (v && v.length > 6) s = s.split(v).join("[nascosto]");
  }
  s = s.replace(/eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g, "[token]")
    .replace(/\b(ApiKey|Bearer)\s+\S{8,}/gi, "$1 [nascosto]")
    .replace(/(webcal|https?):\/\/[^\s"']*\?[^\s"']*/gi, "[url]")
    .replace(/postgres(ql)?:\/\/\S+/gi, "[db]");
  return s.slice(0, limit);
}
