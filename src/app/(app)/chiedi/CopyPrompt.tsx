"use client";
import { useState } from "react";
export function CopyPrompt({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <div className="row between" style={{ borderTop: "1px solid var(--line)", paddingTop: 10, flexWrap: "nowrap" }}>
      <p>{text}</p>
      <button className="btn" onClick={async () => { try { await navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1500); } catch { /* */ } }}>{ok ? "Copiata" : "Copia"}</button>
    </div>
  );
}
