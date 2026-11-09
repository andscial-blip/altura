"use client";
import { useEffect, useState } from "react";
import { Mark, Wordmark } from "@/components/Mark";

/**
 * Schermata d'avvio: 3 secondi, solo all'avvio a freddo (prima apertura della sessione del browser o dell'app installata).
 * Navigando tra le schermate o tornando all'app dal background non ricompare: il componente non si rimonta e la sessione la ricorda.
 */
const MIN_MS = 3000;
export function Splash() {
  const [phase, setPhase] = useState<"show" | "out" | "gone">("show");
  useEffect(() => {
    let seen = false;
    try { seen = sessionStorage.getItem("altura_splash") === "1"; sessionStorage.setItem("altura_splash", "1"); } catch { /* storage non disponibile */ }
    if (seen) { setPhase("gone"); return; }
    const a = setTimeout(() => setPhase("out"), MIN_MS);
    const b = setTimeout(() => setPhase("gone"), MIN_MS + 420);
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
