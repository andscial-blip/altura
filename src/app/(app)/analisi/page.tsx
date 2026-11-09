import { dailyLoad, runEfficiency, weekly } from "@/lib/queries";
import { acwr, acwrZone, efficiency, trend } from "@/lib/analytics";
import { dec, hm, int, km, todayLocal } from "@/lib/fmt";
import { LineChart, WeekBars } from "@/components/charts";

export const dynamic = "force-dynamic";
const add = (d: string, n: number) => { const x = new Date(d + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

export default async function Page() {
  const today = todayLocal();
  const WEEKS = 16;
  const [wk, load, eff] = await Promise.all([weekly(WEEKS), dailyLoad(120), runEfficiency(180)]);
  const mon = (() => { const x = new Date(today + "T12:00:00Z"); return add(today, -((x.getUTCDay() + 6) % 7)); })();
  const weeks = Array.from({ length: WEEKS + 1 }, (_, i) => add(mon, -7 * (WEEKS - i)));
  const L = acwr(load.map((d) => d.load));
  const ratioNow = L.ratio.at(-1) ?? null;
  const zone = acwrZone(ratioNow);
  const noLoad = load.reduce((a, d) => a + d.n_without, 0);
  const effPts = eff.map((r) => ({ x: r.day, y: efficiency(r.v_mpm, r.hr) }));
  const tr = trend(eff.map((r) => Date.parse(r.day) / 86400_000 / 30), effPts.map((p) => p.y ?? NaN).filter((v) => !Number.isNaN(v)));
  const tot = (f: string) => wk.filter((r) => r.fam === f && r.week >= weeks[weeks.length - 5]).reduce((a, r) => a + r.dist_m, 0) / 4;

  return (
    <div className="stack">
      <div className="head"><div><h1>Analisi</h1><p>Volumi per disciplina, carico e efficienza. Sotto ogni grafico: metodo, fonte e limiti.</p></div></div>

      <section className="grid g3">
        <div className="panel metric"><div className="l">Corsa, media delle ultime 4 settimane</div><div className="v">{km(tot("corsa"))}<span className="u">km/sett.</span></div></div>
        <div className="panel metric"><div className="l">Montagna e cammino, media 4 settimane</div><div className="v">{km(tot("montagna"))}<span className="u">km/sett.</span></div></div>
        <div className="panel metric"><div className="l">Carico acuto / cronico</div><div className="v">{ratioNow === null ? "–" : dec(ratioNow, 2)}</div><div className="note"><span className={`state ${zone.cls}`}>{zone.label}</span></div></div>
      </section>

      <section className="panel">
        <h2>Distanza per settimana</h2>
        <WeekBars rows={wk} weeks={weeks} value={(r) => r.dist_m / 1000} fmt={(v) => `${dec(v, 0)} km`} label="Distanza settimanale per disciplina" />
        <p className="note">Somma delle distanze delle attività della settimana (lunedì–domenica, ora locale). Fonte: campi fusi delle attività (Garmin prioritario).</p>
      </section>
      <section className="grid g2">
        <div className="panel"><h2>Tempo per settimana</h2><WeekBars rows={wk} weeks={weeks} value={(r) => r.time_s / 3600} fmt={(v) => hm(v * 3600)} label="Tempo settimanale" height={150} /></div>
        <div className="panel"><h2>Dislivello per settimana</h2><WeekBars rows={wk} weeks={weeks} value={(r) => r.gain_m} fmt={(v) => `${int(v)} m`} label="Dislivello settimanale" height={150} /></div>
      </section>

      <section className="panel">
        <h2>Carico acuto e cronico</h2>
        <LineChart points={load.map((d, i) => ({ x: d.day, y: L.ratio[i] }))} color="var(--s1)" fmt={(v) => dec(v, 2)} band={{ lo: 0.8, hi: 1.3 }} yLabel="rapporto acuto/cronico" />
        <p className="note">Metodo: media del carico di allenamento Garmin degli ultimi 7 giorni divisa per la media degli ultimi 28 (Gabbett 2016). La fascia evidenziata (0,8–1,3) è quella indicata in letteratura come aumento graduale. Limiti: è un indicatore descrittivo, la sua capacità di prevedere gli infortuni è discussa; le attività senza carico Garmin contano zero{noLoad ? ` (${noLoad} negli ultimi 120 giorni)` : ""}.</p>
      </section>

      <section className="panel">
        <h2>Efficienza aerobica nella corsa</h2>
        <LineChart points={effPts} color="var(--s2)" fmt={(v) => dec(v, 2)} yLabel="metri al minuto per battito" />
        <p className="note">
          Metodo: velocità media (metri al minuto) divisa per il battito medio, corse sopra i 3 km degli ultimi 6 mesi. Valori più alti indicano più velocità allo stesso battito.
          {tr ? ` Tendenza: ${tr.slope >= 0 ? "+" : ""}${dec(tr.slope, 3)} al mese su ${tr.n} corse.` : ""} Limiti: risente di caldo, pendenza, fatica e tipo di seduta (le ripetute alzano la velocità media), quindi conta la tendenza, non il singolo punto.
        </p>
      </section>
    </div>
  );
}
