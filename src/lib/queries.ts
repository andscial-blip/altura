import "server-only";
import { q, one } from "@/lib/db";

export type DailyPoint = { day: string; value: number; source: string; quality: string | null };

/** Per ogni metrica: ultimo valore disponibile, dalla fonte più affidabile secondo il catalogo. */
export async function latestDaily(metrics: string[]) {
  return q<{ metric: string; label_it: string; unit: string; kind: string; day: string; value: string; source: string; quality: string | null }>(
    `select distinct on (d.metric) d.metric, c.label_it, c.unit, c.kind, to_char(d.day,'YYYY-MM-DD') as day, d.value::text, d.source, d.quality
       from sport.daily_metrics d join sport.metric_catalog c using (metric)
      where d.metric = any($1) and d.day >= current_date - 10
      order by d.metric, d.day desc, coalesce(array_position(c.source_priority, d.source), 99)`, [metrics]);
}

/** Serie giornaliera di una metrica: un valore al giorno, dalla fonte prioritaria di quel giorno. */
export async function dailySeries(metric: string, days: number): Promise<DailyPoint[]> {
  const rows = await q<{ day: string; value: string; source: string; quality: string | null }>(
    `select distinct on (d.day) to_char(d.day,'YYYY-MM-DD') as day, d.value::text, d.source, d.quality
       from sport.daily_metrics d join sport.metric_catalog c using (metric)
      where d.metric = $1 and d.day >= current_date - $2::int
      order by d.day, coalesce(array_position(c.source_priority, d.source), 99)`, [metric, days]);
  return rows.map((r) => ({ ...r, value: Number(r.value) }));
}

export async function catalog() {
  return q<{ metric: string; label_it: string; unit: string; kind: string; source_priority: string[] }>("select * from sport.metric_catalog order by metric");
}

export type ActivityRow = {
  id: string; sport: string; start_utc: string; start_local: string | null; name: string | null;
  distance_m: string | null; moving_s: string | null; elapsed_s: string | null; elev_gain_m: string | null;
  avg_hr: string | null; max_hr: string | null; training_load: string | null; primary_source: string; sources: string[]; has_track: boolean;
};

export async function activities(opts: { sport?: string; limit?: number; offset?: number; from?: string } = {}) {
  const fam: Record<string, string[]> = { corsa: ["run", "trail_run", "treadmill"], montagna: ["hike", "walk"], bici: ["ride"], forza: ["strength"], altro: ["swim", "ski", "yoga", "other"] };
  const sports = opts.sport ? fam[opts.sport] ?? [opts.sport] : null;
  return q<ActivityRow>(
    `select a.id, a.sport, a.start_utc, to_char(a.start_local,'YYYY-MM-DD HH24:MI') as start_local, a.name, a.distance_m::text, a.moving_s::text, a.elapsed_s::text,
            a.elev_gain_m::text, a.avg_hr::text, a.max_hr::text, a.training_load::text, a.primary_source,
            array(select s.source from sport.activity_sources s where s.activity_id = a.id order by s.source) as sources,
            exists(select 1 from sport.activity_streams t where t.activity_id = a.id and t.start_lat is not null) as has_track
       from sport.activities a
      where not a.hidden and ($1::text[] is null or a.sport = any($1)) and ($4::timestamptz is null or a.start_utc >= $4)
      order by a.start_utc desc limit $2 offset $3`, [sports, opts.limit ?? 50, opts.offset ?? 0, opts.from ?? null]);
}

export async function activity(id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const a = await one<ActivityRow & { tz: string | null; avg_cadence: string | null; avg_power: string | null; elev_loss_m: string | null; relative_effort: string | null; is_race: boolean }>(
    `select a.*, to_char(a.start_local,'YYYY-MM-DD HH24:MI') as start_local, a.distance_m::text, a.moving_s::text, a.elapsed_s::text, a.elev_gain_m::text,
            a.avg_hr::text, a.max_hr::text, a.training_load::text, a.avg_cadence::text, a.avg_power::text, a.elev_loss_m::text, a.relative_effort::text,
            array(select s.source from sport.activity_sources s where s.activity_id = a.id) as sources, false as has_track
       from sport.activities a where a.id = $1`, [id]);
  if (!a) return null;
  const sources = await q<{ source: string; external_id: string; acquisition: string; fetched_at: string; norm: Record<string, unknown>; extras: Record<string, unknown> | null; fit_session: Record<string, unknown> | null; runna: Record<string, unknown> | null; summary: Record<string, unknown> | null }>(
    `select source, external_id, acquisition, fetched_at, norm, raw->'extras' as extras, raw->'fit_session' as fit_session,
            case when source = 'garmin' then (raw->'summary') - 'splitSummaries' - 'ownerProfileImageUrlLarge' - 'ownerProfileImageUrlMedium' - 'ownerProfileImageUrlSmall' - 'ownerFullName' end as summary,
            case when source = 'runna' then jsonb_build_object('steps', raw->'steps', 'segments', raw->'segments', 'type', raw->'type', 'text', raw->'text') end as runna
       from sport.activity_sources where activity_id = $1 order by source`, [id]);
  const streams = await one<{ source: string; n_points: number; streams: Record<string, (number | null)[]>; bbox: string[] | null }>(
    "select source, n_points, streams, bbox from sport.activity_streams where activity_id = $1", [id]);
  const laps = await q<{ idx: number; distance_m: string; duration_s: string; avg_hr: string; avg_speed: string; avg_cadence: string; avg_power: string; elev_gain_m: string }>(
    "select idx, distance_m::text, duration_s::text, avg_hr::text, avg_speed::text, avg_cadence::text, avg_power::text, elev_gain_m::text from sport.activity_laps where activity_id = $1 order by idx", [id]);
  const planned = await one<{ key: string; title: string; type: string; km: string | null; duration_min_s: number | null; duration_max_s: number | null; structure: { steps?: unknown[] } }>(
    "select key, title, type, km::text, duration_min_s, duration_max_s, structure from sport.planned_workouts where completed_activity = $1", [id]);
  return { a, sources, streams, laps, planned };
}

