-- 002: valori normalizzati per fonte (per ricalcolare i campi dell'attività senza mai toccare il record originale)
alter table sport.activity_sources add column if not exists norm jsonb not null default '{}'::jsonb;

-- stato delle sincronizzazioni per fonte (cursori, finestre già coperte)
create table if not exists sport.sync_state (
  source text primary key references sport.sources(id),
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table sport.sync_state enable row level security;
drop policy if exists sport_app_all on sport.sync_state;
create policy sport_app_all on sport.sync_state to sport_app using (true) with check (true);
grant select, insert, update, delete on sport.sync_state to sport_app;
revoke all on sport.sync_state from anon, authenticated;

-- metriche aggiunte (Garmin)
insert into sport.metric_catalog(metric, label_it, unit, kind, source_priority) values
 ('body_battery_charged','Body Battery ricaricata','punti','stima','{garmin}'),
 ('body_battery_drained','Body Battery consumata','punti','stima','{garmin}')
on conflict (metric) do nothing;

-- Apple Salute: la HRV di Apple è SDNN, quella Garmin è RMSSD notturna: metriche diverse, mai fuse.
insert into sport.metric_catalog(metric, label_it, unit, kind, source_priority) values
 ('hrv_sdnn','Variabilità cardiaca (SDNN, Apple)','ms','misura','{apple_health}'),
 ('walking_hr','Battito medio camminando','bpm','misura','{apple_health}'),
 ('exercise_min','Minuti di esercizio','min','misura','{apple_health}'),
 ('distance_walk_run_m','Distanza a piedi e di corsa','m','misura','{garmin,apple_health}')
on conflict (metric) do nothing;
