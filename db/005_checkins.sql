-- 005: domanda del mattino (come ti senti, 1-5) e contesto del giorno (caldo, viaggio, malattia, alcol), per il semaforo del recupero.
create table if not exists sport.checkins (
  day date primary key,
  feel smallint check (feel between 1 and 5),
  context text[] not null default '{}',          -- caldo | viaggio | malattia | alcol | febbre
  note text,
  updated_at timestamptz not null default now()
);
alter table sport.checkins enable row level security;
drop policy if exists sport_app_all on sport.checkins;
create policy sport_app_all on sport.checkins to sport_app using (true) with check (true);
grant select, insert, update, delete on sport.checkins to sport_app;
revoke all on sport.checkins from anon, authenticated;
