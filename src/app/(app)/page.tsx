import Link from "next/link";
import { activities, dailyLoad, dailyMulti, goals, lastSyncs, periodActs, planned, runBests } from "@/lib/queries";
import { thumbs } from "@/lib/track";
import { acwr, acwrZone } from "@/lib/analytics";
import { isNum, mean, riegel, validDaily } from "@/lib/stats";
import { addDays, daysBetween, range } from "@/lib/dates";
import { ago, day, dec, dur, hm, int, km, SOURCE_LABEL, todayLocal } from "@/lib/fmt";
import { Gauge, Spark, StackBars } from "@/components/charts";
import { Card, Kpi, Legend, MobileTools } from "@/components/Head";
import { ActCard, FAM_LABEL, SPORT_COLOR, StructBar } from "@/components/Act";
import { Icon, sessionIcon, sportMeta } from "@/components/Icon";
import { SyncOnOpen } from "@/components/SyncOnOpen";

export const dynamic = "force-dynamic";

const M = ["hrv_night", "hrv_baseline_low", "hrv_baseline_high", "resting_hr", "sleep_s", "sleep_score", "body_battery_high", "body_battery_low", "stress_avg"];

export default async function Oggi() {
  const today = todayLocal();
  const [dm, load, plan, gl, recent, syncs, week, bests] = await Promise.all([
    dailyMulti(M, 30), dailyLoad(60), planned(today, addDays(today, 200)), goals(true), activities({ limit: 4 }), lastSyncs(), periodActs(addDays(today, -6)), runBests(90),
  ]);
  const th = await thumbs(recent.map((a) => a.id));

  // serie giornaliere pulite (valori "dato insufficiente" di Garmin esclusi)
  const days14 = range(addDays(today, -13), today);
  const ser = (m: string) => days14.map((d) => validDaily(m, dm[m].find((p) => p.day === d)?.value ?? null));
  const last = (m: string) => { const v = dm[m].filter((p) => validDaily(m, p.value) !== null); return v[v.length - 1] ?? null; };
  const hrv = last("hrv_night"), lo = last("hrv_baseline_low"), hi = last("hrv_baseline_high");
  const rhr = last("resting_hr"), sleep = last("sleep_s"), bb = last("body_battery_high");
  const prev7 = (m: string) => mean(ser(m).slice(0, 13).slice(-7));
  const hrvIn = hrv && lo && hi ? (hrv.value < lo.value ? "sotto la fascia" : hrv.value > hi.value ? "sopra la fascia" : "nella fascia") : null;
  const fresh = (p: { day: string } | null) => (p && p.day !== today ? `del ${day(p.day, { day: "numeric", month: "short" })}` : "oggi");

  // carico acuto/cronico
  const L = acwr(load.map((d) => d.load));
  const ratio = L.ratio.at(-1) ?? null;
  const zone = acwrZone(ratio);

  // prossima seduta e obiettivo
  const next = plan.find((p) => p.state === "programmato" && p.day >= today) ?? null;
  const race = gl.find((g) => g.kind === "gara" && g.target_date && g.target_date >= today) ?? gl.find((g) => g.target_date && g.target_date >= today) ?? null;
  const daysTo = race?.target_date ? daysBetween(today, race.target_date) : null;
  const planWeeks = Math.max(0, ...plan.map((p) => p.week ?? 0));
  const curWeek = plan.find((p) => p.day >= today)?.week ?? null;
  // previsione di Riegel dal miglior 10 km (o 5 km) degli ultimi 90 giorni
  const b10 = bests.filter((b) => isNum(b.s10)).sort((a, b) => a.s10! - b.s10!)[0];
  const b5 = bests.filter((b) => isNum(b.s5)).sort((a, b) => a.s5! - b.s5!)[0];
  const base = b10 ? { t: b10.s10!, d: 10000, label: "10 km" } : b5 ? { t: b5.s5!, d: 5000, label: "5 km" } : null;
  const tgtDist = race?.target.dist_m ?? null;
  const pred = base && tgtDist ? riegel(base.t, base.d, tgtDist) : null;

  // ultimi 7 giorni per disciplina
  const days7 = range(addDays(today, -6), today);
  const fams = [...new Set(week.map((a) => sportMeta(a.sport).fam))];
  const stacks = fams.map((f) => ({ name: FAM_LABEL[f] ?? f, color: SPORT_COLOR[f] ?? "var(--oth)", values: days7.map((d) => week.filter((a) => a.day === d && sportMeta(a.sport).fam === f).reduce((s, a) => s + a.time, 0) / 60) }));
  const wTime = week.reduce((s, a) => s + a.time, 0), wDist = week.reduce((s, a) => s + a.dist, 0), wGain = week.reduce((s, a) => s + a.gain, 0);

  const syncErr = syncs.filter((s) => s.status === "error");
  const st = next ? sessionIcon(next.type) : null;

  return (
    <div className="stack-l">
      <section className="band-dark" aria-label="Stato di oggi">
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 12, alignItems: "start" }}>
          <div style={{ minWidth: 0 }}>
            <p className="date">{day(today, { weekday: "long", day: "numeric", month: "long" })}</p>
            <h1>{next?.day === today ? next.title : hrvIn === "sotto la fascia" ? "Recupero sotto la tua norma" : "Oggi"}</h1>
          </div>
          <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}><SyncOnOpen variant="icon" /><MobileTools /></div>
        </div>
        <div className="status">
          {hrvIn && <span><i className={hrvIn === "nella fascia" ? "" : "warn"} />Variabilità {hrvIn}</span>}
          {ratio !== null && <span><i className={zone.cls === "ok" ? "" : "warn"} />{zone.label[0].toUpperCase() + zone.label.slice(1)}</span>}
          <span><i className={syncErr.length ? "warn" : ""} />{syncErr.length ? `Errore da ${syncErr.map((s) => SOURCE_LABEL[s.source]).join(", ")}` : `Dati aggiornati ${ago(syncs.map((s) => s.finished_at ?? s.started_at).sort().at(-1))}`}</span>
        </div>
        <div className="kpis">
          <Kpi dark label="Variabilità notte" icon="hrv" value={hrv ? int(hrv.value) : "–"} unit="ms" foot={lo && hi ? `fascia ${int(lo.value)}–${int(hi.value)}` : fresh(hrv)}><Spark values={ser("hrv_night")} /></Kpi>
          <Kpi dark label="Battito a riposo" icon="heart" value={rhr ? int(rhr.value) : "–"} unit="bpm" foot={fresh(rhr)}
            delta={rhr && prev7("resting_hr") !== null ? (() => { const d = rhr.value - prev7("resting_hr")!; return { text: `${d > 0 ? "▲" : d < 0 ? "▼" : "="} ${dec(Math.abs(d), 0)} vs 7 gg`, dir: Math.abs(d) < 1 ? "ne" : d < 0 ? "up" : "dn" }; })() : null}><Spark values={ser("resting_hr")} /></Kpi>
          <Kpi dark label="Sonno" icon="sleep" value={sleep ? hm(sleep.value) : "–"} foot={last("sleep_score") ? `punteggio ${int(last("sleep_score")!.value)}` : fresh(sleep)}><Spark values={ser("sleep_s")} /></Kpi>
          <Kpi dark label="Body Battery max" icon="battery" value={bb ? int(bb.value) : "–"} foot={last("body_battery_low") ? `minimo ${int(last("body_battery_low")!.value)}` : fresh(bb)}><Spark values={ser("body_battery_high")} /></Kpi>
        </div>
      </section>

      {race && daysTo !== null && (
        <section className="card goal" aria-label="Obiettivo">
          <div className="row between" style={{ alignItems: "flex-start" }}>
            <div style={{ minWidth: 0 }}>
              <p className="note" style={{ fontWeight: 600 }}><Icon name={race.kind === "test" ? "test" : "race"} size={14} /> {race.kind === "test" ? "Test" : "Gara"} · {day(race.target_date!, { day: "numeric", month: "long", year: "numeric" })}</p>
              <h2 style={{ fontSize: "1.0625rem", marginTop: 4 }}>{race.name}</h2>
              <p className="note" style={{ marginTop: 4 }}>
                Obiettivo Runna {race.target.time_min_s && race.target.time_max_s && race.target.time_min_s !== race.target.time_max_s ? `${dur(race.target.time_min_s)}–${dur(race.target.time_max_s)}` : race.target.time_s ? dur(race.target.time_s) : ""}
                {pred && base ? ` · previsione oggi ${dur(pred)} (dal tuo miglior ${base.label})` : ""}
              </p>
            </div>
            <div className="count">{daysTo}<small>giorni</small></div>
          </div>
          {planWeeks > 0 && curWeek && (
            <>
              <div className="goalbar" role="img" style={{ gridTemplateColumns: `repeat(${planWeeks}, minmax(0, 1fr))` }} aria-label={`Settimana ${curWeek} di ${planWeeks} del piano`}>
                {Array.from({ length: planWeeks }, (_, i) => <i key={i} className={i + 1 < curWeek ? "d" : i + 1 === curWeek ? "now" : undefined} />)}
              </div>
              <div className="row between note" style={{ marginTop: 6 }}><span>Settimana {curWeek} di {planWeeks}</span><Link href="/obiettivi">Obiettivi</Link></div>
            </>
          )}
        </section>
      )}

      <div className="grid g2">
        <Card title="Prossima seduta" icon="calendar" aside={<Link href="/piano">Piano</Link>}>
          {next ? (
            <div className="stack">
              <div className="row" style={{ flexWrap: "nowrap" }}>
                {st && <span className={`sp ${st.cls}`}><Icon name={st.icon} size={20} /></span>}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{next.title}</div>
                  <div className="note">{next.day === today ? "Oggi" : day(next.day)}{next.km ? ` · ${dec(next.km)} km` : ""}{next.duration_min_s ? ` · ${hm(next.duration_min_s)}–${hm(next.duration_max_s)}` : ""}</div>
                </div>
              </div>
              <StructBar steps={next.structure?.steps} />
              {next.structure?.steps?.length ? <Legend items={[{ label: "Riscaldamento e defaticamento", color: "var(--z1)" }, { label: "Lavoro", color: "var(--z4)" }, { label: "Facile", color: "var(--z2)" }]} /> : null}
            </div>
          ) : <p className="empty">Nessuna seduta Runna in programma.</p>}
        </Card>
        <Card title="Carico" icon="load" aside="7 giorni su 28">
          <div className="row" style={{ flexWrap: "nowrap", alignItems: "center" }}>
            <Gauge value={ratio} lo={0.4} hi={2} bandLo={0.8} bandHi={1.3} label={`Rapporto carico acuto/cronico ${ratio === null ? "non disponibile" : dec(ratio, 2)}`} />
            <div>
              <div className="row" style={{ gap: 8 }}><span className="mono" style={{ fontSize: "1.375rem" }}>{ratio === null ? "–" : dec(ratio, 2)}</span><span className={`badge ${zone.cls}`}>{zone.label}</span></div>
              <p className="note" style={{ marginTop: 6 }}>Media del carico Garmin degli ultimi 7 giorni divisa per quella degli ultimi 28. Fascia verde 0,8–1,3: aumento graduale.</p>
            </div>
          </div>
        </Card>
      </div>

      <Card title="Ultimi 7 giorni" icon="activity" aside={`${hm(wTime)} · ${km(wDist, 0)} km · ${int(wGain)} m D+`}>
        {week.length ? (
          <>
            <StackBars cats={days7} stacks={stacks} fmt={(v) => `${int(v)}`} unit="min" height={110} label="Minuti di allenamento al giorno, ultimi 7 giorni" catLabel={(d) => day(d, { weekday: "short", day: "numeric" })} highlight={6} />
            <Legend items={stacks.map((s) => ({ label: s.name, color: s.color }))} />
          </>
        ) : <p className="empty">Nessuna attività negli ultimi 7 giorni.</p>}
      </Card>

      <section>
        <div className="row between" style={{ marginBottom: 10 }}><h2>Recenti</h2><Link href="/attivita" className="note">Tutte le attività</Link></div>
        {recent.length ? <div className="acards">{recent.map((a) => <ActCard key={a.id} a={a} path={th[a.id]} compact />)}</div> : <p className="empty">Nessuna attività ancora.</p>}
      </section>

      <details className="card more">
        <summary>Fonti dei dati <Icon name="next" size={16} /></summary>
        <div className="stack" style={{ marginTop: 6 }}>
          {["garmin", "strava", "runna", "apple_health"].map((s) => {
            const r = syncs.find((x) => x.source === s);
            return (
              <div key={s} className="row between">
                <span className="src" data-s={s}><i />{SOURCE_LABEL[s]}</span>
                <span className="note">{r ? `${ago(r.started_at)} · ` : ""}<span className={`badge ${!r ? "" : r.status === "ok" ? "ok" : r.status === "error" ? "bad" : "warn"}`}>{!r ? "mai" : r.status === "ok" ? "riuscita" : r.status === "partial" ? "parziale" : r.status === "running" ? "in corso" : "errore"}</span></span>
              </div>
            );
          })}
          <p className="note">Previsione: formula di Riegel (tempo × (distanza obiettivo / distanza)^1,06) applicata al parziale più veloce misurato da Garmin negli ultimi 90 giorni. Vale per una preparazione completa sulla distanza; è un riferimento, non una promessa.</p>
        </div>
      </details>
    </div>
  );
}
