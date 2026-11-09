import Link from "next/link";
import { Suspense } from "react";
import { periodActs, planned, zoneRows } from "@/lib/queries";
import { intensity, peak, weekChange } from "@/lib/training";
import { addDays, monday } from "@/lib/dates";
import { day, dec, hm, int, todayLocal } from "@/lib/fmt";
import { StackBars } from "@/components/charts";
import { Card, Head, Info, Legend, Verdict } from "@/components/Head";
import { Icon } from "@/components/Icon";
import { RecurringRoutes } from "@/components/Routes";

export const dynamic = "force-dynamic";
const RUN = ["run", "trail_run", "treadmill"];
const TYPE_LABEL: Record<string, string> = { facile: "Facile", qualita: "Qualità", lungo: "Lungo", gara: "Gara", test: "Test", forza: "Forza" };
const KIND = (s: string) => (s === "run" || s === "treadmill" ? "strada" : s === "trail_run" ? "trail" : s === "hike" || s === "walk" ? "montagna" : "altro");
const KIND_LABEL: Record<string, string> = { strada: "Corsa", trail: "Trail", montagna: "Escursione", altro: "Altro" };
const KIND_COLOR: Record<string, string> = { strada: "var(--run)", trail: "var(--z3)", montagna: "var(--mnt)", altro: "var(--oth)" };

