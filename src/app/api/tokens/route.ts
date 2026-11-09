import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { q } from "@/lib/db";
import { sha256 } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await q("select id, label, scope, created_at, last_used_at, revoked_at from sport.ingest_tokens order by created_at desc");
  return NextResponse.json(rows);
}

/** Crea un token per Comandi Rapidi: mostrato una sola volta, salvato solo come impronta. */
export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as { label?: string };
  const token = "alt_" + randomBytes(24).toString("base64url");
  const label = (b.label || "Comandi Rapidi iPhone").slice(0, 60);
  await q("insert into sport.ingest_tokens(label, scope, token_sha256) values ($1, '{apple_health}', $2)", [label, sha256(token)]);
  return NextResponse.json({ token, label });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id mancante" }, { status: 400 });
  await q("update sport.ingest_tokens set revoked_at = now() where id = $1 and revoked_at is null", [id]);
  return NextResponse.json({ ok: true });
}
