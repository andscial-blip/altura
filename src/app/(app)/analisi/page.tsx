import Link from "next/link";
import { dailyLoad, goals, periodActs, runBests, runEfficiency, sportsPresent } from "@/lib/queries";
import { acwr, acwrZone, efficiency } from "@/lib/analytics";
import { isNum, linreg, pctDelta, riegel, rolling } from "@/lib/stats";
import { addDays, monday, range } from "@/lib/dates";
import { day, dec, dur, hm, int, km, paceS, todayLocal } from "@/lib/fmt";
import { Heatmap, StackBars, TimeChart } from "@/components/charts";
import { Card, Empty, Head, Kpi, Legend, Seg } from "@/components/Head";
import { DataTable } from "@/components/DataTable";
import { FAM_LABEL, SPORT_COLOR } from "@/components/Act";
import { Icon, sportMeta } from "@/components/Icon";

export const dynamic = "force-dynamic";

const TABS: { k: string; label: string; icon: string; sports: string[] }[] = [
  { k: "tutte", label: "Generale", icon: "chart", sports: [] },
  { k: "corsa", label: "Corsa", icon: "run", sports: ["run", "trail_run", "treadmill"] },
  { k: "montagna", label: "Montagna", icon: "hike", sports: ["hike", "walk"] },
  { k: "nuoto", label: "Nuoto", icon: "swim", sports: ["swim"] },
  { k: "bici", label: "Bici", icon: "ride", sports: ["ride"] },
  { k: "altro", label: "Altro", icon: "ski", sports: ["ski", "yoga", "strength", "other"] },
];
const PERIODS = [[4, "4 sett."], [12, "12 sett."], [26, "6 mesi"], [52, "1 anno"]] as const;