/** Allenamento: cosa ho fatto e cosa mi aspetta. Settimana, intensità, volume, percorsi ricorrenti. */
export default async function Page() {
  const today = todayLocal();
  const mon = monday(today);
  const from = addDays(mon, -7 * 11);
  const [acts, plan, zones] = await Promise.all([periodActs(from), planned(addDays(mon, -7), addDays(mon, 7 * 30)), zoneRows(addDays(mon, -7 * 3))]);

  // settimana in corso: sedute Runna e uscite registrate
  const week = plan.filter((p) => p.day >= mon && p.day <= addDays(mon, 6) && p.state !== "rimosso");
  const doneWeek = acts.filter((a) => a.day >= mon && a.day <= addDays(mon, 6));
  const runKm = doneWeek.filter((a) => RUN.includes(a.sport)).reduce((s, a) => s + a.dist, 0) / 1000;
  const todo = week.filter((p) => p.state === "programmato" && p.day >= today);
  const todoKm = todo.reduce((s, p) => s + Number(p.km ?? 0), 0);
  const missed = week.filter((p) => p.state === "programmato" && p.day < today);
  const curWeek = plan.find((p) => p.day >= today)?.week ?? null;
  const planWeeks = Math.max(0, ...plan.map((p) => p.week ?? 0));

  // intensità: ultime 4 settimane, una barra per settimana
  const zw = Array.from({ length: 4 }, (_, i) => addDays(mon, -7 * (3 - i)));
  const perWeek = zw.map((w) => ({ w, r: intensity(zones.filter((z) => z.day >= w && z.day < addDays(w, 7))) }));
  const all4 = intensity(zones);

  // volume: 12 settimane, ore per tipo; km di corsa per il confronto
  const weeks = Array.from({ length: 12 }, (_, i) => addDays(mon, 7 * (i - 11)));
  const kinds = ["strada", "trail", "montagna", "altro"].filter((k) => acts.some((a) => KIND(a.sport) === k));
  const stacks = kinds.map((k) => ({ name: KIND_LABEL[k], color: KIND_COLOR[k], values: weeks.map((w) => acts.filter((a) => KIND(a.sport) === k && a.day >= w && a.day < addDays(w, 7)).reduce((s, a) => s + a.time, 0) / 3600) }));
  const runWeeks = weeks.map((w) => acts.filter((a) => RUN.includes(a.sport) && a.day >= w && a.day < addDays(w, 7)).reduce((s, a) => s + a.dist, 0) / 1000);
  const wc = weekChange(runWeeks.slice(0, -1));          // ultima settimana completa contro le 4 prima

  // controllo picchi sul prossimo lungo
  const runs = acts.filter((a) => RUN.includes(a.sport)).map((a) => ({ day: a.day, dist: a.dist }));
  const nextLong = plan.find((p) => p.state === "programmato" && p.day >= today && p.km && Number(p.km) >= 10);
  const pk = nextLong ? peak(runs, nextLong.day, Number(nextLong.km) * 1000) : null;

  const issues = [all4 && !all4.ok ? "intensità" : null, pk?.warn ? "lungo" : null, missed.length ? "sedute saltate" : null].filter(Boolean);
  const level = issues.length === 0 ? "verde" : "giallo";
  const title = issues.length === 0
    ? `Settimana in linea: ${dec(runKm, 1)} km fatti${todoKm ? `, ${dec(todoKm, 1)} ancora in programma` : ""}.`
    : pk?.warn ? `Attenzione al lungo: +${int(pk.pct)}% sulla corsa più lunga del mese.` : all4 && !all4.ok ? `Troppa intensità: ${int(all4.easy * 100)}% del tempo facile (obiettivo circa 80%).` : `${missed.length} ${missed.length === 1 ? "seduta saltata" : "sedute saltate"} questa settimana.`;

  return (
    <div className="stack-l">
      <Head icon="activity" title="Allenamento" sub={curWeek && planWeeks ? `Piano Runna, settimana ${curWeek} di ${planWeeks}.` : "Sedute fatte e in programma."} />
      <div className="card"><Verdict level={level} sub={wc ? `Settimana scorsa ${dec(wc.cur, 0)} km di corsa, ${wc.pct >= 0 ? "+" : "−"}${int(Math.abs(wc.pct))}% sulla media delle 4 precedenti.` : undefined}>{title}</Verdict></div>

      <div className="grid g2">
        <Card title="Questa settimana" icon="calendar" aside={<Link href="/piano">Calendario</Link>}>
          {week.length || doneWeek.length ? (
            <ul className="agenda" aria-label="Sedute della settimana">
              {week.map((p) => {
                const done = p.state === "completato" || (p.completed_activity && p.state !== "programmato");
                const miss = p.state === "programmato" && p.day < today;
                return (
                  <li key={p.key} style={{ borderLeftColor: done ? "var(--good)" : miss ? "var(--warn)" : "var(--line)" }}>
                    <div style={{ minWidth: 0 }}>
                      <div className="t">{p.completed_activity ? <Link href={`/attivita/${p.completed_activity}`}>{p.title}</Link> : p.title}</div>
                      <div className="note">{TYPE_LABEL[p.type] ?? p.type}{p.km && !/\d\s?km/i.test(p.title) ? ` · ${dec(p.km)} km` : ""}</div>
                    </div>
                    <div className="when">
                      <span className="mono">{day(p.day, { weekday: "short", day: "numeric" })}</span>
                      <span className={`badge ${done ? "ok" : miss ? "warn" : p.day === today ? "warn" : ""}`}>{done ? "fatta" : miss ? "non fatta" : p.day === today ? "oggi" : "da fare"}</span>
                    </div>
                  </li>
                );
              })}
              {doneWeek.filter((a) => !week.some((p) => p.completed_activity === a.id)).map((a) => (
                <li key={a.id} style={{ borderLeftColor: "var(--good)" }}>
                  <div style={{ minWidth: 0 }}><div className="t"><Link href={`/attivita/${a.id}`}>{a.name ?? "Uscita"}</Link></div><div className="note">{KIND_LABEL[KIND(a.sport)]} · {dec(a.dist / 1000)} km · {hm(a.time)}</div></div>
                  <div className="when"><span className="mono">{day(a.day, { weekday: "short", day: "numeric" })}</span><span className="badge ok">fuori piano</span></div>
                </li>
              ))}
            </ul>
          ) : <p className="muted">Nessuna seduta questa settimana.</p>}
          {pk && nextLong && (
            <p className={pk.warn ? "alert" : "note"} style={{ marginTop: 10 }}>
              {pk.warn ? <Icon name="load" size={16} /> : null}
              {`Prossimo lungo: ${nextLong.title}, ${day(nextLong.day, { weekday: "short", day: "numeric" })}. ${pk.warn ? `È ${int(pk.pct)}% più lungo della corsa più lunga degli ultimi 30 giorni (${dec(pk.longest / 1000)} km): oltre il +10% il rischio di infortunio sale, tienilo facile.` : `Entro il +10% rispetto alla corsa più lunga del mese (${dec(pk.longest / 1000)} km).`}`}
            </p>
          )}
        </Card>

        <Card title="Intensità" icon="heart" aside={<Info title="Facile, medio, duro"><p>Tempo nelle zone di battito misurato da Garmin nelle corse: facile = zone 1–2, medio = zona 3, duro = zone 4–5.</p><p>Per chi prepara una mezza il riferimento è circa l&apos;80% del tempo facile (Seiler 2010). Sotto il 75% si accumula fatica senza migliorare di più. Il caldo alza il battito: in Madagascar parte del «medio» è dovuto alla temperatura.</p></Info>}>
          {all4 ? (
            <>
              <p style={{ fontWeight: 600 }}>{int(all4.easy * 100)}% facile nelle ultime 4 settimane: {all4.verdict}.</p>
              <div className="stack" style={{ marginTop: 12, gap: 8 }}>
                {perWeek.map(({ w, r }) => (
                  <div key={w} className="row" style={{ flexWrap: "nowrap", gap: 10 }}>
                    <span className="note mono" style={{ width: 52, flex: "none" }}>{day(w, { day: "numeric", month: "short" })}</span>
                    {r ? <div className="ibar" style={{ flex: 1 }} role="img" aria-label={`Settimana del ${day(w, { day: "numeric", month: "short" })}: ${int(r.easy * 100)}% facile, ${int(r.mid * 100)}% medio, ${int(r.hard * 100)}% duro`}>
                      <i className="e" style={{ width: `${r.easy * 100}%` }} /><i className="m" style={{ width: `${r.mid * 100}%` }} /><i className="h" style={{ width: `${r.hard * 100}%` }} />
                    </div> : <span className="note" style={{ flex: 1 }}>nessuna corsa con battito</span>}
                    <span className="note mono" style={{ width: 36, textAlign: "right", flex: "none" }}>{r ? `${int(r.easy * 100)}%` : ""}</span>
                  </div>
                ))}
              </div>
              <Legend items={[{ label: "Facile", color: "var(--z2)" }, { label: "Medio", color: "var(--z3)" }, { label: "Duro", color: "var(--z4)" }]} />
            </>
          ) : <p className="muted">Servono corse con il battito registrato da Garmin.</p>}
        </Card>
      </div>

      <Card title="Volume, ultime 12 settimane" icon="chart" aside={<Info title="Volume"><p>Ore di attività per settimana, divise per tipo. La montagna conta a tempo, non nei km di corsa.</p><p>Il confronto settimanale usa i km di corsa dell&apos;ultima settimana completa contro la media delle 4 precedenti, al posto del rapporto carico acuto/cronico (ACWR), criticato in letteratura.</p></Info>}>
        <StackBars cats={weeks} stacks={stacks} fmt={(v) => dec(v, 1)} unit="h" height={140} label="Ore di attività per settimana e per tipo" catLabel={(w) => day(w, { day: "numeric", month: "short" })} highlight={11} />
        <Legend items={stacks.map((s) => ({ label: s.name, color: s.color }))} />
      </Card>

      <Suspense fallback={<Card title="Percorsi ricorrenti" icon="map"><div className="skel" style={{ height: 160 }} aria-label="Caricamento dei percorsi" /></Card>}>
        <RecurringRoutes />
      </Suspense>

      <nav className="subnav" aria-label="Altro dell'allenamento">
        <Link href="/attivita"><Icon name="activity" size={18} /><span>Tutte le attività<small>elenco, ricerca, filtri</small></span></Link>
        <Link href="/piano"><Icon name="calendar" size={18} /><span>Calendario Runna<small>5 settimane e oltre</small></span></Link>
        <Link href="/montagna"><Icon name="mountain" size={18} /><span>Montagna<small>salite, tempi dei percorsi</small></span></Link>
        <Link href="/mappa"><Icon name="map" size={18} /><span>Mappa<small>dove ti alleni</small></span></Link>
        <Link href="/analisi"><Icon name="chart" size={18} /><span>Analisi per disciplina<small>corsa, montagna, bici, nuoto</small></span></Link>
      </nav>
    </div>
  );
}
