"use client";
import { useEffect, useState } from "react";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";

/** Accesso con passkey del dispositivo (Face ID, Touch ID, impronta). Nessuna password propria. */
export function Access() {
  const [registered, setRegistered] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [setup, setSetup] = useState("");

  useEffect(() => { fetch("/api/auth/status").then((r) => r.json()).then((j) => setRegistered(j.registered)).catch(() => setRegistered(null)); }, []);

  const done = () => { window.location.href = "/"; };

  async function login() {
    setBusy(true); setErr(null);
    try {
      const o = await fetch("/api/auth/login-options", { method: "POST" });
      if (o.status === 409) { setRegistered(false); return; }
      const opts = await o.json();
      const resp = await startAuthentication({ optionsJSON: opts });
      const v = await fetch("/api/auth/login-verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(resp) });
      const j = await v.json();
      if (!v.ok) throw new Error(j.error ?? "Accesso non riuscito.");
      done();
    } catch (e) {
      setErr(e instanceof Error && e.name === "NotAllowedError" ? "Accesso annullato o passkey non trovata su questo dispositivo. Se è un dispositivo nuovo, entra da quello già registrato e aggiungilo da Impostazioni." : !navigator.onLine ? "Sei offline: serve la connessione per entrare." : (e as Error).message || "Accesso non riuscito: riprova.");
    } finally { setBusy(false); }
  }

  async function register() {
    setBusy(true); setErr(null);
    try {
      const o = await fetch("/api/auth/register-options", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ setupToken: setup.trim(), label: navigator.platform || "dispositivo" }) });
      const opts = await o.json();
      if (!o.ok) throw new Error(opts.error ?? "Attivazione non riuscita.");
      const resp = await startRegistration({ optionsJSON: opts });
      const v = await fetch("/api/auth/register-verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(resp) });
      const j = await v.json();
      if (!v.ok) throw new Error(j.error ?? "Attivazione non riuscita.");
      done();
    } catch (e) {
      setErr(e instanceof Error && e.name === "NotAllowedError" ? "Attivazione annullata." : (e as Error).message);
    } finally { setBusy(false); }
  }

  if (registered === null) return <div className="card stack" aria-busy="true"><div className="skel" style={{ height: 20, width: "40%" }} /><div className="skel" style={{ height: 14, width: "70%" }} /><div className="skel" style={{ height: 44 }} /></div>;
  return (
    <div className="card stack">
      {registered ? (
        <>
          <h2>Entra</h2>
          <p className="muted">Usa Face ID, Touch ID o l&apos;impronta di questo dispositivo.</p>
          <button className="btn primary" onClick={login} disabled={busy}>{busy ? "Attendo il dispositivo…" : "Entra con passkey"}</button>
        </>
      ) : (
        <>
          <h2>Attiva Altura su questo dispositivo</h2>
          <p className="muted">Prima attivazione: incolla il codice di attivazione e crea la passkey. Dopo, l&apos;accesso è solo con Face ID o impronta.</p>
          <input className="in" type="password" autoComplete="off" placeholder="Codice di attivazione" value={setup} onChange={(e) => setSetup(e.target.value)} aria-label="Codice di attivazione" />
          <button className="btn primary" onClick={register} disabled={busy || setup.trim().length < 16}>{busy ? "Attendo il dispositivo…" : "Crea passkey"}</button>
        </>
      )}
      {err && <p className="alert bad" role="alert">{err}</p>}
    </div>
  );
}
