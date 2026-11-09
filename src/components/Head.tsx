import Link from "next/link";
import { Icon } from "@/components/Icon";
import { Mark, Wordmark } from "@/components/Mark";

/**
 * Barra superiore del telefono: marchio a sinistra (torna a Oggi), icone a destra. Su desktop non c'è
 * (marchio e sezioni stanno nella barra laterale). Il titolo sta sempre su una riga sua, sotto.
 */
export function TopBar({ dark = false, children }: { dark?: boolean; children?: React.ReactNode }) {
  return (
    <div className="topbar">
      <Link href="/" className="logo" aria-label="Altura, vai a Oggi">
        <Mark size={26} tone={dark ? "aqua" : "ink"} lanes={dark ? "var(--night)" : undefined} />
        <Wordmark height={17} color={dark ? "var(--on-night)" : "currentColor"} />
      </Link>
      <div className="tb">{children}<MobileTools /></div>
    </div>
  );
}

/** Intestazione di pagina: barra del telefono, poi ritorno, titolo, sottotitolo e azioni. */
export function Head({ title, sub, back, acts, top, icon }: {
  title: React.ReactNode; sub?: React.ReactNode; back?: { href: string; label: string }; acts?: React.ReactNode; top?: React.ReactNode; icon?: string;
}) {
  return (
    <header className="head">
      <TopBar>{top}</TopBar>
      <div className="head-main">
        <div className="head-id">
          {icon && <span className="htile" aria-hidden="true"><Icon name={icon} size={24} /></span>}
          <div className="head-text">
            {back && <Link href={back.href} className="back"><Icon name="back" size={18} />{back.label}</Link>}
            <h1>{title}</h1>
            {sub && <p className="sub">{sub}</p>}
          </div>
        </div>
        {acts && <div className="acts">{acts}</div>}
      </div>
    </header>
  );
}

export function MobileTools() {
  return (
    <>
      <Link href="/chiedi" className="iconbtn" aria-label="Chiedi a Claude"><Icon name="chat" size={20} /></Link>
      <Link href="/impostazioni" className="iconbtn" aria-label="Impostazioni"><Icon name="settings" size={20} /></Link>
    </>
  );
}

/** Valore numerico: cifre in Plex Mono, unità e separatori ("h", "min", "/km") in Plex Sans più piccolo. */
export function Num({ v, unit }: { v: string; unit?: string }) {
  const parts = v.split(/(-?[\d][\d.,:]*)/).filter((p) => p !== "");
  return (
    <span className="nv">
      {parts.map((p, i) => (/^-?\d/.test(p) ? <span key={i} className="dg">{p}</span> : p.trim() ? <span key={i} className="u">{p.trim()}</span> : null))}
      {unit && <span className="u">{unit}</span>}
    </span>
  );
}

/** Riquadro indicatore. */
export function Kpi({ label, icon, value, unit, delta, foot, dark, children }: {
  label: string; icon?: string; value: React.ReactNode; unit?: string; delta?: { text: string; dir: "up" | "dn" | "ne" } | null; foot?: React.ReactNode; dark?: boolean; children?: React.ReactNode;
}) {
  return (
    <div className={`kpi${dark ? " dark" : ""}`}>
      <div className="l">{icon && <Icon name={icon} size={14} />}{label}</div>
      <div className="v">{typeof value === "string" ? <Num v={value} unit={unit} /> : value}</div>
      {(delta || foot) && <div className="d"><span>{foot}</span>{delta && <span className={delta.dir}>{delta.text}</span>}</div>}
      {children}
    </div>
  );
}

/** Scheda con intestazione. */
export function Card({ title, icon, aside, children, className = "", id }: { title?: React.ReactNode; icon?: string; aside?: React.ReactNode; children: React.ReactNode; className?: string; id?: string }) {
  return (
    <section className={`card ${className}`} id={id} aria-label={typeof title === "string" ? title : undefined}>
      {(title || aside) && <div className="card-h"><h2>{icon && <Icon name={icon} size={16} />}{title}</h2>{aside && <div className="aside">{aside}</div>}</div>}
      {children}
    </section>
  );
}

/** Stato vuoto: icona, titolo, spiegazione e, se c'è, l'azione che lo risolve. */
export function Empty({ icon = "activity", title, text, action, inline = false }: { icon?: string; title: string; text?: React.ReactNode; action?: { href: string; label: string }; inline?: boolean }) {
  return (
    <div className={`es${inline ? " inline" : ""}`} role="status">
      <span className="ic" aria-hidden="true"><Icon name={icon} size={inline ? 18 : 24} /></span>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action && <Link href={action.href} className="btn sm">{action.label}</Link>}
    </div>
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

/** Spiegazione a richiesta: un pulsante "i" che apre un riquadro (metodo, fonti, limiti) invece dei paragrafi sotto i grafici. */
export function Info({ title = "Come si calcola", children }: { title?: string; children: React.ReactNode }) {
  return (
    <details className="info">
      <summary aria-label={title} title={title}><span aria-hidden="true">i</span></summary>
      <div className="infobox" role="note"><b>{title}</b>{children}</div>
    </details>
  );
}

/** Giudizio in una riga, con il pallino del semaforo. */
export function Verdict({ level, children, sub }: { level: "verde" | "giallo" | "rosso" | "na"; children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className={`verdict-b v-${level}`}>
      <p className="vt"><span className="dotl" aria-hidden="true" />{children}</p>
      {sub && <p className="vs">{sub}</p>}
    </div>
  );
}
