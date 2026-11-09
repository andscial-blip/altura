import "server-only";
import { maskPrivate } from "@/lib/model";
import { privateZones } from "@/lib/queries";
import { cached } from "@/lib/cache";

/** Tracciato pronto per il browser: zone private tolte, punti ridotti, spezzato dove mancano punti. */
export async function publicTrack(lat: (number | null)[] = [], lon: (number | null)[] = [], maxPts = 1200, zonesIn?: Awaited<ReturnType<typeof privateZones>>): Promise<[number, number][][]> {
  const zones = zonesIn ?? await privateZones();
  const m = maskPrivate(lat, lon, zones);
  const step = Math.max(1, Math.ceil(m.lat.length / maxPts));
  const segs: [number, number][][] = [];
  let cur: [number, number][] = [];
  for (let i = 0; i < m.lat.length; i += step) {
    const a = m.lat[i], o = m.lon[i];
    if (a === null || o === null || (Math.abs(a) < 1e-9 && Math.abs(o) < 1e-9)) { if (cur.length > 1) segs.push(cur); cur = []; continue; }
    cur.push([a, o]);
  }
  if (cur.length > 1) segs.push(cur);
  return segs;
}

/** Miniature dei percorsi: ~80 punti campionati nel database, zone private tolte, path SVG in un riquadro 100×100. */
async function thumbs_(ids: string[]): Promise<Record<string, string>> {
  if (!ids.length) return {};
  const { q } = await import("@/lib/db");
  const rows = await q<{ id: string; lat: (number | null)[]; lon: (number | null)[] }>(
    `select t.activity_id as id,
            array(select v::float8 from jsonb_array_elements_text(t.streams->'lat') with ordinality e(v, i) where (i - 1) % greatest(1, t.n_points / 80) = 0 order by i) as lat,
            array(select v::float8 from jsonb_array_elements_text(t.streams->'lon') with ordinality e(v, i) where (i - 1) % greatest(1, t.n_points / 80) = 0 order by i) as lon
       from sport.activity_streams t where t.activity_id = any($1::uuid[]) and t.start_lat is not null`, [ids]);
  const out: Record<string, string> = {};
  const zones = await privateZones();
  for (const r of rows) {
    const segs = await publicTrack(r.lat, r.lon, 200, zones);
    const pts = segs.flat();
    if (pts.length < 2) continue;
    const la = pts.map((p) => p[0]), lo = pts.map((p) => p[1]);
    const k = Math.cos(((Math.min(...la) + Math.max(...la)) / 2) * Math.PI / 180);
    const x0 = Math.min(...lo) * k, x1 = Math.max(...lo) * k, y0 = Math.min(...la), y1 = Math.max(...la);
    const s = 84 / Math.max(x1 - x0, y1 - y0, 1e-6), ox = (100 - (x1 - x0) * s) / 2, oy = (100 - (y1 - y0) * s) / 2;
    out[r.id] = segs.map((sg) => sg.map((p, i) => `${i ? "L" : "M"}${(ox + (p[1] * k - x0) * s).toFixed(1)} ${(oy + (y1 - p[0]) * s).toFixed(1)}`).join("")).join("");
  }
  return out;
}

export const thumbs = cached("thumbs", thumbs_);
