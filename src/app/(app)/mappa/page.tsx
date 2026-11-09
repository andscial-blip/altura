import { q } from "@/lib/db";
import { publicTrack } from "@/lib/track";
import { TrackMap } from "@/components/TrackMap";

export const dynamic = "force-dynamic";
const FAM: Record<string, string[]> = { tutte: [], corsa: ["run", "trail_run"], montagna: ["hike", "walk"], bici: ["ride"] };

export default async function Page({ searchParams }: { searchParams: Promise<{ s?: string; g?: string }> }) {
  const sp = await searchParams;
  const s = sp.s && FAM[sp.s] ? sp.s : "tutte";
  const g = [90, 365, 3650].includes(Number(sp.g)) ? Number(sp.g) : 365;
  const rows = await q<{ lat: (number | null)[]; lon: (number | null)[] }>(
    `select t.streams->'lat' as lat, t.streams->'lon' as lon from sport.activity_streams t join sport.activities a on a.id = t.activity_id
      where not a.hidden and t.start_lat is not null and a.start_utc > now() - make_interval(days => $1) and (cardinality($2::text[]) = 0 or a.sport = any($2))
      order by a.start_utc desc limit 400`, [g, FAM[s]]);
  const lines = (await Promise.all(rows.map((r) => publicTrack(r.lat ?? [], r.lon ?? [], 400)))).flat();
  return (
    <div className="stack">
      <div className="head"><div><h1>Mappa</h1><p>Dove ti alleni di più. Le zone private sono escluse.</p></div></div>
      <div className="row between">
        <nav className="chips">{Object.keys(FAM).map((k) => <a key={k} className="chip" aria-current={k === s ? "true" : undefined} href={`/mappa?s=${k}&g=${g}`}>{k[0].toUpperCase() + k.slice(1)}</a>)}</nav>
        <nav className="chips">{[[90, "3 mesi"], [365, "1 anno"], [3650, "tutto"]].map(([d, l]) => <a key={d} className="chip" aria-current={d === g ? "true" : undefined} href={`/mappa?s=${s}&g=${d}`}>{l}</a>)}</nav>
      </div>
      <TrackMap lines={lines} heat height={560} />
      <p className="note">{rows.length} tracciati GPS (file FIT originali Garmin). Mappa: OpenFreeMap, dati © OpenStreetMap.</p>
    </div>
  );
}
