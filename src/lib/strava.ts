import "server-only";
import { decrypt, encrypt } from "@/lib/session";
import { getSetting, q, setSetting, tx } from "@/lib/db";
import { finishRun, getState, sanitize, setState, startRun, upsertActivity, upsertStreams } from "@/lib/ingest";
import { stravaNorm, stravaStreams, type StravaStreamSet, type StravaSummary } from "@/lib/strava-map";

/**
 * Strava API v3 con OAuth del proprietario (app API creata nel suo account Strava).
 * CLIENT_ID e CLIENT_SECRET stanno solo nelle variabili d'ambiente di Vercel; i token OAuth sono salvati cifrati.
 * I dati Strava si mostrano solo al proprietario e non vengono usati per addestrare modelli (API Agreement di Strava).
 */
const API = "https://www.strava.com/api/v3";
const OAUTH = "https://www.strava.com/oauth";
const SCOPE = "read,activity:read_all";
const PAGE = 200;
const OVERLAP_S = 2 * 86400;
const STREAMS_PER_RUN = 25;
const STREAM_KEYS = "time,distance,latlng,altitude,heartrate,velocity_smooth,cadence,watts";
const PACE_MS = 250;

export class StravaError extends Error {
  constructor(message: string, readonly kind: "config" | "auth" | "rate" | "network" | "server" | "budget") { super(message); }
}

type Tok = { access_token: string; refresh_token: string; expires_at: number; athlete_id?: number; scope?: string };
type State = {
  newest_start?: number;          // inizio (epoch s) dell'attività più recente già vista
  history_before?: number | null; // lo storico è stato importato fino a qui (epoch s), scendendo all'indietro
  history_done?: boolean;
  streams_pending?: { id: string; tries: number }[];
};

const clean = (v: string | undefined) => (v ?? "").replace(/[\s​-‍⁠﻿]/g, "");
const creds = () => ({ id: clean(process.env.STRAVA_CLIENT_ID), secret: clean(process.env.STRAVA_CLIENT_SECRET) });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function stravaConfigured(): boolean { const c = creds(); return !!(c.id && c.secret); }

export async function stravaConnection(): Promise<{ connected: boolean; athlete_id?: number; all?: boolean }> {
  const t = await getSetting<{ enc: string; athlete_id?: number; scope?: string }>("strava_token");
  return t ? { connected: true, athlete_id: t.athlete_id, all: (t.scope ?? "").includes("activity:read_all") } : { connected: false };
}

export function authorizeUrl(redirectUri: string, state: string): string {
  const { id } = creds();
  if (!id) throw new StravaError("STRAVA_CLIENT_ID mancante su Vercel.", "config");
  const p = new URLSearchParams({ client_id: id, response_type: "code", redirect_uri: redirectUri, approval_prompt: "auto", scope: SCOPE, state });
  return `${OAUTH}/authorize?${p}`;
}

async function saveToken(t: Tok): Promise<void> {
  await setSetting("strava_token", { enc: encrypt(JSON.stringify(t)), athlete_id: t.athlete_id, scope: t.scope });
}

async function tokenRequest(body: Record<string, string>): Promise<Record<string, unknown>> {
  const { id, secret } = creds();
  if (!id || !secret) throw new StravaError("Credenziali dell'app Strava mancanti su Vercel.", "config");
  let res: Response;
  try {
    res = await fetch(`${OAUTH}/token`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client_id: id, client_secret: secret, ...body }), cache: "no-store", signal: AbortSignal.timeout(20_000) });
  } catch { throw new StravaError("Strava non raggiungibile.", "network"); }
  if (res.status === 400 || res.status === 401) throw new StravaError("Strava ha rifiutato l'autorizzazione: va ricollegato da Impostazioni.", "auth");
  if (!res.ok) throw new StravaError(`Servizio token Strava non disponibile (${res.status}).`, "server");
  return (await res.json()) as Record<string, unknown>;
}

/** Scambia il codice ricevuto dalla pagina di autorizzazione con i token e li salva cifrati. */
export async function exchangeCode(code: string, scope: string | null): Promise<void> {
  const j = await tokenRequest({ code, grant_type: "authorization_code" });
  const athlete = j.athlete as { id?: number } | undefined;
  await saveToken({ access_token: String(j.access_token), refresh_token: String(j.refresh_token), expires_at: Number(j.expires_at), athlete_id: athlete?.id, scope: scope ?? undefined });
}

