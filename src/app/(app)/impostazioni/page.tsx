import { Card, Empty, Head } from "@/components/Head";
import { DataTable } from "@/components/DataTable";
import { revalidatePath } from "next/cache";
import { invalidate } from "@/lib/cache";
import { q } from "@/lib/db";
import { lastSyncs } from "@/lib/queries";
import { garminHistoryState, setGarminHistory } from "@/lib/garmin";
import { disconnectStrava, stravaConnection } from "@/lib/strava";
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
  invalidate();
  revalidatePath("/impostazioni");
}
async function delZone(fd: FormData) {
  "use server";
  await q("delete from sport.private_zones where id = $1", [String(fd.get("id"))]);
  invalidate();
  revalidatePath("/impostazioni");
}
async function history(fd: FormData) {
  "use server";
  const d = String(fd.get("from") ?? "");
  await setGarminHistory(/^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);
  invalidate();
  revalidatePath("/impostazioni");
}
async function forgetGarminToken() {
  "use server";
  await q("delete from sport.settings where key = 'garmin_token'");
  invalidate();
  revalidatePath("/impostazioni");
}
async function stravaOff() {
  "use server";
  await disconnectStrava();
  invalidate();
  revalidatePath("/impostazioni");
}
const STRAVA_MSG: Record<string, string> = {
  ok: "Strava collegato. Le attività arrivano con la prossima sincronizzazione (lo storico in più passaggi).",
  negato: "Autorizzazione annullata su Strava.",
  permessi: "Serve il permesso di leggere le attività: ricollega e lascia spuntata la casella delle attività.",
  stato: "Richiesta scaduta o non valida: riprova.",
  config: "Mancano STRAVA_CLIENT_ID e STRAVA_CLIENT_SECRET su Vercel.",
  errore: "Strava non ha accettato il codice: riprova tra poco.",
};
async function deleteSource(fd: FormData) {
  "use server";
  const s = String(fd.get("source"));
  if (String(fd.get("confirm")) !== "ELIMINA" || !["strava", "apple_health", "runna"].includes(s)) return;
  // toglie la fonte; le attività che restano senza fonti vengono eliminate, le altre ricalcolate alla prossima sincronizzazione
  await q("delete from sport.activity_sources where source = $1", [s]);
  await q("delete from sport.activities a where not exists (select 1 from sport.activity_sources x where x.activity_id = a.id)");
  await q("delete from sport.daily_metrics where source = $1", [s]);
  if (s === "runna") await q("delete from sport.planned_workouts where source = 'runna'");
  invalidate();
  revalidatePath("/", "layout");
}

