import { NextResponse, type NextRequest } from "next/server";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { one, q } from "@/lib/db";
import { CHALLENGE_COOKIE, SESSION_COOKIE, newSession, verify } from "@/lib/session";
import { rp } from "@/lib/webauthn";

export async function POST(req: NextRequest) {
  const ch = verify<{ c: string; k: string; exp: number }>(req.cookies.get(CHALLENGE_COOKIE)?.value);
  if (!ch || ch.k !== "auth") return NextResponse.json({ error: "Richiesta scaduta: riprova." }, { status: 400 });
  const body = (await req.json()) as { id: string };
  const cred = await one<{ id: string; public_key: string; counter: string; transports: string[] | null }>(
    "select id, public_key, counter::text, transports from sport.passkeys where id = $1", [body.id]);
  if (!cred) return NextResponse.json({ error: "Passkey non riconosciuta su questo dispositivo." }, { status: 400 });
  const { rpID, origin } = rp(req);
  let v;
  try {
    v = await verifyAuthenticationResponse({
      response: body as never, expectedChallenge: ch.c, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true,
      credential: { id: cred.id, publicKey: new Uint8Array(Buffer.from(cred.public_key, "base64url")), counter: Number(cred.counter), transports: (cred.transports ?? undefined) as never },
    });
  } catch (e) {
    return NextResponse.json({ error: "Verifica non riuscita: " + (e as Error).message }, { status: 400 });
  }
  if (!v.verified) return NextResponse.json({ error: "Verifica non riuscita." }, { status: 400 });
  await q("update sport.passkeys set counter = $2, last_used_at = now() where id = $1", [cred.id, v.authenticationInfo.newCounter]);
  const s = newSession();
  const res = NextResponse.json({ ok: true });
  res.cookies.delete({ name: CHALLENGE_COOKIE, path: "/api/auth" });
  res.cookies.set(SESSION_COOKIE, s.value, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: s.maxAge });
  return res;
}
