import { invalidate } from "@/lib/cache";
import { NextResponse, type NextRequest } from "next/server";
import { one, q, tx } from "@/lib/db";
import type { HealthPayload as HP } from "@/lib/apple";
import { sha256 } from "@/lib/session";
import { HealthPayload, SeriesPayload, flatToSeries, fromSeries, samplesToDaily, workoutNorm } from "@/lib/apple";
import { finishRun, sanitize, startRun, upsertActivity, upsertDaily } from "@/lib/ingest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const MAX_BYTES = 4 * 1024 * 1024;

/**
 * Ingresso dati da Apple Salute (automazione Comandi Rapidi sull'iPhone).
 * Autenticazione: "Authorization: Bearer <token>" creato in Impostazioni; nel database c'è solo l'impronta SHA-256.
 */
export async function POST(req: NextRequest) {
  const tok = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (tok.length < 24) return NextResponse.json({ error: "token mancante" }, { status: 401 });
  const row = await one<{ id: string; scope: string[] }>(
    "select id, scope from sport.ingest_tokens where token_sha256 = $1 and revoked_at is null", [sha256(tok)]);
  if (!row || !row.scope.includes("apple_health")) return NextResponse.json({ error: "token non valido" }, { status: 401 });
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_BYTES) return NextResponse.json({ error: "dati troppo grandi: invia meno giorni per volta" }, { status: 413 });
  let body: unknown;
  try { body = JSON.parse(await req.text()); } catch { return NextResponse.json({ error: "JSON non valido" }, { status: 400 }); }
  // due formati: a campioni (samples/workouts) o a colonne (series), il più semplice da costruire in Comandi Rapidi
  if (body && typeof body === "object" && "metric" in (body as object)) body = flatToSeries(body as Record<string, unknown>);
  let p: HP;
  let warnings: string[] = [];
  const isSeries = !!body && typeof body === "object" && ("series" in (body as object) || (("workouts" in (body as object)) && !Array.isArray((body as { workouts?: unknown }).workouts)));
  if (isSeries) {
    const sp = SeriesPayload.safeParse(body);
    if (!sp.success) return NextResponse.json({ error: "formato non valido", detail: sp.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`) }, { status: 400 });
    ({ payload: p, warnings } = fromSeries(sp.data));
  } else {
    const parsed = HealthPayload.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "formato non valido", detail: parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`) }, { status: 400 });
    p = parsed.data;
  }
  const rows = samplesToDaily(p, p.tz || "Indian/Antananarivo");
  const perMetric = rows.reduce<Record<string, number>>((o, r) => ((o[r.metric] = (o[r.metric] ?? 0) + 1), o), {});
  // prova: legge e risponde con quello che ha capito, senza salvare
  if (req.nextUrl.searchParams.get("prova") === "1") {
    return NextResponse.json({ prova: true, giorni_per_metrica: perMetric, allenamenti: p.workouts?.length ?? 0, avvisi: warnings, esempio: rows.slice(0, 5) });
  }
  const runId = await startRun("apple_health");
  const counts = { daily_rows: 0, workouts: 0, created: 0, linked: 0 };
  try {
    counts.daily_rows = await upsertDaily(rows);
    for (const w of p.workouts ?? []) {
      const { external_id, norm } = workoutNorm(w);
      const r = await tx((c) => upsertActivity({ source: "apple_health", external_id, acquisition: "shortcut", raw: w, norm }, c));
      counts.workouts++; if (r.created) counts.created++; if (r.linked) counts.linked++;
    }
    await q("update sport.ingest_tokens set last_used_at = now() where id = $1", [row.id]);
    await finishRun(runId, "ok", counts);
    if (warnings.length) await q("update sport.sync_runs set message = $2 where id = $1", [runId, warnings.slice(0, 5).join("; ")]);
    invalidate();
    return NextResponse.json({ ok: true, ...counts, giorni_per_metrica: perMetric, avvisi: warnings });
  } catch (e) {
    await finishRun(runId, "error", counts, sanitize(e));
    return NextResponse.json({ error: "errore nel salvataggio" }, { status: 500 });
  }
}