async function accessToken(force = false): Promise<string> {
  const s = await getSetting<{ enc: string }>("strava_token");
  if (!s) throw new StravaError("Strava non collegato.", "config");
  let t: Tok;
  try { t = JSON.parse(decrypt(s.enc)) as Tok; } catch { throw new StravaError("Token Strava illeggibile: va ricollegato.", "auth"); }
  if (!force && t.expires_at * 1000 - Date.now() > 5 * 60_000) return t.access_token;
  const j = await tokenRequest({ grant_type: "refresh_token", refresh_token: t.refresh_token });
  const next: Tok = { ...t, access_token: String(j.access_token), refresh_token: String(j.refresh_token ?? t.refresh_token), expires_at: Number(j.expires_at) };
  await saveToken(next);
  return next.access_token;
}

/** Revoca l'accesso su Strava e cancella i token. I dati già importati restano (si eliminano a parte). */
export async function disconnectStrava(): Promise<void> {
  try {
    const t = await accessToken();
    await fetch(`${OAUTH}/deauthorize`, { method: "POST", headers: { Authorization: `Bearer ${t}` }, cache: "no-store", signal: AbortSignal.timeout(15_000) });
  } catch { /* token già revocato o Strava irraggiungibile: si cancella comunque */ }
  await q("delete from sport.settings where key = 'strava_token'");
  await q("delete from sport.sync_state where source = 'strava'");
}

class Client {
  private t: string | null = null;
  calls = 0;
  constructor(private deadline: number) {}
  async json(path: string, params?: Record<string, string | number>): Promise<unknown> {
    const url = API + path + (params ? "?" + new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])) : "");
    for (let attempt = 0; attempt < 3; attempt++) {
      if (Date.now() > this.deadline) throw new StravaError("tempo a disposizione esaurito", "budget");
      if (!this.t) this.t = await accessToken(attempt > 0);
      if (this.calls++) await sleep(PACE_MS);
      let res: Response;
      try {
        res = await fetch(url, { headers: { Authorization: `Bearer ${this.t}`, Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(20_000) });
      } catch { await sleep(1000 * 2 ** attempt); continue; }
      if (res.status === 401 && attempt === 0) { this.t = null; continue; }
      if (res.status === 401) throw new StravaError("Strava ha revocato l'accesso: va ricollegato da Impostazioni.", "auth");
      if (res.status === 429) throw new StravaError("Limite di richieste Strava raggiunto: riprende alla prossima sincronizzazione.", "rate");
      if (res.status === 404) return null;
      if (res.status >= 500) { await sleep(1500 * 2 ** attempt); continue; }
      if (!res.ok) throw new StravaError(`Strava ha risposto ${res.status}`, "server");
      // vicini al limite dei 15 minuti: ci si ferma prima di farsi bloccare
      const use = (res.headers.get("x-readratelimit-usage") ?? res.headers.get("x-ratelimit-usage") ?? "").split(",").map(Number);
      const lim = (res.headers.get("x-readratelimit-limit") ?? res.headers.get("x-ratelimit-limit") ?? "").split(",").map(Number);
      if (use[0] && lim[0] && use[0] >= lim[0] - 5) this.deadline = Math.min(this.deadline, Date.now());
      return res.json();
    }
    throw new StravaError("Strava non raggiungibile dopo vari tentativi", "network");
  }
}

export type StravaCounts = { activities: number; created: number; linked: number; streams: number; calls: number };

async function ingestPage(list: StravaSummary[], counts: StravaCounts, pending: Map<string, { id: string; tries: number }>): Promise<number[]> {
  const starts: number[] = [];
  for (const s of list) {
    const norm = stravaNorm(s);
    if (!norm.start_utc || !norm.sport) continue;
    starts.push(Date.parse(String(norm.start_utc)) / 1000);
    const r = await upsertActivity({ source: "strava", external_id: String(s.id), acquisition: "api", raw: { summary: s }, norm });
    counts.activities++;
    if (r.created) counts.created++;
    if (r.linked) counts.linked++;
    // il tracciato da Strava serve solo dove Garmin non c'è (Garmin porta il file FIT originale)
    const gps = !!s.map?.summary_polyline || s.has_heartrate;
    if (gps && !s.manual) {
      const has = await q<{ g: boolean; st: boolean }>(
        `select exists(select 1 from sport.activity_sources where activity_id = $1 and source = 'garmin') as g,
                exists(select 1 from sport.activity_streams where activity_id = $1) as st`, [r.id]);
      if (!has[0].g && !has[0].st && !pending.has(String(s.id))) pending.set(String(s.id), { id: String(s.id), tries: 0 });
    }
  }
  return starts;
}

