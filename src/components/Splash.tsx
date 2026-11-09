"use client";
import { useEffect, useState } from "react";
import { Mark } from "@/components/Mark";

/** Schermata d'avvio: solo all'avvio a freddo (prima apertura della sessione del browser), almeno 5 secondi. */
const MIN_MS = 5000;
export function Splash() {
  const [phase, setPhase] = useState<"show" | "out" | "gone">("show");
  useEffect(() => {
    let seen = false;
    try { seen = sessionStorage.getItem("altura_splash") === "1"; sessionStorage.setItem("altura_splash", "1"); } catch { /* storage non disponibile */ }
    if (seen) { setPhase("gone"); return; }
    const a = setTimeout(() => setPhase("out"), MIN_MS);
    const b = setTimeout(() => setPhase("gone"), MIN_MS + 550);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, []);
  if (phase === "gone") return null;
  return (
    <div className={`splash${phase === "out" ? " out" : ""}`} role="status" aria-label="Altura si sta aprendo">
      <div className="inner">
        <Mark size={96} draw />
        <div className="word">Altura</div>
        <div className="motto">Know your edge</div>
      </div>
    </div>
  );
}
