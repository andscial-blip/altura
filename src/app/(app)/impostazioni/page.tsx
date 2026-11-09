import { revalidatePath } from "next/cache";
import { q } from "@/lib/db";
import { lastSyncs } from "@/lib/queries";
import { garminHistoryState, setGarminHistory } from "@/lib/garmin";
import { ago, when, SOURCE_LABEL } from "@/lib/fmt";
import { Tokens } from "./Tokens";
import { Devices } from "./Devices";
import { SyncOnOpen } from "@/components/SyncOnOpen";

export const dynamic = "force-dynamic";

async function addZone(fd: FormData) {
  "use server";
  const lat = Number(String(fd.get("lat")).replace(",", ".")), lon = Number(String(fd.get("lon")).replace(",", "."));
  const r = Math.min(2000, Math.max(100, Number(fd.get("r")) || 400));
  const label = String(fd.get("label") ?? "").slice(0, 60) || "Zona privata";
  if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) return;
  await q("insert into sport.private_zones(label, lat, lon, radius_m) values ($1,$2,$3,$4)", [label, lat, lon, r]);
  revalidatePath("/impostazioni");
}
async function delZone(fd: FormData) {
  "use server";
  await q("delete from sport.private_zones where id = $1", [String(fd.get("id"))]);
  revalidatePath("/impostazioni");
}
async function history(fd: FormData) {
  "use server";
  const d = String(fd.get("from") ?? "");
  await setGarminHistory(/^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);
  revalidatePath("/impostazioni");
}
async function forgetGarminToken() {
  "use server";
  await q("delete from sport.settings where key = 'garmin_token'");
  revalidatePath("/impostazioni");
}
async function deleteSource(fd: FormData) {
  "use server";
  const s = String(fd.get("source"));
  if (String(fd.get("confirm")) !== "ELIMINA" || !["strava", "apple_health", "runna"].includes(s)) return;
  // toglie la fonte; le attività che restano senza fonti vengono eliminate, le altre ricalcolate alla prossima sincronizzazione
  await q("delete from sport.activity_sources where source = $1", [s]);
  await q("delete from sport.activities a where not exists (select 1 from sport.activity_sources x where x.activity_id = a.id)");
  await q("delete from sport.daily_metrics where source = $1", [s]);
  if (s === "runna") await q("delete from sport.planned_workouts where source = 'runna'");
  revalidatePath("/", "layout");
}

