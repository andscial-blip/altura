"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Registra il service worker (avvio istantaneo dalla copia salvata) e, alla prima apertura della sessione,
 * chiede subito i dati aggiornati: la copia salvata viene sostituita in pochi istanti, di solito durante lo splash.
 */
export function SW() {
  const router = useRouter();
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
    let boot = false;
    try { boot = !sessionStorage.getItem("altura_boot"); sessionStorage.setItem("altura_boot", "1"); } catch { /* */ }
    if (boot && navigator.serviceWorker.controller) router.refresh();
  }, [router]);
  return null;
}