export default async function Page({ searchParams }: { searchParams: Promise<{ sport?: string; g?: string }> }) {
  const sp = await searchParams;
  const today = todayLocal();
  const present = await sportsPresent();
  const tabs = TABS.filter((t) => t.k === "tutte" || t.sports.some((s) => present.includes(s)));
  const tab = tabs.find((t) => t.k === sp.sport) ?? tabs[0];
  const W = PERIODS.some(([n]) => n === Number(sp.g)) ? Number(sp.g) : 12;
  const mon = monday(today);
  const from = addDays(mon, -7 * (W - 1)), prevFrom = addDays(from, -7 * W);
  const days = W * 7 + 7;

  const sparse = ["nuoto", "bici", "altro"].includes(tab.k);
  const [all, load, eff, bests, gl] = await Promise.all([
    periodActs(sparse ? "1990-01-01" : addDays(prevFrom, -21)), tab.k === "tutte" ? dailyLoad(days + 28) : Promise.resolve([]),
    tab.k === "corsa" ? runEfficiency(Math.max(days, 182)) : Promise.resolve([]), tab.k === "corsa" ? runBests(Math.max(days, 182)) : Promise.resolve([]), goals(true),
  ]);
  const mine = (a: { sport: string }) => tab.k === "tutte" || tab.sports.includes(a.sport);
  const acts = all.filter(mine);
  const cur = acts.filter((a) => a.day >= from), prev = acts.filter((a) => a.day >= prevFrom && a.day < from);
  const tot = (xs: typeof acts, f: (a: (typeof acts)[number]) => number) => xs.reduce((s, a) => s + f(a), 0);
  const kp = (f: (a: (typeof acts)[number]) => number) => ({ c: tot(cur, f), p: tot(prev, f) });
  const T = kp((a) => a.time), D = kp((a) => a.dist), G = kp((a) => a.gain), N = { c: cur.length, p: prev.length };
  const dl = (v: { c: number; p: number }) => { const d = pctDelta(v.c, v.p); return d === null ? null : { text: `${d >= 0 ? "▲" : "▼"} ${int(Math.abs(d))}%`, dir: (Math.abs(d) < 3 ? "ne" : d > 0 ? "up" : "dn") as "up" | "dn" | "ne" }; };

  // settimane (con 3 settimane prima per avviare la media mobile)
  const weeks = Array.from({ length: W + 3 }, (_, i) => addDays(from, 7 * (i - 3)));
  const wOf = (d: string) => monday(d);
  const fams = tab.k === "tutte" ? [...new Set(acts.map((a) => sportMeta(a.sport).fam))] : [sportMeta(tab.sports[0]).fam];
  const swim = tab.k === "nuoto";
  const metric = swim ? { f: (a: (typeof acts)[number]) => a.dist, fmt: (v: number) => int(v), unit: "m", name: "Metri" }
    : tab.k === "tutte" || tab.k === "altro" ? { f: (a: (typeof acts)[number]) => a.time / 3600, fmt: (v: number) => dec(v, v < 10 ? 1 : 0), unit: "h", name: "Ore" }
    : tab.k === "montagna" ? { f: (a: (typeof acts)[number]) => a.gain, fmt: (v: number) => int(v), unit: "m", name: "Dislivello" }
    : { f: (a: (typeof acts)[number]) => a.dist / 1000, fmt: (v: number) => dec(v, v < 10 ? 1 : 0), unit: "km", name: "Distanza" };
  const stacksAll = fams.map((f) => ({ name: FAM_LABEL[f] ?? f, color: SPORT_COLOR[f] ?? "var(--oth)", values: weeks.map((w) => tot(acts.filter((a) => wOf(a.day) === w && sportMeta(a.sport).fam === f), metric.f)) }));
  const weekTot = weeks.map((_, i) => stacksAll.reduce((s, x) => s + x.values[i], 0));
  const avg4 = rolling(weekTot, 4, 4).slice(3);
  const stacks = stacksAll.map((s) => ({ ...s, values: s.values.slice(3) }));

  // calendario a caldo (minuti al giorno)
  const hw = Array.from({ length: Math.min(W, 26) }, (_, i) => addDays(mon, -7 * (Math.min(W, 26) - 1 - i)));
  const mins = new Map<string, number>(); for (const a of cur) mins.set(a.day, (mins.get(a.day) ?? 0) + a.time / 60);
  const lvl = (m: number) => (m <= 0 ? 0 : m < 30 ? 1 : m < 60 ? 2 : m < 105 ? 3 : 4);
  const heat = hw.map((w) => ({ start: w, days: range(w, addDays(w, 6)).map((d) => ({ d, level: d > today ? 0 : lvl(mins.get(d) ?? 0), tip: `${day(d)}: ${mins.get(d) ? `${int(mins.get(d))} min` : "riposo"}` })) }));
  const activeDays = new Set(cur.map((a) => a.day)).size;

  return (
    <div className="stack-l">
      <Head icon="chart" title="Analisi" sub="Volumi, tendenze e prestazioni. Sotto ogni grafico: metodo, fonte e limiti." acts={<Link href="/progressi" className="btn sm"><Icon name="trend" size={16} />Progressi</Link>} />
      <nav className="tabs" aria-label="Disciplina">
        {tabs.map((t) => <Link key={t.k} href={`/analisi?sport=${t.k}&g=${W}`} aria-current={t.k === tab.k ? "true" : undefined}><Icon name={t.icon} size={16} />{t.label}</Link>)}
      </nav>
      <Seg className="inline" label="Periodo" items={PERIODS.map(([n, l]) => ({ href: `/analisi?sport=${tab.k}&g=${n}`, label: l, on: n === W }))} />

      <div className="kpis">
        <Kpi label="Uscite" icon="activity" value={int(N.c)} delta={dl(N)} foot={`${activeDays} ${activeDays === 1 ? "giorno attivo" : "giorni attivi"}`} />
        <Kpi label="Tempo" icon="clock" value={hm(T.c)} delta={dl(T)} foot={`${hm(T.c / W)}/sett.`} />
        {swim ? <Kpi label="Distanza" icon="distance" value={int(D.c)} unit="m" delta={dl(D)} />
          : tab.k !== "montagna" ? <Kpi label="Distanza" icon="distance" value={km(D.c, 0)} unit="km" delta={dl(D)} foot={`${km(D.c / W, 1)} km/sett.`} />
          : <Kpi label="Dislivello" icon="gain" value={int(G.c)} unit="m" delta={dl(G)} foot={`${int(G.c / W)} m/sett.`} />}
        {swim ? <Kpi label="Passo medio" icon="trend" value={D.c ? paceS(T.c / (D.c / 100)) : "–"} unit="/100 m" />
          : tab.k === "montagna" ? <Kpi label="Distanza" icon="distance" value={km(D.c, 0)} unit="km" delta={dl(D)} />
          : <Kpi label="Dislivello" icon="gain" value={int(G.c)} unit="m" delta={dl(G)} />}
      </div>
      <p className="note" style={{ marginTop: -12 }}>Variazioni rispetto alle {W} settimane precedenti.</p>

      {sparse && cur.length < 4 ? (
        <AllTime acts={acts} label={tab.label} swim={swim} />
      ) : (
        <>
          <Card title={`${metric.name} per settimana`} icon="chart" aside={metric.unit}>
            {cur.length ? (
              <>
                <StackBars cats={weeks.slice(3)} stacks={stacks} line={{ name: "Media 4 sett.", values: avg4 }} fmt={metric.fmt} unit={metric.unit} label={`${metric.name} settimanale`} catLabel={(w) => day(w, { day: "numeric", month: "short" })} highlight={W - 1} />
                <Legend items={[...stacks.map((s) => ({ label: s.name, color: s.color })), { label: "Media mobile 4 settimane", color: "var(--ink)", line: true, dash: true }]} />
                <p className="note" style={{ marginTop: 6 }}>Settimane lunedì–domenica, ora locale. In giallo la settimana in corso (incompleta).</p>
              </>
            ) : <Empty inline icon="chart" title="Nessuna uscita in questo periodo" text="Prova un periodo più lungo." action={{ href: `/analisi?sport=${tab.k}&g=52`, label: "Ultimo anno" }} />}
          </Card>

          <div className="grid g2">
            <Card title="Costanza" icon="calendar" aside={`${activeDays} giorni su ${Math.min(W * 7, range(from, today).length)}`}>
              <Heatmap weeks={heat} label="Minuti di attività per giorno" />
              <Legend items={[{ label: "riposo", color: "var(--h0)" }, { label: "<30 min", color: "var(--h1)" }, { label: "30–60", color: "var(--h2)" }, { label: "60–105", color: "var(--h3)" }, { label: ">105", color: "var(--h4)" }]} />
            </Card>
            {tab.k === "tutte" ? <SportMix cur={cur} /> : tab.k === "corsa" ? <Bests bests={bests} gl={gl} today={today} /> : tab.k === "montagna" ? <TopOutings acts={cur} /> : <SessionList acts={cur} swim={swim} />}
          </div>
          {sparse && <AllTime acts={acts} label={tab.label} swim={swim} compact />}
        </>
      )}

      {tab.k === "tutte" && <LoadCard load={load} from={from} today={today} />}
      {tab.k === "corsa" && <EffCard eff={eff} today={today} W={W} />}
      {tab.k === "montagna" && <Places acts={cur} />}
    </div>
  );
}

