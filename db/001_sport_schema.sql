-- Arête · schema "sport" nel progetto Supabase "cairn".
-- Isolamento da Cairn: nessun oggetto nello schema public, nessuna voce nella cronologia migrazioni di Cairn
-- (eseguito con execute_sql, versionato in questo repo), ruolo dedicato "sport_app" che vede solo lo schema sport.
-- Idempotente: si può rieseguire.

create schema if not exists sport;
revoke all on schema sport from public, anon, authenticated;

-- ---------- Catalogo fonti e metriche ----------
create table if not exists sport.sources (
  id text primary key,                  -- garmin | strava | runna | apple_health | manual
  name text not null,
  kind text not null,                   -- device | platform | plan | health | manual
  official_route text not null          -- come arrivano i dati (documentato)
);

create table if not exists sport.metric_catalog (
  metric text primary key,              -- es. resting_hr, hrv_night, vo2max_run, sleep_s
  label_it text not null,
  unit text not null,
  kind text not null check (kind in ('misura','stima','derivato')),
  source_priority text[] not null       -- gerarchia trasparente delle fonti per questa metrica
);

-- ---------- Attività ----------
create table if not exists sport.activities (
  id uuid primary key default gen_random_uuid(),
  sport text not null,                  -- run | trail_run | treadmill | hike | walk | ride | swim | strength | ski | other
  start_utc timestamptz not null,
  start_local timestamp,
  tz text,
  name text,
  distance_m numeric, moving_s numeric, elapsed_s numeric,
  elev_gain_m numeric, elev_loss_m numeric,
  avg_hr numeric, max_hr numeric, avg_cadence numeric, avg_power numeric,
  training_load numeric, relative_effort numeric,
  location_code text,                   -- IS, MG, ... (come nell'app attuale)
  primary_source text not null references sport.sources(id),
  is_race boolean not null default false,
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists activities_start_idx on sport.activities (start_utc desc);
create index if not exists activities_sport_idx on sport.activities (sport, start_utc desc);

-- Una riga per fonte: l'attività "canonica" collega i record originali (mai sovrascritti) di Garmin, Strava, Apple Health.
create table if not exists sport.activity_sources (
  activity_id uuid not null references sport.activities(id) on delete cascade,
  source text not null references sport.sources(id),
  external_id text not null,
  raw jsonb not null,                   -- record originale com'è arrivato
  acquisition text not null,            -- api | file_fit | ical | shortcut | import
  fetched_at timestamptz not null default now(),
  primary key (source, external_id)
);
create index if not exists activity_sources_act_idx on sport.activity_sources (activity_id);

-- Tracce e serie temporali (ricampionate), per mappe, profili e grafici
create table if not exists sport.activity_streams (
  activity_id uuid primary key references sport.activities(id) on delete cascade,
  source text not null references sport.sources(id),
  n_points int not null,
  streams jsonb not null,               -- {t:[s], dist:[m], lat:[], lon:[], alt:[m], hr:[], v:[m/s], cad:[], pw:[]}
  bbox numeric[] ,                      -- [minLat, minLon, maxLat, maxLon]
  start_lat numeric, start_lon numeric, end_lat numeric, end_lon numeric,
  updated_at timestamptz not null default now()
);

create table if not exists sport.activity_laps (
  activity_id uuid not null references sport.activities(id) on delete cascade,
  idx int not null,
  source text not null references sport.sources(id),
  distance_m numeric, duration_s numeric, avg_hr numeric, max_hr numeric, avg_speed numeric, avg_cadence numeric, avg_power numeric, elev_gain_m numeric,
  primary key (activity_id, idx)
);

-- ---------- Metriche giornaliere (salute e recupero) ----------
create table if not exists sport.daily_metrics (
  day date not null,
  metric text not null references sport.metric_catalog(metric),
  source text not null references sport.sources(id),
  value numeric not null,
  quality text,                         -- es. stato HRV Garmin, numero di campioni
  recorded_at timestamptz not null default now(),
  primary key (day, metric, source)
);
create index if not exists daily_metrics_metric_idx on sport.daily_metrics (metric, day desc);

-- ---------- Piano Runna ----------
create table if not exists sport.planned_workouts (
  key text primary key,                 -- chiave stabile Runna (plan_week_N_TIPO_i) o id evento
  source text not null default 'runna' references sport.sources(id),
  plan_id text,
  week int,
  day date not null,
  title text not null,
  type text not null,                   -- facile | qualita | lungo | gara | forza | test
  km numeric,
  duration_min_s int, duration_max_s int,
  description text,
  structure jsonb,                      -- passi: riscaldamento, ripetute, recuperi, ritmi target
  state text not null,                  -- programmato | completato | rimosso
  completed_activity uuid references sport.activities(id) on delete set null,
  history jsonb not null default '[]',  -- spostamenti di data e modifiche viste
  updated_at timestamptz not null default now()
);
create index if not exists planned_day_idx on sport.planned_workouts (day);

-- ---------- Obiettivi ----------
create table if not exists sport.goals (
  id text primary key,
  name text not null,
  kind text not null,                   -- gara | volume | dislivello | ritmo | frequenza | altro
  sport text,
  target_date date,
  target jsonb not null,                -- es. {"dist_m":21097.5,"time_s":5485,"pace_s":260}
  start_value jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- Analisi calcolate (motore verificato v3/kpis) ----------
create table if not exists sport.analytics_snapshots (
  id bigserial primary key,
  computed_at timestamptz not null default now(),
  engine text not null,                 -- es. "v20.4 (kpis.py + v3.py, 120 test)"
  data jsonb not null
);

-- ---------- Sincronizzazioni, storico modifiche, token ----------
create table if not exists sport.sync_runs (
  id bigserial primary key,
  source text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null,                 -- ok | partial | error
  counts jsonb not null default '{}',
  message text
);

create table if not exists sport.change_log (
  id bigserial primary key,
  table_name text not null,
  row_key text not null,
  changed_at timestamptz not null default now(),
  old_row jsonb,
  new_row jsonb
);

create table if not exists sport.ingest_tokens (
  id uuid primary key default gen_random_uuid(),
  label text not null,                  -- es. "Comandi Rapidi iPhone", "Sincronizzazione cloud"
  scope text[] not null,                -- fonti che il token può scrivere
  token_sha256 text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create table if not exists sport.passkeys (
  id text primary key,                  -- credential id (base64url)
  public_key text not null,             -- base64url
  counter bigint not null default 0,
  transports text[],
  device_label text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create table if not exists sport.private_zones (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  lat numeric not null, lon numeric not null,
  radius_m int not null default 400
);

create table if not exists sport.settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- ---------- Storico delle modifiche: attività e piano ----------
create or replace function sport.log_change() returns trigger language plpgsql set search_path = sport as $$
begin
  if tg_op = 'UPDATE' and to_jsonb(old) is distinct from to_jsonb(new) then
    insert into sport.change_log(table_name, row_key, old_row, new_row)
    values (tg_table_name, coalesce(to_jsonb(new)->>'id', to_jsonb(new)->>'key'), to_jsonb(old), to_jsonb(new));
  end if;
  return new;
end $$;
drop trigger if exists activities_log on sport.activities;
create trigger activities_log after update on sport.activities for each row execute function sport.log_change();
drop trigger if exists planned_log on sport.planned_workouts;
create trigger planned_log after update on sport.planned_workouts for each row execute function sport.log_change();

-- ---------- Ruolo applicativo ----------
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'sport_app') then
    create role sport_app login noinherit;
  end if;
end $$;
grant usage on schema sport to sport_app;
grant select, insert, update, delete on all tables in schema sport to sport_app;
grant usage, select on all sequences in schema sport to sport_app;
grant execute on all functions in schema sport to sport_app;
alter default privileges in schema sport grant select, insert, update, delete on tables to sport_app;
alter default privileges in schema sport grant usage, select on sequences to sport_app;
revoke all on all tables in schema sport from anon, authenticated;
alter role sport_app set search_path = sport;

-- RLS attiva ovunque: solo sport_app (il server dell'app) legge e scrive; anon e authenticated non vedono nulla.
do $$ declare t text; begin
  for t in select tablename from pg_tables where schemaname = 'sport' loop
    execute format('alter table sport.%I enable row level security', t);
    execute format('drop policy if exists sport_app_all on sport.%I', t);
    execute format('create policy sport_app_all on sport.%I to sport_app using (true) with check (true)', t);
  end loop;
end $$;

-- ---------- Dati di base ----------
insert into sport.sources(id, name, kind, official_route) values
 ('garmin','Garmin Connect','device','Accesso personale lato server dell''account Garmin (Forerunner 965): attività, file FIT, metriche giornaliere'),
 ('strava','Strava','platform','Connettore ufficiale Strava per Claude (OAuth gestito da Strava); niente uso dei dati Strava per l''AI'),
 ('runna','Runna','plan','Feed iCal ufficiale del calendario Runna (sola lettura); Runna non ha API pubbliche'),
 ('apple_health','Apple Salute','health','Automazione di Comandi Rapidi sull''iPhone che invia i campioni Salute autorizzati'),
 ('manual','Inserimento manuale','manual','Dati inseriti o corretti a mano nell''app')
on conflict (id) do update set name = excluded.name, kind = excluded.kind, official_route = excluded.official_route;

insert into sport.metric_catalog(metric, label_it, unit, kind, source_priority) values
 ('resting_hr','Battito a riposo','bpm','misura','{garmin,apple_health}'),
 ('hrv_night','Variabilità cardiaca notturna (media)','ms','misura','{garmin,apple_health}'),
 ('hrv_week','Variabilità cardiaca, media 7 giorni','ms','derivato','{garmin}'),
 ('hrv_baseline_low','Variabilità cardiaca, soglia bassa personale','ms','derivato','{garmin}'),
 ('hrv_baseline_high','Variabilità cardiaca, soglia alta personale','ms','derivato','{garmin}'),
 ('sleep_s','Sonno','s','misura','{garmin,apple_health}'),
 ('sleep_score','Punteggio del sonno','punti','stima','{garmin}'),
 ('steps','Passi','passi','misura','{garmin,apple_health}'),
 ('body_battery_high','Body Battery massima','punti','stima','{garmin}'),
 ('body_battery_low','Body Battery minima','punti','stima','{garmin}'),
 ('stress_avg','Stress medio','punti','stima','{garmin}'),
 ('vo2max_run','VO2max corsa','ml/kg/min','stima','{garmin,apple_health}'),
 ('active_kcal','Energia attiva','kcal','stima','{apple_health,garmin}'),
 ('resting_kcal','Energia a riposo','kcal','stima','{apple_health,garmin}'),
 ('respiration','Frequenza respiratoria','resp/min','misura','{apple_health,garmin}'),
 ('spo2','Saturazione di ossigeno','%','misura','{apple_health,garmin}'),
 ('weight_kg','Peso','kg','misura','{apple_health,manual}'),
 ('body_fat_pct','Massa grassa','%','stima','{apple_health,manual}')
on conflict (metric) do update set label_it = excluded.label_it, unit = excluded.unit, kind = excluded.kind, source_priority = excluded.source_priority;
