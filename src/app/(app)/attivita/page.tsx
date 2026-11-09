import Link from "next/link";
import { activities, sportsPresent } from "@/lib/queries";
import { thumbs } from "@/lib/track";
import { day } from "@/lib/fmt";
import { Head } from "@/components/Head";
import { ActCard } from "@/components/Act";
import { Icon } from "@/components/Icon";

export const dynamic = "force-dynamic";
const FILTERS: [string, string, string][] = [["", "Tutte", "activity"], ["corsa", "Corsa", "run"], ["montagna", "Montagna", "hike"], ["altro", "Nuoto e altro", "swim"], ["bici", "Bici", "ride"], ["forza", "Forza", "strength"]];
const PAGE = 30;

export default async function Page({ searchParams }: { searchParams: Promise<{ sport?: string; p?: string }> }) {
  const sp = await searchParams;
  const sport = FILTERS.some(([k]) => k === sp.sport) ? sp.sport! : "";
  const page = Math.max(0, Number(sp.p ?? 0) || 0);
  const rows = await activities({ sport: sport || undefined, limit: PAGE, offset: page * PAGE });
  const th = await thumbs(rows.map((r) => r.id));
  // mostra bici e forza solo se ce ne sono (evita schede vuote)
  const present = await sportsPresent();
  const has = (k: string) => k === "" || k === sport || present.some((x) => ({ corsa: ["run", "trail_run", "treadmill"], montagna: ["hike", "walk"], bici: ["ride"], forza: ["strength"], altro: ["swim", "ski", "yoga", "other"] } as Record<string, string[]>)[k]?.includes(x));
  const months = new Map<string, typeof rows>();
  for (const r of rows) { const m = String(r.start_local ?? new Date(r.start_utc).toISOString()).slice(0, 7); months.set(m, [...(months.get(m) ?? []), r]); }
  const qs = (o: Record<string, string>) => `/attivita?${new URLSearchParams({ ...(sport ? { sport } : {}), ...o })}`;

  return (
    <div className="stack-l">
      <Head title="Attività" sub="Ogni uscita una volta sola, anche se arriva da più fonti. Nomi da Strava."
        acts={<Link href="/mappa" className="btn sm"><Icon name="map" size={16} />Mappa</Link>} />
      <nav className="tabs" aria-label="Filtra per disciplina">
        {FILTERS.filter(([k]) => has(k)).map(([k, l, ic]) => <Link key={k} href={k ? `/attivita?sport=${k}` : "/attivita"} aria-current={sport === k ? "true" : undefined}><Icon name={ic} size={16} />{l}</Link>)}
      </nav>
      {rows.length ? [...months.entries()].map(([m, list]) => (
        <section key={m} className="stack">
          <h2 className="dayh">{day(m + "-15", { month: "long", year: "numeric" })}</h2>
          <div className="acards">{list.map((a) => <ActCard key={a.id} a={a} path={th[a.id]} />)}</div>
        </section>
      )) : <div className="card"><p className="empty">Nessuna attività con questo filtro.</p></div>}
      <div className="row">
        {page > 0 && <Link className="btn" href={qs({ p: String(page - 1) })}><Icon name="back" size={16} />Più recenti</Link>}
        {rows.length === PAGE && <Link className="btn" href={qs({ p: String(page + 1) })}>Meno recenti<Icon name="next" size={16} /></Link>}
      </div>
    </div>
  );
}
