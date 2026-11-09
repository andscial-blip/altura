import "server-only";
import { q } from "@/lib/db";
import { garminConfigured, syncGarmin } from "@/lib/garmin";
import { runnaConfigured, syncRunna } from "@/lib/runna";
import { stravaConfigured, stravaConnection, syncStrava } from "@/lib/strava";

const MIN_GAP_MIN = 10;

/** Esegue le sincronizzazioni configurate. Senza force salta le fonti aggiornate da meno di 10 minuti. */
export async function syncAll(opts: { force?: boolean; budgetMs?: number } = {}) {
  const recent = await q<{ source: string; age_min: number }>(
    `select source, extract(epoch from now() - max(started_at))/60 as age_min from sport.sync_runs
      where status in ('ok','partial','running') and started_at > now() - interval '1 hour' group by source`);
  const age = new Map(recent.map((r) => [r.source, Number(r.age_min)]));
  const due = (s: string) => opts.force || !(age.get(s)! < MIN_GAP_MIN);
  const out: Record<string, unknown> = {};
  await Promise.all([
    (async () => {
      if (!garminConfigured()) out.garmin = { status: "non configurato" };
      else if (!due("garmin")) out.garmin = { status: "recente" };
      else out.garmin = await syncGarmin({ budgetMs: opts.budgetMs ?? 45_000 });
    })(),
    (async () => {
      if (!runnaConfigured()) out.runna = { status: "non configurato" };
      else if (!due("runna")) out.runna = { status: "recente" };
      else out.runna = await syncRunna();
    })(),
    (async () => {
      if (!stravaConfigured() || !(await stravaConnection()).connected) out.strava = { status: "non collegato" };
      else if (!due("strava")) out.strava = { status: "recente" };
      else out.strava = await syncStrava({ budgetMs: opts.budgetMs ?? 45_000 });
    })(),
  ]);
  // le corse interrotte a metà (funzione chiusa dal limite di tempo) non restano "in corso" per sempre
  await q("update sport.sync_runs set status='error', finished_at=now(), message='interrotta' where status='running' and started_at < now() - interval '10 minutes'");
  return out;
}
