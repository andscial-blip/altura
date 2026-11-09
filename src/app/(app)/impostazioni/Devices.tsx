"use client";
import { useState } from "react";
import { startRegistration } from "@simplewebauthn/browser";

export function Devices({ passkeys }: { passkeys: { id: string; device_label: string | null; created: string; used: string }[] }) {
  const [msg, setMsg] = useState<string | null>(null);
  const add = async () => {
    setMsg(null);
    try {
      const o = await fetch("/api/auth/register-options", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label: navigator.platform || "dispositivo" }) });
      const opts = await o.json(); if (!o.ok) throw new Error(opts.error);
      const resp = await startRegistration({ optionsJSON: opts });
      const v = await fetch("/api/auth/register-verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(resp) });
      if (!v.ok) throw new Error((await v.json()).error);
      setMsg("Passkey aggiunta."); location.reload();
    } catch (e) { setMsg(e instanceof Error && e.name === "NotAllowedError" ? "Operazione annullata sul dispositivo." : (e as Error).message || "Non è stato possibile aggiungere la passkey: riprova."); }
  };
  const logout = async () => { await fetch("/api/auth/logout", { method: "POST" }); location.href = "/accesso"; };
  return (
    <section className="card" aria-labelledby="dev-h">
      <div className="card-h"><h2 id="dev-h">Accesso</h2><span className="aside">passkey</span></div>
      <div className="stack">
        {passkeys.map((p) => <div key={p.id} className="row between"><span>{p.device_label ?? "Dispositivo"}</span><span className="note">creata {p.created} · ultimo accesso {p.used}</span></div>)}
        <p className="note">Su iPhone e Mac con lo stesso ID Apple la passkey si sincronizza da sola con il Portachiavi iCloud. Per un altro dispositivo, aprilo con una sessione attiva e aggiungi la passkey qui.</p>
        <div className="row"><button className="btn" onClick={add}>Aggiungi passkey su questo dispositivo</button><button className="btn" onClick={logout}>Esci</button></div>
        {msg && <p className={`alert ${msg === "Passkey aggiunta." ? "ok" : "bad"}`} role="status">{msg}</p>}
      </div>
    </section>
  );
}
