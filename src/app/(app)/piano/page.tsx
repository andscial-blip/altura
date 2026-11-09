import Link from "next/link";
import { goals, planned, runnaDone } from "@/lib/queries";
import { addDays, monday, range } from "@/lib/dates";
import { day, dec, dur, hm, km, pace, todayLocal } from "@/lib/fmt";
import { compare, type Step } from "@/lib/runna-parse";
import { StackBars } from "@/components/charts";
import { Card, Empty, Head, Kpi, Legend } from "@/components/Head";
import { StructBar } from "@/components/Act";
import { Icon, sessionIcon } from "@/components/Icon";

export const dynamic = "force-dynamic";
const TYPE_LABEL: Record<string, string> = { facile: "Facile", qualita: "Qualità", lungo: "Lungo", gara: "Gara", test: "Test", forza: "Forza" };
const TYPE_COLOR: Record<string, string> = { facile: "var(--z2)", qualita: "var(--z4)", lungo: "var(--run)", gara: "var(--sun)", test: "var(--sun)", forza: "var(--str)" };

export default async function Page() {
  const today = todayLocal();
  const mon = monday(today);
  const [rows, done, gl] = await Promise.all([planned(addDays(mon, -28), addDays(mon, 7 * 16)), runnaDone(addDays(mon, -7 * 8)), goals(true)]);
  if (!rows.length && !done.length) {
    return <div className="stack-l"><Head icon="calendar" title="Piano" sub="Programma Runna dal calendario iCal ufficiale." /><div className="card"><Empty icon="calendar" title="Nessuna seduta Runna" text="Il calendario iCal di Runna non è collegato o non contiene sedute. Serve l'indirizzo iCal su Vercel (RUNNA_ICS_URL)." action={{ href: "/impostazioni", label: "Vai ai collegamenti" }} /></div></div>;
  }
  const curWeek = rows.find((r) => r.day >= today)?.week ?? null;
  const planWeeks = Math.max(0, ...rows.map((r) => r.week ?? 0));
  const race = gl.find((g) => g.id.startsWith("runna:") && g.kind === "gara");

  // settimane: 8 passate (sedute Runna completate) + 8 future (sedute in programma)
  const weeks = Array.from({ length: 16 }, (_, i) => addDays(mon, 7 * (i - 7)));
  const doneKm = weeks.map((w) => done.filter((d) => monday(d.day) === w).reduce((s, d) => s + d.dist / 1000, 0));
  const planKm = weeks.map((w) => rows.filter((r) => monday(r.day) === w && r.state === "programmato" && r.day >= today).reduce((s, r) => s + Number(r.km ?? 0), 0));
  const last4 = done.filter((d) => d.day >= addDays(mon, -28) && d.day < mon);
  const next7 = rows.filter((r) => r.day >= today && r.day < addDays(today, 7) && r.state === "programmato");
  const thisWeek = rows.filter((r) => monday(r.day) === mon);
  const doneThis = done.filter((d) => monday(d.day) === mon);

  // calendario: settimana scorsa + 4 settimane
  const calFrom = addDays(mon, -7), cal = range(calFrom, addDays(calFrom, 34));

  return (
    <div className="stack-l">
      <Head icon="calendar" title="Piano" sub={`Programma Runna${curWeek && planWeeks ? `, settimana ${curWeek} di ${planWeeks}` : ""}${race ? ` verso ${race.name}` : ""}.`}
        acts={<Link href="/obiettivi" className="btn sm"><Icon name="target" size={16} />Obiettivi</Link>} />

      <div className="kpis">
        <Kpi label="Sedute fatte, 4 settimane" icon="check" value={String(last4.length)} foot={`${km(last4.reduce((s, d) => s + d.dist, 0), 0)} km con Runna`} />
        <Kpi label="Questa settimana" icon="calendar" value={`${doneThis.length}/${doneThis.length + thisWeek.filter((r) => r.state === "programmato" && r.day >= today).length}`} foot="fatte / totali" />
        <Kpi label="Prossimi 7 giorni" icon="clock" value={String(next7.length)} foot={`${dec(next7.reduce((s, r) => s + Number(r.km ?? 0), 0), 0)} km previsti`} />
        <Kpi label="Spostate da Runna" icon="sync" value={String(rows.filter((r) => r.history?.length).length)} foot="sedute con data cambiata" />
      </div>

      <Card title="Chilometri per settimana" icon="chart" aside="Runna">
        <StackBars cats={weeks} stacks={[{ name: "Fatti", color: "var(--run)", values: doneKm }, { name: "In programma", color: "var(--z1)", values: planKm }]} fmt={(v) => dec(v, 0)} unit="km" label="Chilometri fatti e in programma per settimana" catLabel={(w) => day(w, { day: "numeric", month: "short" })} highlight={7} />
        <Legend items={[{ label: "Fatti (uscite registrate da Runna)", color: "var(--run)" }, { label: "In programma", color: "var(--z1)" }]} />
        <p className="note" style={{ marginTop: 6 }}>Il calendario Runna contiene le sedute future e quelle completate: per le settimane passate le sedute saltate non sono note, quindi l&apos;aderenza si misura da oggi in avanti.</p>
      </Card>

      <Card title="Questa settimana" icon="calendar">
        {thisWeek.length || doneThis.length ? (
          <div className="stack">
            {thisWeek.map((p) => {
              const ic = sessionIcon(p.type);
              const rr = p.runna_raw as { steps?: Step[]; segments?: [number, number][] } | null;
              const c = rr?.steps && rr.segments ? compare(rr.steps, rr.segments, p.km ? Number(p.km) : null, [p.duration_min_s, p.duration_max_s], p.act_dist ? Number(p.act_dist) / 1000 : null, p.act_time ? Number(p.act_time) : null) : null;
              const missed = p.state === "programmato" && p.day < today;
              return (
                <div key={p.key} className="row" style={{ flexWrap: "nowrap", alignItems: "flex-start", opacity: p.state === "rimosso" ? 0.5 : 1 }}>
                  <span className={`sp sm ${ic.cls}`}><Icon name={ic.icon} size={17} /></span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="row between"><b style={{ fontWeight: 600 }}>{p.title}</b><span className="note">{p.day === today ? "oggi" : day(p.day)}</span></div>
                    <div className="note">{TYPE_LABEL[p.type] ?? p.type}{p.km ? ` · ${dec(p.km)} km` : ""}{p.duration_min_s ? ` · ${hm(p.duration_min_s)}–${hm(p.duration_max_s)}` : ""}
                      {p.state === "completato" && <> · <span className="badge ok">fatta</span></>}{missed && <> · <span className="badge warn">non fatta</span></>}{p.state === "rimosso" && <> · tolta da Runna</>}
                      {p.history?.length ? ` · era il ${day(p.history[p.history.length - 1].date, { day: "numeric", month: "short" })}` : ""}</div>
                    <div style={{ marginTop: 6 }}><StructBar steps={p.structure?.steps} /></div>
                    {p.completed_activity && <p className="note" style={{ marginTop: 4 }}><Link href={`/attivita/${p.completed_activity}`}>{km(p.act_dist)} km in {dur(p.act_time)}, {pace(p.act_dist, p.act_time)} /km</Link>{c ? ` · ${String(c.verdict)}` : ""}</p>}
                  </div>
                </div>
              );
            })}
            {doneThis.filter((d) => !thisWeek.some((p) => p.completed_activity === d.id)).map((d) => (
              <div key={d.id} className="row" style={{ flexWrap: "nowrap" }}>
                <span className="sp sm sp-run"><Icon name="check" size={17} /></span>
                <div style={{ minWidth: 0 }}><Link href={`/attivita/${d.id}`}><b style={{ fontWeight: 600 }}>{d.name ?? "Seduta Runna"}</b></Link><div className="note">{day(d.day)} · {km(d.dist)} km in {dur(d.time)} · <span className="badge ok">fatta</span></div></div>
              </div>
            ))}
          </div>
        ) : <Empty inline icon="calendar" title="Settimana senza sedute" text="Runna non ha sedute in programma per questa settimana." />}
        <Legend items={[{ label: "Riscaldamento, recupero", color: "var(--z1)" }, { label: "Facile", color: "var(--z2)" }, { label: "Costante", color: "var(--z3)" }, { label: "Lavoro", color: "var(--z4)" }]} />
      </Card>

      <Card title="Calendario" icon="calendar" aside="5 settimane">
        <div className="cal">
          {["L", "M", "M", "G", "V", "S", "D"].map((d, i) => <div key={i} className="dh" aria-hidden="true">{d}</div>)}
          {cal.map((d) => {
            const ps = rows.filter((r) => r.day === d && r.state !== "rimosso");
            const dn = done.filter((x) => x.day === d);
            const cls = d === today ? "today" : d < today ? (dn.length ? "done" : ps.some((p) => p.state === "programmato") ? "miss" : "out") : "";
            return (
              <div key={d} className={`dc ${cls}`}>
                <span className="sr">{`${day(d)}: ${ps.map((p) => p.title).join(", ") || (dn.length ? "seduta fatta" : "riposo")}`}</span>
                <b aria-hidden="true">{Number(d.slice(8))}</b>
                {ps.map((p) => <span key={p.key} className="row" style={{ gap: 3, flexWrap: "nowrap" }}><i className="dot" style={{ background: TYPE_COLOR[p.type] ?? "var(--z2)" }} /><span className="only-d" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.km ? `${dec(p.km, 0)} km` : TYPE_LABEL[p.type]}</span></span>)}
                {!ps.length && dn.map((x) => <span key={x.id} className="row" style={{ gap: 3 }}><i className="dot" style={{ background: "var(--run)" }} /><span className="only-d">{km(x.dist, 0)} km</span></span>)}
              </div>
            );
          })}
        </div>
        <Legend items={Object.entries(TYPE_LABEL).filter(([k]) => rows.some((r) => r.type === k)).map(([k, l]) => ({ label: l, color: TYPE_COLOR[k] })).concat([{ label: "Fatta", color: "var(--good-bg)" }])} />
      </Card>

      <div className="grid g2">
        <Card title="Prossime settimane" icon="next">
          {[1, 2, 3, 4].map((i) => {
            const w = addDays(mon, 7 * i), list = rows.filter((r) => monday(r.day) === w && r.state === "programmato");
            if (!list.length) return null;
            return (
              <div key={w} style={{ padding: "8px 0", borderTop: i > 1 ? "1px solid var(--line-2)" : undefined }}>
                <div className="row between"><b style={{ fontSize: "0.875rem" }}>Settimana del {day(w, { day: "numeric", month: "short" })}{list[0].week ? ` · ${list[0].week}ª` : ""}</b><span className="note mono">{dec(list.reduce((s, r) => s + Number(r.km ?? 0), 0), 0)} km</span></div>
                <div className="note">{list.map((r) => r.title).join(" · ")}</div>
              </div>
            );
          })}
        </Card>
        <Card title="Settimane passate" icon="check" aside="sedute registrate da Runna">
          {[1, 2, 3, 4].map((i) => {
            const w = addDays(mon, -7 * i), list = done.filter((d) => monday(d.day) === w);
            return (
              <div key={w} style={{ padding: "8px 0", borderTop: i > 1 ? "1px solid var(--line-2)" : undefined }}>
                <div className="row between"><b style={{ fontSize: "0.875rem" }}>Settimana del {day(w, { day: "numeric", month: "short" })}</b><span className="note mono">{list.length} sedute · {km(list.reduce((s, d) => s + d.dist, 0), 0)} km</span></div>
                <div className="note">{list.length ? list.map((d) => <Link key={d.id} href={`/attivita/${d.id}`} style={{ marginRight: 8 }}>{d.name ?? day(d.day)}</Link>) : "nessuna seduta Runna"}</div>
              </div>
            );
          })}
        </Card>
      </div>
      <p className="note">Una seduta è &quot;fatta&quot; quando Runna registra l&apos;uscita e si abbina al programma (stessa data o un giorno di scarto, stesso titolo o tipo). &quot;Non fatta&quot;: era in programma, la data è passata e nessuna uscita Runna le corrisponde.</p>
    </div>
  );
}