export default async function Page() {
  const [syncs, zones, passkeys, hist, counts] = await Promise.all([
    lastSyncs(),
    q<{ id: string; label: string; lat: string; lon: string; radius_m: number }>("select id, label, lat::text, lon::text, radius_m from sport.private_zones order by label"),
    q<{ id: string; device_label: string | null; created_at: string; last_used_at: string | null }>("select id, device_label, created_at, last_used_at from sport.passkeys order by created_at"),
    garminHistoryState(),
    q<{ source: string; n: number }>("select source, count(*)::int as n from sport.activity_sources group by source"),
  ]);
  const env = { garmin: !!process.env.GARMIN_API_KEY, runna: !!process.env.RUNNA_ICS_URL, strava: !!(process.env.STRAVA_CLIENT_ID && process.env.STRAVA_CLIENT_SECRET) };
  const n = (s: string) => counts.find((c) => c.source === s)?.n ?? 0;
  const st = (s: string) => syncs.find((x) => x.source === s);
  const HOW: Record<string, string> = {
    garmin: env.garmin ? "Chiave personale Garmin presente sul server." : "Manca la chiave: va aggiunta su Vercel come GARMIN_API_KEY.",
    runna: env.runna ? "Indirizzo del calendario iCal Runna presente sul server." : "Manca l'indirizzo iCal di Runna: va aggiunto su Vercel come RUNNA_ICS_URL.",
    apple_health: "Automazione Comandi Rapidi sull'iPhone con un token creato qui sotto.",
    strava: env.strava ? "App API Strava configurata." : "Non collegata. Garmin registra già le stesse attività; Strava resta facoltativo.",
  };
  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="head"><div><h1>Impostazioni</h1><p>Collegamenti, privacy e accesso.</p></div><SyncOnOpen /></div>

      <section className="panel scroll-x">
        <h2>Collegamenti</h2>
        <table className="t">
          <thead><tr><th>Fonte</th><th>Come arrivano i dati</th><th className="r">Attività</th><th>Ultima sincronizzazione</th></tr></thead>
          <tbody>{["garmin", "runna", "apple_health", "strava"].map((s) => {
            const r = st(s);
            return (
              <tr key={s}>
                <td style={{ fontWeight: 500 }}>{SOURCE_LABEL[s]}</td>
                <td>{HOW[s]}</td>
                <td className="r">{n(s)}</td>
                <td>{r ? <>{ago(r.started_at)} <span className={`state ${r.status === "ok" ? "ok" : r.status === "error" ? "bad" : "warn"}`}>{r.status}</span>{r.message && r.message !== "ok" ? <div className="note">{r.message}</div> : null}</> : "mai"}</td>
              </tr>
            );
          })}</tbody>
        </table>
        <p className="note" style={{ marginTop: 10 }}>Le chiavi stanno solo nelle variabili d&apos;ambiente del server (Vercel), mai nel browser, nel codice o nei registri. Il token Garmin derivato è salvato cifrato.</p>
      </section>

      <section className="grid g2">
        <div className="panel stack">
          <h2>Storico Garmin</h2>
          <p className="note">Ogni sincronizzazione importa anche un blocco di 60 giorni più vecchio, fino alla data scelta. I file FIT (tracciato e altimetria) arrivano a gruppi.</p>
          <p>{hist.history_from ? `Importazione dal ${hist.history_from}; arrivata al ${hist.backfill_before ?? "–"}.` : `Importati gli ultimi mesi${hist.backfill_before ? ` (dal ${hist.backfill_before})` : ""}.`} File FIT in coda: {hist.fit_pending}.</p>
          <form action={history} className="row"><input className="in" type="date" name="from" defaultValue={hist.history_from ?? "2022-01-01"} aria-label="Importa dal" /><button className="btn">Importa lo storico da questa data</button></form>
          <form action={forgetGarminToken}><button className="btn">Dimentica il token Garmin salvato</button></form>
        </div>
        <div className="panel stack">
          <h2>Zone private</h2>
          <p className="note">I punti GPS entro il raggio non vengono mai mostrati sulle mappe.</p>
          {zones.map((z) => <form key={z.id} action={delZone} className="row between"><span>{z.label}, raggio {z.radius_m} m</span><input type="hidden" name="id" value={z.id} /><button className="btn danger">Rimuovi</button></form>)}
          <form action={addZone} className="grid g2" style={{ alignItems: "end" }}>
            <input className="in" name="label" placeholder="Casa" aria-label="Nome della zona" />
            <input className="in" name="r" type="number" min={100} max={2000} defaultValue={400} aria-label="Raggio in metri" />
            <input className="in" name="lat" placeholder="Latitudine, es. -13,6833" required aria-label="Latitudine" />
            <input className="in" name="lon" placeholder="Longitudine, es. 48,4500" required aria-label="Longitudine" />
            <button className="btn primary">Aggiungi zona</button>
          </form>
        </div>
      </section>

      <Tokens />

      <section className="grid g2">
        <Devices passkeys={passkeys.map((p) => ({ ...p, created: when(p.created_at), used: p.last_used_at ? ago(p.last_used_at) : "mai" }))} />
        <div className="panel stack">
          <h2>Elimina i dati di una fonte</h2>
          <p className="note">Toglie tutti i record di quella fonte; le attività registrate solo da lì spariscono, le altre restano con le fonti rimanenti. Scrivi ELIMINA per confermare.</p>
          <form action={deleteSource} className="row">
            <select className="in" name="source" aria-label="Fonte">{["runna", "apple_health", "strava"].map((s) => <option key={s} value={s}>{SOURCE_LABEL[s]}</option>)}</select>
            <input className="in" name="confirm" placeholder="ELIMINA" aria-label="Conferma" />
            <button className="btn danger">Elimina</button>
          </form>
        </div>
      </section>
    </div>
  );
}
