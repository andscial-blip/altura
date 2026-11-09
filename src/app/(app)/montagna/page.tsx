import Link from "next/link";
import { mountainActs, mountainCurve } from "@/lib/queries";
import { kmEffort } from "@/lib/mountain";
import { day, dec, hm, int, km, todayLocal } from "@/lib/fmt";
import { addDays } from "@/lib/dates";
import { StackBars } from "@/components/charts";
import { Card, Empty, Head, Info, Legend, Verdict } from "@/components/Head";
import { DataTable } from "@/components/DataTable";
import { GpxEstimate } from "@/components/GpxEstimate";

export const dynamic = "force-dynamic";
const SPORT: Record<string, string> = { hike: "Escursione", walk: "Camminata", trail_run: "Trail" };

/** Montagna: km-sforzo e VAM delle uscite, come vai in salita e in discesa, stima dei tempi di un percorso. */
export default async function Page() {
  const today = todayLocal();
  const [acts, mc] = await Promise.all([mountainActs(), mountainCurve()]);
  const withEffort = acts.filter((a) => a.dist > 0).map((a) => ({ ...a, eff: kmEffort(a.dist, a.gain), vam: mc.vam[a.id]?.best ?? null }));
  const effs = withEffort.map((a) => a.eff).sort((a, b) => a - b);
  const q = (p: number) => effs.length ? effs[Math.floor((effs.length - 1) * p)] : 0;
  const lo = q(1 / 3), hi = q(2 / 3);
  const level = (e: number) => (e >= hi ? "dura" : e <= lo ? "facile" : "media");
  const last = withEffort[0];
  const year = withEffort.filter((a) => a.day > addDays(today, -365));
  const vams = withEffort.filter((a) => a.vam).slice(0, 12);
  const bestVam = vams.reduce((m, a) => Math.max(m, a.vam ?? 0), 0);
  const curve = mc.curve.filter((c) => c.g >= -30 && c.g <= 30);
  const known = curve.filter((c) => c.p50 !== null).length;

  return (
    <div className="stack-l">
      <Head icon="mountain" title="Montagna" back={{ href: "/allenamento", label: "Allenamento" }} sub="Escursioni, camminate e trail: fatica reale, salite e tempi dei percorsi." />
      {last ? (
        <div className="card"><Verdict level="na" sub={`${year.length} uscite negli ultimi 12 mesi${bestVam ? ` · miglior VAM recente ${int(bestVam)} m/h` : ""}.`}>
          Ultima: {last.name ?? SPORT[last.sport]}, {day(last.day, { day: "numeric", month: "short" })}: {dec(last.eff, 0)} km-sforzo, per te un&apos;uscita {level(last.eff)}.
        </Verdict></div>
      ) : <div className="card"><Empty icon="mountain" title="Nessuna uscita in montagna" text="Escursioni, camminate e trail arrivano da Garmin e Strava." /></div>}

      <div className="grid g2">
        <Card title="Stima i tempi di un percorso" icon="clock" aside={<Info title="Come si stima"><p>Il percorso si divide in tratti da 50 m. Per ogni tratto si usa la tua velocità su quella pendenza, ricavata da {mc.n} uscite registrate (solo tempo in movimento). Dove hai pochi dati si usa la formula di Tobler.</p><p>Oltre le 3 ore si aggiunge il 5% per la fatica. Le app note sbagliano in media di 30–70 minuti sui sentieri italiani (studio 2025): questa stima parte dal tuo passo reale.</p></Info>}>
          {known >= 4 ? <GpxEstimate curve={mc.curve} /> : <Empty inline icon="clock" title="Servono più uscite con quota e tempi" text="La stima usa la tua velocità sulle diverse pendenze: arriva dopo qualche escursione registrata con Garmin." />}
        </Card>

        <Card title="Come vai in salita e in discesa" icon="gain" aside={<Info title="Curva velocità-pendenza"><p>Velocità orizzontale mediana (km/h) per fascia di pendenza, da tutte le tue escursioni, camminate e trail, escluse le soste. La linea è la formula di Tobler, il riferimento classico per un escursionista medio.</p><p>Barre sopra la linea: su quella pendenza vai più veloce del riferimento.</p></Info>}>
          {known >= 4 ? (
            <>
              <StackBars cats={curve.map((c) => String(c.g))} stacks={[{ name: "Tu", color: "var(--mnt)", values: curve.map((c) => c.p50 ?? 0) }]} line={{ name: "Tobler", values: curve.map((c) => c.tobler) }}
                fmt={(v) => dec(v, 1)} unit="km/h" height={140} label="Velocità per pendenza, tua e di riferimento" catLabel={(g) => `${Number(g) > 0 ? "+" : ""}${g}%`} />
              <Legend items={[{ label: "Tua velocità mediana", color: "var(--mnt)" }, { label: "Riferimento Tobler", color: "var(--ink)", line: true }]} />
            </>
          ) : <Empty inline icon="gain" title="Pochi dati" text="Servono uscite con quota e tempi registrati." />}
        </Card>
      </div>

      <Card title="Le tue uscite" icon="mountain" aside={<Info title="Km-sforzo e VAM"><p>Km-sforzo = km + dislivello positivo / 100 (il metodo usato da ITRA): mette sulla stessa scala uscite molto diverse. Facile, media e dura sono rispetto al tuo storico (terzi).</p><p>VAM: metri di dislivello all&apos;ora sulla salita lunga più veloce (almeno 150 m e 8% di pendenza). Confrontala tra uscite con battito simile.</p></Info>}>
        {withEffort.length ? (
          <DataTable caption="Uscite in montagna" initial={{ key: "d", dir: "desc" }} pinned={false}
            cols={[{ key: "n", label: "Uscita", lead: true }, { key: "d", label: "Data", r: true, sort: true }, { key: "e", label: "Km-sforzo", r: true, sort: true }, { key: "g", label: "D+", r: true, sort: true }, { key: "v", label: "VAM", r: true, sort: true }]}
            rows={withEffort.slice(0, 30).map((a) => ({ key: a.id, cells: {
              n: { t: a.name ?? SPORT[a.sport] ?? "Uscita", href: `/attivita/${a.id}`, sub: `${SPORT[a.sport] ?? a.sport}${a.place ? ` · ${a.place}` : ""} · ${km(a.dist)} km · ${hm(a.time)}` },
              d: { t: day(a.day, { day: "numeric", month: "short", year: "2-digit" }), v: a.day },
              e: { t: dec(a.eff, 0), v: a.eff, sub: level(a.eff) },
              g: { t: `${int(a.gain)} m`, v: a.gain },
              v: { t: a.vam ? `${int(a.vam)} m/h` : "–", v: a.vam },
            } }))} />
        ) : null}
      </Card>
      <p className="note"><Link href="/analisi?sport=montagna">Volumi e dislivello nel tempo</Link> · <Link href="/mappa?s=montagna">Mappa delle uscite</Link></p>
    </div>
  );
}
