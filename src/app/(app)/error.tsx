"use client";
import Link from "next/link";
import { useEffect } from "react";
import { Icon } from "@/components/Icon";

/** Errore in una schermata: spiega cosa è successo in parole semplici e offre come riprovare. Nessun dettaglio tecnico a schermo. */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("[Altura]", error.digest ?? error.message); }, [error]);
  const offline = typeof navigator !== "undefined" && !navigator.onLine;
  return (
    <div className="card" style={{ marginTop: 24 }}>
      <div className="es" role="alert">
        <span className="ic" aria-hidden="true"><Icon name={offline ? "sync" : "heart"} size={24} /></span>
        <h3>{offline ? "Sei offline" : "Non riesco a caricare questa schermata"}</h3>
        <p>{offline
          ? "Altura legge i tuoi dati dal server: torna online e riprova."
          : "Il database non ha risposto in tempo o una fonte ha restituito dati inattesi. I tuoi dati non sono stati modificati."}</p>
        <div className="row" style={{ justifyContent: "center", marginTop: 8 }}>
          <button className="btn primary" onClick={reset}>Riprova</button>
          <Link className="btn" href="/impostazioni">Stato dei collegamenti</Link>
        </div>
        {error.digest && <p className="note">Codice per l&apos;assistenza: {error.digest}</p>}
      </div>
    </div>
  );
}
