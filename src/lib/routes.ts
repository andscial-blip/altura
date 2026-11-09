/**
 * Stesso percorso: due corse sono sullo stesso giro se hanno distanza simile e tracciati sovrapposti, a prescindere dal verso.
 * Partire da casa non basta: molte uscite partono dallo stesso punto e vanno in direzioni diverse.
 * Funzioni pure (testate in tests/routes.test.ts); i tracciati non escono dal server.
 */
export type Track = { lat: number[]; lon: number[] };
export type Pt = [number, number]; // metri (x est, y nord) attorno a un'origine comune

const R = 6371000;

/** Proiezione locale in metri (equirettangolare: errore trascurabile su pochi km). */
function project(t: Track, lat0: number, lon0: number): Pt[] {
  const k = Math.cos((lat0 * Math.PI) / 180);
  const out: Pt[] = [];
  for (let i = 0; i < t.lat.length; i++) {
    const a = t.lat[i], o = t.lon[i];
    if (!Number.isFinite(a) || !Number.isFinite(o) || (Math.abs(a) < 1e-9 && Math.abs(o) < 1e-9)) continue;
    out.push([((o - lon0) * Math.PI / 180) * R * k, ((a - lat0) * Math.PI / 180) * R]);
  }
  return out;
}

/** n punti equidistanti lungo il tracciato. */
export function resample(p: Pt[], n = 64): Pt[] {
  if (p.length < 2) return p;
  const cum = [0];
  for (let i = 1; i < p.length; i++) cum.push(cum[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
  const L = cum[cum.length - 1];
  if (L <= 0) return [p[0]];
  const out: Pt[] = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const s = (L * k) / (n - 1);
    while (j < cum.length - 2 && cum[j + 1] < s) j++;
    const f = (s - cum[j]) / (cum[j + 1] - cum[j] || 1);
    out.push([p[j][0] + f * (p[j + 1][0] - p[j][0]), p[j][1] + f * (p[j + 1][1] - p[j][1])]);
  }
  return out;
}

/** Distanza media di ogni punto di a dal punto più vicino di b, in metri. Con stop: si ferma appena la media supera il limite. */
function meanNearest(a: Pt[], b: Pt[], stop = Infinity): number {
  let sum = 0;
  const cap = stop * a.length;
  for (const [x, y] of a) {
    if (sum > cap) return Infinity;
    let m = Infinity;
    for (const [u, v] of b) { const d = (x - u) * (x - u) + (y - v) * (y - v); if (d < m) m = d; }
    sum += Math.sqrt(m);
  }
  return sum / a.length;
}

/** Scarto tra due tracciati: il peggiore dei due versi (a→b e b→a), così un giro più corto contenuto in uno lungo non conta come uguale. */
export function routeGap(a: Pt[], b: Pt[], stop = Infinity): number {
  const ab = meanNearest(a, b, stop);
  return ab === Infinity ? ab : Math.max(ab, meanNearest(b, a, stop));
}

export const SAME_ROUTE_M = 150;      // scarto medio massimo tra i tracciati
export const SAME_DIST = 0.1;         // differenza di distanza massima (10%)

export type RouteRun = { id: string; dist: number; track: Track };
export type Prepared = { id: string; dist: number; pts: Pt[] };

/** Prepara i tracciati in un sistema comune (origine: primo punto valido del primo tracciato). */
export function prepare(runs: RouteRun[], n = 64): Prepared[] {
  const first = runs.find((r) => r.track.lat.some((v, i) => Number.isFinite(v) && Number.isFinite(r.track.lon[i]) && Math.abs(v) > 1e-9));
  if (!first) return [];
  const i0 = first.track.lat.findIndex((v, i) => Number.isFinite(v) && Number.isFinite(first.track.lon[i]) && Math.abs(v) > 1e-9);
  const lat0 = first.track.lat[i0], lon0 = first.track.lon[i0];
  return runs.map((r) => ({ id: r.id, dist: r.dist, pts: resample(project(r.track, lat0, lon0), n) })).filter((r) => r.pts.length >= 8);
}

export function sameRoute(a: Prepared, b: Prepared): boolean {
  if (!a.dist || !b.dist || Math.abs(a.dist - b.dist) / Math.max(a.dist, b.dist) > SAME_DIST) return false;
  // partenze a oltre 2 km: escluso senza confrontare il resto
  if (Math.hypot(a.pts[0][0] - b.pts[0][0], a.pts[0][1] - b.pts[0][1]) > 2000) return false;
  return routeGap(a.pts, b.pts, SAME_ROUTE_M) <= SAME_ROUTE_M;
}

/** Corse sullo stesso percorso di quella data (inclusa). */
export function matches(target: string, list: Prepared[]): string[] {
  const t = list.find((r) => r.id === target);
  if (!t) return [];
  return list.filter((r) => r.id === target || sameRoute(t, r)).map((r) => r.id);
}

/**
 * Raggruppa le corse in percorsi ricorrenti: ogni corsa entra nel primo gruppo il cui riferimento (la prima corsa del gruppo)
 * è sullo stesso percorso. L'ordine d'ingresso è dal più recente, così il riferimento è il giro com'è oggi.
 */
export function clusters(list: Prepared[], minSize = 2): string[][] {
  return groups(list, minSize).map((g) => g.ids);
}

export function groups(list: Prepared[], minSize = 2): { ids: string[]; dir: string }[] {
  const gs: { ref: Prepared; ids: string[] }[] = [];
  for (const r of list) {
    const g = gs.find((x) => sameRoute(x.ref, r));
    if (g) g.ids.push(r.id); else gs.push({ ref: r, ids: [r.id] });
  }
  return gs.filter((g) => g.ids.length >= minSize).map((g) => ({ ids: g.ids, dir: heading(g.ref) }));
}

const WINDS = ["nord", "nord-est", "est", "sud-est", "sud", "sud-ovest", "ovest", "nord-ovest"];
/** Direzione del punto più lontano dalla partenza, per dare un nome ai percorsi (es. "verso nord-est"). */
export function heading(p: Prepared): string {
  const [x0, y0] = p.pts[0];
  let far = p.pts[0], dmax = 0;
  for (const q of p.pts) { const d = Math.hypot(q[0] - x0, q[1] - y0); if (d > dmax) { dmax = d; far = q; } }
  if (dmax < 300) return "attorno alla partenza";
  const deg = (Math.atan2(far[0] - x0, far[1] - y0) * 180) / Math.PI;
  return `verso ${WINDS[Math.round(((deg + 360) % 360) / 45) % 8]}`;
}
