import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { sign } from "@/lib/session";
import { authorizeUrl, stravaConfigured } from "@/lib/strava";

export const dynamic = "force-dynamic";

/** Avvia l'autorizzazione Strava (serve la sessione: controllata dal proxy). */
export async function GET(req: NextRequest) {
  const back = new URL("/impostazioni", req.nextUrl.origin);
  if (!stravaConfigured()) { back.searchParams.set("strava", "config"); return NextResponse.redirect(back); }
  const nonce = randomBytes(16).toString("base64url");
  const state = sign({ n: nonce, exp: Date.now() + 10 * 60_000 });
  const res = NextResponse.redirect(authorizeUrl(`${req.nextUrl.origin}/api/strava/callback`, nonce));
  res.cookies.set("altura_strava", state, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/strava", maxAge: 600 });
  return res;
}
