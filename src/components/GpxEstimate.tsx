"use client";
import { useState } from "react";
import { estimateRoute, type CurvePoint, type GpxPt } from "@/lib/mountain";

const hm = (s: number) => { const m = Math.round(s / 60); return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`; };
const nf = (v: number, d = 1) => v.toLocaleString("it-IT", { minimumFractionDigits: d, maximumFractionDigits: d });

/** Legge un GPX (traccia o rotta) nel browser: il file non esce dal telefono. */
function parseGpx(text: string): GpxPt[] {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  const nodes = [...doc.getElementsByTagName("trkpt"), ...doc.getElementsByTagName("rtept")];
  return nodes.map((n) => ({ lat: Number(n.getAttribute("lat")), lon: Number(n.getAttribute("lon")), ele: n.getElementsByTagName("ele")[0] ? Number(n.getElementsByTagName("ele")[0].textContent) : null }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
}

/** Stima dei tempi di un percorso futuro dalla tua curva velocità-pendenza. */
export function GpxEstimate({ curve }: { curve: CurvePoint[] }) {
  const [res, setRes] = useState<ReturnType<typeof estimateRoute> | null>(null);
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const onFile = async (f: File | undefined) => {
    setErr(null); setRes(null);
    if (!f) return;
    try {
      const pts = parseGpx(await f.text());
      if (pts.length < 10) { setErr("Nel file non ci sono abbastanza punti: serve una traccia GPX (da Komoot, Strava, Garmin o Outdooractive)."); return; }
      if (!pts.some((p) => p.ele !== null)) { setErr("La traccia non ha la quota: esportala con l'altitudine, altrimenti il dislivello non si può calcolare."); return; }
      setName(f.name.replace(/\.gpx$/i, ""));
      setRes(estimateRoute(pts, curve));
    } catch { setErr("File non leggibile: serve un GPX."); }
  };
  return (
    <div className="stack">
      <label className="fld">Traccia GPX del percorso
        <input className="in" type="file" accept=".gpx,application/gpx+xml" onChange={(e) => onFile(e.target.files?.[0])} />
      </label>
      {err && <p className="alert" role="alert">{err}</p>}
      {res && (
        <div aria-live="polite" className="stack">
          <p style={{ fontWeight: 600 }}>{name}: {hm(res.mid)} di cammino{res.slow - res.fast > 600 ? `, tra ${hm(res.fast)} e ${hm(res.slow)}` : ""}, soste escluse.</p>
          <dl className="kv">
            <dt className="note">Distanza</dt><dd className="mono">{nf(res.dist / 1000)} km</dd>
            <dt className="note">Dislivello</dt><dd className="mono">+{Math.round(res.gain)} m · −{Math.round(res.loss)} m</dd>
            <dt className="note">Km-sforzo</dt><dd className="mono">{nf(res.effort)}</dd>
            <dt className="note">Basato sui tuoi dati</dt><dd className="mono">{Math.round(res.coverage * 100)}% del percorso</dd>
          </dl>
          <p className="note">Veloce = come nelle tue giornate migliori, lento = come nelle più lente, sulle stesse pendenze. Dove non hai dati si usa la formula di Tobler. Aggiungi le soste (circa 10 minuti ogni ora) e controlla l&apos;ora del tramonto.</p>
        </div>
      )}
    </div>
  );
}
