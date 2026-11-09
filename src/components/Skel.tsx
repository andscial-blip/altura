/** Segnaposto di caricamento con la stessa forma del contenuto in arrivo (niente schermate vuote). */
const B = ({ h, w = "100%", r }: { h: number; w?: string | number; r?: number }) => <div className="skel" style={{ height: h, width: w, borderRadius: r }} />;

export function SkelPage({ kind }: { kind: "dash" | "list" | "detail" | "charts" | "plan" | "map" | "form" }) {
  return (
    <div className="stack-l" aria-busy="true" aria-label="Caricamento">
      <span className="sr" role="status">Caricamento…</span>
      {kind === "dash" ? (
        <div className="band-dark stack" style={{ minHeight: 230 }}><B h={14} w="30%" /><B h={24} w="55%" /><div className="kpis">{[0, 1, 2, 3].map((i) => <B key={i} h={96} r={12} />)}</div></div>
      ) : (
        <div className="stack" style={{ gap: 8 }}><B h={30} w="38%" /><B h={14} w="62%" /></div>
      )}
      {kind === "list" && (<><B h={44} r={999} w="70%" /><B h={66} r={12} /><div className="acards">{Array.from({ length: 9 }, (_, i) => <B key={i} h={102} r={14} />)}</div></>)}
      {kind === "dash" && (<div className="grid g2"><B h={220} r={14} /><B h={220} r={14} /><B h={160} r={14} /><B h={160} r={14} /></div>)}
      {kind === "detail" && (<><div className="kpis">{[0, 1, 2, 3].map((i) => <B key={i} h={84} r={12} />)}</div><B h={340} r={14} /><B h={260} r={14} /></>)}
      {kind === "charts" && (<><B h={44} r={12} w="50%" /><div className="kpis">{[0, 1, 2, 3].map((i) => <B key={i} h={84} r={12} />)}</div><B h={240} r={14} /><div className="grid g2"><B h={200} r={14} /><B h={200} r={14} /></div></>)}
      {kind === "plan" && (<><div className="kpis">{[0, 1, 2, 3].map((i) => <B key={i} h={84} r={12} />)}</div><B h={220} r={14} /><B h={320} r={14} /></>)}
      {kind === "map" && (<><B h={44} r={999} w="50%" /><B h={520} r={14} /></>)}
      {kind === "form" && (<><B h={180} r={14} /><div className="grid g2"><B h={220} r={14} /><B h={220} r={14} /></div></>)}
    </div>
  );
}
