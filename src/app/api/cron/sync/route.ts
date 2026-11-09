import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { syncAll } from "@/lib/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Cron giornaliero di Vercel: Vercel invia "Authorization: Bearer CRON_SECRET". */
export async function GET(req: NextRequest) {
  const want = process.env.CRON_SECRET;
  const got = req.headers.get("authorization") ?? "";
  const ok = !!want && got.length === want.length + 7 && timingSafeEqual(Buffer.from(got), Buffer.from(`Bearer ${want}`));
  if (!ok) return NextResponse.json({ error: "non autorizzato" }, { status: 401 });
  return NextResponse.json(await syncAll({ budgetMs: 50_000 }));
}
