import Link from "next/link";
import { activities } from "@/lib/queries";
import { day, dur, int, km, pace, sportLabel } from "@/lib/fmt";
import { Src } from "@/components/Src";

export const dynamic = "force-dynamic";
const FILTERS = [["", "Tutte"], ["corsa", "Corsa"], ["montagna", "Montagna e cammino"], ["bici", "Bici"], ["forza", "Forza"], ["altro", "Altro"]] as const;

export default async function Page({ searchParams }: { searchParams: Promise<{ sport?: string; p?: string }> }) {
  const sp = await searchParams;
  const page = Math.max(0, Number(sp.p ?? 0) || 0);
  const rows = await activities({ sport: sp.sport || undefined, limit: 40, offset: page * 40 });
  return (
    <div className="stack">
      <div className="head"><div><h1>Attività</h1><p>Ogni attività una volta sola, anche se arriva da più fonti.</p></div></div>
      <nav className="chips" aria-label="Filtra per disciplina">
        {FILTERS.map(([k, l]) => <Link key={k} className="chip" aria-current={(sp.sport ?? "") === k ? "true" : undefined} href={k ? `/attivita?sport=${k}` : "/attivita"}>{l}</Link>)}
      </nav>
      <div className="panel scroll-x" style={{ padding: 0 }}>
        {rows.length ? (
          <table className="t">
            <thead><tr><th>Data</th><th>Attività</th><th className="r">Distanza</th><th className="r">Tempo</th><th className="r">Passo</th><th className="r">D+</th><th className="r">FC media</th><th>Fonti</th></tr></thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id}>
                  <td style={{ whiteSpace: "nowrap" }}>{day(a.start_utc)}</td>
                  <td><Link href={`/attivita/${a.id}`} style={{ fontWeight: 500 }}>{a.name ?? sportLabel(a.sport)}</Link><div className="note">{sportLabel(a.sport)}</div></td>
                  <td className="r">{a.distance_m ? `${km(a.distance_m)} km` : "–"}</td>
                  <td className="r">{dur(a.moving_s ?? a.elapsed_s)}</td>
                  <td className="r">{a.distance_m && ["run", "trail_run", "treadmill", "hike", "walk"].includes(a.sport) ? pace(a.distance_m, a.moving_s ?? a.elapsed_s) : "–"}</td>
                  <td className="r">{a.elev_gain_m ? `${int(a.elev_gain_m)} m` : "–"}</td>
                  <td className="r">{a.avg_hr ? int(a.avg_hr) : "–"}</td>
                  <td><div className="row" style={{ gap: 8 }}>{a.sources.map((s) => <Src key={s} s={s} />)}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="empty" style={{ padding: 18 }}>Nessuna attività con questo filtro.</p>}
      </div>
      <div className="row">
        {page > 0 && <Link className="btn" href={`/attivita?${new URLSearchParams({ ...(sp.sport ? { sport: sp.sport } : {}), p: String(page - 1) })}`}>Più recenti</Link>}
        {rows.length === 40 && <Link className="btn" href={`/attivita?${new URLSearchParams({ ...(sp.sport ? { sport: sp.sport } : {}), p: String(page + 1) })}`}>Meno recenti</Link>}
      </div>
    </div>
  );
}
