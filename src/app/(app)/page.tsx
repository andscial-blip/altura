import Link from "next/link";
import { activities, dailyLoad, dailyMulti, goals, lastSyncs, periodActs, planned, runBests } from "@/lib/queries";
import { thumbs } from "@/lib/track";
import { acwr, acwrZone } from "@/lib/analytics";
import { isNum, mean, riegel, rolling, validDaily } from "@/lib/stats";
import { todaySummary } from "@/lib/today";
import { addDays, daysBetween, range } from "@/lib/dates";
import { ago, day, dec, dur, hm, int, km, SOURCE_LABEL, todayLocal } from "@/lib/fmt";
import { Gauge, Spark, StackBars, TimeChart } from "@/components/charts";
import { Card, Empty, Kpi, Legend, Num, TopBar } from "@/components/Head";
import { ActCard, FAM_LABEL, SPORT_COLOR, StructBar } from "@/components/Act";
import { Icon, sessionIcon, sportMeta } from "@/components/Icon";
import { SyncOnOpen } from "@/components/SyncOnOpen";

export const dynamic = "force-dynamic";

const M = ["hrv_night", "hrv_baseline_low", "hrv_baseline_high", "resting_hr", "sleep_s", "sleep_score", "body_battery_high", "body_battery_low"];

export default async function Oggi() {
  const today = todayLocal();
  const [dm, load, plan, gl, recent, syncs, week, bests] = await Promise.all([
    dailyMulti(M, 40), dailyLoad(60), planned(today, addDays(today, 200)), goals(true), activities({ limit: 4 }), lastSyncs(), periodActs(addDays(today, -6)), runBests(90),
  ]);
  const th = await thumbs(recent.map((a) => a.id));

  // serie giornaliere pulite (i valori "dato insufficiente" di Garmin sono esclusi)
  const days = range(addDays(today, -29), today);
  const ser = (m: string, n = 14) => days.slice(-n).map((d) => validDaily(m, dm[m].find((p) => p.day === d)?.value ?? null));
  const last = (m: string) => { const v = dm[m].filter((p) => validDaily(m, p.value) !== null); return v[v.length - 1] ?? null; };
  const before7 = (m: string) => mean(days.slice(-8, -1).map((d) => validDaily(m, dm[m].find((p) => p.day === d)?.value ?? null)));
  const hrv = last("hrv_night"), lo = last("hrv_baseline_low"), hi = last("hrv_baseline_high");
  const rhr = last("resting_hr"), sleep = last("sleep_s"), bb = last("body_battery_high");
  const when = (p: { day: string } | null) => (!p ? "nessun dato" : p.day === today ? "oggi" : `del ${day(p.day, { day: "numeric", month: "short" })}`);

  const L = acwr(load.map((d) => d.load));
  const ratio = L.ratio.at(-1) ?? null;
  const zone = acwrZone(ratio);

  const next = plan.find((p) => p.state === "programmato" && p.day >= today) ?? null;
  const todays = plan.find((p) => p.day === today && p.state === "programmato") ?? null;
  const race = gl.find((g) => g.kind === "gara" && g.target_date && g.target_date >= today) ?? gl.find((g) => g.target_date && g.target_date >= today) ?? null;
  const daysTo = race?.target_date ? daysBetween(today, race.target_date) : null;
  const planWeeks = Math.max(0, ...plan.map((p) => p.week ?? 0));
  const curWeek = plan.find((p) => p.day >= today)?.week ?? null;
  const b10 = bests.filter((b) => isNum(b.s10)).sort((a, b) => a.s10! - b.s10!)[0];
  const b5 = bests.filter((b) => isNum(b.s5)).sort((a, b) => a.s5! - b.s5!)[0];
  const base = b10 ? { t: b10.s10!, d: 10000, label: "10 km" } : b5 ? { t: b5.s5!, d: 5000, label: "5 km" } : null;
  const pred = base && race?.target.dist_m ? riegel(base.t, base.d, race.target.dist_m) : null;

  const sum = todaySummary({
    today, hrv, hrvLo: lo?.value ?? null, hrvHi: hi?.value ?? null, rhr, rhrMean7: before7("resting_hr"), sleep, sleepMean7: before7("sleep_s"),
    acwr: ratio, session: todays ? { title: todays.title, type: todays.type, km: todays.km ? Number(todays.km) : null } : null, fmtSleep: hm,
  });
  const LEVEL_COLOR = { ok: "var(--good)", one: "var(--sun)", more: "var(--ride)", na: "var(--faint)" };

  const days7 = range(addDays(today, -6), today);
  const fams = [...new Set(week.map((a) => sportMeta(a.sport).fam))];
  const stacks = fams.map((f) => ({ name: FAM_LABEL[f] ?? f, color: SPORT_COLOR[f] ?? "var(--oth)", values: days7.map((d) => week.filter((a) => a.day === d && sportMeta(a.sport).fam === f).reduce((s, a) => s + a.time, 0) / 60) }));
  const wTime = week.reduce((s, a) => s + a.time, 0), wDist = week.reduce((s, a) => s + a.dist, 0), wGain = week.reduce((s, a) => s + a.gain, 0);

  const sleep30 = ser("sleep_s", 30);
  const nights30 = sleep30.filter(isNum).length;
  const sleepAvg7 = rolling(sleep30.map((v) => (isNum(v) ? v / 3600 : null)), 7, 3);
  const syncErr = syncs.filter((s) => s.status === "error");
  const st = next ? sessionIcon(next.type) : null;

  return (
    <div className="stack-l">
      <section className="band-dark" aria-labelledby="oggi-h">
        <TopBar dark><SyncOnOpen variant="icon" /></TopBar>
        <div className="row between" style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
          <div style={{ minWidth: 0 }}>
            <p className="date">{day(today, { weekday: "long", day: "numeric", month: "long" })}</p>
            <h1 id="oggi-h">{todays ? todays.title : "Oggi"}</h1>
          </div>
          <span className="only-d"><SyncOnOpen variant="icon" /></span>
        </div>
        <ul className="status" aria-label="Stato">
          <li><i className={sum.level === "ok" ? "" : "warn"} aria-hidden="true" />{sum.title}</li>
          {ratio !== null && <li><i className={zone.cls === "ok" ? "" : "warn"} aria-hidden="true" />{zone.label[0].toUpperCase() + zone.label.slice(1)}</li>}
          <li><i className={syncErr.length ? "warn" : ""} aria-hidden="true" />{syncErr.length ? `Errore da ${syncErr.map((s) => SOURCE_LABEL[s.source]).join(", ")}` : `Dati aggiornati ${ago(syncs.map((s) => s.finished_at ?? s.started_at).sort().at(-1))}`}</li>
        </ul>
        <div className="kpis">
          <Kpi dark label="Variabilità notte" icon="hrv" value={hrv ? int(hrv.value) : "–"} unit="ms" foot={lo && hi ? `fascia ${int(lo.value)}–${int(hi.value)}` : when(hrv)}><Spark values={ser("hrv_night")} /></Kpi>
          <Kpi dark label="Battito a riposo" icon="heart" value={rhr ? int(rhr.value) : "–"} unit="bpm" foot={when(rhr)}><Spark values={ser("resting_hr")} /></Kpi>
          <Kpi dark label="Sonno" icon="sleep" value={sleep ? hm(sleep.value) : "–"} foot={sleep?.day === today && last("sleep_score") ? `punteggio ${int(last("sleep_score")!.value)}` : when(sleep)}><Spark values={ser("sleep_s")} /></Kpi>
          <Kpi dark label="Body Battery max" icon="battery" value={bb ? int(bb.value) : "–"} foot={last("body_battery_low") ? `minimo ${int(last("body_battery_low")!.value)}` : when(bb)}><Spark values={ser("body_battery_high")} /></Kpi>
        </div>
      </section>

      <div className="dash">
        <div className="col">
          <Card title="Cosa dicono i dati oggi" icon="target" className="today o1" aside="sintesi automatica">
            <p className="verdict"><span className="dotl" style={{ background: LEVEL_COLOR[sum.level] }} aria-hidden="true" />{sum.title}</p>
            <ul>
              {sum.signals.map((s) => (
                <li key={s.key}>
                  <span className={`ic ${s.state}`} aria-hidden="true">{s.state === "ok" ? "✓" : s.state === "warn" ? "!" : "–"}</span>
                  <span><b style={{ fontWeight: 600 }}>{s.label}</b><span className="sr">{s.state === "ok" ? ": nella norma" : s.state === "warn" ? ": da considerare" : ": non disponibile"}</span><span className="muted">: {s.text}</span></span>
                  {s.value ? <span className="val">{s.value}</span> : <span />}
                </li>
              ))}
            </ul>
            <p className="plan">{sum.plan}</p>
            <p className="note" style={{ marginTop: 8 }}>Confronto con la tua norma recente secondo regole fisse (soglie in Impostazioni › Metodo). Non è un consiglio medico né di allenamento: il riferimento per la seduta resta Runna.</p>
          </Card>

          <Card title="Ultimi 7 giorni" icon="activity" className="o5" aside={<>{hm(wTime)} · {km(wDist, 0)} km · {int(wGain)} m D+</>}>
            {week.length ? (
              <>
                <StackBars cats={days7} stacks={stacks} fmt={(v) => `${int(v)}`} unit="min" height={110} label="Minuti di allenamento al giorno, ultimi 7 giorni" catLabel={(d) => day(d, { weekday: "short", day: "numeric" })} highlight={6} />
                <Legend items={stacks.map((s) => ({ label: s.name, color: s.color }))} />
              </>
            ) : <Empty inline icon="activity" title="Nessuna attività negli ultimi 7 giorni" text="Le uscite arrivano da Garmin e Strava a ogni sincronizzazione." />}
          </Card>

          <Card title="Sonno" icon="sleep" className="o6" aside={<Link href="/salute#sonno">Storico completo</Link>}>
            {nights30 >= 3 ? (
              <>
                <TimeChart from={days[0]} to={today} height={100} label="Ore di sonno, ultime 30 notti" fmt={(v) => dec(v, 1)} unit="h"
                  series={[{ name: "Notte", color: "var(--h2)", kind: "bars", pts: days.map((d, i) => ({ d, v: isNum(sleep30[i]) ? sleep30[i]! / 3600 : null })) }, { name: "Media 7 notti", color: "var(--ink)", kind: "line", pts: days.map((d, i) => ({ d, v: sleepAvg7[i] })) }]} />
                <Legend items={[{ label: "Notte registrata", color: "var(--h2)" }, { label: "Media 7 notti", color: "var(--ink)", line: true }]} />
                <p className="note" style={{ marginTop: 6 }}>{nights30} notti registrate su 30 · media {hm(mean(sleep30)! )}. Le notti senza orologio restano vuote, non stimate.</p>
              </>
            ) : <Empty inline icon="sleep" title="Poche notti registrate" text="Il sonno arriva dall'orologio Garmin: indossalo di notte per vederlo qui." />}
          </Card>
        </div>

        <div className="col">
          {race && daysTo !== null && (
            <section className="card goal o2" aria-label={`Obiettivo: ${race.name}`}>
              <div className="row between" style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
                <div style={{ minWidth: 0 }}>
                  <p className="note" style={{ fontWeight: 600 }}><Icon name={race.kind === "test" ? "test" : "race"} size={14} /> {race.kind === "test" ? "Test" : "Gara"} · {day(race.target_date!, { day: "numeric", month: "long", year: "numeric" })}</p>
                  <h2 style={{ fontSize: "1.0625rem", marginTop: 4 }}>{race.name}</h2>
                </div>
                <div className="count"><Num v={String(daysTo)} unit="giorni" /></div>
              </div>
              <dl className="kv" style={{ marginTop: 10 }}>
                {(race.target.time_s || race.target.time_min_s) && <><dt className="note">Obiettivo Runna</dt><dd><Num v={race.target.time_min_s && race.target.time_max_s && race.target.time_min_s !== race.target.time_max_s ? `${dur(race.target.time_min_s)}–${dur(race.target.time_max_s)}` : dur(race.target.time_s)} /></dd></>}
                {pred && base && <><dt className="note">Previsione oggi (dal miglior {base.label})</dt><dd><Num v={dur(pred)} /></dd></>}
              </dl>
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

          <Card title="Prossima seduta" icon="calendar" className="o3" aside={<Link href="/piano">Piano</Link>}>
            {next ? (
              <div className="stack">
                <div className="row" style={{ flexWrap: "nowrap" }}>
                  {st && <span className={`sp ${st.cls}`}><Icon name={st.icon} size={20} /></span>}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{next.title}</div>
                    <div className="note">{next.day === today ? "Oggi" : day(next.day)}{next.km ? ` · ${dec(next.km)} km` : ""}{next.duration_min_s ? ` · ${hm(next.duration_min_s)}–${hm(next.duration_max_s)} (Runna)` : ""}</div>
                  </div>
                </div>
                <StructBar steps={next.structure?.steps} />
              </div>
            ) : <Empty inline icon="calendar" title="Nessuna seduta in programma" text="Le sedute arrivano dal calendario iCal di Runna." action={{ href: "/impostazioni", label: "Collegamenti" }} />}
          </Card>

          <Card title="Carico" icon="load" className="o4" aside="7 giorni su 28">
            <div className="row" style={{ flexWrap: "nowrap" }}>
              <Gauge value={ratio} lo={0.4} hi={2} bandLo={0.8} bandHi={1.3} label={`Rapporto carico acuto/cronico ${ratio === null ? "non disponibile" : dec(ratio, 2)}, fascia verde da 0,8 a 1,3`} />
              <div style={{ minWidth: 0 }}>
                <div className="row" style={{ gap: 8 }}><span style={{ fontSize: "1.375rem" }}><Num v={ratio === null ? "–" : dec(ratio, 2)} /></span><span className={`badge ${zone.cls}`}>{zone.label}</span></div>
                <p className="note" style={{ marginTop: 6 }}>Carico Garmin medio degli ultimi 7 giorni diviso per quello degli ultimi 28. Fascia verde 0,8–1,3: aumento graduale.</p>
              </div>
            </div>
          </Card>

          <details className="card more o7">
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
              <p className="note">Previsione gara: formula di Riegel (tempo × (distanza obiettivo / distanza)^1,06) sul parziale più veloce misurato da Garmin negli ultimi 90 giorni. Presuppone una preparazione specifica: è un riferimento, non una promessa.</p>
            </div>
          </details>
        </div>
      </div>

      <section aria-labelledby="recenti-h">
        <div className="row between" style={{ marginBottom: 10 }}><h2 id="recenti-h">Recenti</h2><Link href="/attivita" className="note">Tutte le attività</Link></div>
        {recent.length ? <div className="acards">{recent.map((a) => <ActCard key={a.id} a={a} path={th[a.id]} compact />)}</div>
          : <div className="card"><Empty icon="activity" title="Ancora nessuna attività" text="Collega Garmin o Strava: le uscite compaiono qui dopo la prima sincronizzazione." action={{ href: "/impostazioni", label: "Vai ai collegamenti" }} /></div>}
      </section>
    </div>
  );
}
