"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Mark } from "@/components/Mark";

const ITEMS = [
  { href: "/", label: "Oggi", d: "M4 11l8-7 8 7v9h-5v-6H9v6H4z" },
  { href: "/attivita", label: "Attività", d: "M3 17l5-6 4 3 4-7 5 10" },
  { href: "/salute", label: "Salute", d: "M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z" },
  { href: "/piano", label: "Piano", d: "M5 5h14v15H5zM5 9h14M9 3v4M15 3v4" },
  { href: "/analisi", label: "Analisi", d: "M5 20V10M12 20V4M19 20v-7" },
  { href: "/mappa", label: "Mappa", d: "M9 4l-5 2v14l5-2 6 2 5-2V4l-5 2z M9 4v14M15 6v14" },
  { href: "/obiettivi", label: "Obiettivi", d: "M12 21a9 9 0 100-18 9 9 0 000 18zM12 16a4 4 0 100-8 4 4 0 000 8z" },
  { href: "/chiedi", label: "Chiedi a Claude", d: "M4 5h16v11H9l-5 4z" },
  { href: "/impostazioni", label: "Impostazioni", d: "M12 15a3 3 0 100-6 3 3 0 000 6zM19 12l2-1-2-4-2 .5-1.5-1L15 4h-6l-.5 2.5-1.5 1L5 7 3 11l2 1v0l-2 1 2 4 2-.5 1.5 1L9 20h6l.5-2.5 1.5-1 2 .5 2-4z" },
];
const TAB = ["/", "/attivita", "/salute", "/piano", "/impostazioni"];

function Icon({ d }: { d: string }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true"><path d={d} /></svg>;
}

export function Nav() {
  const p = usePathname();
  const cur = (h: string) => (h === "/" ? p === "/" : p.startsWith(h)) ? "page" : undefined;
  return (
    <>
      <nav className="rail" aria-label="Sezioni">
        <Link href="/" className="brand"><Mark /> Altura</Link>
        {ITEMS.map((i) => <Link key={i.href} href={i.href} className="nav" aria-current={cur(i.href)}><Icon d={i.d} />{i.label}</Link>)}
        <div className="foot">Know your edge</div>
      </nav>
      <nav className="tabbar" aria-label="Sezioni principali">
        {ITEMS.filter((i) => TAB.includes(i.href)).map((i) => (
          <Link key={i.href} href={i.href} aria-current={cur(i.href)}><Icon d={i.d} />{i.href === "/impostazioni" ? "Altro" : i.label}</Link>
        ))}
      </nav>
    </>
  );
}