export async function privateZones() {
  return q<{ id: string; label: string; lat: number; lon: number; radius_m: number }>("select id, label, lat::float8 as lat, lon::float8 as lon, radius_m from sport.private_zones");
}

export async function lastSyncs() {
  return q<{ source: string; status: string; started_at: string; finished_at: string | null; counts: Record<string, number>; message: string | null }>(
    `select distinct on (source) source, status, started_at, finished_at, counts, message from sport.sync_runs order by source, started_at desc`);
}

export async function weekly(weeks: number) {
  return q<{ week: string; fam: string; n: number; dist_m: number; time_s: number; gain_m: number; load: number }>(
    `select to_char(date_trunc('week', coalesce(start_local, start_utc at time zone 'Indian/Antananarivo')),'YYYY-MM-DD') as week,
            case when sport in ('run','trail_run','treadmill') then 'corsa' when sport in ('hike','walk') then 'montagna' when sport = 'ride' then 'bici' when sport = 'strength' then 'forza' else 'altro' end as fam,
            count(*)::int as n, coalesce(sum(distance_m),0)::float8 as dist_m, coalesce(sum(coalesce(moving_s, elapsed_s)),0)::float8 as time_s,
            coalesce(sum(elev_gain_m),0)::float8 as gain_m, coalesce(sum(training_load),0)::float8 as load
       from sport.activities where not hidden and start_utc >= date_trunc('week', now()) - make_interval(weeks => $1)
      group by 1, 2 order by 1`, [weeks]);
}

export async function planned(from: string, to: string) {
  return q<{ key: string; day: string; title: string; type: string; km: string | null; duration_min_s: number | null; duration_max_s: number | null; state: string; week: number | null;
    completed_activity: string | null; history: { date: string; until: string }[]; act_dist: string | null; act_time: string | null; act_hr: string | null; act_name: string | null; runna_raw: Record<string, unknown> | null; structure: { header?: string; steps?: unknown[] } }>(
    `select p.key, to_char(p.day,'YYYY-MM-DD') as day, p.title, p.type, p.km::text, p.duration_min_s, p.duration_max_s, p.state, p.week, p.completed_activity, p.history, p.structure,
            a.distance_m::text as act_dist, coalesce(a.moving_s, a.elapsed_s)::text as act_time, a.avg_hr::text as act_hr, a.name as act_name,
            (select s.raw from sport.activity_sources s where s.activity_id = a.id and s.source = 'runna' limit 1) as runna_raw
       from sport.planned_workouts p left join sport.activities a on a.id = p.completed_activity
      where p.day between $1 and $2 order by p.day, p.key`, [from, to]);
}

/** Carico giornaliero (somma del carico Garmin delle attività), ultimi n giorni, giorni vuoti = 0. */
export async function dailyLoad(days: number) {
  return q<{ day: string; load: number; n_without: number }>(
    `with d as (select generate_series(current_date - $1::int, current_date, '1 day')::date as day)
     select to_char(d.day,'YYYY-MM-DD') as day, coalesce(sum(a.training_load),0)::float8 as load,
            count(a.id) filter (where a.training_load is null)::int as n_without
       from d left join sport.activities a on not a.hidden and (coalesce(a.start_local, a.start_utc at time zone 'Indian/Antananarivo'))::date = d.day
      group by d.day order by d.day`, [days]);
}

/** Corse con FC media: per l'indice di efficienza (metri al minuto per battito). */
export async function runEfficiency(days: number) {
  return q<{ day: string; v_mpm: number; hr: number; gap: number | null; dist: number }>(
    `select to_char(coalesce(a.start_local, a.start_utc at time zone 'Indian/Antananarivo'),'YYYY-MM-DD') as day,
            (a.distance_m / nullif(coalesce(a.moving_s, a.elapsed_s),0) * 60)::float8 as v_mpm, a.avg_hr::float8 as hr,
            (select (s.raw->'extras'->>'gap_mps')::float8 * 60 from sport.activity_sources s where s.activity_id = a.id and s.source = 'garmin') as gap,
            a.distance_m::float8 as dist
       from sport.activities a
      where not a.hidden and a.sport in ('run','trail_run') and a.avg_hr > 0 and a.distance_m > 3000 and a.start_utc > now() - make_interval(days => $1)
      order by a.start_utc`, [days]);
}

