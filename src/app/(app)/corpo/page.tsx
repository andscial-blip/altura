import Link from "next/link";
import { bodyData } from "@/lib/body-server";
import { rolling } from "@/lib/stats";
import { addDays, range } from "@/lib/dates";
import { day, hm, int, todayLocal } from "@/lib/fmt";
import { TimeChart } from "@/components/charts";
import { Card, Head, Info, Legend, Verdict } from "@/components/Head";
import { CheckIn } from "@/components/CheckIn";
import { CONTEXT_LABEL, type Context } from "@/lib/readiness";

export const dynamic = "force-dynamic";

/** Corpo: recupero bene? Il semaforo di Oggi spiegato, con HRV, battito e sonno rispetto alla tua norma. */
export default async function Page() {
  const today = todayLocal();
  const b = await bodyData(today, 70);
  const { r } = b;
  const days = range(addDays(today, -59), today);
  const val = (m: string) => { const s = b.ser(m); return days.map((d) => s.find((p) => p.day === d)?.value ?? null); };

  const hrv = val("hrv_night"), hrv7 = rolling(hrv, 7, 3);
  const lo = b.last("hrv_baseline_low"), hi = b.last("hrv_baseline_high");
  const rhr = val("resting_hr"), rhr30 = rolling(rhr, 30, 7);
  const sl = val("sleep_s").map((v) => (v ? v / 3600 : null)), sl7 = rolling(sl, 7, 3);
  const steps = b.ser("steps").filter((p) => p.day > addDays(today, -7));
  const stepsAvg = steps.length ? steps.reduce((a, p) => a + p.value, 0) / steps.length : null;
  const sleepWeek = sl.slice(-7).filter((v): v is number => v !== null);
  const sleepWeekAvg = sleepWeek.length >= 3 ? sleepWeek.reduce((a, v) => a + v, 0) / sleepWeek.length : null;
  const sig = (k: string) => r.signals.find((s) => s.key === k)!;
  const recent = b.checkins.filter((c) => c.day > addDays(today, -14) && (c.feel || c.context.length));

  return (
    <div className="stack-l">
      <Head icon="heart" title="Corpo" sub="Recupero rispetto alla tua norma: variabilità, battito a riposo, sonno e come ti senti." />
      <div className="card">
        <Verdict level={r.level} sub={r.advice}>{r.title}</Verdict>
        <ul className="signals" style={{ marginTop: 12 }}>
          {r.signals.map((s) => (
            <li key={s.key}>
              <span className={`ic ${s.state}`} aria-hidden="true">{s.state === "ok" ? "✓" : s.state === "warn" ? "!" : "–"}</span>
              <span><b style={{ fontWeight: 600 }}>{s.label}</b>: {s.text}</span>
              <span className="val">{s.value ?? ""}</span>
            </li>
          ))}
        </ul>
        {r.softened && <p className="note" style={{ marginTop: 8 }}>Con il contesto di oggi ({r.context.map((c) => CONTEXT_LABEL[c].toLowerCase()).join(", ")}) battito e variabilità cambiano anche senza fatica: il rosso diventa giallo.</p>}
      </div>

      {b.checkinAvailable && <div className="card"><CheckIn feel={b.checkin?.feel ?? null} context={(b.checkin?.context ?? []) as Context[]} available /></div>}

      <div className="grid g2">
        <Card title="Variabilità notturna" icon="hrv" aside={<Info title="Variabilità (HRV)"><p>Si guarda la media delle ultime 7 notti rispetto alla tua fascia di normalità calcolata da Garmin, non la singola notte: varia molto da un giorno all&apos;altro (Plews 2013).</p><p>Segnale: media sotto la fascia, oppure due notti di fila sotto. Caldo, alcol e viaggi la abbassano anche senza fatica.</p></Info>}>
          <p style={{ fontWeight: 600 }}>{sig("hrv").state === "na" ? "Poche notti registrate di recente." : `${sig("hrv").text[0].toUpperCase()}${sig("hrv").text.slice(1)}.`}</p>
          <TimeChart label="Variabilità notturna, ultimi 60 giorni" from={days[0]} to={today} fmt={(v) => int(v)} unit="ms" height={120} band={lo && hi ? { lo: lo.value, hi: hi.value } : null}
            series={[{ name: "Media 7 notti", color: "var(--ink)", kind: "line", pts: days.map((d, i) => ({ d, v: hrv7[i] })) }, { name: "Notte", color: "var(--h3)", kind: "dots", width: 4, tip: false, pts: days.map((d, i) => ({ d, v: hrv[i] })) }]} />
          <Legend items={[{ label: "Media 7 notti", color: "var(--ink)", line: true }, { label: "Singola notte", color: "var(--h3)" }, { label: "Tua fascia", color: "var(--band)" }]} />
        </Card>

        <Card title="Battito a riposo" icon="heart" aside={<Info title="Battito a riposo"><p>Confronto con la tua media dei 30 giorni precedenti. Segnale: almeno 5 battiti in più per due giorni, oppure insieme alla variabilità bassa: può indicare fatica o un&apos;infezione in arrivo (Radin 2020).</p></Info>}>
          <p style={{ fontWeight: 600 }}>{sig("rhr").state === "na" ? "Nessun dato di stamattina." : `${sig("rhr").value}: ${sig("rhr").text}.`}</p>
          <TimeChart label="Battito a riposo, ultimi 60 giorni" from={days[0]} to={today} fmt={(v) => int(v)} unit="bpm" height={120}
            series={[{ name: "Battito", color: "var(--z5)", kind: "line", width: 1.5, pts: days.map((d, i) => ({ d, v: rhr[i] })) }, { name: "Media 30 giorni", color: "var(--faint)", kind: "line", dash: true, tip: false, pts: days.map((d, i) => ({ d, v: rhr30[i] })) }]} />
          <Legend items={[{ label: "Battito a riposo", color: "var(--z5)", line: true }, { label: "Media 30 giorni", color: "var(--faint)", dash: true }]} />
        </Card>

        <Card title="Sonno" icon="sleep" aside={<Info title="Sonno"><p>Conta la durata, non le fasi: gli orologi le stimano male (Garmin sovrastima il sonno di circa 38 minuti in uno studio con polisonnografia).</p><p>Riferimenti: almeno 7 ore a notte per un adulto che si allena (AASM); sotto le 6 ore la notte vale come segnale.</p></Info>}>
          <p style={{ fontWeight: 600 }}>{sleepWeekAvg ? `Media dell'ultima settimana ${hm(sleepWeekAvg * 3600)}${sleepWeekAvg < 7 ? ": sotto le 7 ore, il sonno è la priorità." : ": nella norma."}` : "Poche notti registrate."}</p>
          <TimeChart label="Ore di sonno, ultime 60 notti" from={days[0]} to={today} fmt={(v) => (v ? hm(v * 3600) : "–")} step={1} height={120} refLine={{ v: 7, dash: true }}
            series={[{ name: "Notte", color: "var(--swim)", kind: "bars", pts: days.map((d, i) => ({ d, v: sl[i] })) }, { name: "Media 7 notti", color: "var(--ink)", kind: "line", pts: days.map((d, i) => ({ d, v: sl7[i] })) }]} />
          <Legend items={[{ label: "Notte", color: "var(--swim)" }, { label: "Media 7 notti", color: "var(--ink)", line: true }, { label: "7 ore", color: "var(--faint)", dash: true }]} />
        </Card>

        <Card title="Movimento e diario" icon="steps">
          <p style={{ fontWeight: 600 }}>{stepsAvg ? `${int(stepsAvg)} passi al giorno nell'ultima settimana${stepsAvg >= 7000 ? "." : ": sotto i 7.000 consigliati."}` : "Passi non disponibili."}</p>
          {recent.length > 0 ? (
            <ul className="signals" style={{ marginTop: 10 }}>
              {recent.slice(-7).reverse().map((c) => (
                <li key={c.day}><span className={`ic ${c.feel && c.feel <= 2 ? "warn" : "ok"}`} aria-hidden="true">{c.feel ?? "–"}</span><span>{day(c.day, { weekday: "short", day: "numeric", month: "short" })}</span><span className="val">{c.context.map((x) => CONTEXT_LABEL[x as Context]?.toLowerCase() ?? x).join(", ")}</span></li>
              ))}
            </ul>
          ) : <p className="note" style={{ marginTop: 6 }}>Qui comparirà il diario della domanda del mattino.</p>}
        </Card>
      </div>

      <p className="note"><Link href="/salute">Tutti i dati di salute</Link> (Body Battery, punteggio del sonno, stress, periodi lunghi). Altura è uno strumento personale di allenamento, non un dispositivo medico: con febbre, dolore al petto, palpitazioni o svenimenti non allenarti e senti un medico.</p>
    </div>
  );
}
