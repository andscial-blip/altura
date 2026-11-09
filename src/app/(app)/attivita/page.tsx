import Link from "next/link";
import { Suspense } from "react";
import { activities, sportsPresent, FAMILIES, type ActSort } from "@/lib/queries";
import { thumbs } from "@/lib/track";
import { day } from "@/lib/fmt";
import { Empty, Head } from "@/components/Head";
import { ActCard } from "@/components/Act";
import { Icon } from "@/components/Icon";
import { Filters } from "./Filters";

export const dynamic = "force-dynamic";
const TABS: [string, string, string][] = [["", "Tutte", "activity"], ["corsa", "Corsa", "run"], ["montagna", "Montagna", "hike"], ["nuoto", "Nuoto", "swim"], ["bici", "Bici", "ride"], ["forza", "Forza", "strength"], ["altro", "Altro", "ski"]];
const SORTS: ActSort[] = ["recenti", "vecchie", "distanza", "durata", "dislivello"];
const PAGE = 30;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const sport = TABS.some(([k]) => k === sp.sport) ? sp.sport! : "";
  const page = Math.max(0, Number(sp.p ?? 0) || 0);
  const sort = SORTS.includes(sp.sort as ActSort) ? (sp.sort as ActSort) : "recenti";
  const from = sp.from && ISO.test(sp.from) ? sp.from : undefined, to = sp.to && ISO.test(sp.to) ? sp.to : undefined;
  const qtext = (sp.q ?? "").slice(0, 60);
  const [rows, present] = await Promise.all([activities({ sport: sport || undefined, limit: PAGE, offset: page * PAGE, from, to, q: qtext, sort }), sportsPresent()]);
  const th = await thumbs(rows.map((r) => r.id));
  const has = (k: string) => k === "" || k === sport || present.some((x) => FAMILIES[k]?.includes(x));
  const keep = (o: Record<string, string>) => { const u = new URLSearchParams(); for (const k of ["sport", "q", "from", "to", "sort"]) if (sp[k]) u.set(k, sp[k]!); for (const [k, v] of Object.entries(o)) { if (v) u.set(k, v); else u.delete(k); } return `/attivita?${u}`; };
  const filtered = !!(qtext || from || to);
  // raggruppa per mese solo nell'ordine cronologico; negli altri ordinamenti la lista è unica
  const groups = new Map<string, typeof rows>();
  if (sort === "recenti" || sort === "vecchie") for (const r of rows) { const m = String(r.start_local ?? new Date(r.start_utc).toISOString()).slice(0, 7); groups.set(m, [...(groups.get(m) ?? []), r]); }
  else groups.set("", rows);

  return (
    <div className="stack-l">
      <Head icon="activity" title="Attività" sub="Ogni uscita una volta sola, anche se arriva da più fonti. Nomi da Strava."
        acts={<Link href="/mappa" className="btn sm"><Icon name="map" size={16} />Mappa</Link>} />
      <nav className="tabs" aria-label="Disciplina">
        {TABS.filter(([k]) => has(k)).map(([k, l, ic]) => <Link key={k} href={keep({ sport: k, p: "" })} aria-current={sport === k ? "true" : undefined} scroll={false}><Icon name={ic} size={16} />{l}</Link>)}
      </nav>
      <Suspense fallback={<div className="skel" style={{ height: 66 }} />}><Filters /></Suspense>
      {rows.length ? [...groups.entries()].map(([m, list]) => (
        <section key={m || "all"} className="stack" aria-label={m ? day(m + "-15", { month: "long", year: "numeric" }) : "Risultati"}>
          {m && <h2 className="dayh">{day(m + "-15", { month: "long", year: "numeric" })}</h2>}
          <div className="acards">{list.map((a) => <ActCard key={a.id} a={a} path={th[a.id]} />)}</div>
        </section>
      )) : (
        <div className="card">
          {filtered
            ? <Empty icon="activity" title="Nessuna attività con questi filtri" text={`Nessuna uscita${qtext ? ` con "${qtext}" nel nome` : ""}${from || to ? " nel periodo scelto" : ""}${sport ? " per questa disciplina" : ""}.`} action={{ href: sport ? `/attivita?sport=${sport}` : "/attivita", label: "Azzera filtri" }} />
            : <Empty icon="activity" title="Ancora nessuna attività" text="Le uscite arrivano da Garmin e Strava a ogni sincronizzazione." action={{ href: "/impostazioni", label: "Vai ai collegamenti" }} />}
        </div>
      )}
      <nav className="row" aria-label="Pagine">
        {page > 0 && <Link className="btn" href={keep({ p: String(page - 1) })}><Icon name="back" size={16} />Precedenti</Link>}
        {rows.length === PAGE && <Link className="btn" href={keep({ p: String(page + 1) })}>Successive<Icon name="next" size={16} /></Link>}
        {(page > 0 || rows.length === PAGE) && <span className="note">Pagina {page + 1} · {PAGE} per pagina</span>}
      </nav>
    </div>
  );
}
