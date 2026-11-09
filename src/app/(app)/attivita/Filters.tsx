"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const SORTS: [string, string][] = [["recenti", "Più recenti"], ["vecchie", "Meno recenti"], ["distanza", "Distanza"], ["durata", "Durata"], ["dislivello", "Dislivello"]];

/** Ricerca nel nome, intervallo di date e ordinamento. Tutto in URL: si combina con la disciplina e si può condividere o salvare. */
export function Filters() {
  const router = useRouter(), path = usePathname(), sp = useSearchParams();
  const [pending, start] = useTransition();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const push = (patch: Record<string, string>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) { if (v) next.set(k, v); else next.delete(k); }
    next.delete("p");
    start(() => router.replace(`${path}?${next.toString()}`, { scroll: false }));
  };
  useEffect(() => { setQ(sp.get("q") ?? ""); }, [sp]);
  const onQ = (v: string) => { setQ(v); if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => push({ q: v.trim() }), 350); };
  const active = ["q", "from", "to"].some((k) => sp.get(k)) || (sp.get("sort") ?? "recenti") !== "recenti";
  return (
    <form className="filters" role="search" aria-label="Filtra le attività" aria-busy={pending} onSubmit={(e) => { e.preventDefault(); push({ q: q.trim() }); }}>
      <label className="fld q">Cerca nel nome<input className="in" type="search" value={q} onChange={(e) => onQ(e.target.value)} placeholder="es. lungo, Isnello, ripetute" enterKeyHint="search" /></label>
      <label className="fld">Dal<input className="in" type="date" value={sp.get("from") ?? ""} max={sp.get("to") ?? undefined} onChange={(e) => push({ from: e.target.value })} /></label>
      <label className="fld">Al<input className="in" type="date" value={sp.get("to") ?? ""} min={sp.get("from") ?? undefined} onChange={(e) => push({ to: e.target.value })} /></label>
      <label className="fld">Ordina per<select className="in" value={sp.get("sort") ?? "recenti"} onChange={(e) => push({ sort: e.target.value === "recenti" ? "" : e.target.value })}>{SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      {active ? <button type="button" className="btn sm reset" onClick={() => { setQ(""); start(() => router.replace(sp.get("sport") ? `${path}?sport=${sp.get("sport")}` : path, { scroll: false })); }}>Azzera filtri</button> : <span />}
    </form>
  );
}
