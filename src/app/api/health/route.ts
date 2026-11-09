import { NextResponse } from "next/server";
import { one } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Stato tecnico pubblico: nessun dato personale, nessun valore di configurazione (solo se è presente). */
export async function GET() {
  const t0 = Date.now();
  let db: "ok" | "errore" = "ok";
  let schema = 0;
  let db_error: string | null = null;
  try {
    const r = await one<{ n: string }>("select count(*)::text as n from sport.sources");
    schema = Number(r?.n ?? 0);
  } catch (e) {
    db = "errore";
    // solo la classe dell'errore (es. ENOTFOUND, "Tenant or user not found"): mai host, utente o password
    const err = e as { code?: string; message?: string };
    db_error = err.code ?? (err.message ?? "").replace(/[a-z0-9.-]+\.(com|co|net)\S*/gi, "[host]").slice(0, 80);
  }
  return NextResponse.json({
    app: "altura", db, db_error, schema_ok: schema >= 5, ms: Date.now() - t0,
    configured: {
      database: !!process.env.DATABASE_URL, session: !!process.env.SESSION_SECRET, garmin: !!process.env.GARMIN_API_KEY,
      runna: !!process.env.RUNNA_ICS_URL, strava: !!(process.env.STRAVA_CLIENT_ID && process.env.STRAVA_CLIENT_SECRET), cron: !!process.env.CRON_SECRET,
    },
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
  }, { headers: { "Cache-Control": "no-store" } });
}
