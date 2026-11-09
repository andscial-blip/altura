import { NextResponse, type NextRequest } from "next/server";
import { verify } from "@/lib/session";
import { sanitize } from "@/lib/ingest";
import { exchangeCode } from "@/lib/strava";
import { scopeOk } from "@/lib/strava-map";

export const dynamic = "force-dynamic";

/** Ritorno dalla pagina di autorizzazione Strava: controlla lo stato, scambia il codice, salva i token cifrati. */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const back = new URL("/impostazioni", req.nextUrl.origin);
  const done = (v: string) => { back.searchParams.set("strava", v); const r = NextResponse.redirect(back); r.cookies.delete({ name: "altura_strava", path: "/api/strava" }); return r; };
  const st = verify<{ n: string; exp: number }>(req.cookies.get("altura_strava")?.value);
  if (!st || st.n !== p.get("state")) return done("stato");
  if (p.get("error")) return done("negato");
  const scope = p.get("scope");
  if (!scopeOk(scope).ok) return done("permessi");
  const code = p.get("code");
  if (!code) return done("negato");
  try { await exchangeCode(code, scope); } catch (e) { console.error("strava callback", sanitize(e)); return done("errore"); }
  return done("ok");
}