export default async function Page({ searchParams }: { searchParams: Promise<{ strava?: string }> }) {
  const sp = await searchParams;
  const [syncs, zones, passkeys, hist, counts, sconn] = await Promise.all([
    lastSyncs(),
    q<{ id: string; label: string; lat: string; lon: string; radius_m: number }>("select id, label, lat::text, lon::text, radius_m from sport.private_zones order by label"),
    q<{ id: string; device_label: string | null; created_at: string; last_used_at: string | null }>("select id, device_label, created_at, last_used_at from sport.passkeys order by created_at"),
    garminHistoryState(),
    q<{ source: string; n: number }>("select source, count(*)::int as n from sport.activity_sources group by source"),
    stravaConnection(),
  ]);
  const env = { garmin: !!process.env.GARMIN_API_KEY, runna: !!process.env.RUNNA_ICS_URL, strava: !!(process.env.STRAVA_CLIENT_ID && process.env.STRAVA_CLIENT_SECRET) };
  const n = (s: string) => counts.find((c) => c.source === s)?.n ?? 0;
  const st = (s: string) => syncs.find((x) => x.source === s);
  const HOW: Record<string, string> = {
    garmin: env.garmin ? "Chiave personale Garmin presente sul server." : "Manca la chiave: va aggiunta su Vercel come GARMIN_API_KEY.",
    runna: env.runna ? "Indirizzo del calendario iCal Runna presente sul server." : "Manca l'indirizzo iCal di Runna: va aggiunto su Vercel come RUNNA_ICS_URL.",
    apple_health: "Automazione Comandi Rapidi sull'iPhone con un token creato qui sotto.",
    strava: !env.strava ? "Manca l'app API Strava: STRAVA_CLIENT_ID e STRAVA_CLIENT_SECRET su Vercel." : sconn.connected ? `Collegato con OAuth${sconn.all ? " (anche attività private)" : ""}; token salvati cifrati.` : "App API pronta: manca il collegamento (pulsante qui sotto).",
  };
  const stLabel = (x?: { status: string }) => (!x ? ["mai", ""] : x.status === "ok" ? ["riuscita", "ok"] : x.status === "partial" ? ["parziale", "warn"] : x.status === "running" ? ["in corso", ""] : ["errore", "bad"]);
  return (
    <div className="stack-l">
      <Head title="Impostazioni" sub="Collegamenti, storico, privacy e accesso." acts={<SyncOnOpen />} />

      <Card title="Collegamenti" icon="sync" aside="chiavi solo sul server">
        <DataTable caption="Stato delle fonti" cols={[{ key: "f", label: "Fonte", lead: true }, { key: "how", label: "Come arrivano i dati" }, { key: "n", label: "Attività", r: true }, { key: "last", label: "Ultima sincronizzazione" }]}
          rows={["garmin", "runna", "apple_health", "strava"].map((s) => {
            const r = st(s); const [lbl] = stLabel(r);
            return { key: s, cells: { f: { t: SOURCE_LABEL[s] }, how: { t: HOW[s] }, n: { t: String(n(s)), v: n(s) }, last: { t: r ? `${ago(r.started_at)} · ${lbl}` : "mai", sub: r?.message && r.message !== "ok" ? r.message : undefined } } };
          })} />
        <p className="note" style={{ marginTop: 10 }}>Le chiavi stanno solo nelle variabili d&apos;ambiente del server (Vercel), mai nel browser, nel codice o nei registri. Il token Garmin derivato è salvato cifrato.</p>
      </Card>

      <div className="grid g2">
        <Card title="Strava" icon="activity">
          <div className="stack">
            {sp.strava && STRAVA_MSG[sp.strava] ? <p className={`alert ${sp.strava === "ok" ? "ok" : ""}`} role="status">{STRAVA_MSG[sp.strava]}</p> : null}
            <p className="note">Serve soprattutto per lo storico registrato prima di Garmin e per i nomi delle uscite. Le uscite registrate da entrambi restano una sola attività. I dati Strava si vedono solo qui e non servono ad addestrare modelli.</p>
            {sconn.connected
              ? <form action={stravaOff} className="row between"><span className="badge ok">Collegato{sconn.athlete_id ? ` · atleta ${sconn.athlete_id}` : ""}</span><button className="btn sm">Scollega Strava</button></form>
              : env.strava
                ? <div className="row"><a className="btn primary" href="/api/strava/connect">Collega Strava</a></div>
                : <p className="alert">Prima crea l&apos;app API su strava.com/settings/api e aggiungi STRAVA_CLIENT_ID e STRAVA_CLIENT_SECRET su Vercel.</p>}
          </div>
        </Card>

        <Card title="Storico Garmin" icon="clock">
          <div className="stack">
            <dl className="kv">
              <dt>Importa dal</dt><dd className="mono">{hist.history_from ?? "ultimi 4 mesi"}</dd>
              <dt>Attività arrivate al</dt><dd className="mono">{hist.backfill_before ?? "–"}{hist.history_from && hist.backfill_before && hist.backfill_before <= hist.history_from ? " · completo" : ""}</dd>
              <dt>Sonno, variabilità, battito arrivati al</dt><dd className="mono">{hist.daily_back_before ?? (hist.history_from ? "in attesa" : "ultimi 4 mesi")}{hist.history_from && hist.daily_back_before && hist.daily_back_before <= hist.history_from ? " · completo" : ""}</dd>
              <dt>File FIT in coda</dt><dd className="mono">{hist.fit_pending}</dd>
            </dl>
            <p className="note">Ogni sincronizzazione scende di qualche mese finché ha tempo; i file FIT (tracciato, altimetria, giri) arrivano a gruppi. Tocca l&apos;icona di sincronizzazione per farla avanzare.</p>
            <form action={history} className="row"><label className="fld" style={{ flex: 1 }}>Importa dal<input className="in" type="date" name="from" defaultValue={hist.history_from ?? "2022-01-01"} /></label><button className="btn" style={{ alignSelf: "flex-end" }}>Imposta</button></form>
            <form action={forgetGarminToken}><button className="btn sm">Dimentica il token Garmin salvato</button></form>
          </div>
        </Card>
      </div>

      <Card title="Metodo della sintesi di Oggi" icon="target" aside="regole fisse">
        <p className="note" style={{ marginBottom: 8 }}>La sintesi confronta i dati di oggi con la tua norma recente. Un segnale è &quot;da considerare&quot; quando:</p>
        <dl className="kv" style={{ maxWidth: 720 }}>
          <dt>Variabilità notturna</dt><dd>sotto il limite basso della tua fascia abituale (calcolata da Garmin)</dd>
          <dt>Battito a riposo</dt><dd>5 bpm o più sopra la media dei 7 giorni precedenti</dd>
          <dt>Sonno</dt><dd>meno di 6 ore, o più di 1 ora sotto la media delle 7 notti precedenti</dd>
          <dt>Carico 7/28 giorni</dt><dd>rapporto sopra 1,3 (aumento rapido)</dd>
        </dl>
        <p className="note" style={{ marginTop: 8 }}>Valgono solo i dati di oggi. Con meno di due segnali disponibili la sintesi dice &quot;dati insufficienti&quot;. Non è un consiglio medico né di allenamento.</p>
      </Card>

      <Tokens />

      <div className="grid g2">
        <Card title="Zone private" icon="map">
          <div className="stack">
            <p className="note">I punti GPS entro il raggio non compaiono mai su mappe e miniature.</p>
            {zones.length ? zones.map((z) => <form key={z.id} action={delZone} className="row between"><span>{z.label} · raggio {z.radius_m} m</span><input type="hidden" name="id" value={z.id} /><button className="btn sm danger">Rimuovi</button></form>)
              : <Empty inline icon="map" title="Nessuna zona privata" text="Aggiungi casa o lavoro per nasconderne i dintorni." />}
            <form action={addZone} className="grid g2 t2" style={{ alignItems: "end" }}>
              <label className="fld">Nome<input className="in" name="label" placeholder="Casa" /></label>
              <label className="fld">Raggio (m)<input className="in" name="r" type="number" min={100} max={2000} defaultValue={400} /></label>
              <label className="fld">Latitudine<input className="in" name="lat" placeholder="-13,6833" inputMode="decimal" required /></label>
              <label className="fld">Longitudine<input className="in" name="lon" placeholder="48,4500" inputMode="decimal" required /></label>
              <button className="btn primary">Aggiungi zona</button>
            </form>
          </div>
        </Card>
        <Devices passkeys={passkeys.map((p) => ({ ...p, created: when(p.created_at), used: p.last_used_at ? ago(p.last_used_at) : "mai" }))} />
      </div>

      <Card title="Elimina i dati di una fonte" icon="settings">
        <div className="stack">
          <p className="note">Toglie tutti i record di quella fonte; le attività registrate solo da lì spariscono, le altre restano con le fonti rimanenti. Scrivi ELIMINA per confermare: non si può annullare.</p>
          <form action={deleteSource} className="grid g3" style={{ alignItems: "end" }}>
            <label className="fld">Fonte<select className="in" name="source">{["runna", "apple_health", "strava"].map((s) => <option key={s} value={s}>{SOURCE_LABEL[s]}</option>)}</select></label>
            <label className="fld">Conferma<input className="in" name="confirm" placeholder="ELIMINA" autoComplete="off" /></label>
            <button className="btn danger">Elimina i dati</button>
          </form>
        </div>
      </Card>
    </div>
  );
}
