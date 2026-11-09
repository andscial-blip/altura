import "server-only";
import { maskPrivate } from "@/lib/model";
import { privateZones } from "@/lib/queries";

/** Tracciato pronto per il browser: zone private tolte, punti ridotti, spezzato dove mancano punti. */
export async function publicTrack(lat: (number | null)[] = [], lon: (number | null)[] = [], maxPts = 1200): Promise<[number, number][][]> {
  const zones = await privateZones();
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
