import { NextResponse, type NextRequest } from "next/server";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import { q, one } from "@/lib/db";
import { CHALLENGE_COOKIE, SESSION_COOKIE, sha256, sign, verify } from "@/lib/session";
import { rp, RP_NAME } from "@/lib/webauthn";

/**
 * Registrazione di una passkey.
 * - Primo dispositivo: serve il codice di attivazione (SETUP_TOKEN, mostrato solo al proprietario).
 * - Dispositivi successivi: serve una sessione già aperta (si aggiunge da Impostazioni).
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { setupToken?: string; label?: string };
  const count = Number((await one<{ n: string }>("select count(*)::text as n from sport.passkeys"))?.n ?? 0);
  const session = verify(req.cookies.get(SESSION_COOKIE)?.value);
  if (count > 0 && !session) return NextResponse.json({ error: "Per aggiungere un dispositivo apri prima Altura su un dispositivo già registrato." }, { status: 403 });
  if (count === 0) {
    const want = process.env.SETUP_TOKEN;
    if (!want || !body.setupToken || sha256(body.setupToken.trim()) !== sha256(want)) {
      return NextResponse.json({ error: "Codice di attivazione non valido." }, { status: 403 });
    }
  }
  const { rpID } = rp(req);
  const existing = await q<{ id: string; transports: string[] | null }>("select id, transports from sport.passkeys");
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID,
    userName: "Andrea",
    userDisplayName: "Andrea",
    userID: new TextEncoder().encode("altura-owner"),
    attestationType: "none",
    excludeCredentials: existing.map((c) => ({ id: c.id, transports: (c.transports ?? undefined) as never })),
    authenticatorSelection: { residentKey: "required", userVerification: "required" },
  });
  const res = NextResponse.json(options);
  res.cookies.set(CHALLENGE_COOKIE, sign({ c: options.challenge, k: "reg", l: (body.label ?? "").slice(0, 60), exp: Date.now() + 5 * 60_000 }), {
    httpOnly: true, secure: true, sameSite: "strict", path: "/api/auth", maxAge: 300,
  });
  return res;
}
