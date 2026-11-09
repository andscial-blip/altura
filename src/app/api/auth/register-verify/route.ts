import { NextResponse, type NextRequest } from "next/server";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { q } from "@/lib/db";
import { CHALLENGE_COOKIE, SESSION_COOKIE, newSession, verify } from "@/lib/session";
import { rp } from "@/lib/webauthn";

export async function POST(req: NextRequest) {
  const ch = verify<{ c: string; k: string; l: string; exp: number }>(req.cookies.get(CHALLENGE_COOKIE)?.value);
  if (!ch || ch.k !== "reg") return NextResponse.json({ error: "Richiesta scaduta: riprova." }, { status: 400 });
  const body = await req.json();
  const { rpID, origin } = rp(req);
  let v;
  try {
    v = await verifyRegistrationResponse({ response: body, expectedChallenge: ch.c, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true });
  } catch (e) {
    return NextResponse.json({ error: "Verifica non riuscita: " + (e as Error).message }, { status: 400 });
  }
  if (!v.verified) return NextResponse.json({ error: "Verifica non riuscita." }, { status: 400 });
  const c = v.registrationInfo.credential;
  await q(
    "insert into sport.passkeys(id, public_key, counter, transports, device_label) values ($1,$2,$3,$4,$5) on conflict (id) do nothing",
    [c.id, Buffer.from(c.publicKey).toString("base64url"), c.counter, c.transports ?? null, ch.l || req.headers.get("user-agent")?.slice(0, 80) || null],
  );
  const res = NextResponse.json({ ok: true });
  res.cookies.delete({ name: CHALLENGE_COOKIE, path: "/api/auth" });
  if (!verify(req.cookies.get(SESSION_COOKIE)?.value)) {
    const s = newSession();
    res.cookies.set(SESSION_COOKIE, s.value, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: s.maxAge });
  }
  return res;
}
