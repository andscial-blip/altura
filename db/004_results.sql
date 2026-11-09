-- 004: risultati inseriti a mano (tempi ufficiali di gare e test). Entrano nei record e nelle stime al posto del parziale dell'orologio.
create table if not exists sport.results (
  id text primary key,
  day date not null,
  name text not null,
  kind text not null default 'gara',          -- gara | test
  dist_m numeric not null check (dist_m > 0),
  time_s numeric not null check (time_s > 0),
  activity_id uuid references sport.activities(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists results_day on sport.results(day);
alter table sport.results enable row level security;
drop policy if exists sport_app_all on sport.results;
create policy sport_app_all on sport.results to sport_app using (true) with check (true);
grant select, insert, update, delete on sport.results to sport_app;
revoke all on sport.results from anon, authenticated;
