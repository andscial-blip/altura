import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verify } from "@/lib/session";

/** Tutto è privato tranne: pagina di accesso, API di accesso, ingresso dati con token, cron di Vercel, file statici. */
const PUBLIC = [/^\/accesso/, /^\/api\/auth\//, /^\/api\/ingest\//, /^\/api\/cron\//, /^\/api\/health$/, /^\/manifest\.webmanifest$/, /^\/icons\//, /^\/favicon/, /^\/sw\.js$/];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((r) => r.test(pathname))) return NextResponse.next();
  const ok = verify(req.cookies.get(SESSION_COOKIE)?.value);
  if (ok) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "non autenticato" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/accesso";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/((?!_next/static|_next/image).*)"] };
