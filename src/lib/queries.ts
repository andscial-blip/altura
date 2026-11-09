import "server-only";
import { q, one } from "@/lib/db";
import { cached } from "@/lib/cache";

export type DailyPoint = { day: string; value: number; source: string; quality: string | null };

/** Per ogni metrica: ultimo valore disponibile, dalla fonte più affidabile secondo il catalogo. */
async function latestDaily_(metrics: string[]) {
  return q<{ metric: string; label_it: string; unit: string; kind: string; day: string; value: string; source: string; quality: string | null }>(
    `select distinct on (d.metric) d.metric, c.label_it, c.unit, c.kind, to_char(d.day,'YYYY-MM-DD') as day, d.value::text, d.source, d.quality
       from sport.daily_metrics d join sport.metric_catalog c using (metric)
      where d.metric = any($1) and d.day >= current_date - 10
      order by d.metric, d.day desc, coalesce(array_position(c.source_priority, d.source), 99)`, [metrics]);
}

/** Serie giornaliera di una metrica: un valore al giorno, dalla fonte prioritaria di quel giorno. */
async function dailySeries_(metric: string, days: number): Promise<DailyPoint[]> {
  const rows = await q<{ day: string; value: string; source: string; quality: string | null }>(
    `select distinct on (d.day) to_char(d.day,'YYYY-MM-DD') as day, d.value::text, d.source, d.quality
       from sport.daily_metrics d join sport.metric_catalog c using (metric)
      where d.metric = $1 and d.day >= current_date - $2::int
      order by d.day, coalesce(array_position(c.source_priority, d.source), 99)`, [metric, days]);
  return rows.map((r) => ({ ...r, value: Number(r.value) }));
}

async function catalog_() {
  return q<{ metric: string; label_it: string; unit: string; kind: string; source_priority: string[] }>("select * from sport.metric_catalog order by metric");
}

export type ActivityRow = {
  id: string; sport: string; start_utc: string; start_local: string | null; name: string | null;
  distance_m: string | null; moving_s: string | null; elapsed_s: string | null; elev_gain_m: string | null;
  avg_hr: string | null; max_hr: string | null; training_load: string | null; primary_source: string; sources: string[]; has_track: boolean;
};

export type ActSort = "recenti" | "vecchie" | "distanza" | "durata" | "dislivello";
const ORDER: Record<ActSort, string> = {
  recenti: "a.start_utc desc", vecchie: "a.start_utc asc", distanza: "a.distance_m desc nulls last, a.start_utc desc",
  durata: "coalesce(a.moving_s, a.elapsed_s) desc nulls last, a.start_utc desc", dislivello: "a.elev_gain_m desc nulls last, a.start_utc desc",
};
export const FAMILIES: Record<string, string[]> = { corsa: ["run", "trail_run", "treadmill"], montagna: ["hike", "walk"], nuoto: ["swim"], bici: ["ride"], forza: ["strength"], altro: ["ski", "yoga", "other"] };

/** Elenco attività con filtri combinabili: disciplina, testo nel nome, intervallo di date (giorno locale), ordinamento. */
async function activities_(opts: { sport?: string; limit?: number; offset?: number; from?: string; to?: string; q?: string; sort?: ActSort } = {}) {
  const sports = opts.sport ? FAMILIES[opts.sport] ?? [opts.sport] : null;
  const like = opts.q?.trim() ? `%${opts.q.trim().replace(/[\\%_]/g, (c) => "\\" + c)}%` : null;
  return q<ActivityRow>(
    `select a.id, a.sport, a.start_utc, to_char(a.start_local,'YYYY-MM-DD HH24:MI') as start_local, a.name, a.distance_m::text, a.moving_s::text, a.elapsed_s::text,
            a.elev_gain_m::text, a.avg_hr::text, a.max_hr::text, a.training_load::text, a.primary_source,
            array(select s.source from sport.activity_sources s where s.activity_id = a.id order by s.source) as sources,
            exists(select 1 from sport.activity_streams t where t.activity_id = a.id and t.start_lat is not null) as has_track
       from sport.activities a
      where not a.hidden and ($1::text[] is null or a.sport = any($1))
        and ($4::date is null or coalesce(a.start_local, a.start_utc at time zone 'Indian/Antananarivo')::date >= $4)
        and ($5::date is null or coalesce(a.start_local, a.start_utc at time zone 'Indian/Antananarivo')::date <= $5)
        and ($6::text is null or a.name ilike $6)
      order by ${ORDER[opts.sort ?? "recenti"] ?? ORDER.recenti} limit $2 offset $3`,
    [sports, opts.limit ?? 50, opts.offset ?? 0, opts.from ?? null, opts.to ?? null, like]);
}

