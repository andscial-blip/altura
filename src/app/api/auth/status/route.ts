import { NextResponse } from "next/server";
import { one } from "@/lib/db";

/** Dice solo se esiste già almeno una passkey (per mostrare "Accedi" o "Attiva"). Nessun dato personale. */
export async function GET() {
  const r = await one<{ n: string }>("select count(*)::text as n from sport.passkeys").catch(() => null);
  return NextResponse.json({ registered: r ? Number(r.n) > 0 : null });
}
