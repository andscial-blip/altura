"use client";
import { useEffect, useState } from "react";
import { Mark, Wordmark } from "@/components/Mark";

/**
 * Schermata d'avvio: 4 secondi dal tocco sull'icona, a ogni avvio a freddo (prima apertura della sessione del browser o dell'app installata).
 * Il tempo si conta dall'inizio della navigazione (performance.now), non dal caricamento del JavaScript: intanto i dati si caricano sotto.
 * Sull'app installata iOS mostra subito un'immagine d'avvio identica (public/splash), quindi lì il marchio resta fermo invece di animarsi.
 * Navigando tra le schermate o tornando all'app dal background non ricompare: il componente non si rimonta e la sessione la ricorda.
 */
const MIN_MS = 4000;
export function Splash() {
  const [phase, setPhase] = useState<"show" | "out" | "gone">("show");
  useEffect(() => {
    let seen = false;
    try { seen = sessionStorage.getItem("altura_splash") === "1"; sessionStorage.setItem("altura_splash", "1"); } catch { /* storage non disponibile */ }
    if (seen) { setPhase("gone"); return; }
    const left = Math.max(300, MIN_MS - performance.now());
    const a = setTimeout(() => setPhase("out"), left);
    const b = setTimeout(() => setPhase("gone"), left + 420);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, []);
  if (phase === "gone") return null;
  return (
    <div className={`splash${phase === "out" ? " out" : ""}`} role="status" aria-label="Altura si sta aprendo">
      <div className="inner">
        <Mark size={104} tone="aqua" lanes="#FFFFFF" animate />
        <Wordmark height={44} color="#2E3D52" />
        <div className="motto">Know your edge</div>
      </div>
    </div>
  );
}
