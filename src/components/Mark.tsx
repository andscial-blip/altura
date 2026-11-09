/**
 * Marchio Altura, concept "Margine" variante pista (round 4): il bordo concavo è il tuo limite e una curva di pista
 * con due corsie, il punto giallo sei tu oggi. tone "ink": corpo blu notte e corsie verde acqua (fondi chiari);
 * tone "aqua": corpo verde acqua e corsie del colore del fondo (fondo bianco o blu notte).
 */
export function Mark({ size = 28, tone = "ink", lanes, animate = false }: { size?: number; tone?: "ink" | "aqua"; lanes?: string; animate?: boolean }) {
  const body = tone === "ink" ? "var(--ink)" : "#4FB09C";
  const lane = lanes ?? (tone === "ink" ? "#4FB09C" : "#FFFFFF");
  const id = `mk${size}${tone}`;
  return (
    <svg className="mk" width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <defs><clipPath id={id}><rect x="18" y="18" width="64" height="64" /></clipPath></defs>
      <path className={animate ? "body" : undefined} d="M18 18H34A48 48 0 0 0 82 66V82H18Z" fill={body} />
      <g clipPath={`url(#${id})`} fill="none" stroke={lane} strokeWidth="4">
        <circle className={animate ? "lane" : undefined} cx="82" cy="18" r="58" />
        <circle className={animate ? "lane" : undefined} cx="82" cy="18" r="68" />
      </g>
      <circle className={animate ? "dot" : undefined} cx="58" cy="42" r="10" fill="#F2B93B" />
    </svg>
  );
}

/** Logotipo disegnato (minuscolo, monolineare). */
export function Wordmark({ height = 32, color = "currentColor" }: { height?: number; color?: string }) {
  return (
    <svg height={height} viewBox="-2 12 214 72" role="img" aria-label="altura" style={{ width: "auto" }}>
      <g fill="none" stroke={color} strokeWidth="9">
        <circle cx="20" cy="60" r="15.5" />
        <path d="M35.5 40V80M54.5 16V80M75.5 26V80M65.5 44.5H85.5M97 40V60A15.5 15.5 0 0 0 128 60M128 40V80M146 80V60A15.5 15.5 0 0 1 161.5 44.5H164" />
        <circle cx="190" cy="60" r="15.5" />
        <path d="M205.5 40V80" />
      </g>
    </svg>
  );
}
