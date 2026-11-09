import "server-only";
import type { NextRequest } from "next/server";

/** RP ID e origine ricavati dalla richiesta (dominio vercel.app o futuro dominio proprio). */
export function rp(req: NextRequest): { rpID: string; origin: string } {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost";
  const proto = req.headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const rpID = host.split(":")[0]!;
  return { rpID, origin: `${proto}://${host}` };
}
export const RP_NAME = "Altura";