async function activity_(id: string) {
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

async function privateZones_() {
  return q<{ id: string; label: string; lat: number; lon: number; radius_m: number }>("select id, label, lat::float8 as lat, lon::float8 as lon, radius_m from sport.private_zones");
}

async function lastSyncs_() {
  return q<{ source: string; status: string; started_at: string; finished_at: string | null; counts: Record<string, number>; message: string | null }>(
    `select distinct on (source) source, status, started_at, finished_at, counts, message from sport.sync_runs order by source, started_at desc`);
}

async function weekly_(weeks: number) {
  return q<{ week: string; fam: string; n: number; dist_m: number; time_s: number; gain_m: number; load: number }>(
    `select to_char(date_trunc('week', coalesce(start_local, start_utc at time zone 'Indian/Antananarivo')),'YYYY-MM-DD') as week,
            case when sport in ('run','trail_run','treadmill') then 'corsa' when sport in ('hike','walk') then 'montagna' when sport = 'ride' then 'bici' when sport = 'strength' then 'forza' else 'altro' end as fam,
            count(*)::int as n, coalesce(sum(distance_m),0)::float8 as dist_m, coalesce(sum(coalesce(moving_s, elapsed_s)),0)::float8 as time_s,
            coalesce(sum(elev_gain_m),0)::float8 as gain_m, coalesce(sum(training_load),0)::float8 as load
       from sport.activities where not hidden and start_utc >= date_trunc('week', now()) - make_interval(weeks => $1)
      group by 1, 2 order by 1`, [weeks]);
}

async function planned_(from: string, to: string) {
  return q<{ key: string; day: string; title: string; type: string; km: string | null; duration_min_s: number | null; duration_max_s: number | null; state: string; week: number | null;
    completed_activity: string | null; history: { date: string; until: string }[]; act_dist: string | null; act_time: string | null; act_hr: string | null; act_name: string | null; runna_raw: Record<string, unknown> | null; structure: { header?: string; steps?: unknown[] } }>(
    `select p.key, to_char(p.day,'YYYY-MM-DD') as day, p.title, p.type, p.km::text, p.duration_min_s, p.duration_max_s, p.state, p.week, p.completed_activity, p.history, p.structure,
            a.distance_m::text as act_dist, coalesce(a.moving_s, a.elapsed_s)::text as act_time, a.avg_hr::text as act_hr, a.name as act_name,
            (select s.raw from sport.activity_sources s where s.activity_id = a.id and s.source = 'runna' limit 1) as runna_raw
       from sport.planned_workouts p left join sport.activities a on a.id = p.completed_activity
      where p.day between $1 and $2 order by p.day, p.key`, [from, to]);
}

/** Carico giornaliero (somma del carico Garmin delle attività), ultimi n giorni, giorni vuoti = 0. */
async function dailyLoad_(days: number) {
  return q<{ day: string; load: number; n_without: number }>(
    `with d as (select generate_series(current_date - $1::int, current_date, '1 day')::date as day)
     select to_char(d.day,'YYYY-MM-DD') as day, coalesce(sum(a.training_load),0)::float8 as load,
            count(a.id) filter (where a.training_load is null)::int as n_without
       from d left join sport.activities a on not a.hidden and (coalesce(a.start_local, a.start_utc at time zone 'Indian/Antananarivo'))::date = d.day
      group by d.day order by d.day`, [days]);
}

/** Corse con FC media: per l'indice di efficienza (metri al minuto per battito). */
async function runEfficiency_(days: number) {
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
async function dailyMulti_(metrics: string[], days: number) {
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
async function goals_(activeOnly = false) {
  return q<Goal>(`select id, name, kind, to_char(target_date,'YYYY-MM-DD') as target_date, target, active from sport.goals ${activeOnly ? "where active" : ""} order by active desc, target_date nulls last`);
}

/** Migliori tempi su 5 e 10 km (parziale più veloce calcolato da Garmin dentro ogni corsa). */
async function runBests_(days: number) {
  return q<{ id: string; day: string; name: string | null; s5: number | null; s10: number | null }>(
    `select a.id, to_char(${LOCAL},'YYYY-MM-DD') as day, a.name,
            (s.raw->'summary'->>'fastestSplit_5000')::float8 as s5, (s.raw->'summary'->>'fastestSplit_10000')::float8 as s10
       from sport.activities a join sport.activity_sources s on s.activity_id = a.id and s.source = 'garmin'
      where not a.hidden and a.sport in ('run','trail_run','treadmill') and a.start_utc > now() - make_interval(days => $1)
        and (s.raw->'summary' ? 'fastestSplit_5000')
      order by a.start_utc`, [days]);
}

/** Corse simili a una data (distanza ±20%, stesso sport), per il confronto nel dettaglio. */
async function similar_(id: string, sport: string, dist: number) {
  return q<{ id: string; day: string; name: string | null; dist: number; time: number; hr: number | null; gain: number | null }>(
    `select a.id, to_char(${LOCAL},'YYYY-MM-DD') as day, a.name, a.distance_m::float8 as dist, coalesce(a.moving_s, a.elapsed_s)::float8 as time, a.avg_hr::float8 as hr, a.elev_gain_m::float8 as gain
       from sport.activities a
      where not a.hidden and a.id <> $1 and a.sport = $2 and a.distance_m between $3 * 0.8 and $3 * 1.2 and coalesce(a.moving_s, a.elapsed_s) > 0
      order by a.start_utc desc limit 8`, [id, sport, dist]);
}

/** Attività di un periodo con i campi per i riepiloghi (luogo e zone da Garmin, se presenti). */
async function periodActs_(from: string) {
  return q<{ id: string; sport: string; day: string; name: string | null; dist: number; time: number; gain: number; hr: number | null; load: number | null; place: string | null }>(
    `select a.id, a.sport, to_char(${LOCAL},'YYYY-MM-DD') as day, a.name, coalesce(a.distance_m,0)::float8 as dist,
            coalesce(a.moving_s, a.elapsed_s, 0)::float8 as time, coalesce(a.elev_gain_m,0)::float8 as gain, a.avg_hr::float8 as hr, a.training_load::float8 as load,
            (select s.raw->'summary'->>'locationName' from sport.activity_sources s where s.activity_id = a.id and s.source = 'garmin') as place
       from sport.activities a where not a.hidden and ${LOCAL} >= $1::date order by a.start_utc`, [from]);
}

/** Sedute Runna completate (l'uscita registrata da Runna, abbinata all'attività). */
async function runnaDone_(from: string) {
  return q<{ id: string; day: string; name: string | null; dist: number; time: number; type: string | null }>(
    `select a.id, to_char(${LOCAL},'YYYY-MM-DD') as day, a.name, coalesce(a.distance_m,0)::float8 as dist, coalesce(a.moving_s, a.elapsed_s, 0)::float8 as time, s.raw->>'type' as type
       from sport.activities a join sport.activity_sources s on s.activity_id = a.id and s.source = 'runna'
      where not a.hidden and ${LOCAL} >= $1::date order by a.start_utc`, [from]);
}

/** Parziali più veloci di Garmin per ogni corsa (tutto lo storico): base di record e stime. */
async function splitRows_() {
  return q<{ id: string; day: string; name: string | null; s1: number | null; s1609: number | null; s5: number | null; s10: number | null; s21: number | null; race: boolean }>(
    `select a.id, to_char(${LOCAL},'YYYY-MM-DD') as day, a.name,
            (coalesce(s.raw->'summary'->'eventType'->>'typeKey', '') = 'race'
              or exists (select 1 from sport.activity_sources r where r.activity_id = a.id and r.source = 'runna' and r.raw->>'type' = 'gara')) as race,
            (s.raw->'summary'->>'fastestSplit_1000')::float8 as s1, (s.raw->'summary'->>'fastestSplit_1609')::float8 as s1609,
            (s.raw->'summary'->>'fastestSplit_5000')::float8 as s5, (s.raw->'summary'->>'fastestSplit_10000')::float8 as s10,
            (s.raw->'summary'->>'fastestSplit_21098')::float8 as s21
       from sport.activities a join sport.activity_sources s on s.activity_id = a.id and s.source = 'garmin'
      where not a.hidden and a.sport in ('run','trail_run','treadmill') and (s.raw->'summary' ? 'fastestSplit_1000')
      order by a.start_utc`);
}

/** Risultati inseriti a mano (tempi ufficiali). */
async function results_() {
  // la tabella arriva con db/004: se non è ancora stata creata, nessun risultato (il resto di Progressi funziona lo stesso)
  return q<{ id: string; day: string; name: string; kind: string; dist_m: number; time_s: number; activity_id: string | null; note: string | null }>(
    `select id, to_char(day,'YYYY-MM-DD') as day, name, kind, dist_m::float8 as dist_m, time_s::float8 as time_s, activity_id::text as activity_id, note
       from sport.results order by day desc`).catch((e: unknown) => {
    if (String((e as { code?: string })?.code) === "42P01") return [];
    throw e;
  });
}

/**
 * Percorsi ricorrenti: tracciati di tutte le corse con GPS (150 punti ciascuno), raggruppati per forma e distanza.
 * Il confronto avviene sul server con i tracciati completi; al browser arrivano solo gli identificativi dei gruppi.
 */
async function routeGroups_() {
  const rows = await q<{ id: string; dist: number; lat: (number | null)[]; lon: (number | null)[] }>(
    `select a.id, a.distance_m::float8 as dist,
            array(select v::float8 from jsonb_array_elements_text(t.streams->'lat') with ordinality e(v, i) where (i - 1) % greatest(1, t.n_points / 150) = 0 order by i) as lat,
            array(select v::float8 from jsonb_array_elements_text(t.streams->'lon') with ordinality e(v, i) where (i - 1) % greatest(1, t.n_points / 150) = 0 order by i) as lon
       from sport.activities a join sport.activity_streams t on t.activity_id = a.id
      where not a.hidden and a.sport in ('run','trail_run') and t.start_lat is not null and a.distance_m > 1000
      order by a.start_utc desc`);
  const { prepare, groups } = await import("@/lib/routes");
  const prep = prepare(rows.map((r) => ({ id: r.id, dist: r.dist, track: { lat: r.lat.map((v) => v ?? NaN), lon: r.lon.map((v) => v ?? NaN) } })));
  return groups(prep, 2);
}

/** Corse sullo stesso percorso di una data: candidati con partenza entro ~2 km e distanza ±10%, poi confronto della forma del tracciato. */
async function sameRouteIds_(id: string) {
  const rows = await q<{ id: string; dist: number; lat: (number | null)[]; lon: (number | null)[] }>(
    `with me as (select a.distance_m, t.start_lat, t.start_lon from sport.activities a join sport.activity_streams t on t.activity_id = a.id where a.id = $1 and t.start_lat is not null)
     select a.id, a.distance_m::float8 as dist,
            array(select v::float8 from jsonb_array_elements_text(t.streams->'lat') with ordinality e(v, i) where (i - 1) % greatest(1, t.n_points / 150) = 0 order by i) as lat,
            array(select v::float8 from jsonb_array_elements_text(t.streams->'lon') with ordinality e(v, i) where (i - 1) % greatest(1, t.n_points / 150) = 0 order by i) as lon
       from sport.activities a join sport.activity_streams t on t.activity_id = a.id, me
      where not a.hidden and a.sport in ('run','trail_run') and t.start_lat is not null
        and abs(t.start_lat - me.start_lat) < 0.02 and abs(t.start_lon - me.start_lon) < 0.02
        and a.distance_m between me.distance_m * 0.9 and me.distance_m * 1.1`, [id]);
  if (rows.length < 2) return [];
  const { prepare, matches } = await import("@/lib/routes");
  const prep = prepare(rows.map((r) => ({ id: r.id, dist: r.dist, track: { lat: r.lat.map((v) => v ?? NaN), lon: r.lon.map((v) => v ?? NaN) } })));
  const m = matches(id, prep);
  return m.length >= 2 ? m : [];
}

/** Dati di confronto per un insieme di corse (stesso percorso). */
async function routeRuns_(ids: string[]) {
  if (!ids.length) return [];
  return q<{ id: string; day: string; name: string | null; dist: number; time: number; hr: number | null; gain: number | null; place: string | null; temp: number | null }>(
    `select a.id, to_char(${LOCAL},'YYYY-MM-DD') as day, a.name, a.distance_m::float8 as dist, coalesce(a.moving_s, a.elapsed_s)::float8 as time,
            a.avg_hr::float8 as hr, a.elev_gain_m::float8 as gain,
            (select x.raw->'summary'->>'locationName' from sport.activity_sources x where x.activity_id = a.id and x.source = 'garmin') as place,
            (select (x.raw->'summary'->>'averageTemperature')::float8 from sport.activity_sources x where x.activity_id = a.id and x.source = 'garmin') as temp
       from sport.activities a where a.id = any($1::uuid[]) and coalesce(a.moving_s, a.elapsed_s) > 0 order by a.start_utc`, [ids]);
}

/** Domanda del mattino e contesto (tabella db/005; se non c'è ancora, nessun dato). */
async function checkins_(from: string) {
  return q<{ day: string; feel: number | null; context: string[] }>(
    "select to_char(day,'YYYY-MM-DD') as day, feel, context from sport.checkins where day >= $1::date order by day", [from])
    .catch((e: unknown) => { if (String((e as { code?: string })?.code) === "42P01") return []; throw e; });
}

/** La tabella della domanda del mattino esiste? (creata con db/005) */
async function checkinsReady_() {
  return (await q<{ ok: boolean }>("select to_regclass('sport.checkins') is not null as ok"))[0]?.ok ?? false;
}

/** Tempo nelle 5 zone di battito (Garmin) per ogni corsa da una data. */
async function zoneRows_(from: string) {
  const rows = await q<{ day: string; z1: number | null; z2: number | null; z3: number | null; z4: number | null; z5: number | null }>(
    `select to_char(${LOCAL},'YYYY-MM-DD') as day,
            (s.raw->'summary'->>'hrTimeInZone_1')::float8 as z1, (s.raw->'summary'->>'hrTimeInZone_2')::float8 as z2, (s.raw->'summary'->>'hrTimeInZone_3')::float8 as z3,
            (s.raw->'summary'->>'hrTimeInZone_4')::float8 as z4, (s.raw->'summary'->>'hrTimeInZone_5')::float8 as z5
       from sport.activities a join sport.activity_sources s on s.activity_id = a.id and s.source = 'garmin'
      where not a.hidden and a.sport in ('run','trail_run','treadmill') and ${LOCAL} >= $1::date and (s.raw->'summary' ? 'hrTimeInZone_1')
      order by a.start_utc`, [from]);
  return rows.map((r) => ({ day: r.day, z: [r.z1, r.z2, r.z3, r.z4, r.z5].map((v) => Number(v) || 0) }));
}

/**
 * Montagna da tutto lo storico: curva personale velocità-pendenza e salite lunghe (VAM) di ogni uscita.
 * I tracciati restano sul server; si restituiscono solo la curva e i numeri per uscita.
 */
async function mountainCurve_() {
  const rows = await q<{ id: string; dist: (number | null)[]; alt: (number | null)[]; t: (number | null)[] }>(
    `select a.id, array(select v::float8 from jsonb_array_elements_text(st.streams->'dist') with ordinality e(v, i) where (i - 1) % greatest(1, st.n_points / 1500) = 0 order by i) as dist,
            array(select v::float8 from jsonb_array_elements_text(st.streams->'alt') with ordinality e(v, i) where (i - 1) % greatest(1, st.n_points / 1500) = 0 order by i) as alt,
            array(select v::float8 from jsonb_array_elements_text(st.streams->'t') with ordinality e(v, i) where (i - 1) % greatest(1, st.n_points / 1500) = 0 order by i) as t
       from sport.activities a join sport.activity_streams st on st.activity_id = a.id
      where not a.hidden and a.sport in ('hike','walk','trail_run') and st.streams ? 'alt' and st.streams ? 'dist' and st.streams ? 't'`);
  const { byDistance, speedCurve, climbs } = await import("@/lib/mountain");
  const tracks = rows.map((r) => ({ id: r.id, pts: byDistance(r.dist, r.alt, r.t) }));
  const vam: Record<string, { best: number | null; gain: number; n: number }> = {};
  for (const t of tracks) {
    const c = climbs(t.pts);
    vam[t.id] = { best: c.length ? Math.max(...c.map((x) => x.vam)) : null, gain: c.reduce((s, x) => s + x.gain, 0), n: c.length };
  }
  return { n: rows.length, curve: speedCurve(tracks.map((t) => t.pts)), vam };
}

/** Uscite in montagna (escursione, camminata, trail) con dislivello, per l'elenco e la VAM. */
async function mountainActs_() {
  return q<{ id: string; day: string; name: string | null; sport: string; dist: number; time: number; gain: number; hr: number | null; place: string | null }>(
    `select a.id, to_char(${LOCAL},'YYYY-MM-DD') as day, a.name, a.sport, coalesce(a.distance_m,0)::float8 as dist, coalesce(a.moving_s, a.elapsed_s, 0)::float8 as time,
            coalesce(a.elev_gain_m,0)::float8 as gain, a.avg_hr::float8 as hr,
            (select x.raw->'summary'->>'locationName' from sport.activity_sources x where x.activity_id = a.id and x.source = 'garmin') as place
       from sport.activities a where not a.hidden and a.sport in ('hike','walk','trail_run') order by a.start_utc desc`);
}

async function sportsPresent_() {
  return (await q<{ sport: string }>("select distinct sport from sport.activities where not hidden")).map((r) => r.sport);
}

// letture con cache (invalidata a ogni scrittura: vedi lib/cache.ts)
export const latestDaily = cached("latestDaily", latestDaily_);
export const dailySeries = cached("dailySeries", dailySeries_);
export const catalog = cached("catalog", catalog_);
export const activities = cached("activities", activities_);
export const activity = cached("activity", activity_);
export const privateZones = cached("privateZones", privateZones_);
export const lastSyncs = cached("lastSyncs", lastSyncs_, 60);
export const weekly = cached("weekly", weekly_);
export const planned = cached("planned", planned_);
export const dailyLoad = cached("dailyLoad", dailyLoad_);
export const runEfficiency = cached("runEfficiency", runEfficiency_);
export const dailyMulti = cached("dailyMulti", dailyMulti_);
export const goals = cached("goals", goals_);
export const runBests = cached("runBests", runBests_);
export const similar = cached("similar", similar_);
export const periodActs = cached("periodActs", periodActs_);
export const runnaDone = cached("runnaDone", runnaDone_);
export const sportsPresent = cached("sportsPresent", sportsPresent_);
export const splitRows = cached("splitRows", splitRows_);
export const results = cached("results", results_);
export const routeGroups = cached("routeGroups", routeGroups_, 3600);
export const routeRuns = cached("routeRuns", routeRuns_);
export const sameRouteIds = cached("sameRouteIds", sameRouteIds_);
export const checkins = cached("checkins", checkins_, 60);
export const checkinsReady = cached("checkinsReady", checkinsReady_, 300);
export const zoneRows = cached("zoneRows", zoneRows_);
export const mountainCurve = cached("mountainCurve", mountainCurve_, 3600);
export const mountainActs = cached("mountainActs", mountainActs_);
