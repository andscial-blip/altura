import Link from "next/link";
import { q } from "@/lib/db";
import { cached } from "@/lib/cache";
import { privateZones } from "@/lib/queries";
import { publicTrack } from "@/lib/track";
import { int } from "@/lib/fmt";
import { Card, Empty, Head, Seg } from "@/components/Head";
import { DataTable } from "@/components/DataTable";
import { Icon } from "@/components/Icon";
import { TrackMap } from "@/components/TrackMap";

export const dynamic = "force-dynamic";
const FAM: Record<string, { label: string; icon: string; sports: string[] }> = {
  tutte: { label: "Tutte", icon: "map", sports: [] },
  corsa: { label: "Corsa", icon: "run", sports: ["run", "trail_run"] },
  montagna: { label: "Montagna", icon: "hike", sports: ["hike", "walk"] },
  bici: { label: "Bici", icon: "ride", sports: ["ride"] },
};

/** Tracciati per la vista d'insieme: 120 punti ciascuno, 4 decimali (~10 m), zone private tolte. Calcolati una volta e messi in cache. */
const mapData = cached("mapData", async (g: number, sports: string[]) => {
  const rows = await q<{ lat: (number | null)[]; lon: (number | null)[]; place: string | null }>(
    `select array(select (t.streams->'lat'->>i)::float8 from generate_series(0, t.n_points - 1, greatest(1, t.n_points / 240)) i) as lat,
            array(select (t.streams->'lon'->>i)::float8 from generate_series(0, t.n_points - 1, greatest(1, t.n_points / 240)) i) as lon,
            (select x.raw->'summary'->>'locationName' from sport.activity_sources x where x.activity_id = a.id and x.source = 'garmin') as place
       from sport.activity_streams t join sport.activities a on a.id = t.activity_id
      where not a.hidden and t.start_lat is not null and a.start_utc > now() - make_interval(days => $1) and (cardinality($2::text[]) = 0 or a.sport = any($2))
      order by a.start_utc desc limit 400`, [g, sports]);
  const zones = await privateZones();
  const r4 = (v: number) => Math.round(v * 1e4) / 1e4;
  const lines = (await Promise.all(rows.map((r) => publicTrack(r.lat ?? [], r.lon ?? [], 120, zones)))).flat().map((seg) => seg.map(([a, o]) => [r4(a), r4(o)] as [number, number]));
  const places = new Map<string, number>(); for (const r of rows) if (r.place) places.set(r.place, (places.get(r.place) ?? 0) + 1);
  return { n: rows.length, lines, top: [...places.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8) };
});
const mapSports = cached("mapSports", async () => (await q<{ sport: string }>("select distinct a.sport from sport.activities a join sport.activity_streams t on t.activity_id = a.id where not a.hidden and t.start_lat is not null")).map((f) => f.sport));

export default async function Page({ searchParams }: { searchParams: Promise<{ s?: string; g?: string }> }) {
  const sp = await searchParams;
  const s = sp.s && FAM[sp.s] ? sp.s : "tutte";
  const g = [90, 365, 3650].includes(Number(sp.g)) ? Number(sp.g) : 365;
  const [{ n, lines, top }, present] = await Promise.all([mapData(g, FAM[s].sports), mapSports()]);

  return (
    <div className="stack-l">
      <Head icon="map" back={{ href: "/allenamento", label: "Allenamento" }} title="Mappa" sub="Dove ti alleni di più. Le zone private sono escluse." />
      <nav className="tabs" aria-label="Disciplina">
        {Object.entries(FAM).filter(([k, f]) => k === "tutte" || k === s || f.sports.some((x) => present.includes(x))).map(([k, f]) => (
          <Link key={k} href={`/mappa?s=${k}&g=${g}`} aria-current={k === s ? "true" : undefined}><Icon name={f.icon} size={16} />{f.label}</Link>
        ))}
      </nav>
      <Seg className="inline" label="Periodo" items={[[90, "3 mesi"], [365, "1 anno"], [3650, "Tutto"]].map(([d, l]) => ({ href: `/mappa?s=${s}&g=${d}`, label: l, on: d === g }))} />
      {lines.length ? <TrackMap lines={lines} heat tall /> : <div className="card"><Empty icon="map" title="Nessun tracciato GPS con questo filtro" text="Prova un periodo più lungo o un'altra disciplina. I tracciati arrivano dai file Garmin e da Strava." /></div>}
      <p className="note" style={{ marginTop: -10 }}>{n} tracciati GPS. Ingrandendo compaiono le singole linee. Sfondi: OpenFreeMap, OpenTopoMap{process.env.NEXT_PUBLIC_MAPTILER_KEY ? ", MapTiler" : ""}; dati © OpenStreetMap.</p>
      {top.length > 0 && (
        <Card title="Luoghi più frequenti" icon="mountain" aside="nome del luogo da Garmin">
          <DataTable caption="Luoghi più frequenti" initial={{ key: "n", dir: "desc" }} pinned={false} cols={[{ key: "p", label: "Luogo", lead: true, sort: true }, { key: "n", label: "Uscite", r: true, sort: true }]}
            rows={top.map(([p, n]) => ({ key: p, cells: { p: { t: p }, n: { t: int(n), v: n } } }))} />
        </Card>
      )}
    </div>
  );
}
