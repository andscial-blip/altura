import { NextResponse, type NextRequest } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { q } from "@/lib/db";
import { CHALLENGE_COOKIE, sign } from "@/lib/session";
import { rp } from "@/lib/webauthn";

export async function POST(req: NextRequest) {
  const { rpID } = rp(req);
  const creds = await q<{ id: string; transports: string[] | null }>("select id, transports from sport.passkeys");
  if (!creds.length) return NextResponse.json({ error: "nessuna passkey", setup: true }, { status: 409 });
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "required",
    allowCredentials: creds.map((c) => ({ id: c.id, transports: (c.transports ?? undefined) as never })),
  });
  const res = NextResponse.json(options);
  res.cookies.set(CHALLENGE_COOKIE, sign({ c: options.challenge, k: "auth", exp: Date.now() + 5 * 60_000 }), {
    httpOnly: true, secure: true, sameSite: "strict", path: "/api/auth", maxAge: 300,
  });
  return res;
}
