"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { Mark, Wordmark } from "@/components/Mark";
import { Icon } from "@/components/Icon";

/** Quattro schede, una domanda ciascuna: Oggi (come sto, cosa faccio), Allenamento (cosa ho fatto e cosa mi aspetta),
 *  Gara (arrivo all'obiettivo?), Corpo (recupero bene?). Le altre pagine sono dettagli raggiungibili da lì; su desktop
 *  stanno anche nella barra laterale. Chiedi e Impostazioni dalle icone in alto a destra. */
const MAIN = [
  { href: "/", label: "Oggi", icon: "home" },
  { href: "/allenamento", label: "Allenamento", icon: "activity" },
  { href: "/gara", label: "Gara", icon: "race" },
  { href: "/corpo", label: "Corpo", icon: "heart" },
];
const MORE = [
  { href: "/attivita", label: "Tutte le attività", icon: "run" },
  { href: "/piano", label: "Calendario Runna", icon: "calendar" },
  { href: "/montagna", label: "Montagna", icon: "mountain" },
  { href: "/mappa", label: "Mappa", icon: "map" },
  { href: "/analisi", label: "Analisi per disciplina", icon: "chart" },
];
const TOOLS = [
  { href: "/chiedi", label: "Chiedi a Claude", icon: "chat" },
  { href: "/impostazioni", label: "Impostazioni", icon: "settings" },
];
/** Sottopagine: la scheda principale resta accesa. */
const UNDER: Record<string, string[]> = { "/allenamento": ["/attivita", "/piano", "/montagna", "/mappa", "/analisi"], "/gara": ["/obiettivi", "/progressi"], "/corpo": ["/salute"] };

export function Nav() {
  const p = usePathname();
  const cur = (h: string) => ((h === "/" ? p === "/" : p.startsWith(h)) ? "page" : undefined);
  const lit = (h: string) => (cur(h) || (UNDER[h] ?? []).some((x) => p.startsWith(x)) ? "page" : undefined);
  // le schede orizzontali (sport, periodi) mostrano sempre quella attiva, anche se è in fondo alla fila
  // cambio sezione: si riparte dall'alto (con il marchio visibile), non dal punto in cui Next porta il nuovo contenuto
  useEffect(() => { window.scrollTo({ top: 0 }); }, [p]);
  useEffect(() => {
    const show = () => document.querySelectorAll<HTMLElement>('.tabs [aria-current="true"]').forEach((el) => {
      const box = el.parentElement!; const l = el.offsetLeft - box.offsetLeft, r = l + el.offsetWidth;
      if (l < box.scrollLeft || r > box.scrollLeft + box.clientWidth) box.scrollTo({ left: l - 16, behavior: "smooth" });
    });
    show();
    const mo = new MutationObserver(show);
    mo.observe(document.body, { subtree: true, attributes: true, attributeFilter: ["aria-current"], childList: true });
    return () => mo.disconnect();
  }, [p]);
  const link = (i: { href: string; label: string; icon: string }) => (
    <Link key={i.href} href={i.href} className="nav" prefetch={true} aria-current={cur(i.href)}><Icon name={i.icon} size={20} />{i.label}</Link>
  );
  return (
    <>
      <nav className="rail" aria-label="Sezioni">
        <Link href="/" className="brand" aria-label="Altura, oggi"><Mark size={30} tone="aqua" lanes="var(--night)" /><Wordmark height={22} /></Link>
        {MAIN.map(link)}
        <div className="sep" />
        {MORE.map(link)}
        <div className="sep" />
        {TOOLS.map(link)}
        <div className="foot">Know your edge</div>
      </nav>
      <nav className="tabbar" aria-label="Sezioni principali">
        {MAIN.map((i) => {
          return <Link key={i.href} href={i.href} prefetch={true} aria-current={lit(i.href)}><Icon name={i.icon} size={22} />{i.label}</Link>;
        })}
      </nav>
    </>
  );
}
