import { revalidatePath } from "next/cache";
import { q } from "@/lib/db";
import { day, dec, dur, km, todayLocal } from "@/lib/fmt";

export const dynamic = "force-dynamic";

async function addGoal(fd: FormData) {
  "use server";
  const name = String(fd.get("name") ?? "").trim().slice(0, 80);
  const kind = String(fd.get("kind") ?? "gara");
  const date = String(fd.get("date") ?? "") || null;
  const distKm = Number(String(fd.get("km") ?? "").replace(",", ".")) || null;
  const t = String(fd.get("time") ?? "").trim();
  const parts = t ? t.split(":").map(Number) : [];
  const time_s = parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts.length === 2 ? parts[0] * 60 + parts[1] : null;
  const weekly = Number(String(fd.get("weekly") ?? "").replace(",", ".")) || null;
  if (!name) return;
  const target = kind === "gara" ? { dist_m: distKm ? distKm * 1000 : null, time_s } : kind === "volume" ? { km_week: weekly } : { gain_week_m: weekly };
  await q("insert into sport.goals(id, name, kind, target_date, target) values (gen_random_uuid()::text, $1, $2, $3, $4::jsonb)", [name, kind, date, JSON.stringify(target)]);
  revalidatePath("/obiettivi");
}
async function toggle(fd: FormData) {
  "use server";
  await q("update sport.goals set active = not active where id = $1", [String(fd.get("id"))]);
  revalidatePath("/obiettivi");
}

export default async function Page() {
  const goals = await q<{ id: string; name: string; kind: string; target_date: string | null; target: Record<string, number | null>; active: boolean }>(
    "select id, name, kind, to_char(target_date,'YYYY-MM-DD') as target_date, target, active from sport.goals order by active desc, target_date nulls last");
  const wk = await q<{ km: number; gain: number }>(
    `select coalesce(sum(distance_m) filter (where sport in ('run','trail_run','treadmill')),0)/1000/4 as km, coalesce(sum(elev_gain_m),0)/4 as gain
       from sport.activities where not hidden and start_utc > now() - interval '28 days'`);
  const today = todayLocal();
  return (
    <div className="stack">
      <div className="head"><div><h1>Obiettivi</h1><p>Gare, volumi settimanali, dislivello. Il progresso si calcola dai dati, non si dichiara.</p></div></div>
      {goals.length === 0 && <div className="panel"><p className="empty">Nessun obiettivo. Aggiungine uno qui sotto, per esempio la prossima gara.</p></div>}
      <div className="grid g2">
        {goals.map((g) => {
          const weeksLeft = g.target_date ? Math.ceil((Date.parse(g.target_date) - Date.parse(today)) / (7 * 86400_000)) : null;
          let progress = "";
          if (g.kind === "volume" && g.target.km_week) progress = `Media ultime 4 settimane: ${dec(wk[0]?.km ?? 0)} km su ${dec(g.target.km_week)} km (${Math.round(((wk[0]?.km ?? 0) / g.target.km_week) * 100)}%).`;
          if (g.kind === "dislivello" && g.target.gain_week_m) progress = `Media ultime 4 settimane: ${Math.round(wk[0]?.gain ?? 0)} m su ${Math.round(g.target.gain_week_m)} m.`;
          if (g.kind === "gara" || g.kind === "test") {
            const t = g.target;
            const range = t.time_min_s && t.time_max_s && t.time_min_s !== t.time_max_s;
            const pace = t.pace_min_s && t.pace_max_s ? (t.pace_min_s === t.pace_max_s ? `${dur(t.pace_min_s)} /km` : `${dur(t.pace_min_s)}–${dur(t.pace_max_s)} /km`) : t.dist_m && t.time_s ? `${dur(t.time_s / (t.dist_m / 1000))} /km` : null;
            progress = `${t.dist_m ? `${km(t.dist_m)} km` : ""}${range ? ` in ${dur(t.time_min_s!)}–${dur(t.time_max_s!)}` : t.time_s ? ` in ${dur(t.time_s)}` : ""}${pace ? `, ritmo ${pace}` : ""}.`;
          }
          return (
            <section key={g.id} className="panel" style={{ opacity: g.active ? 1 : 0.6 }}>
              <div className="row between"><h2>{g.name}</h2>{g.id.startsWith("runna:") && <span className="state ok">{g.kind === "test" ? "Test" : "Gara"} · da Runna</span>}<form action={toggle}><input type="hidden" name="id" value={g.id} /><button className="btn">{g.active ? "Archivia" : "Riattiva"}</button></form></div>
              <p>{progress}</p>
              {g.target_date && <p className="note">{day(g.target_date, { day: "numeric", month: "long", year: "numeric" })}{weeksLeft !== null && weeksLeft >= 0 ? `, tra ${weeksLeft} settimane` : ""}</p>}
            </section>
          );
        })}
      </div>
      <section className="panel">
        <h2>Nuovo obiettivo</h2>
        <form action={addGoal} className="grid g3" style={{ alignItems: "end" }}>
          <label className="stack" style={{ gap: 4 }}><span className="note">Nome</span><input className="in" name="name" required placeholder="Mezza maratona di Antananarivo" /></label>
          <label className="stack" style={{ gap: 4 }}><span className="note">Tipo</span><select className="in" name="kind"><option value="gara">Gara</option><option value="volume">Km di corsa a settimana</option><option value="dislivello">Dislivello a settimana</option></select></label>
          <label className="stack" style={{ gap: 4 }}><span className="note">Data</span><input className="in" type="date" name="date" /></label>
          <label className="stack" style={{ gap: 4 }}><span className="note">Distanza gara (km)</span><input className="in" name="km" inputMode="decimal" placeholder="21,1" /></label>
          <label className="stack" style={{ gap: 4 }}><span className="note">Tempo obiettivo (h:mm:ss)</span><input className="in" name="time" placeholder="1:45:00" /></label>
          <label className="stack" style={{ gap: 4 }}><span className="note">Valore settimanale (km o m)</span><input className="in" name="weekly" inputMode="decimal" /></label>
          <button className="btn primary" type="submit">Aggiungi obiettivo</button>
        </form>
      </section>
    </div>
  );
}