type A = Awaited<ReturnType<typeof periodActs>>[number];

function SportMix({ cur }: { cur: A[] }) {
  const t = cur.reduce((s, a) => s + a.time, 0) || 1;
  const by = new Map<string, number>(); for (const a of cur) { const f = sportMeta(a.sport).fam; by.set(f, (by.get(f) ?? 0) + a.time); }
  const rows = [...by.entries()].sort((a, b) => b[1] - a[1]);
  return (
    <Card title="Tempo per disciplina" icon="clock">
      <div className="stackbar" role="img" aria-label={rows.map(([f, v]) => `${FAM_LABEL[f]} ${int((v / t) * 100)}%`).join(", ")}>{rows.map(([f, v]) => <span key={f} style={{ flex: `${v} 0 0`, background: SPORT_COLOR[f] }} />)}</div>
      <table className="t" style={{ marginTop: 12 }}><tbody>{rows.map(([f, v]) => <tr key={f}><td><span className="legend" style={{ margin: 0 }}><span><i style={{ background: SPORT_COLOR[f] }} />{FAM_LABEL[f]}</span></span></td><td className="r mono">{hm(v)}</td><td className="r mono">{int((v / t) * 100)}%</td></tr>)}</tbody></table>
    </Card>
  );
}

function LoadCard({ load, from, today }: { load: { day: string; load: number; n_without: number }[]; from: string; today: string }) {
  const L = acwr(load.map((d) => d.load));
  const r = L.ratio.at(-1) ?? null, z = acwrZone(r);
  const noLoad = load.filter((d) => d.day >= from).reduce((s, d) => s + d.n_without, 0);
  return (
    <Card title="Carico acuto / cronico" icon="load" aside={<span className={`badge ${z.cls}`}>{r === null ? "–" : dec(r, 2)} · {z.label}</span>}>
      <TimeChart from={from} to={today} label="Rapporto carico acuto/cronico" fmt={(v) => dec(v, 2)} band={{ lo: 0.8, hi: 1.3 }} refLine={{ v: 1 }}
        series={[{ name: "Rapporto", color: "var(--accent)", kind: "line", pts: load.map((d, i) => ({ d: d.day, v: L.ratio[i] })) }]} />
      <Legend items={[{ label: "Rapporto 7/28 giorni", color: "var(--accent)", line: true }, { label: "Fascia 0,8–1,3", color: "var(--band)" }]} />
      <p className="note" style={{ marginTop: 6 }}>Metodo: media del carico di allenamento Garmin degli ultimi 7 giorni divisa per quella degli ultimi 28 (Gabbett 2016). Limiti: indicatore descrittivo, la capacità di prevedere infortuni è discussa; le uscite senza carico Garmin contano zero{noLoad ? ` (${noLoad} nel periodo)` : ""}.</p>
    </Card>
  );
}

