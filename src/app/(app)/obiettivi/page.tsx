import Link from "next/link";
import { revalidatePath } from "next/cache";
import { invalidate } from "@/lib/cache";
import { q } from "@/lib/db";
import { day, dec, dur, km, todayLocal } from "@/lib/fmt";
import { progressData } from "@/lib/progress-server";
import { forecast } from "@/lib/progress";
import { Card, Empty, Head } from "@/components/Head";
import { Icon } from "@/components/Icon";

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
  invalidate();
  revalidatePath("/obiettivi");
}
async function toggle(fd: FormData) {
  "use server";
  await q("update sport.goals set active = not active where id = $1", [String(fd.get("id"))]);
  invalidate();
  revalidatePath("/obiettivi");
}

export default async function Page() {
  const goals = await q<{ id: string; name: string; kind: string; target_date: string | null; target: Record<string, number | null>; active: boolean }>(
    "select id, name, kind, to_char(target_date,'YYYY-MM-DD') as target_date, target, active from sport.goals order by active desc, target_date nulls last");
  const wk = await q<{ km: number; gain: number }>(
    `select coalesce(sum(distance_m) filter (where sport in ('run','trail_run','treadmill')),0)/1000/4 as km, coalesce(sum(elev_gain_m),0)/4 as gain
       from sport.activities where not hidden and start_utc > now() - interval '28 days'`);
  const today = todayLocal();
  const prog = await progressData(today);
  // stima per qualunque distanza: lo sforzo da 5 km in su degli ultimi 90 giorni che dà il tempo più veloce (come in Progressi)
  const predict = (m: number) => forecast(prog.list, m, today)?.s ?? null;
  return (
    <div className="stack-l">
      <Head icon="target" title="Obiettivi" sub="Gare e test arrivano da Runna; volumi e dislivello li aggiungi tu. Il progresso si calcola dai dati." back={{ href: "/gara", label: "Gara" }} />
      {goals.length === 0 && <div className="card"><Empty icon="target" title="Nessun obiettivo" text="Gare e test arrivano da Runna da soli; qui sotto puoi aggiungere volumi settimanali o dislivello." /></div>}
      <div className="grid g2">
        {goals.map((g) => {
          const daysLeft = g.target_date ? Math.round((Date.parse(g.target_date) - Date.parse(today)) / 86400_000) : null;
          const t = g.target;
          let line = "", pred: number | null = null;
          if (g.kind === "volume" && t.km_week) line = `Media ultime 4 settimane: ${dec(wk[0]?.km ?? 0)} km su ${dec(t.km_week)} km (${Math.round(((wk[0]?.km ?? 0) / t.km_week) * 100)}%).`;
          if (g.kind === "dislivello" && t.gain_week_m) line = `Media ultime 4 settimane: ${Math.round(wk[0]?.gain ?? 0)} m su ${Math.round(t.gain_week_m)} m.`;
          if (g.kind === "gara" || g.kind === "test") {
            const range = t.time_min_s && t.time_max_s && t.time_min_s !== t.time_max_s;
            const pc = t.pace_min_s && t.pace_max_s ? (t.pace_min_s === t.pace_max_s ? `${dur(t.pace_min_s)} /km` : `${dur(t.pace_min_s)}–${dur(t.pace_max_s)} /km`) : t.dist_m && t.time_s ? `${dur(t.time_s / (t.dist_m / 1000))} /km` : null;
            line = `${t.dist_m ? `${km(t.dist_m)} km` : ""}${range ? ` in ${dur(t.time_min_s!)}–${dur(t.time_max_s!)}` : t.time_s ? ` in ${dur(t.time_s)}` : ""}${pc ? `, ritmo ${pc}` : ""}`;
            if (t.dist_m) pred = predict(t.dist_m);
          }
          const race = (g.kind === "gara" || g.kind === "test") && g.active && daysLeft !== null && daysLeft >= 0;
          return (
            <section key={g.id} className={`card${race ? " goal" : ""}`} style={{ opacity: g.active ? 1 : 0.6 }}>
              <div className="row between" style={{ alignItems: "flex-start" }}>
                <div style={{ minWidth: 0 }}>
                  <p className="note" style={{ fontWeight: 600 }}><Icon name={g.kind === "test" ? "test" : g.kind === "gara" ? "race" : g.kind === "volume" ? "distance" : "gain"} size={14} /> {g.kind === "test" ? "Test" : g.kind === "gara" ? "Gara" : g.kind === "volume" ? "Volume" : "Dislivello"}{g.id.startsWith("runna:") ? " · da Runna" : ""}</p>
                  <h2 style={{ marginTop: 4 }}>{g.name}</h2>
                </div>
                {race && <div className="count">{daysLeft}<small>giorni</small></div>}
              </div>
              <p style={{ marginTop: 8 }}>{line}</p>
              {pred && <p className="note">Stima di oggi: <b className="mono">{dur(pred)}</b> (dall&apos;ultima gara o test dei 12 mesi){t.time_s ? `, ${pred <= t.time_s ? "dentro" : "oltre"} l'obiettivo di ${dur(Math.abs(pred - t.time_s))}` : ""}.</p>}
              <div className="row between" style={{ marginTop: 10 }}>
                <span className="note">{g.target_date ? day(g.target_date, { day: "numeric", month: "long", year: "numeric" }) : "senza data"}</span>
                <form action={toggle}><input type="hidden" name="id" value={g.id} /><button className="btn sm">{g.active ? "Archivia" : "Riattiva"}</button></form>
              </div>
            </section>
          );
        })}
      </div>
      <Card title="Nuovo obiettivo" icon="target">
        <form action={addGoal} className="grid g3" style={{ alignItems: "end" }}>
          <label className="fld">Nome<input className="in" name="name" required placeholder="Mezza maratona di Antananarivo" /></label>
          <label className="fld">Tipo<select className="in" name="kind"><option value="gara">Gara</option><option value="volume">Km di corsa a settimana</option><option value="dislivello">Dislivello a settimana</option></select></label>
          <label className="fld">Data<input className="in" type="date" name="date" /></label>
          <label className="fld">Distanza gara (km)<input className="in" name="km" inputMode="decimal" placeholder="21,1" /></label>
          <label className="fld">Tempo obiettivo (h:mm:ss)<input className="in" name="time" placeholder="1:45:00" /></label>
          <label className="fld">Valore settimanale (km o m)<input className="in" name="weekly" inputMode="decimal" /></label>
          <button className="btn primary" type="submit">Aggiungi obiettivo</button>
        </form>
      </Card>
      <p className="note">Stima: stesso metodo della pagina <Link href="/gara">Gara</Link>, ancorato all&apos;ultima gara o test dei 12 mesi.</p>
    </div>
  );
}
