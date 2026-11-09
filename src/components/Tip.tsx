"use client";
import { useRef, useState } from "react";

export type TipRow = { x: number; lines: string[] };

/**
 * Valori esatti al tocco o al passaggio del puntatore: trova il punto più vicino lungo l'asse x del primo grafico
 * contenuto e mostra cursore ed etichetta. Funziona con il dito (pointer events) e con il mouse.
 */
export function Tip({ tips, children }: { tips: TipRow[]; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [st, setSt] = useState<{ left: number; top: number; h: number; lines: string[]; flip: boolean } | null>(null);
  const move = (e: React.PointerEvent) => {
    const box = ref.current; if (!box || !tips.length) return;
    const svgs = box.querySelectorAll("svg.c");
    if (!svgs.length) return;
    const first = svgs[0].getBoundingClientRect(), last = svgs[svgs.length - 1].getBoundingClientRect(), b = box.getBoundingClientRect();
    const f = (e.clientX - first.left) / first.width;
    if (f < -0.02 || f > 1.02) { setSt(null); return; }
    let best = tips[0];
    for (const t of tips) if (Math.abs(t.x - f) < Math.abs(best.x - f)) best = t;
    const left = first.left - b.left + best.x * first.width;
    setSt({ left, top: first.top - b.top, h: last.bottom - first.top, lines: best.lines, flip: best.x > 0.55 });
  };
  return (
    <div ref={ref} className="chart" onPointerMove={move} onPointerDown={move} onPointerLeave={() => setSt(null)}>
      {children}
      {st && (
        <>
          <div className="cur" style={{ left: st.left, top: st.top, height: st.h }} aria-hidden="true" />
          <div className="tip" role="status" style={{ top: Math.max(0, st.top - 4), ...(st.flip ? { right: `calc(100% - ${st.left - 8}px)` } : { left: st.left + 8 }) }}>
            {st.lines.map((l, i) => <div key={i}>{l}</div>)}
          </div>
        </>
      )}
    </div>
  );
}
