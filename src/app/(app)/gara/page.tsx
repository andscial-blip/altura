import Link from "next/link";
import { periodActs, planned } from "@/lib/queries";
import { progressData } from "@/lib/progress-server";
import { forecast } from "@/lib/progress";
import { addDays, monday } from "@/lib/dates";
import { day, dec, dur, int, km, paceS, todayLocal } from "@/lib/fmt";
import { StackBars, TimeChart } from "@/components/charts";
import { Card, Empty, Head, Info, Legend, Num, Verdict } from "@/components/Head";
import { DataTable } from "@/components/DataTable";
import { Icon } from "@/components/Icon";
import { addResult, delResult } from "../actions";

export const dynamic = "force-dynamic";
const RUN = ["run", "trail_run", "treadmill"];

/** Gara: arrivo all'obiettivo? Una sola stima con forbice e affidabilità, cosa serve per confermarla, il lungo. */
export default async function Page() {
  const today = todayLocal();
  const mon = monday(today);
  const [prog, acts, plan] = await Promise.all([progressData(today), periodActs(addDays(mon, -7 * 11)), planned(today, addDays(today, 200))]);
  const { goal: g, goalFc: fc, fcBy, trend, test5k, nextTest, manual, recAll, DISTS } = prog;

  // stima nel tempo: a fine mese, con lo stesso metodo (ancora sull'ultima gara o test dei 12 mesi precedenti)
  const ends: string[] = [];
  for (let i = 11; i >= 1; i--) { const d = new Date(today + "T12:00:00Z"); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - i + 1); d.setUTCDate(0); ends.push(d.toISOString().slice(0, 10)); }
  ends.push(today);
  const hist = g ? ends.map((d) => { const f = forecast(prog.list, g.distM, d); return { d, v: f ? Math.round(f.s) : null, lo: f ? f.lo : null, hi: f ? f.hi : null }; }) : [];
  const histPts = hist.filter((p) => p.v !== null);
  // il grafico serve solo se la stima è cambiata nel periodo (con una sola gara è una linea piatta)
  const histMoves = new Set(histPts.map((p) => p.v)).size >= 2;

  // il lungo: corsa più lunga per settimana (12 settimane) e lunghi in programma
  const weeks = Array.from({ length: 12 }, (_, i) => addDays(mon, 7 * (i - 11)));
  const longest = weeks.map((w) => acts.filter((a) => RUN.includes(a.sport) && a.day >= w && a.day < addDays(w, 7)).reduce((m, a) => Math.max(m, a.dist / 1000), 0));
  const long4 = Math.max(0, ...longest.slice(-4));
  const plannedLongs = plan.filter((p) => p.state === "programmato" && p.type === "lungo" && p.km && (!g || p.day < g.date));
  const maxLong = plannedLongs.reduce<(typeof plannedLongs)[number] | null>((b, p) => (!b || Number(p.km) > Number(b.km) ? p : b), null);

  const level = !fc ? "na" : fc.gap <= 0 ? "verde" : fc.gap / (g?.target ?? 1) <= 0.03 ? "giallo" : "rosso";
  const trendTxt = trend === "su" ? "In miglioramento: nelle ultime 4 settimane corri più metri per battito." : trend === "giu" ? "In calo: nelle ultime 4 settimane meno metri per battito (anche il caldo pesa)." : trend === "stabile" ? "Forma stabile nelle ultime 4 settimane." : null;

  return (
    <div className="stack-l">
      <Head icon="race" title="Gara" sub={g ? `${g.name} · ${day(g.date, { day: "numeric", month: "long", year: "numeric" })}` : "Nessuna gara in programma"}
        acts={<Link href="/obiettivi" className="btn sm"><Icon name="target" size={16} />Obiettivi</Link>} />

      {g ? (
        <section className="card goal" aria-label={`Stima per ${g.name}`}>
          <div className="row between" style={{ alignItems: "flex-start", flexWrap: "nowrap", gap: 12 }}>
            <Verdict level={level} sub={trendTxt}>
              {fc ? (fc.gap <= 0 ? `In linea per ${dur(g.target)}.` : `Ti mancano ${int(fc.perKm)} s/km per ${dur(g.target)}.`) : "Serve una gara o un test per stimare il tempo."}
            </Verdict>
            <div className="count"><Num v={String(g.daysLeft)} unit="giorni" /></div>
          </div>
          <div className="grid g2" style={{ marginTop: 14, gap: 10 }}>
            <div className="kpi">
              <div className="l"><Icon name="clock" size={14} /> Stima di oggi</div>
              <div className="big"><Num v={fc ? dur(Math.round(fc.s / 10) * 10) : "–"} /></div>
              {fc && <div className="range">forbice {dur(Math.round(fc.lo / 60) * 60)}–{dur(Math.round(fc.hi / 60) * 60)} · affidabilità <b>{fc.confidence}</b></div>}
            </div>
            <div className="kpi">
              <div className="l"><Icon name="target" size={14} /> Obiettivo Runna</div>
              <div className="big"><Num v={dur(g.target)} /></div>
              <div className="range">{paceS(g.target ? g.target / (g.distM / 1000) : null)} /km{fc ? ` · stima ${paceS(fc.s / (g.distM / 1000))} /km` : ""}</div>
            </div>
          </div>
          <div className="row between" style={{ marginTop: 10 }}>
            <p className="note">{fc ? <>Base: {fc.anchor.official ? "risultato ufficiale" : "gara"} <Link href={fc.anchor.id ? `/attivita/${fc.anchor.id}` : "#risultati"}>{fc.anchor.name ?? "gara"}</Link>, {day(fc.anchor.day, { day: "numeric", month: "short", year: "numeric" })} ({DISTS.find((d) => d.key === fc.anchor.key)!.label} in {dur(fc.anchor.s)})</> : "Nessuna gara o test negli ultimi 12 mesi."}</p>
            <Info title="Come si stima">
              <p>Si parte dall&apos;ultima gara o test fatto a fondo degli ultimi 12 mesi (gare segnate su Garmin, gare Runna, risultati ufficiali inseriti qui) e si converte sulla distanza con la formula di Riegel (esponente 1,06), affidabile per gli amatori fino alla mezza.</p>
              <p>La forbice parte da ±1% e si allarga di 0,5% al mese dopo i primi due: più il riferimento è vecchio, meno sa della forma di oggi. Affidabilità alta entro 8 settimane dal riferimento, media entro 6 mesi.</p>
              <p>Gli allenamenti non spostano il tempo (non sono sforzi massimali): danno solo la tendenza, dai metri percorsi per battito nelle corse da 4 km in su.</p>
            </Info>
          </div>
          {histPts.length >= 2 && histMoves && (
            <div style={{ marginTop: 12 }}>
              <TimeChart label="Stima a fine mese e obiettivo" from={histPts[0].d} to={today} today={false} invert step={300} fmt={(v) => dur(v)} height={130}
                refLine={g.target ? { v: g.target, dash: true } : null}
                series={[{ name: "Stima", color: "var(--night, #2E3D52)", kind: "line", gapDays: 40, pts: hist.map((p) => ({ d: p.d, v: p.v })) }]} />
              <Legend items={[{ label: "Stima", color: "var(--night, #2E3D52)", line: true }, { label: "Obiettivo", color: "var(--faint)", dash: true }]} />
            </div>
          )}
        </section>
      ) : (
        <div className="card"><Empty icon="race" title="Nessuna gara in programma" text="Le gare arrivano da Runna; puoi aggiungerne una negli Obiettivi." action={{ href: "/obiettivi", label: "Obiettivi" }} /></div>
      )}

      <div className="grid g2">
        {g && test5k ? (
          <Card title="Per confermarlo" icon="test">
            <p style={{ fontWeight: 600 }}>{nextTest ? `${nextTest.name}, ${day(nextTest.date, { weekday: "short", day: "numeric", month: "short" })}` : "Un 5 km a tutta, su percorso piatto"}</p>
            <p style={{ marginTop: 6 }}>Per {dur(g.target)} sulla mezza serve un 5 km in circa <b className="mono">{dur(Math.round(test5k / 5) * 5)}</b> ({paceS(test5k / 5)} /km).</p>
            <p className="note" style={{ marginTop: 6 }}>Un test ogni 4–6 settimane tiene la stima affidabile. Se Garmin non lo segna come gara, inserisci il tempo in Risultati ufficiali.</p>
          </Card>
        ) : null}

        <Card title="Il lungo" icon="long" aside={<Info title="Il lungo"><p>Corsa più lunga di ogni settimana (Garmin e Strava) e lunghi in programma su Runna prima della gara.</p><p>Aumenti oltre il 10% rispetto alla corsa più lunga dei 30 giorni precedenti sono associati a più infortuni (coorte di 5.205 runner, BJSM 2025).</p></Info>}>
          <p style={{ fontWeight: 600 }}>{long4 ? `Il più lungo delle ultime 4 settimane: ${dec(long4, 1)} km.` : "Nessuna corsa nelle ultime 4 settimane."}{maxLong ? ` Il piano arriva a ${dec(maxLong.km, 0)} km il ${day(maxLong.day, { day: "numeric", month: "short" })}.` : ""}</p>
          <div style={{ marginTop: 10 }}>
            <StackBars cats={weeks} stacks={[{ name: "Corsa più lunga", color: "var(--run)", values: longest }]} fmt={(v) => dec(v, 0)} unit="km" height={110} label="Corsa più lunga per settimana, ultime 12 settimane" catLabel={(w) => day(w, { day: "numeric", month: "short" })} highlight={11} />
          </div>
        </Card>
      </div>

      <details className="card more" id="altre">
        <summary>Stime su altre distanze <Icon name="next" size={16} /></summary>
        {Object.values(fcBy).some(Boolean) ? (
          <DataTable caption="Stime sulle distanze classiche" pinned={false}
            cols={[{ key: "d", label: "Distanza", lead: true }, { key: "s", label: "Stima", r: true }, { key: "f", label: "Forbice", r: true }, { key: "p", label: "Passo", r: true }]}
            rows={DISTS.filter((d) => fcBy[d.key]).map((d) => { const f = fcBy[d.key]!; return { key: d.key, hl: g?.key === d.key, cells: {
              d: { t: d.label, sub: d.key === "m" ? "indicativa: Riegel è ottimista sulla maratona" : undefined },
              s: { t: dur(Math.round(f.s / 5) * 5), v: f.s },
              f: { t: `${dur(Math.round(f.lo / 10) * 10)}–${dur(Math.round(f.hi / 10) * 10)}`, v: f.lo },
              p: { t: paceS(f.s / (d.m / 1000)), v: f.s / d.m },
            } }; })} />
        ) : <p className="note" style={{ marginTop: 8 }}>Servono una gara o un test negli ultimi 12 mesi.</p>}
      </details>

      <details className="card more" id="risultati">
        <summary>Risultati ufficiali{manual.length ? ` (${manual.length})` : ""} <Icon name="next" size={16} /></summary>
        <div className="stack" style={{ marginTop: 10 }}>
          {manual.length > 0 && (
            <DataTable caption="Risultati inseriti" initial={{ key: "d", dir: "desc" }} pinned={false}
              cols={[{ key: "n", label: "Gara o test", lead: true }, { key: "d", label: "Data", r: true, sort: true }, { key: "t", label: "Tempo", r: true, sort: true }]}
              rows={manual.map((r) => ({ key: r.id, cells: {
                n: { t: r.name, href: r.activity_id ? `/attivita/${r.activity_id}` : undefined, sub: `${km(r.dist_m, 2)} km` },
                d: { t: day(r.day, { day: "numeric", month: "short", year: "2-digit" }), v: r.day },
                t: { t: dur(r.time_s), v: r.time_s, sub: `${paceS(r.time_s / (r.dist_m / 1000))} /km` },
              } }))} />
          )}
          <p className="note">Il tempo ufficiale di una gara o di un test vale più del parziale dell&apos;orologio ed è la base della stima. Se quel giorno c&apos;è una corsa con distanza simile (±8%) si abbina da sola.</p>
          <form action={addResult} className="grid g3" style={{ alignItems: "end" }}>
            <label className="fld">Nome<input className="in" name="name" required placeholder="Cronometro 5 km" /></label>
            <label className="fld">Data<input className="in" type="date" name="day" required max={today} /></label>
            <label className="fld">Tipo<select className="in" name="kind"><option value="gara">Gara</option><option value="test">Test</option></select></label>
            <label className="fld">Distanza<select className="in" name="dist" defaultValue="5"><option value="5">5 km</option><option value="10">10 km</option><option value="21">Mezza maratona</option><option value="42">Maratona</option><option value="">Altra (scrivi i km)</option></select></label>
            <label className="fld">Altra distanza (km)<input className="in" name="km" inputMode="decimal" placeholder="es. 15" /></label>
            <label className="fld">Tempo (h:mm:ss o mm:ss)<input className="in" name="time" required placeholder="20:37" inputMode="numeric" /></label>
            <button className="btn primary" type="submit">Aggiungi risultato</button>
          </form>
          {manual.length > 0 && (
            <details className="data"><summary>Elimina un risultato</summary>
              <div className="stack" style={{ marginTop: 8 }}>
                {manual.map((r) => (
                  <form key={r.id} action={delResult} className="row between"><input type="hidden" name="id" value={r.id} /><span>{r.name} · {day(r.day, { day: "numeric", month: "short", year: "numeric" })}</span><button className="btn sm" type="submit">Elimina</button></form>
                ))}
              </div>
            </details>
          )}
        </div>
      </details>

      <details className="card more">
        <summary>Migliori parziali dell&apos;orologio <Icon name="next" size={16} /></summary>
        <p className="note" style={{ marginTop: 8 }}>Il tratto più veloce che Garmin misura dentro una corsa, quasi sempre un allenamento: indicativi, non record ufficiali. Sui tratti brevi il GPS può sbagliare.</p>
        {Object.keys(recAll).length ? (
          <DataTable caption="Migliori parziali per distanza" pinned={false}
            cols={[{ key: "d", label: "Distanza", lead: true }, { key: "s", label: "Tempo", r: true }, { key: "p", label: "Passo", r: true }]}
            rows={DISTS.filter((d) => recAll[d.key]).map((d) => { const r = recAll[d.key]!; return { key: d.key, cells: {
              d: { t: d.label, sub: `${day(r.day, { day: "numeric", month: "short", year: "numeric" })}${r.official ? " · ufficiale" : r.race ? " · in gara" : ""}`, href: r.id ? `/attivita/${r.id}` : undefined },
              s: { t: dur(r.s), v: r.s },
              p: { t: paceS(r.s / (d.m / 1000)), v: r.s / d.m },
            } }; })} />
        ) : null}
      </details>
    </div>
  );
}