function EffCard({ eff, today, W }: { eff: { day: string; v_mpm: number; hr: number; dist: number }[]; today: string; W: number }) {
  const from = addDays(today, -Math.max(W * 7, 182));
  const pts = eff.map((r) => ({ d: r.day, v: efficiency(r.v_mpm, r.hr) })).filter((p) => isNum(p.v)) as { d: string; v: number }[];
  const xs = pts.map((p) => Date.parse(p.d) / 86400000 / 30.44), lr = linreg(xs, pts.map((p) => p.v));
  const trend = lr && pts.length ? [pts[0], pts[pts.length - 1]].map((p) => ({ d: p.d, v: lr.a + lr.b * (Date.parse(p.d) / 86400000 / 30.44) })) : [];
  return (
    <Card title="Efficienza aerobica" icon="trend" aside={lr ? <span className={lr.b > 0 ? "up" : "dn"}>{lr.b >= 0 ? "+" : "−"}{dec(Math.abs(lr.b), 3)} al mese</span> : undefined}>
      {pts.length >= 3 ? (
        <>
          <TimeChart from={from} to={today} label="Efficienza aerobica nella corsa" fmt={(v) => dec(v, 2)} today={false}
            series={[{ name: "Corsa", color: "var(--run)", kind: "dots", pts }, ...(trend.length ? [{ name: "Tendenza", color: "var(--ink)", kind: "line" as const, width: 1.6, gapDays: 9999, pts: trend }] : [])]} />
          <Legend items={[{ label: "Una corsa", color: "var(--run)" }, { label: "Tendenza lineare", color: "var(--ink)", line: true }]} />
        </>
      ) : <Empty inline icon="trend" title="Servono almeno 3 corse" text="Corse sopra i 3 km con battito registrato." />}
      <p className="note" style={{ marginTop: 6 }}>Metri al minuto per battito (velocità media / FC media), corse oltre i 3 km, ultimi {Math.max(W * 7, 182) >= 365 ? "12" : "6"} mesi. Più alto = più veloce allo stesso battito. Risente di caldo, salite e ripetute: conta la tendenza, non il singolo punto.</p>
    </Card>
  );
}