/** Sincronizzazione con tempo massimo: prima le novità, poi lo storico all'indietro, poi i tracciati mancanti. */
export async function syncStrava(opts: { budgetMs?: number } = {}): Promise<{ status: string; counts: StravaCounts; message: string }> {
  const runId = await startRun("strava");
  const deadline = Date.now() + (opts.budgetMs ?? 45_000);
  const counts: StravaCounts = { activities: 0, created: 0, linked: 0, streams: 0, calls: 0 };
  const st = (await getState<State>("strava")) as State;
  const pending = new Map((st.streams_pending ?? []).map((p) => [p.id, p]));
  const c = new Client(deadline);
  let status: "ok" | "partial" | "error" = "ok";
  const notes: string[] = [];
  try {
    const now = Math.floor(Date.now() / 1000);
    // 1) novità
    if (st.newest_start) {
      for (let page = 1; page <= 10; page++) {
        const list = ((await c.json("/athlete/activities", { after: st.newest_start - OVERLAP_S, page, per_page: PAGE })) ?? []) as StravaSummary[];
        const starts = await ingestPage(list, counts, pending);
        if (starts.length) st.newest_start = Math.max(st.newest_start, ...starts);
        if (list.length < PAGE) break;
      }
    }
    // 2) storico, dal più recente al più vecchio
    while (!st.history_done && Date.now() < deadline) {
      const before = st.history_before ?? now + 3600;
      const list = ((await c.json("/athlete/activities", { before, per_page: PAGE })) ?? []) as StravaSummary[];
      const starts = await ingestPage(list, counts, pending);
      if (starts.length) {
        st.history_before = Math.floor(Math.min(...starts));
        st.newest_start = Math.max(st.newest_start ?? 0, ...starts);
      }
      if (list.length < PAGE) st.history_done = true;
      await setState("strava", { ...st, streams_pending: [...pending.values()] });
    }
    if (!st.history_done) { status = "partial"; notes.push("storico ancora in arrivo"); }
    // 3) tracciati delle attività che Garmin non ha
    let done = 0;
    for (const p of [...pending.values()]) {
      if (done >= STREAMS_PER_RUN || Date.now() > deadline) break;
      const row = await q<{ activity_id: string; sport: string }>(
        `select s.activity_id, a.sport from sport.activity_sources s join sport.activities a on a.id = s.activity_id
          where s.source = 'strava' and s.external_id = $1`, [p.id]);
      if (!row[0]) { pending.delete(p.id); continue; }
      try {
        const set = (await c.json(`/activities/${p.id}/streams`, { keys: STREAM_KEYS, key_by_type: "true" })) as StravaStreamSet | null;
        const streams = set ? stravaStreams(set, row[0].sport) : null;
        if (streams) { await tx((cl) => upsertStreams(cl, row[0].activity_id, "strava", streams)); counts.streams++; }
        pending.delete(p.id);
        done++;
      } catch (e) {
        if (e instanceof StravaError && (e.kind === "rate" || e.kind === "budget" || e.kind === "auth")) throw e;
        p.tries++;
        if (p.tries >= 3) pending.delete(p.id);
      }
    }
    if (pending.size) { status = "partial"; notes.push(`${pending.size} tracciati in coda`); }
  } catch (e) {
    if (e instanceof StravaError && (e.kind === "budget" || e.kind === "rate")) { status = "partial"; notes.push(e.message); }
    else { status = "error"; notes.push(sanitize(e)); }
  }
  counts.calls = c.calls;
  await setState("strava", { ...st, streams_pending: [...pending.values()] });
  const message = notes.join("; ") || "ok";
  await finishRun(runId, status, counts, message);
  return { status, counts, message };
}
