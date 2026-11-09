import Link from "next/link";
import { activities, latestDaily, lastSyncs, planned, weekly } from "@/lib/queries";
import { ago, day, dec, dur, hm, int, km, KIND_LABEL, pace, sportLabel, todayLocal, SOURCE_LABEL } from "@/lib/fmt";
import { Src } from "@/components/Src";
import { SyncOnOpen } from "@/components/SyncOnOpen";

export const dynamic = "force-dynamic";

const HEALTH = ["resting_hr", "hrv_night", "hrv_baseline_low", "hrv_baseline_high", "sleep_s", "sleep_score", "body_battery_high", "stress_avg", "steps"];

function addDays(d: string, n: number) { const x = new Date(d + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }

export default async function Oggi() {
  const today = todayLocal();
  const [health, recent, plan, syncs, wk] = await Promise.all([
    latestDaily(HEALTH), activities({ limit: 4 }), planned(addDays(today, -1), addDays(today, 7)), lastSyncs(), weekly(1),
  ]);
  const h = Object.fromEntries(health.map((r) => [r.metric, r]));
  const next = plan.filter((p) => p.day >= today && p.state === "programmato");
  const todays = plan.filter((p) => p.day === today);
  const thisWeek = wk.filter((r) => r.week >= addDays(today, -6));
  const runKm = thisWeek.filter((r) => r.fam === "corsa").reduce((a, r) => a + r.dist_m, 0);
  const gain = thisWeek.reduce((a, r) => a + r.gain_m, 0);
  const hrv = h.hrv_night ? Number(h.hrv_night.value) : null;
  const lo = h.hrv_baseline_low ? Number(h.hrv_baseline_low.value) : null, hi = h.hrv_baseline_high ? Number(h.hrv_baseline_high.value) : null;
  const hrvPos = hrv !== null && lo !== null && hi !== null ? (hrv < lo ? "sotto la tua fascia abituale" : hrv > hi ? "sopra la tua fascia abituale" : "dentro la tua fascia abituale") : null;

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div className="head">
        <div>
          <h1>{day(today, { weekday: "long", day: "numeric", month: "long" })}</h1>
          <p>{todays.length ? `Oggi in programma: ${todays.map((t) => t.title).join(", ")}` : next[0] ? `Prossima seduta: ${next[0].title}, ${day(next[0].day)}` : "Nessuna seduta in programma nei prossimi giorni."}</p>
        </div>
        <SyncOnOpen />
      </div>

      <section className="grid g4" aria-label="Recupero">
        <Metric label="Variabilità cardiaca notturna" v={h.hrv_night} unit="ms" note={hrvPos ?? undefined} />
        <Metric label="Battito a riposo" v={h.resting_hr} unit="bpm" />
        <Metric label="Sonno" v={h.sleep_s} fmt={(x) => hm(x)} note={h.sleep_score ? `punteggio ${int(h.sleep_score.value)}` : undefined} />
        <Metric label="Body Battery massima" v={h.body_battery_high} unit="" note={h.stress_avg ? `stress medio ${int(h.stress_avg.value)}` : undefined} />
      </section>

      <section className="grid g2">
        <div className="panel">
          <div className="row between"><h2>Ultime attività</h2><Link href="/attivita" className="note">Tutte</Link></div>
          {recent.length ? (
            <div className="stack" style={{ gap: 0 }}>
              {recent.map((a) => (
                <Link key={a.id} href={`/attivita/${a.id}`} className="list-link" style={{ padding: "10px 0", borderTop: "1px solid var(--line)" }}>
                  <div className="row between"><span className="ttl" style={{ fontWeight: 500 }}>{a.name ?? sportLabel(a.sport)}</span><span className="note">{day(a.start_utc)}</span></div>
                  <div className="row note" style={{ gap: 14 }}>
                    <span>{sportLabel(a.sport)}</span>
                    {a.distance_m && <span>{km(a.distance_m)} km</span>}
                    <span>{dur(a.moving_s ?? a.elapsed_s)}</span>
                    {a.distance_m && ["run", "trail_run", "treadmill"].includes(a.sport) && <span>{pace(a.distance_m, a.moving_s ?? a.elapsed_s)} /km</span>}
                    {a.elev_gain_m && Number(a.elev_gain_m) > 20 && <span>{int(a.elev_gain_m)} m D+</span>}
                  </div>
                </Link>
              ))}
            </div>
          ) : <p className="empty">Nessuna attività ancora. Arriveranno con la prima sincronizzazione Garmin.</p>}
        </div>
        <div className="panel">
          <div className="row between"><h2>Prossimi giorni</h2><Link href="/piano" className="note">Piano</Link></div>
          {next.length ? next.slice(0, 5).map((p) => (
            <div key={p.key} style={{ padding: "10px 0", borderTop: "1px solid var(--line)" }}>
              <div className="row between"><span style={{ fontWeight: 500 }}>{p.title}</span><span className="note">{day(p.day)}</span></div>
              <div className="row note" style={{ gap: 14 }}>{p.km && <span>{dec(p.km)} km</span>}{p.duration_min_s && <span>{hm(p.duration_min_s)}–{hm(p.duration_max_s)}</span>}<Src s="runna" /></div>
            </div>
          )) : <p className="empty">Nessuna seduta Runna in arrivo, oppure il calendario Runna non è ancora collegato.</p>}
          <p className="note" style={{ marginTop: 12 }}>Da lunedì: {km(runKm)} km di corsa, {int(gain)} m di dislivello.</p>
        </div>
      </section>

      <section className="panel">
        <h2>Fonti</h2>
        <table className="t">
          <thead><tr><th>Fonte</th><th>Ultima sincronizzazione</th><th>Esito</th></tr></thead>
          <tbody>
            {["garmin", "runna", "apple_health", "strava"].map((s) => {
              const r = syncs.find((x) => x.source === s);
              return (
                <tr key={s}>
                  <td>{SOURCE_LABEL[s]}</td>
                  <td>{r ? ago(r.started_at) : "mai"}</td>
                  <td>{r ? <span className={`state ${r.status === "ok" ? "ok" : r.status === "error" ? "bad" : "warn"}`}>{r.status === "ok" ? "riuscita" : r.status === "partial" ? "parziale" : r.status === "running" ? "in corso" : "errore"}</span> : <span className="state">non collegata</span>}{r?.message && r.message !== "ok" ? <div className="note">{r.message}</div> : null}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Metric({ label, v, unit, fmt, note }: { label: string; v?: { value: string; source: string; day: string; kind: string }; unit?: string; fmt?: (x: number) => string; note?: string }) {
  return (
    <div className="panel metric">
      <div className="l">{label}</div>
      {v ? (
        <>
          <div><span className="v">{fmt ? fmt(Number(v.value)) : dec(v.value, Number(v.value) % 1 ? 1 : 0)}</span>{unit ? <span className="u">{unit}</span> : null}</div>
          {note && <div className="note">{note}</div>}
          <div className="row" style={{ gap: 8, marginTop: 6 }}><Src s={v.source} extra={day(v.day, { day: "numeric", month: "short" })} /><span className="kind">{KIND_LABEL[v.kind]}</span></div>
        </>
      ) : <div className="note" style={{ marginTop: 6 }}>Nessun dato negli ultimi 10 giorni.</div>}
    </div>
  );
}
