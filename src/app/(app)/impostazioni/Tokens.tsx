"use client";
import { TZ, when } from "@/lib/fmt";
import { useEffect, useState } from "react";

type T = { id: string; label: string; created_at: string; last_used_at: string | null; revoked_at: string | null };

/** Token per l'automazione di Comandi Rapidi (Apple Salute). Il token in chiaro si vede una volta sola. */
export function Tokens() {
  const [list, setList] = useState<T[]>([]);
  const [fresh, setFresh] = useState<string | null>(null);
  const load = () => fetch("/api/tokens").then((r) => r.json()).then(setList).catch(() => {});
  useEffect(() => { void load(); }, []);
  const create = async () => { const r = await fetch("/api/tokens", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }); const j = await r.json(); setFresh(j.token); void load(); };
  const revoke = async (id: string) => { await fetch(`/api/tokens?id=${id}`, { method: "DELETE" }); void load(); };
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return (
    <section className="panel stack">
      <h2>Apple Salute (Comandi Rapidi)</h2>
      <ol style={{ margin: 0, paddingLeft: 20 }} className="stack">
        <li>Crea un token qui sotto e copialo: si vede una volta sola.</li>
        <li>Sull&apos;iPhone, in Comandi Rapidi, crea un comando che con &quot;Trova campioni di Salute&quot; legge i dati degli ultimi 2 giorni (passi, battito a riposo, variabilità cardiaca, sonno, energia attiva, peso, VO2max) e gli allenamenti.</li>
        <li>Con &quot;Ottieni contenuto dell&apos;URL&quot; invia un POST JSON a <code>{origin}/api/ingest/health</code> con l&apos;intestazione <code>Authorization: Bearer &lt;token&gt;</code>. Formato: <code>{`{"samples":[{"type":"steps","start":"…","value":1234}], "workouts":[{"type":"Running","start":"…","end":"…","distance":8.2}]}`}</code></li>
        <li>In Automazione, fallo partire ogni mattina. Salute raccoglie anche i dati di Garmin, Strava e Runna: Altura li tiene come fonte separata con la priorità più bassa, così non li conta due volte.</li>
      </ol>
      {fresh && <div className="panel" style={{ background: "var(--surface-2)" }}><p className="note">Nuovo token, copialo adesso:</p><code style={{ wordBreak: "break-all" }}>{fresh}</code></div>}
      <div className="row"><button className="btn primary" onClick={create}>Crea token</button></div>
      {list.length > 0 && (
        <table className="t"><thead><tr><th>Token</th><th>Creato</th><th>Ultimo uso</th><th></th></tr></thead>
          <tbody>{list.map((t) => <tr key={t.id}><td>{t.label}</td><td>{new Date(t.created_at).toLocaleDateString("it-IT", { timeZone: TZ })}</td><td>{t.last_used_at ? when(t.last_used_at) : "mai"}</td><td className="r">{t.revoked_at ? <span className="state">revocato</span> : <button className="btn danger" onClick={() => revoke(t.id)}>Revoca</button>}</td></tr>)}</tbody>
        </table>
      )}
    </section>
  );
}
