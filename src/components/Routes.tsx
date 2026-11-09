import { routeGroups, routeRuns } from "@/lib/queries";
import { day, int, km, paceS } from "@/lib/fmt";
import { Card, Empty, Info } from "@/components/Head";
import { DataTable } from "@/components/DataTable";

/** Percorsi ricorrenti: il calcolo più pesante della pagina, caricato dopo il resto (streaming) così la parte alta compare subito. */
export async function RecurringRoutes() {
  const groups = await routeGroups();
  const routeData = groups.length ? await routeRuns([...new Set(groups.flatMap((g) => g.ids))]) : [];
  // percorsi ricorrenti: un riga per gruppo con migliore, ultima e tendenza
  const byId = new Map(routeData.map((r) => [r.id, r]));
  const routes = groups.map((g, i) => {
    const rs = g.ids.map((id) => byId.get(id)).filter((x): x is NonNullable<typeof x> => !!x).map((x) => ({ ...x, pace: x.time / (x.dist / 1000) }));
    if (rs.length < 2) return null;
    rs.sort((a, b) => a.day.localeCompare(b.day));
    const best = rs.reduce((b, x) => (x.pace < b.pace ? x : b));
    const last = rs[rs.length - 1];
    const prev = rs.slice(0, -1).reduce((s, x) => s + x.pace, 0) / (rs.length - 1);
    const place = rs.map((x) => x.place).filter(Boolean).pop() ?? "Percorso";
    const distAvg = rs.reduce((s, x) => s + x.dist, 0) / rs.length;
    return { key: `r${i}`, name: `${place}, ${km(distAvg)} km ${g.dir}`, n: rs.length, best, last, delta: last.pace - prev };
  }).filter((x): x is NonNullable<typeof x> => !!x).sort((a, b) => b.last.day.localeCompare(a.last.day));

  return (
      <Card title="Percorsi ricorrenti" icon="map" aside={<Info title="Stesso percorso"><p>Due corse sono sullo stesso giro se partono vicine, hanno distanza entro il 10% e tracciati che si sovrappongono (scarto medio sotto 150 m, in qualunque verso).</p><p>«Ultima»: passo dell'ultima uscita rispetto alla media delle precedenti (− = più veloce). Tocca un percorso per il confronto completo.</p></Info>}>
      {routes.length ? (
        <DataTable caption="Percorsi ricorrenti" initial={{ key: "n", dir: "desc" }} pinned={false}
          cols={[{ key: "r", label: "Percorso", lead: true, sort: true }, { key: "n", label: "Volte", r: true, sort: true }, { key: "b", label: "Migliore", r: true, sort: true }, { key: "l", label: "Ultima", r: true, sort: true }]}
          rows={routes.map((r) => ({ key: r.key, cells: {
            r: { t: r.name, v: r.name, href: `/attivita/${r.last.id}`, sub: `ultima ${day(r.last.day, { day: "numeric", month: "short" })}` },
            n: { t: String(r.n), v: r.n },
            b: { t: `${paceS(r.best.pace)} /km`, v: r.best.pace, sub: day(r.best.day, { day: "numeric", month: "short", year: "2-digit" }) },
            l: { t: `${paceS(r.last.pace)} /km`, v: r.last.pace, sub: Math.abs(r.delta) < 2 ? "come la media" : `${r.delta < 0 ? "−" : "+"}${int(Math.abs(r.delta))} s/km vs media`, cls: r.delta < -2 ? "good" : r.delta > 2 ? "warn" : undefined },
          } }))} />
      ) : <Empty inline icon="map" title="Nessun percorso ripetuto" text="Quando corri due volte lo stesso giro (stesso tracciato GPS, distanza entro ±10%) compare qui, con il confronto tra le uscite." />}
    </Card>
  );
}
