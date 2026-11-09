"use client";
import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/** x: posizione 0–1 lungo l'asse; lines: righe dell'etichetta (la prima è il "quando"); d: data YYYY-MM-DD, serve allo zoom. */
export type TipRow = { x: number; lines: string[]; d?: string };

/**
 * Valori esatti di un grafico, per tutti:
 * - dito o mouse: tocca o passa sopra, il punto più vicino mostra cursore ed etichetta;
 * - tastiera: Tab sul grafico, frecce sinistra/destra (Maiusc = 10 alla volta), Home/Fine, Esc;
 * - lettore di schermo: ogni spostamento viene letto; sotto il grafico c'è la tabella con tutti i valori;
 * - zoom (se zoomHref è dato): trascina in orizzontale per scegliere un intervallo di date.
 */
export function Tip({ tips, children, label, zoomHref, table = true }: { tips: TipRow[]; children: React.ReactNode; label?: string; zoomHref?: string; table?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const id = useId();
  const [idx, setIdx] = useState<number | null>(null);
  const [geo, setGeo] = useState<{ left: number; top: number; h: number; w: number } | null>(null);
  const [drag, setDrag] = useState<{ a: number; b: number } | null>(null);
  const startX = useRef<number | null>(null);

  const measure = () => {
    const box = ref.current; if (!box) return null;
    const svgs = box.querySelectorAll("svg.c");
    if (!svgs.length) return null;
    const first = svgs[0].getBoundingClientRect(), last = svgs[svgs.length - 1].getBoundingClientRect(), b = box.getBoundingClientRect();
    const g = { left: first.left - b.left, top: first.top - b.top, h: last.bottom - first.top, w: first.width };
    setGeo(g);
    return { g, abs: first.left };
  };
  const nearest = (f: number) => { let best = 0; tips.forEach((t, i) => { if (Math.abs(t.x - f) < Math.abs(tips[best].x - f)) best = i; }); return best; };
  const fracOf = (clientX: number) => { const m = measure(); return m ? (clientX - m.abs) / m.g.w : null; };

  const move = (e: React.PointerEvent) => {
    if (!tips.length) return;
    const f = fracOf(e.clientX); if (f === null) return;
    if (f < -0.02 || f > 1.02) { setIdx(null); return; }
    setIdx(nearest(f));
    if (startX.current !== null && zoomHref) setDrag({ a: startX.current, b: Math.min(1, Math.max(0, f)) });
  };
  const down = (e: React.PointerEvent) => {
    move(e);
    if (zoomHref && e.pointerType === "mouse") { const f = fracOf(e.clientX); startX.current = f === null ? null : Math.min(1, Math.max(0, f)); }
  };
  const up = () => {
    const s = drag; startX.current = null; setDrag(null);
    if (!s || !zoomHref || Math.abs(s.b - s.a) < 0.04) return;
    const a = tips[nearest(Math.min(s.a, s.b))]?.d, b = tips[nearest(Math.max(s.a, s.b))]?.d;
    if (a && b && a < b) router.push(`${zoomHref}${zoomHref.endsWith("?") ? "" : zoomHref.includes("?") ? "&" : "?"}from=${a}&to=${b}`, { scroll: false });
  };
  const key = (e: React.KeyboardEvent) => {
    if (!tips.length) return;
    const n = tips.length, cur = idx ?? n - 1, step = e.shiftKey ? 10 : 1;
    let next: number | null = cur;
    if (e.key === "ArrowRight") next = Math.min(n - 1, cur + step);
    else if (e.key === "ArrowLeft") next = Math.max(0, cur - step);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = n - 1;
    else if (e.key === "Escape") next = null;
    else return;
    e.preventDefault(); measure(); setIdx(next);
  };

  const t = idx === null ? null : tips[idx];
  const flip = t ? t.x > 0.55 : false;
  return (
    <div className="tipwrap">
      <div ref={ref} className="chart" tabIndex={tips.length ? 0 : -1} role="group" aria-roledescription="grafico"
        aria-label={`${label ?? "Grafico"}. Frecce sinistra e destra per leggere i valori.`} aria-describedby={`${id}-live`}
        onPointerMove={move} onPointerDown={down} onPointerUp={up} onPointerLeave={() => { setIdx(null); startX.current = null; setDrag(null); }}
        onKeyDown={key} onFocus={() => { measure(); }} onBlur={() => setIdx(null)}>
        {children}
        {t && geo && (
          <>
            <div className="cur" style={{ left: geo.left + t.x * geo.w, top: geo.top, height: geo.h }} aria-hidden="true" />
            <div className="tip" aria-hidden="true" style={{ top: Math.max(0, geo.top - 4), ...(flip ? { right: `calc(100% - ${geo.left + t.x * geo.w - 8}px)` } : { left: geo.left + t.x * geo.w + 8 }) }}>
              {t.lines.map((l, i) => <div key={i}>{l}</div>)}
            </div>
          </>
        )}
        {drag && geo && <div className="sel" aria-hidden="true" style={{ left: geo.left + Math.min(drag.a, drag.b) * geo.w, width: Math.abs(drag.b - drag.a) * geo.w, top: geo.top, height: geo.h }} />}
        <div id={`${id}-live`} className="sr" aria-live="polite">{t ? t.lines.join(", ") : ""}</div>
      </div>
      {table && tips.length > 0 && (
        <details className="data">
          <summary>Valori in tabella ({tips.length})</summary>
          <div className="dtab" tabIndex={0} role="region" aria-label={`Valori: ${label ?? "grafico"}`}>
            <table><tbody>{tips.map((r, i) => <tr key={i}><th scope="row">{r.lines[0]}</th><td>{r.lines.slice(1).join(" · ")}</td></tr>)}</tbody></table>
          </div>
        </details>
      )}
    </div>
  );
}
