/** Set di icone di Altura: tratto 1,8 px, angoli arrotondati, 24×24. Decorative per default (aria-hidden). */
const P: Record<string, React.ReactNode> = {
  run: <><circle cx="14.5" cy="4.5" r="1.8" /><path d="M8.5 21l2.6-5.4 3.1 2.4V21M11.1 15.6l1.6-6.1-3.6 1.6L7.6 14M12.7 9.5l2.3 3.1 3.5.6" /></>,
  hike: <><path d="M3 20l6.5-11 4 6.5 2.5-3.5L21 20z" /><path d="M13 9V3.5l3 1.2-3 1.3" /></>,
  walk: <><circle cx="12.5" cy="4.5" r="1.8" /><path d="M9.5 21l2-6 2.5 2v4M11.5 15l.8-5.5-2.8 1.8-.8 3M12.3 9.5l1.7 2.8 2.5.7" /></>,
  swim: <><path d="M3 17c1.5 0 1.5-1 3-1s1.5 1 3 1 1.5-1 3-1 1.5 1 3 1 1.5-1 3-1 1.5 1 3 1" /><circle cx="16.5" cy="8" r="1.8" /><path d="M6 13.5l4-4 3 2.5 3-1" /></>,
  ride: <><circle cx="6" cy="16.5" r="3.5" /><circle cx="18" cy="16.5" r="3.5" /><path d="M6 16.5l4-7h5l3 7M10 9.5l2.5 7M13.5 6.5h2.5" /></>,
  strength: <path d="M3 9.5v5M6 7v10M18 7v10M21 9.5v5M6 12h12" />,
  ski: <><circle cx="15" cy="4.5" r="1.8" /><path d="M4 20l16-4M8 13l4-3 3 3-2 4M12 10l1-3" /></>,
  yoga: <><circle cx="12" cy="5" r="1.8" /><path d="M5 19h14M12 8v6l-4 3M12 14l4 3M7 10l5 1 5-1" /></>,
  other: <><circle cx="12" cy="12" r="8.5" /><path d="M8 12h8M12 8v8" /></>,
  quality: <path d="M13 3L5 14h6l-1 7 8-11h-6z" />,
  hills: <path d="M3 19h6l6-12h6" />,
  long: <path d="M4 12h12M12 6l6 6-6 6" />,
  test: <><circle cx="12" cy="13" r="7.5" /><path d="M12 13l3-3M10 3h4" /></>,
  race: <path d="M5 21V4M5 4h11l-2 4 2 4H5" />,
  home: <path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z" />,
  activity: <path d="M3 17l5-6 4 3 4-7 5 10" />,
  chart: <path d="M5 20V10M12 20V4M19 20v-7" />,
  heart: <path d="M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z" />,
  calendar: <path d="M5 5h14v15H5zM5 9h14M9 3v4M15 3v4" />,
  map: <path d="M9 4l-5 2v14l5-2 6 2 5-2V4l-5 2zM9 4v14M15 6v14" />,
  target: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" /></>,
  chat: <path d="M4 5h16v11H9l-5 4z" />,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" /></>,
  hrv: <path d="M3 12h4l2-5 3 10 2-5h7" />,
  sleep: <path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z" />,
  battery: <><rect x="3" y="7" width="16" height="10" rx="2" /><path d="M21 10.5v3M6.5 10v4M9.5 10v4" /></>,
  load: <path d="M4 17a8 8 0 1116 0M12 17l4-5" />,
  steps: <path d="M7 4c1.7 0 2.5 2 2.5 4.5S8.7 13 7 13s-2.5-2-2.5-4.5S5.3 4 7 4zM17 9c1.7 0 2.5 2 2.5 4.5S18.7 18 17 18s-2.5-2-2.5-4.5S15.3 9 17 9zM5 16h4M15 21h4" />,
  layers: <><path d="M12 4l9 5-9 5-9-5z" /><path d="M3 14l9 5 9-5" /></>,
  mountain: <path d="M3 19l6-10 4 6 3-4 5 8z" />,
  back: <path d="M15 5l-7 7 7 7" />,
  next: <path d="M9 5l7 7-7 7" />,
  down: <path d="M6 9l6 6 6-6" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  sync: <path d="M20 11a8 8 0 00-14.5-4.5L4 8M4 4v4h4M4 13a8 8 0 0014.5 4.5L20 16M20 20v-4h-4" />,
  trend: <path d="M4 18l5-5 4 3 7-8M15 8h5v5" />,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  gain: <path d="M3 19l6-8 4 4 8-10M15 5h6v6" />,
  distance: <path d="M4 18c3 0 3-12 8-12s5 12 8 12M4 18h2M18 18h2" />,
};

export type IconName = keyof typeof P;

export function Icon({ name, size = 20, stroke = 1.8, color = "currentColor", label }: { name: string; size?: number; stroke?: number; color?: string; label?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden={label ? undefined : true} role={label ? "img" : undefined} aria-label={label} style={{ flex: "none" }}>
      {P[name] ?? P.other}
    </svg>
  );
}

/** Sport → icona, classe colore e famiglia. */
export function sportMeta(sport: string): { icon: string; cls: string; fam: "corsa" | "montagna" | "nuoto" | "bici" | "forza" | "altro" } {
  switch (sport) {
    case "run": case "trail_run": case "treadmill": return { icon: "run", cls: "sp-run", fam: "corsa" };
    case "hike": return { icon: "hike", cls: "sp-mnt", fam: "montagna" };
    case "walk": return { icon: "walk", cls: "sp-mnt", fam: "montagna" };
    case "swim": return { icon: "swim", cls: "sp-swim", fam: "nuoto" };
    case "ride": return { icon: "ride", cls: "sp-ride", fam: "bici" };
    case "strength": return { icon: "strength", cls: "sp-str", fam: "forza" };
    case "ski": return { icon: "ski", cls: "sp-oth", fam: "altro" };
    case "yoga": return { icon: "yoga", cls: "sp-oth", fam: "altro" };
    default: return { icon: "other", cls: "sp-oth", fam: "altro" };
  }
}

export function SportIcon({ sport, size = 40 }: { sport: string; size?: number }) {
  const m = sportMeta(sport);
  return <span className={`sp ${m.cls}${size <= 32 ? " sm" : ""}`} style={size !== 40 && size !== 32 ? { width: size, height: size } : undefined}><Icon name={m.icon} size={Math.round(size * 0.52)} /></span>;
}

/** Icona per il tipo di seduta Runna. */
export function sessionIcon(type: string): { icon: string; cls: string } {
  switch (type) {
    case "qualita": return { icon: "quality", cls: "sp-ride" };
    case "lungo": return { icon: "long", cls: "sp-run" };
    case "gara": return { icon: "race", cls: "sp-ride" };
    case "test": return { icon: "test", cls: "sp-ride" };
    case "forza": return { icon: "strength", cls: "sp-str" };
    default: return { icon: "run", cls: "sp-run" };
  }
}
