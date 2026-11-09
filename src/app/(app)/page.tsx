import Link from "next/link";
import { activities, lastSyncs, periodActs, planned } from "@/lib/queries";
import { bodyData } from "@/lib/body-server";
import { progressData } from "@/lib/progress-server";
import { thumbs } from "@/lib/track";
import { peak } from "@/lib/training";
import { addDays, daysBetween, monday } from "@/lib/dates";
import { day, dec, dur, hm, int, paceS, SOURCE_LABEL, todayLocal } from "@/lib/fmt";
import { Spark } from "@/components/charts";
import { Card, Empty, Info, Kpi, Num, TopBar, Verdict } from "@/components/Head";
import { ActCard, StructBar } from "@/components/Act";
import { CheckIn } from "@/components/CheckIn";
import type { Context } from "@/lib/readiness";
import { Icon } from "@/components/Icon";
import { SyncOnOpen } from "@/components/SyncOnOpen";

export const dynamic = "force-dynamic";
const TYPE_LABEL: Record<string, string> = { facile: "Facile", qualita: "Qualità", lungo: "Lungo", gara: "Gara", test: "Test", forza: "Forza" };
const TYPE_COLOR: Record<string, string> = { facile: "var(--z2)", qualita: "var(--z4)", lungo: "var(--run)", gara: "var(--sun)", test: "var(--sun)", forza: "var(--str)" };
const RUN = ["run", "trail_run", "treadmill"];

