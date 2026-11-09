"use client";
import { useState } from "react";
export function CopyPrompt({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <div className="row between" style={{ borderTop: "1px solid var(--line-2)", paddingTop: 10, flexWrap: "nowrap", alignItems: "flex-start" }}>
      <p style={{ fontSize: "0.875rem" }}>{text}</p>
      <button className="btn sm" aria-label={ok ? "Domanda copiata" : "Copia la domanda"} onClick={async () => { try { await navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1500); } catch { /* */ } }}>{ok ? "Copiata" : "Copia"}</button>
    </div>
  );
}
