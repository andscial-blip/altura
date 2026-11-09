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
  const [origin, setOrigin] = useState("https://altura-edge.vercel.app");
  useEffect(() => { setOrigin(window.location.origin); }, []);
  const active = list.filter((t) => !t.revoked_at);
  return (
    <section className="card" aria-labelledby="tok-h">
      <div className="card-h"><h2 id="tok-h">Apple Salute (Comandi Rapidi)</h2><span className="aside">{active.length} token attivi</span></div>
      <div className="stack">
        <p className="note">L&apos;automazione sull&apos;iPhone legge da Salute passi ed energia attiva e li invia con un POST a <code>{origin}/api/ingest/health</code>, intestazione <code>Authorization: Bearer &lt;token&gt;</code>, nel formato <code>{`{"metric":"steps","values":[…],"dates":[…]}`}</code>. Salute raccoglie anche i dati di Garmin e Strava: Altura li tiene come fonte separata con priorità più bassa, senza contarli due volte.</p>
        {fresh && <div className="alert ok" role="status"><div><b>Nuovo token, copialo adesso: non si vedrà più.</b><br /><code style={{ wordBreak: "break-all" }}>{fresh}</code></div></div>}
        <div className="row"><button className="btn primary" onClick={create}>Crea token</button></div>
        {list.length > 0 && (
          <div className="tscroll">
            <table className="t">
              <caption className="sr">Token di invio dati</caption>
              <thead><tr><th scope="col">Token</th><th scope="col">Creato</th><th scope="col">Ultimo uso</th><th scope="col"><span className="sr">Azione</span></th></tr></thead>
              <tbody>{list.map((t) => <tr key={t.id}><td>{t.label}</td><td className="mono">{new Date(t.created_at).toLocaleDateString("it-IT", { timeZone: TZ })}</td><td>{t.last_used_at ? when(t.last_used_at) : "mai"}</td><td className="r">{t.revoked_at ? <span className="badge">revocato</span> : <button className="btn sm danger" onClick={() => revoke(t.id)} aria-label={`Revoca ${t.label}`}>Revoca</button>}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