/** Oggi: come sto e cosa faccio. Giudizio in alto, poi domanda del mattino, seduta, settimana, gara, ultima uscita. */
export default async function Oggi() {
  const today = todayLocal();
  const mon = monday(today);
  const [body, plan, recent, syncs, acts, prog] = await Promise.all([
    bodyData(today), planned(today, addDays(today, 200)), activities({ limit: 1 }), lastSyncs(), periodActs(addDays(today, -35)), progressData(today),
  ]);
  const th = await thumbs(recent.map((a) => a.id));
  const { r } = body;

  const ser = (m: string, n = 14) => { const s = body.ser(m); const from = addDays(today, -n + 1); return Array.from({ length: n }, (_, i) => s.find((p) => p.day === addDays(from, i))?.value ?? null); };
  const hrv7 = (() => { const s = body.ser("hrv_night").filter((p) => p.day > addDays(today, -7)); return s.length >= 3 ? s.reduce((a, b) => a + b.value, 0) / s.length : null; })();
  const lo = body.last("hrv_baseline_low"), hi = body.last("hrv_baseline_high"), rhr = body.last("resting_hr"), sleep = body.last("sleep_s");

  const todays = plan.find((p) => p.day === today && p.state === "programmato") ?? null;
  const doneToday = acts.filter((a) => a.day === today && RUN.includes(a.sport));
  const runs = acts.filter((a) => RUN.includes(a.sport)).map((a) => ({ day: a.day, dist: a.dist }));
  const agenda = plan.filter((p) => p.state === "programmato" && p.day > today).slice(0, 3);
  // controllo picchi: la prossima seduta lunga in programma rispetto alla corsa più lunga dei 30 giorni prima
  const longNext = plan.find((p) => p.state === "programmato" && p.day >= today && p.day <= addDays(today, 7) && p.km && Number(p.km) >= 10);
  const pk = longNext ? peak(runs, longNext.day, Number(longNext.km) * 1000) : null;

  const weekDone = acts.filter((a) => a.day >= mon && RUN.includes(a.sport)).reduce((x, a) => x + a.dist, 0) / 1000;
  const weekPlan = plan.filter((p) => p.state === "programmato" && p.day >= today && p.day <= addDays(mon, 6) && !(p.day === today && doneToday.length)).reduce((x, p) => x + Number(p.km ?? 0), 0);
  const weekTot = weekDone + weekPlan;

  const g = prog.goal, fc = prog.goalFc;
  const syncErr = syncs.filter((s) => s.status === "error");

  return (
    <div className="stack-l">
      <section className="band-dark" aria-labelledby="oggi-h">
        <TopBar dark><SyncOnOpen variant="icon" /></TopBar>
        <div className="row between" style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
          <p className="date" id="oggi-h">{day(today, { weekday: "long", day: "numeric", month: "long" })}</p>
          <span className="only-d"><SyncOnOpen variant="icon" /></span>
        </div>
        <h1 className="sr">Oggi</h1>
        <div style={{ marginTop: 8 }}><Verdict level={r.level} sub={r.advice}>{r.title}</Verdict></div>
        {syncErr.length > 0 && <ul className="status" aria-label="Stato"><li><i className="warn" aria-hidden="true" />{`Errore da ${syncErr.map((s) => SOURCE_LABEL[s.source]).join(", ")}`}</li></ul>}
        <div className="kpis k3" style={{ marginTop: 14 }}>
          <Kpi dark label="Variabilità, media 7 notti" icon="hrv" value={hrv7 ? int(hrv7) : "–"} unit="ms" foot={lo && hi ? `tua fascia ${int(lo.value)}–${int(hi.value)}` : "fascia non disponibile"}><Spark values={ser("hrv_night")} /></Kpi>
          <Kpi dark label="Battito a riposo" icon="heart" value={rhr ? int(rhr.value) : "–"} unit="bpm" foot={rhr?.day === today ? "stamattina" : rhr ? `del ${day(rhr.day, { day: "numeric", month: "short" })}` : "nessun dato"}><Spark values={ser("resting_hr")} /></Kpi>
          <Kpi dark label="Sonno" icon="sleep" value={sleep ? hm(sleep.value) : "–"} foot={sleep?.day === today ? "stanotte" : "notte non registrata"}><Spark values={ser("sleep_s")} /></Kpi>
        </div>
        <details className="why">
          <summary>Da cosa dipende <Icon name="down" size={14} /></summary>
          <ul className="signals">
            {r.signals.map((s) => (
              <li key={s.key}>
                <span className={`ic ${s.state}`} aria-hidden="true">{s.state === "ok" ? "✓" : s.state === "warn" ? "!" : "–"}</span>
                <span><b style={{ fontWeight: 600 }}>{s.label}</b>: {s.text}</span>
                <span className="val">{s.value ?? ""}</span>
              </li>
            ))}
          </ul>
          {r.softened && <p className="note">Con il contesto che hai indicato ({r.context.join(", ")}) battito e variabilità cambiano anche senza fatica: il rosso diventa giallo.</p>}
          <p className="note"><Link href="/corpo">Andamento nel tempo in Corpo</Link></p>
        </details>
      </section>

      <div className="dash">
        <div className="col">
          {body.checkinAvailable && (
            <Card className="o1"><CheckIn feel={body.checkin?.feel ?? null} context={(body.checkin?.context ?? []) as Context[]} available /></Card>
          )}

          <Card title="In programma oggi" icon="calendar" className="o2" aside={<Link href="/allenamento">Allenamento</Link>}>
            {todays ? (
              <div className="stack">
                <div>
                  <p style={{ fontWeight: 600, fontSize: "1.0625rem" }}>{todays.title}</p>
                  <p className="note">{TYPE_LABEL[todays.type] ?? todays.type}{todays.km && !/\d\s?km/i.test(todays.title) ? ` · ${dec(todays.km)} km` : ""}{todays.duration_min_s ? ` · ${hm(todays.duration_min_s)}–${hm(todays.duration_max_s)}` : ""}</p>
                </div>
                <StructBar steps={todays.structure?.steps} />
              </div>
            ) : doneToday.length ? (
              <p>Fatto: <Link href={`/attivita/${recent[0]?.id ?? ""}`}>{doneToday.map((a) => a.name ?? "corsa").join(", ")}</Link>.</p>
            ) : <p className="muted">Nessuna seduta Runna oggi.</p>}
            {pk?.warn && longNext && (
              <p className="alert" style={{ marginTop: 10 }}><Icon name="load" size={16} />{`${longNext.title} (${day(longNext.day, { weekday: "short", day: "numeric" })}) è ${int(pk.pct)}% più lungo della corsa più lunga degli ultimi 30 giorni (${dec(pk.longest / 1000)} km): oltre il +10% il rischio di infortunio sale. Tienilo facile.`}</p>
            )}
          </Card>

          <Card title="Questa settimana" icon="activity" className="o4" aside={<Info title="Settimana"><p>Km di corsa fatti da lunedì (Garmin e Strava) più quelli ancora in programma su Runna fino a domenica.</p></Info>}>
            <div className="row between" style={{ alignItems: "baseline" }}>
              <span><Num v={dec(weekDone, 1)} unit="km fatti" /></span>
              <span className="note">{weekPlan > 0 ? `+ ${dec(weekPlan, 1)} in programma` : "nient'altro in programma"}</span>
            </div>
            <div className="wkbar" role="img" aria-label={`${dec(weekDone, 1)} km fatti, ${dec(weekPlan, 1)} km in programma`} style={{ marginTop: 8 }}>
              <i className="done" style={{ width: `${(weekDone / Math.max(weekTot, 0.1)) * 100}%` }} />
              <i className="plan" style={{ width: `${(weekPlan / Math.max(weekTot, 0.1)) * 100}%` }} />
            </div>
            {agenda.length > 0 && (
              <ul className="agenda" aria-label="Prossime sedute" style={{ marginTop: 12 }}>
                {agenda.map((p) => {
                  const dd = daysBetween(today, p.day);
                  return (
                    <li key={p.key} style={{ borderLeftColor: TYPE_COLOR[p.type] ?? "var(--z2)" }}>
                      <div style={{ minWidth: 0 }}><div className="t">{p.title}</div><div className="note">{TYPE_LABEL[p.type] ?? p.type}</div></div>
                      <div className="when"><span className="mono">{day(p.day, { weekday: "short", day: "numeric" })}</span><span className="badge">{dd === 1 ? "domani" : `tra ${dd} gg`}</span></div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>

        <div className="col">
          {g ? (
            <section className="card goal o3" aria-label={`Gara: ${g.name}`}>
              <div className="row between" style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
                <div style={{ minWidth: 0 }}>
                  <p className="note" style={{ fontWeight: 600 }}><Icon name="race" size={14} /> {day(g.date, { day: "numeric", month: "long" })}</p>
                  <h2 style={{ fontSize: "1.0625rem", marginTop: 4 }}>{g.name}</h2>
                </div>
                <div className="count"><Num v={String(g.daysLeft)} unit="giorni" /></div>
              </div>
              {fc ? (
                <>
                  <p style={{ marginTop: 10, fontWeight: 600 }}>{fc.gap <= 0 ? `In linea per l'obiettivo ${dur(g.target)}.` : `Stima ${dur(Math.round(fc.s / 10) * 10)}: ${dur(fc.gap)} sopra l'obiettivo, ${int(fc.perKm)} s/km.`}</p>
                  <p className="note">Forbice {dur(Math.round(fc.lo / 60) * 60)}–{dur(Math.round(fc.hi / 60) * 60)} · affidabilità {fc.confidence} · da {fc.anchor.name ?? "gara"}, {day(fc.anchor.day, { day: "numeric", month: "short" })}</p>
                </>
              ) : <p className="note" style={{ marginTop: 10 }}>Nessuna gara o test negli ultimi 12 mesi: la stima arriva con il primo test.</p>}
              <div className="row between note" style={{ marginTop: 8 }}>
                <span>{prog.nextTest ? `Prossimo test: ${day(prog.nextTest.date, { day: "numeric", month: "short" })}` : `Obiettivo ${dur(g.target)} · ${paceS(g.target ? g.target / (g.distM / 1000) : null)} /km`}</span>
                <Link href="/gara">Gara</Link>
              </div>
            </section>
          ) : (
            <Card title="Gara" icon="race" className="o3"><Empty inline icon="race" title="Nessuna gara in programma" text="Le gare arrivano da Runna; puoi aggiungerne una in Gara." action={{ href: "/gara", label: "Vai a Gara" }} /></Card>
          )}

          <section className="o5" aria-labelledby="ult-h">
            <div className="row between" style={{ marginBottom: 10 }}><h2 id="ult-h" style={{ fontSize: "1rem" }}>Ultima uscita</h2><Link href="/attivita" className="note">Tutte</Link></div>
            {recent.length ? <ActCard a={recent[0]} path={th[recent[0].id]} />
              : <div className="card"><Empty icon="activity" title="Ancora nessuna attività" text="Collega Garmin o Strava: le uscite compaiono qui dopo la prima sincronizzazione." action={{ href: "/impostazioni", label: "Collegamenti" }} /></div>}
          </section>
        </div>
      </div>
    </div>
  );
}
