"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Mark, Wordmark } from "@/components/Mark";
import { Icon } from "@/components/Icon";

/** Barra laterale (desktop) con tutte le sezioni; su telefono 5 schede. Mappa si apre da Attività, Obiettivi da Oggi e Piano,
 *  Chiedi e Impostazioni dalle icone in alto a destra di ogni pagina. */
const MAIN = [
  { href: "/", label: "Oggi", icon: "home" },
  { href: "/attivita", label: "Attività", icon: "activity" },
  { href: "/analisi", label: "Analisi", icon: "chart" },
  { href: "/salute", label: "Salute", icon: "heart" },
  { href: "/piano", label: "Piano", icon: "calendar" },
];
const MORE = [
  { href: "/mappa", label: "Mappa", icon: "map" },
  { href: "/obiettivi", label: "Obiettivi", icon: "target" },
];
const TOOLS = [
  { href: "/chiedi", label: "Chiedi a Claude", icon: "chat" },
  { href: "/impostazioni", label: "Impostazioni", icon: "settings" },
];

export function Nav() {
  const p = usePathname();
  const cur = (h: string) => ((h === "/" ? p === "/" : p.startsWith(h)) ? "page" : undefined);
  const link = (i: { href: string; label: string; icon: string }) => (
    <Link key={i.href} href={i.href} className="nav" aria-current={cur(i.href)}><Icon name={i.icon} size={20} />{i.label}</Link>
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
          // Mappa vive sotto Attività, Obiettivi sotto Piano: la scheda resta accesa
          const on = cur(i.href) || (i.href === "/attivita" && p.startsWith("/mappa")) || (i.href === "/piano" && p.startsWith("/obiettivi")) ? "page" : undefined;
          return <Link key={i.href} href={i.href} aria-current={on}><Icon name={i.icon} size={22} />{i.label}</Link>;
        })}
      </nav>
    </>
  );
}