function Bests({ bests, gl, today }: { bests: { id: string; day: string; name: string | null; s5: number | null; s10: number | null }[]; gl: { name: string; kind: string; target_date: string | null; target: Record<string, number | null> }[]; today: string }) {
  const b5 = bests.filter((b) => isNum(b.s5)).sort((a, b) => a.s5! - b.s5!)[0];
  const b10 = bests.filter((b) => isNum(b.s10)).sort((a, b) => a.s10! - b.s10!)[0];
  const race = gl.find((g) => g.kind === "gara" && g.target_date && g.target_date >= today && g.target.dist_m);
  const base = b10 ? { t: b10.s10!, d: 10000 } : b5 ? { t: b5.s5!, d: 5000 } : null;
  const pred = base && race?.target.dist_m ? riegel(base.t, base.d, race.target.dist_m) : null;
  const tgt = race?.target.time_s ?? null;
  return (
    <Card title="Migliori tempi" icon="clock" aside="ultimi 6 mesi">
      <div className="kpis k3" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
        <Kpi label="5 km" value={b5 ? dur(b5.s5) : "–"} foot={b5 ? <Link href={`/attivita/${b5.id}`}>{day(b5.day, { day: "numeric", month: "short" })} · {paceS(b5.s5! / 5)}/km</Link> : undefined} />
        <Kpi label="10 km" value={b10 ? dur(b10.s10) : "–"} foot={b10 ? <Link href={`/attivita/${b10.id}`}>{day(b10.day, { day: "numeric", month: "short" })} · {paceS(b10.s10! / 10)}/km</Link> : undefined} />
      </div>
      {race && pred && (
        <div style={{ marginTop: 12 }}>
          <div className="row between"><span className="note">{race.name}: previsione</span><b className="mono">{dur(pred)}</b></div>
          {tgt && <div className="row between"><span className="note">Obiettivo Runna</span><span className="mono">{dur(tgt)}</span></div>}
          {tgt && <div className="row between"><span className="note">Differenza</span><span className={`mono ${pred <= tgt ? "up" : "dn"}`}>{pred <= tgt ? "−" : "+"}{dur(Math.abs(pred - tgt))}</span></div>}
        </div>
      )}
      <p className="note" style={{ marginTop: 8 }}>Parziale più veloce dentro una corsa, calcolato da Garmin (non necessariamente una gara). Previsione: formula di Riegel con esponente 1,06 dal miglior 10 km (o 5 km); presuppone allenamento specifico sulla distanza.</p>
    </Card>
  );
}

function TopOutings({ acts }: { acts: A[] }) {
  const top = [...acts].sort((a, b) => b.gain - a.gain).slice(0, 8);
  return (
    <Card title="Uscite con più dislivello" icon="mountain">
      {top.length ? <DataTable caption="Uscite con più dislivello" initial={{ key: "g", dir: "desc" }} pinned={false}
        cols={[{ key: "n", label: "Uscita", lead: true, sort: true }, { key: "g", label: "D+", r: true, sort: true }, { key: "km", label: "Km", r: true, sort: true }, { key: "t", label: "Tempo", r: true, sort: true }]}
        rows={top.map((a) => ({ key: a.id, cells: { n: { t: a.name ?? a.place ?? "Uscita", href: `/attivita/${a.id}`, sub: day(a.day, { day: "numeric", month: "short", year: "numeric" }), v: a.day }, g: { t: `${int(a.gain)} m`, v: a.gain }, km: { t: km(a.dist), v: a.dist }, t: { t: hm(a.time), v: a.time } } }))} />
        : <Empty inline icon="mountain" title="Nessuna uscita nel periodo" />}
    </Card>
  );
}

function sessionRows(acts: A[], swim: boolean) {
  return acts.map((a) => ({ key: a.id, cells: {
    n: { t: a.name ?? "Uscita", href: `/attivita/${a.id}`, sub: day(a.day, { day: "numeric", month: "short", year: "numeric" }), v: a.day },
    d: { t: a.dist ? (swim ? `${int(a.dist)} m` : `${km(a.dist, a.dist < 5000 ? 2 : 1)} km`) : "–", v: a.dist || null },
    t: { t: hm(a.time), v: a.time },
    p: { t: a.dist && a.time ? (swim ? paceS(a.time / (a.dist / 100)) : dec((a.dist / a.time) * 3.6)) : "–", v: a.dist && a.time ? (swim ? a.time / (a.dist / 100) : a.dist / a.time) : null },
    hr: { t: a.hr ? int(a.hr) : "–", v: a.hr },
  } }));
}
const SESSION_COLS = (swim: boolean) => [{ key: "n", label: "Uscita", lead: true, sort: true }, { key: "d", label: "Distanza", r: true, sort: true }, { key: "t", label: "Tempo", r: true, sort: true }, { key: "p", label: swim ? "Passo /100 m" : "Km/h", r: true, sort: true }, { key: "hr", label: "FC", r: true, sort: true }];

