"use client";
import { useEffect, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import { Empty } from "@/components/Head";

/**
 * Mappa con tre fondi: Mappa (OpenFreeMap, senza chiave), Satellite (MapTiler, solo se è impostata la chiave pubblica
 * NEXT_PUBLIC_MAPTILER_KEY, limitata al dominio dell'app) e Rilievo (OpenTopoMap). lines: tracciati già privati delle zone protette.
 * heat: mappa di calore per la vista d'insieme.
 */
type Layer = "map" | "sat" | "topo";
const SAT_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY ?? "";

export function TrackMap({ lines, heat = false, tall = false, color }: { lines: [number, number][][]; heat?: boolean; tall?: boolean; color?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("maplibre-gl").Map | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [layer, setLayer] = useState<Layer>("map");
  const layers: { k: Layer; label: string }[] = [{ k: "map", label: "Mappa" }, ...(SAT_KEY ? [{ k: "sat" as Layer, label: "Satellite" }] : []), { k: "topo", label: "Rilievo" }];

  useEffect(() => {
    if (!ref.current || !lines.length) return;
    let map: import("maplibre-gl").Map | undefined;
    let cancelled = false;
    (async () => {
      try {
        const ml = (await import("maplibre-gl")).default;
        if (cancelled || !ref.current) return;
        const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        map = new ml.Map({ container: ref.current, style: `https://tiles.openfreemap.org/styles/${dark ? "dark" : "positron"}`, attributionControl: { compact: true }, cooperativeGestures: false });
        mapRef.current = map;
        map.addControl(new ml.NavigationControl({ showCompass: false }), "bottom-right");
        const css = getComputedStyle(document.documentElement);
        const line = color ?? (css.getPropertyValue("--run").trim() || "#3F6FB5");
        map.on("load", () => {
          if (!map) return;
          if (SAT_KEY) {
            map.addSource("sat", { type: "raster", tiles: [`https://api.maptiler.com/tiles/satellite-v2/{z}/{x}/{y}.jpg?key=${SAT_KEY}`], tileSize: 256, maxzoom: 19, attribution: "© MapTiler © OpenStreetMap" });
            map.addLayer({ id: "sat", type: "raster", source: "sat", layout: { visibility: "none" } });
          }
          map.addSource("topo", { type: "raster", tiles: ["https://a.tile.opentopomap.org/{z}/{x}/{y}.png", "https://b.tile.opentopomap.org/{z}/{x}/{y}.png", "https://c.tile.opentopomap.org/{z}/{x}/{y}.png"], tileSize: 256, maxzoom: 17, attribution: "© OpenTopoMap (CC-BY-SA) © OpenStreetMap" });
          map.addLayer({ id: "topo", type: "raster", source: "topo", layout: { visibility: "none" } });
          const fc = { type: "FeatureCollection" as const, features: lines.map((c) => ({ type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: c.map(([la, lo]) => [lo, la]) } })) };
          map.addSource("t", { type: "geojson", data: fc });
          if (heat) {
            const pts = { type: "FeatureCollection" as const, features: lines.flatMap((c) => c.filter((_, i) => i % 3 === 0).map(([la, lo]) => ({ type: "Feature" as const, properties: {}, geometry: { type: "Point" as const, coordinates: [lo, la] } }))) };
            map.addSource("h", { type: "geojson", data: pts });
            map.addLayer({ id: "heat", type: "heatmap", source: "h", maxzoom: 15, paint: {
              "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 5, 3, 14, 14], "heatmap-opacity": 0.85,
              "heatmap-color": ["interpolate", ["linear"], ["heatmap-density"], 0, "rgba(0,0,0,0)", 0.2, "#9ED4C6", 0.5, "#4FB09C", 0.8, "#2F7F6E", 1, "#F2B93B"],
            } });
            map.addLayer({ id: "line", type: "line", source: "t", minzoom: 12, paint: { "line-color": line, "line-width": 2, "line-opacity": 0.75 } });
          } else {
            map.addLayer({ id: "casing", type: "line", source: "t", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": "#FFFFFF", "line-width": 6, "line-opacity": 0.9 } });
            map.addLayer({ id: "line", type: "line", source: "t", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": line, "line-width": 3.5 } });
            const first = lines[0][0], lastSeg = lines[lines.length - 1], last = lastSeg[lastSeg.length - 1];
            map.addSource("ends", { type: "geojson", data: { type: "FeatureCollection", features: [
              { type: "Feature", properties: { k: "a" }, geometry: { type: "Point", coordinates: [first[1], first[0]] } },
              { type: "Feature", properties: { k: "b" }, geometry: { type: "Point", coordinates: [last[1], last[0]] } },
            ] } });
            map.addLayer({ id: "ends", type: "circle", source: "ends", paint: { "circle-radius": 6, "circle-stroke-width": 2.5, "circle-stroke-color": "#FFFFFF", "circle-color": ["match", ["get", "k"], "a", "#2F7F6E", "#2E3D52"] } });
          }
          const all = lines.flat();
          let a = 90, b = 180, c = -90, d = -180;
          for (const [la, lo] of all) { a = Math.min(a, la); c = Math.max(c, la); b = Math.min(b, lo); d = Math.max(d, lo); }
          map.fitBounds([[b, a], [d, c]], { padding: 36, duration: 0, maxZoom: 15 });
        });
        map.on("error", (e) => {
          const m = String(e.error?.message ?? "");
          if (m.includes("Failed to fetch") || m.includes("403") || m.includes("401")) setErr(m.includes("maptiler") || m.includes("403") || m.includes("401") ? "Il satellite non risponde (chiave o limite mensile MapTiler): usa Mappa o Rilievo." : "Uno sfondo della mappa non è raggiungibile: controlla la connessione.");
        });
      } catch { setErr("La mappa non si è caricata."); }
    })();
    return () => { cancelled = true; mapRef.current = null; map?.remove(); };
  }, [lines, heat, color]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    for (const id of ["sat", "topo"]) if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", layer === id ? "visible" : "none");
    if (map.getLayer("casing")) map.setPaintProperty("casing", "line-opacity", layer === "map" ? 0.9 : 1);
  }, [layer]);

  if (!lines.length) return <Empty inline icon="map" title="Nessun tracciato GPS" text="Questa uscita è stata registrata senza GPS, oppure il file con il percorso non è ancora arrivato." />;
  return (
    <div style={{ position: "relative" }}>
            <div ref={ref} className={`map${tall ? " tall" : ""}`} role="region" aria-label={heat ? "Mappa di calore dei tracciati" : "Mappa del percorso"} />
      <div className="maplayer seg inline" role="group" aria-label="Sfondo della mappa">
        {layers.map((l) => <button key={l.k} type="button" aria-pressed={layer === l.k} onClick={() => setLayer(l.k)}>{l.label}</button>)}
      </div>
      {err && <p className="mapnote" role="status">{err}</p>}
    </div>
  );
}