const LOCAL = "coalesce(a.start_local, a.start_utc at time zone 'Indian/Antananarivo')";

/** Più metriche giornaliere in una volta: un valore al giorno per metrica, dalla fonte prioritaria. */
export async function dailyMulti(metrics: string[], days: number) {
  const rows = await q<{ metric: string; day: string; value: string; source: string }>(
    `select distinct on (d.metric, d.day) d.metric, to_char(d.day,'YYYY-MM-DD') as day, d.value::text, d.source
       from sport.daily_metrics d join sport.metric_catalog c using (metric)
      where d.metric = any($1) and d.day >= current_date - $2::int
      order by d.metric, d.day, coalesce(array_position(c.source_priority, d.source), 99)`, [metrics, days]);
  const out: Record<string, { day: string; value: number; source: string }[]> = Object.fromEntries(metrics.map((m) => [m, []]));
  for (const r of rows) out[r.metric].push({ day: r.day, value: Number(r.value), source: r.source });
  return out;
}

export type Goal = { id: string; name: string; kind: string; target_date: string | null; target: Record<string, number | null>; active: boolean };
export async function goals(activeOnly = false) {
  return q<Goal>(`select id, name, kind, to_char(target_date,'YYYY-MM-DD') as target_date, target, active from sport.goals ${activeOnly ? "where active" : ""} order by active desc, target_date nulls last`);
}

/** Migliori tempi su 5 e 10 km (parziale più veloce calcolato da Garmin dentro ogni corsa). */
export async function runBests(days: number) {
  return q<{ id: string; day: string; name: string | null; s5: number | null; s10: number | null }>(
    `select a.id, to_char(${LOCAL},'YYYY-MM-DD') as day, a.name,
            (s.raw->'summary'->>'fastestSplit_5000')::float8 as s5, (s.raw->'summary'->>'fastestSplit_10000')::float8 as s10
       from sport.activities a join sport.activity_sources s on s.activity_id = a.id and s.source = 'garmin'
      where not a.hidden and a.sport in ('run','trail_run','treadmill') and a.start_utc > now() - make_interval(days => $1)
        and (s.raw->'summary' ? 'fastestSplit_5000')
      order by a.start_utc`, [days]);
}

/** Corse simili a una data (distanza ±20%, stesso sport), per il confronto nel dettaglio. */
export async function similar(id: string, sport: string, dist: number) {
  return q<{ id: string; day: string; name: string | null; dist: number; time: number; hr: number | null; gain: number | null }>(
    `select a.id, to_char(${LOCAL},'YYYY-MM-DD') as day, a.name, a.distance_m::float8 as dist, coalesce(a.moving_s, a.elapsed_s)::float8 as time, a.avg_hr::float8 as hr, a.elev_gain_m::float8 as gain
       from sport.activities a
      where not a.hidden and a.id <> $1 and a.sport = $2 and a.distance_m between $3 * 0.8 and $3 * 1.2 and coalesce(a.moving_s, a.elapsed_s) > 0
      order by a.start_utc desc limit 8`, [id, sport, dist]);
}

/** Attività di un periodo con i campi per i riepiloghi (luogo e zone da Garmin, se presenti). */
export async function periodActs(from: string) {
  return q<{ id: string; sport: string; day: string; name: string | null; dist: number; time: number; gain: number; hr: number | null; load: number | null; place: string | null }>(
    `select a.id, a.sport, to_char(${LOCAL},'YYYY-MM-DD') as day, a.name, coalesce(a.distance_m,0)::float8 as dist,
            coalesce(a.moving_s, a.elapsed_s, 0)::float8 as time, coalesce(a.elev_gain_m,0)::float8 as gain, a.avg_hr::float8 as hr, a.training_load::float8 as load,
            (select s.raw->'summary'->>'locationName' from sport.activity_sources s where s.activity_id = a.id and s.source = 'garmin') as place
       from sport.activities a where not a.hidden and ${LOCAL} >= $1::date order by a.start_utc`, [from]);
}

/** Sedute Runna completate (l'uscita registrata da Runna, abbinata all'attività). */
export async function runnaDone(from: string) {
  return q<{ id: string; day: string; name: string | null; dist: number; time: number; type: string | null }>(
    `select a.id, to_char(${LOCAL},'YYYY-MM-DD') as day, a.name, coalesce(a.distance_m,0)::float8 as dist, coalesce(a.moving_s, a.elapsed_s, 0)::float8 as time, s.raw->>'type' as type
       from sport.activities a join sport.activity_sources s on s.activity_id = a.id and s.source = 'runna'
      where not a.hidden and ${LOCAL} >= $1::date order by a.start_utc`, [from]);
}

export async function sportsPresent() {
  return (await q<{ sport: string }>("select distinct sport from sport.activities where not hidden")).map((r) => r.sport);
}
