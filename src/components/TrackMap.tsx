"use client";
import { useEffect, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";

/** Mappa OpenFreeMap (gratuita, senza chiave). lines: tracciati già privati delle zone protette. heat: punti per la mappa di calore. */
export function TrackMap({ lines, heat = false, height }: { lines: [number, number][][]; heat?: boolean; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!ref.current || !lines.length) return;
    let map: import("maplibre-gl").Map | undefined;
    let cancelled = false;
    (async () => {
      try {
        const ml = (await import("maplibre-gl")).default;
        if (cancelled || !ref.current) return;
        const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        map = new ml.Map({ container: ref.current, style: `https://tiles.openfreemap.org/styles/${dark ? "dark" : "positron"}`, attributionControl: { compact: true } });
        map.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");
        const css = getComputedStyle(document.documentElement);
        const accent = css.getPropertyValue("--s1").trim() || "#C4675A";
        map.on("load", () => {
          if (!map) return;
          const fc = { type: "FeatureCollection" as const, features: lines.map((c) => ({ type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: c.map(([la, lo]) => [lo, la]) } })) };
          map.addSource("t", { type: "geojson", data: fc });
          if (heat) {
            const pts = { type: "FeatureCollection" as const, features: lines.flatMap((c) => c.filter((_, i) => i % 3 === 0).map(([la, lo]) => ({ type: "Feature" as const, properties: {}, geometry: { type: "Point" as const, coordinates: [lo, la] } }))) };
            map.addSource("h", { type: "geojson", data: pts });
            map.addLayer({ id: "heat", type: "heatmap", source: "h", maxzoom: 15, paint: {
              "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 5, 3, 14, 14], "heatmap-opacity": 0.85,
              "heatmap-color": ["interpolate", ["linear"], ["heatmap-density"], 0, "rgba(0,0,0,0)", 0.2, "#8FB3E0", 0.5, "#3F78C0", 0.8, "#C4675A", 1, "#F6C6A6"],
            } });
            map.addLayer({ id: "line", type: "line", source: "t", minzoom: 13, paint: { "line-color": accent, "line-width": 2, "line-opacity": 0.7 } });
          } else {
            map.addLayer({ id: "line", type: "line", source: "t", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": accent, "line-width": 3.5 } });
          }
          const all = lines.flat();
          let a = 90, b = 180, c = -90, d = -180;
          for (const [la, lo] of all) { a = Math.min(a, la); c = Math.max(c, la); b = Math.min(b, lo); d = Math.max(d, lo); }
          map.fitBounds([[b, a], [d, c]], { padding: 36, duration: 0, maxZoom: 15 });
        });
        map.on("error", (e) => { if (String(e.error?.message ?? "").includes("Failed to fetch")) setErr("Mappa non raggiungibile in questo momento."); });
      } catch { setErr("La mappa non si è caricata."); }
    })();
    return () => { cancelled = true; map?.remove(); };
  }, [lines, heat]);
  if (!lines.length) return <p className="empty">Nessun tracciato GPS per questa attività.</p>;
  return <>{err && <p className="note">{err}</p>}<div ref={ref} className="map" style={height ? { height } : undefined} role="img" aria-label="Mappa del percorso" /></>;
}
