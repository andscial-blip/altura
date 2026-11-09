import "server-only";
import { revalidateTag, unstable_cache } from "next/cache";

/**
 * Cache dei dati lato server: le schermate rileggono il database solo quando qualcosa è cambiato.
 * Tutto porta l'etichetta "sport" e viene invalidato a ogni sincronizzazione, invio da Apple Salute o modifica
 * da Impostazioni/Obiettivi. In ogni caso una voce non vive più di `ttl` secondi (giorni che cambiano a mezzanotte).
 */
export const TAG = "sport";
const BUILD = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? process.env.NEXT_BUILD_ID ?? "dev";

export function cached<A extends unknown[], R>(name: string, fn: (...a: A) => Promise<R>, ttl = 600): (...a: A) => Promise<R> {
  if (process.env.VITEST) return fn;
  // la versione del codice fa parte della chiave: dopo un rilascio non si leggono dati salvati con una forma vecchia
  return unstable_cache(fn, ["altura", BUILD, name], { tags: [TAG], revalidate: ttl });
}

/** Dopo una scrittura: le prossime letture vanno al database. */
export function invalidate() {
  try { revalidateTag(TAG, { expire: 0 }); } catch { /* fuori da una richiesta (test, script) */ }
}
