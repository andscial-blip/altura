import Link from "next/link";
import { Icon } from "@/components/Icon";

/** Intestazione di pagina: titolo, sottotitolo, ritorno opzionale, azioni. Su telefono aggiunge Chiedi e Impostazioni. */
export function Head({ title, sub, back, acts, tools = true }: {
  title: React.ReactNode; sub?: React.ReactNode; back?: { href: string; label: string }; acts?: React.ReactNode; tools?: boolean;
}) {
  return (
    <header className="head">
      <div style={{ minWidth: 0 }}>
        {back && <Link href={back.href} className="back"><Icon name="back" size={18} />{back.label}</Link>}
        <h1>{title}</h1>
        {sub && <p className="sub">{sub}</p>}
      </div>
      <div className="acts">
        {acts}
        {tools && <MobileTools />}
      </div>
    </header>
  );
}

export function MobileTools({ dark = false }: { dark?: boolean }) {
  return (
    <>
      <Link href="/chiedi" className="iconbtn only-m" aria-label="Chiedi a Claude" style={dark ? undefined : undefined}><Icon name="chat" size={20} /></Link>
      <Link href="/impostazioni" className="iconbtn only-m" aria-label="Impostazioni"><Icon name="settings" size={20} /></Link>
    </>
  );
}

/** Riquadro indicatore. */
export function Kpi({ label, icon, value, unit, delta, foot, dark, children }: {
  label: string; icon?: string; value: React.ReactNode; unit?: string; delta?: { text: string; dir: "up" | "dn" | "ne" } | null; foot?: React.ReactNode; dark?: boolean; children?: React.ReactNode;
}) {
  return (
    <div className={`kpi${dark ? " dark" : ""}`}>
      <div className="l">{icon && <Icon name={icon} size={14} />}{label}</div>
      <div className="v">{value}{unit && <small>{unit}</small>}</div>
      {(delta || foot) && <div className="d"><span>{foot}</span>{delta && <span className={delta.dir}>{delta.text}</span>}</div>}
      {children}
    </div>
  );
}

/** Scheda con intestazione. */
export function Card({ title, icon, aside, children, className = "", id }: { title?: React.ReactNode; icon?: string; aside?: React.ReactNode; children: React.ReactNode; className?: string; id?: string }) {
  return (
    <section className={`card ${className}`} id={id}>
      {(title || aside) && <div className="card-h"><h2>{icon && <Icon name={icon} size={16} />}{title}</h2>{aside && <div className="aside">{aside}</div>}</div>}
      {children}
    </section>
  );
}

/** Legenda. */
export function Legend({ items }: { items: { label: string; color: string; line?: boolean; dash?: boolean }[] }) {
  return (
    <div className="legend">
      {items.map((i) => <span key={i.label}><i className={i.line ? "ln" : undefined} style={{ background: i.dash ? `repeating-linear-gradient(90deg, ${i.color} 0 4px, transparent 4px 7px)` : i.color }} />{i.label}</span>)}
    </div>
  );
}

/** Segmentato a link (filtri in URL). */
export function Seg({ items, label, className = "" }: { items: { href: string; label: React.ReactNode; on: boolean }[]; label: string; className?: string }) {
  return (
    <nav className={`seg ${className}`} aria-label={label}>
      {items.map((i) => <Link key={i.href} href={i.href} aria-current={i.on ? "true" : undefined} scroll={false}>{i.label}</Link>)}
    </nav>
  );
}

/** Freccia di variazione: "su" è un bene salvo inverso (es. FC a riposo). */
export function delta(cur: number | null, prev: number | null, fmt: (v: number) => string, opts: { inverse?: boolean; pct?: boolean; unit?: string } = {}) {
  if (cur === null || prev === null || !Number.isFinite(cur) || !Number.isFinite(prev)) return null;
  const d = opts.pct ? (prev ? ((cur - prev) / prev) * 100 : null) : cur - prev;
  if (d === null) return null;
  const good = opts.inverse ? d < 0 : d > 0;
  const zero = Math.abs(d) < 1e-9 || fmt(Math.abs(d)) === fmt(0);
  return { text: `${zero ? "=" : d > 0 ? "▲" : "▼"} ${fmt(Math.abs(d))}${opts.pct ? "%" : opts.unit ? " " + opts.unit : ""}`, dir: (zero ? "ne" : good ? "up" : "dn") as "up" | "dn" | "ne" };
}