function SessionList({ acts, swim }: { acts: A[]; swim: boolean }) {
  return (
    <Card title="Uscite del periodo" icon="activity">
      {acts.length ? <DataTable caption="Uscite del periodo" cols={SESSION_COLS(swim)} rows={sessionRows([...acts].reverse().slice(0, 12), swim)} />
        : <Empty inline icon="activity" title="Nessuna uscita nel periodo" />}
    </Card>
  );
}

/** Discipline con poche uscite: riepilogo di tutto lo storico, solo con le metriche pertinenti. */
function AllTime({ acts, label, swim, compact = false }: { acts: A[]; label: string; swim: boolean; compact?: boolean }) {
  if (!acts.length) return <div className="card"><Empty icon="activity" title={`Nessuna uscita di ${label.toLowerCase()}`} text="Compariranno qui quando ne registrerai una con Garmin o Strava." /></div>;
  const sorted = [...acts].sort((a, b) => (a.day < b.day ? 1 : -1));
  const dist = acts.reduce((s, a) => s + a.dist, 0), time = acts.reduce((s, a) => s + a.time, 0);
  const withHr = acts.filter((a) => isNum(a.hr));
  return (
    <Card title={compact ? `${label}: tutto lo storico` : `${label}: tutto lo storico`} icon="clock" aside={`dal ${day(sorted[sorted.length - 1].day, { month: "short", year: "numeric" })}`}>
      {!compact && <p className="note" style={{ marginBottom: 10 }}>Poche uscite nel periodo scelto: qui sotto c&apos;è tutto lo storico, con le sole misure pertinenti alla disciplina.</p>}
      <div className="kpis" style={{ marginBottom: 12 }}>
        <Kpi label="Uscite" icon="activity" value={String(acts.length)} foot={`ultima ${day(sorted[0].day, { day: "numeric", month: "short", year: "numeric" })}`} />
        <Kpi label="Distanza totale" icon="distance" value={swim ? int(dist) : km(dist, 0)} unit={swim ? "m" : "km"} />
        <Kpi label="Tempo totale" icon="clock" value={hm(time)} />
        {swim ? <Kpi label="Passo medio" icon="trend" value={dist ? paceS(time / (dist / 100)) : "–"} unit="/100 m" />
          : <Kpi label="Battito medio" icon="heart" value={withHr.length ? int(withHr.reduce((s, a) => s + a.hr!, 0) / withHr.length) : "–"} unit={withHr.length ? "bpm" : undefined} foot={withHr.length ? `${withHr.length} uscite con FC` : "nessuna uscita con FC"} />}
      </div>
      <DataTable caption={`Tutte le uscite: ${label}`} cols={SESSION_COLS(swim)} rows={sessionRows(sorted.slice(0, 20), swim)} />
      {swim && <p className="note" style={{ marginTop: 8 }}>Passo per 100 m sul tempo in movimento; in piscina le pause tra le vasche possono allungarlo. Bracciate, vasche e SWOLF sono nel dettaglio di ogni uscita quando le registra Garmin.</p>}
    </Card>
  );
}

function Places({ acts }: { acts: A[] }) {
  const by = new Map<string, { n: number; gain: number }>();
  for (const a of acts) if (a.place) { const x = by.get(a.place) ?? { n: 0, gain: 0 }; x.n++; x.gain += a.gain; by.set(a.place, x); }
  const rows = [...by.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 10);
  if (!rows.length) return null;
  return (
    <Card title="Luoghi" icon="map" aside="nome del luogo da Garmin">
      <DataTable caption="Luoghi delle uscite" initial={{ key: "n", dir: "desc" }} pinned={false}
        cols={[{ key: "p", label: "Luogo", lead: true, sort: true }, { key: "n", label: "Uscite", r: true, sort: true }, { key: "g", label: "D+ totale", r: true, sort: true }]}
        rows={rows.map(([p, v]) => ({ key: p, cells: { p: { t: p }, n: { t: String(v.n), v: v.n }, g: { t: `${int(v.gain)} m`, v: v.gain } } }))} />
    </Card>
  );
}
