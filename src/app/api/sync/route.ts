import { NextResponse, type NextRequest } from "next/server";
import { syncAll } from "@/lib/sync";
import { invalidate } from "@/lib/cache";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Sincronizzazione chiesta dall'app (all'apertura o dal pulsante). Richiede la sessione (controllata dal proxy). */
export async function POST(req: NextRequest) {
  const force = req.nextUrl.searchParams.get("force") === "1";
  const res = await syncAll({ force, budgetMs: 45_000 });
  invalidate();
  return NextResponse.json(res, { headers: { "Cache-Control": "no-store" } });
}
