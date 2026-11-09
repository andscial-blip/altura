import { notFound } from "next/navigation";
import { activity } from "@/lib/queries";
import { publicTrack } from "@/lib/track";
import { dec, dur, int, km, pace, paceS, sportLabel, when, SOURCE_LABEL } from "@/lib/fmt";
import { ACTIVITY_FIELDS, mergeNorms, type Norm, type SourceId } from "@/lib/model";
import { compare, type Step } from "@/lib/runna-parse";
import { Profile } from "@/components/charts";
import { Src } from "@/components/Src";
import { TrackMap } from "@/components/TrackMap";

export const dynamic = "force-dynamic";

const FIELD_LABEL: Partial<Record<(typeof ACTIVITY_FIELDS)[number], string>> = {
  distance_m: "Distanza", moving_s: "Tempo in movimento", elapsed_s: "Tempo totale", elev_gain_m: "Dislivello positivo", avg_hr: "FC media", max_hr: "FC massima",
  avg_cadence: "Cadenza", avg_power: "Potenza media", training_load: "Carico di allenamento", name: "Nome", sport: "Disciplina",
};

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await activity(id);
  if (!d) notFound();
  const { a, sources, streams, laps, planned } = d;
  const s = streams?.streams ?? {};
  const track = await publicTrack(s.lat ?? [], s.lon ?? []);
  const isRun = ["run", "trail_run", "treadmill"].includes(a.sport);
  const { field_source } = mergeNorms(sources.map((x) => ({ source: x.source as SourceId, norm: x.norm as Norm })));
  const garmin = sources.find((x) => x.source === "garmin");
  const ex = (garmin?.extras ?? {}) as Record<string, number | null>;
  const runna = sources.find((x) => x.source === "runna")?.runna as { steps?: Step[]; segments?: [number, number][] } | null | undefined;
  const cmp = runna?.steps && runna.segments ? compare(runna.steps, runna.segments, planned?.km ? Number(planned.km) : null, planned ? [planned.duration_min_s, planned.duration_max_s] : null, a.distance_m ? Number(a.distance_m) / 1000 : null, a.moving_s ? Number(a.moving_s) : null) : null;

  const stats: [string, string][] = [
    ["Distanza", a.distance_m ? `${km(a.distance_m, 2)} km` : "–"],
    ["Tempo", dur(a.moving_s ?? a.elapsed_s)],
    [isRun ? "Passo medio" : "Velocità", a.distance_m ? (isRun || a.sport === "hike" || a.sport === "walk" ? `${pace(a.distance_m, a.moving_s ?? a.elapsed_s)} /km` : `${dec((Number(a.distance_m) / Number(a.moving_s ?? a.elapsed_s)) * 3.6)} km/h`) : "–"],
    ["Dislivello", a.elev_gain_m ? `${int(a.elev_gain_m)} m` : "–"],
    ["FC media / max", a.avg_hr ? `${int(a.avg_hr)} / ${int(a.max_hr)}` : "–"],
    ["Carico", a.training_load ? int(a.training_load) : "–"],
  ];
  if (ex.gap_mps) stats.push(["Passo corretto per la pendenza", `${paceS(1000 / ex.gap_mps)} /km`]);
  if (ex.vo2max) stats.push(["VO2max stimato da Garmin", dec(ex.vo2max)]);
  if (ex.te_aerobic) stats.push(["Effetto allenante aerobico", dec(ex.te_aerobic)]);

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="head">
        <div><h1>{a.name ?? sportLabel(a.sport)}</h1><p>{sportLabel(a.sport)}, {when(a.start_utc)}{a.is_race ? ", gara" : ""}</p></div>
        <div className="row">{sources.map((x) => <Src key={x.source} s={x.source} />)}</div>
      </div>

      <section className="grid g3">{stats.map(([l, v]) => <div key={l} className="panel metric"><div className="l">{l}</div><div className="v" style={{ fontSize: "1.375rem" }}>{v}</div></div>)}</section>

      {track.length > 0 && <section className="panel"><h2>Percorso</h2><TrackMap lines={track} /><p className="note" style={{ marginTop: 8 }}>Le zone private impostate sono escluse dalla mappa.</p></section>}

      {(s.alt?.length || s.hr?.length) && s.dist ? (
        <section className="grid g2">
          {s.alt && <div className="panel"><h2>Altimetria</h2><Profile xs={s.dist} ys={s.alt} unit="m" color="var(--s2)" /></div>}
          {s.hr && <div className="panel"><h2>Battito</h2><Profile xs={s.dist} ys={s.hr} unit="bpm" color="var(--s1)" /></div>}
        </section>
      ) : null}

      {planned && (
        <section className="panel">
          <h2>Seduta Runna: {planned.title}</h2>
          {cmp ? (
            <>
              <p>Esito: <b>{String(cmp.verdict)}</b>{typeof cmp.km_diff_pct === "number" ? `, distanza ${cmp.km_diff_pct > 0 ? "+" : ""}${dec(cmp.km_diff_pct)}% rispetto al previsto` : ""}.</p>
              {cmp.work.length > 0 && (
                <div className="scroll-x"><table className="t" style={{ marginTop: 10 }}>
                  <thead><tr><th>Ripetuta</th><th className="r">Metri</th><th className="r">Passo</th><th className="r">Obiettivo</th><th>Esito</th></tr></thead>
                  <tbody>{cmp.work.map((w, i) => <tr key={i}><td>{i + 1}</td><td className="r">{w.m}</td><td className="r">{paceS(w.pace)}</td><td className="r">{paceS(w.lo)}–{paceS(w.hi)}</td><td><span className={`state ${w.ok ? "ok" : "warn"}`}>{w.ok ? "nel ritmo" : w.fast ? "più veloce" : "più lenta"}</span></td></tr>)}</tbody>
                </table></div>
              )}
              <p className="note" style={{ marginTop: 8 }}>Metodo: i passi prescritti nel calendario Runna vengono confrontati in ordine con i segmenti registrati da Runna; tolleranza di 3 s/km oltre la forbice indicata (5 s/km se Runna non dà una forbice). {cmp.notes.join(" ")}</p>
            </>
          ) : <p className="note">Seduta abbinata; i segmenti Runna non sono disponibili per il confronto ripetuta per ripetuta.</p>}
        </section>
      )}

      {laps.length > 0 && (
        <section className="panel scroll-x">
          <h2>Giri</h2>
          <table className="t">
            <thead><tr><th>Giro</th><th className="r">Distanza</th><th className="r">Tempo</th><th className="r">Passo</th><th className="r">FC</th><th className="r">Cadenza</th><th className="r">D+</th></tr></thead>
            <tbody>{laps.map((l) => <tr key={l.idx}><td>{l.idx + 1}</td><td className="r">{km(l.distance_m, 2)}</td><td className="r">{dur(l.duration_s)}</td><td className="r">{pace(l.distance_m, l.duration_s)}</td><td className="r">{int(l.avg_hr)}</td><td className="r">{int(l.avg_cadence)}</td><td className="r">{int(l.elev_gain_m)}</td></tr>)}</tbody>
          </table>
        </section>
      )}

      <section className="panel scroll-x">
        <h2>Da dove arrivano i dati</h2>
        <p className="note" style={{ marginBottom: 10 }}>Per ogni campo vale la fonte più affidabile che lo fornisce: correzione manuale, poi Garmin (il dispositivo che misura), poi Strava, poi Apple Salute. I record originali di ogni fonte restano conservati e non vengono mai modificati.</p>
        <table className="t">
          <thead><tr><th>Campo</th><th>Valore usato</th>{sources.map((x) => <th key={x.source}>{SOURCE_LABEL[x.source]}</th>)}</tr></thead>
          <tbody>
            {(Object.keys(FIELD_LABEL) as (keyof typeof FIELD_LABEL)[]).filter((f) => sources.some((x) => x.norm[f] !== null && x.norm[f] !== undefined)).map((f) => (
              <tr key={f}><td>{FIELD_LABEL[f]}</td><td>{field_source[f] ? SOURCE_LABEL[field_source[f]!] : "–"}</td>{sources.map((x) => <td key={x.source}>{x.norm[f] === null || x.norm[f] === undefined ? "–" : String(x.norm[f])}</td>)}</tr>
            ))}
            <tr><td>Acquisizione</td><td></td>{sources.map((x) => <td key={x.source}>{x.acquisition}, {when(x.fetched_at)}</td>)}</tr>
          </tbody>
        </table>
      </section>
    </div>
  );
}
