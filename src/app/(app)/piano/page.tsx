import Link from "next/link";
import { planned } from "@/lib/queries";
import { day, dec, dur, hm, km, pace, todayLocal } from "@/lib/fmt";
import { compare, type Step } from "@/lib/runna-parse";

export const dynamic = "force-dynamic";
const add = (d: string, n: number) => { const x = new Date(d + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const monday = (d: string) => { const x = new Date(d + "T12:00:00Z"); const w = (x.getUTCDay() + 6) % 7; return add(d, -w); };
const STATE: Record<string, [string, string]> = { completato: ["fatta", "ok"], programmato: ["in programma", ""], rimosso: ["tolta da Runna", "warn"] };

export default async function Page() {
  const today = todayLocal();
  const from = add(monday(today), -28), to = add(monday(today), 7 * 9 - 1);
  const rows = await planned(from, to);
  const weeks = new Map<string, typeof rows>();
  for (const r of rows) { const w = monday(r.day); weeks.set(w, [...(weeks.get(w) ?? []), r]); }
  const past = rows.filter((r) => r.day < today && r.state !== "rimosso");
  const done = past.filter((r) => r.state === "completato").length;
  return (
    <div className="stack">
      <div className="head">
        <div><h1>Piano</h1><p>Programma Runna (dal calendario iCal ufficiale) confrontato con quello che hai fatto davvero.</p></div>
      </div>
      {rows.length === 0 ? <div className="panel"><p className="empty">Nessuna seduta: il calendario Runna non è ancora collegato o non contiene sedute in questo periodo.</p></div> : (
        <>
          <section className="grid g3">
            <div className="panel metric"><div className="l">Sedute passate fatte</div><div className="v">{done} / {past.length}</div><div className="note">ultime 4 settimane, sedute tolte escluse</div></div>
            <div className="panel metric"><div className="l">Prossime 7 giorni</div><div className="v">{rows.filter((r) => r.day >= today && r.day < add(today, 7) && r.state === "programmato").length}</div><div className="note">sedute in programma</div></div>
            <div className="panel metric"><div className="l">Spostate da Runna</div><div className="v">{rows.filter((r) => r.history?.length).length}</div><div className="note">sedute con una data cambiata</div></div>
          </section>
          {[...weeks.entries()].map(([w, list]) => (
            <section key={w} className="panel scroll-x">
              <h2>Settimana del {day(w, { day: "numeric", month: "long" })}{list[0].week ? `, settimana ${list[0].week} del piano` : ""}</h2>
              <table className="t">
                <thead><tr><th>Giorno</th><th>Seduta</th><th className="r">Previsto</th><th>Stato</th><th>Fatto</th></tr></thead>
                <tbody>{list.map((p) => {
                  const rr = p.runna_raw as { steps?: Step[]; segments?: [number, number][] } | null;
                  const c = rr?.steps && rr.segments ? compare(rr.steps, rr.segments, p.km ? Number(p.km) : null, [p.duration_min_s, p.duration_max_s], p.act_dist ? Number(p.act_dist) / 1000 : null, p.act_time ? Number(p.act_time) : null) : null;
                  const missed = p.state === "programmato" && p.day < today;
                  const [lbl, cls] = missed ? ["non fatta", "bad"] : STATE[p.state] ?? [p.state, ""];
                  return (
                    <tr key={p.key}>
                      <td style={{ whiteSpace: "nowrap" }}>{day(p.day)}{p.history?.length ? <div className="note">era il {day(p.history[p.history.length - 1].date, { day: "numeric", month: "short" })}</div> : null}</td>
                      <td><span style={{ fontWeight: 500 }}>{p.title}</span><div className="note">{p.type}</div></td>
                      <td className="r">{p.km ? `${dec(p.km)} km` : ""}{p.duration_min_s ? <div className="note">{hm(p.duration_min_s)}–{hm(p.duration_max_s)}</div> : null}</td>
                      <td><span className={`state ${cls}`}>{lbl}</span></td>
                      <td>{p.completed_activity ? <Link href={`/attivita/${p.completed_activity}`}>{km(p.act_dist)} km in {dur(p.act_time)}, {pace(p.act_dist, p.act_time)} /km</Link> : "–"}{c ? <div className="note">{String(c.verdict)}</div> : null}</td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </section>
          ))}
          <p className="note">Una seduta è &quot;fatta&quot; quando Runna registra l&apos;uscita e la si abbina al programma (stessa data o un giorno di scarto, stesso titolo o stesso tipo). &quot;Non fatta&quot;: era in programma, la data è passata e nessuna uscita registrata da Runna le corrisponde.</p>
        </>
      )}
    </div>
  );
}
