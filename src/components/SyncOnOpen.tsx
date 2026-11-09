"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";

/** All'apertura dell'app chiede una sincronizzazione (il server salta le fonti aggiornate da meno di 10 minuti). */
export function SyncOnOpen({ label = true, variant = "button" }: { label?: boolean; variant?: "button" | "icon" }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "run" | "done" | "err">("idle");
  const run = async (force = false) => {
    setState("run");
    try {
      const r = await fetch(`/api/sync${force ? "?force=1" : ""}`, { method: "POST" });
      if (!r.ok) throw new Error(String(r.status));
      const j = (await r.json()) as Record<string, { status?: string; counts?: { created?: number; fit?: number; planned?: number } }>;
      setState("done");
      const changed = Object.values(j).some((x) => x?.counts && ((x.counts.created ?? 0) + (x.counts.fit ?? 0) > 0));
      if (changed || force) router.refresh();
    } catch { setState("err"); }
  };
  useEffect(() => {
    let last = 0;
    try { last = Number(sessionStorage.getItem("altura_sync") || 0); } catch { /* */ }
    if (Date.now() - last > 10 * 60_000) {
      try { sessionStorage.setItem("altura_sync", String(Date.now())); } catch { /* */ }
      void run();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!label) return null;
  const txt = state === "run" ? "Sincronizzo…" : state === "err" ? "Sincronizzazione non riuscita, riprova" : state === "done" ? "Dati aggiornati" : "Sincronizza ora";
  if (variant === "icon") return (
    <button type="button" className={`iconbtn sync-btn ${state}`} onClick={() => run(true)} disabled={state === "run"} aria-label={txt} title={txt}>
      <Icon name="sync" size={20} /><span className="sr" aria-live="polite">{state === "idle" ? "" : txt}</span>
    </button>
  );
  return (
    <button className="btn" onClick={() => run(true)} disabled={state === "run"} aria-live="polite">
      {state === "run" ? "Sincronizzo…" : state === "err" ? "Riprova la sincronizzazione" : "Sincronizza ora"}
    </button>
  );
}
