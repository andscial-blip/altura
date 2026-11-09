import Link from "next/link";
import { SportIcon, sportMeta } from "@/components/Icon";
import { day, dur, int, km, pace, sportLabel, when } from "@/lib/fmt";
import { Num } from "@/components/Head";

const ON_FOOT = ["run", "trail_run", "treadmill", "hike", "walk"];
export const SPORT_COLOR: Record<string, string> = { corsa: "var(--run)", montagna: "var(--mnt)", nuoto: "var(--swim)", bici: "var(--ride)", forza: "var(--str)", altro: "var(--oth)" };
export const FAM_LABEL: Record<string, string> = { corsa: "Corsa", montagna: "Montagna e cammino", nuoto: "Nuoto", bici: "Bici", forza: "Forza", altro: "Altro" };

/** Miniatura del percorso (path già privato delle zone protette) o icona dello sport se non c'è GPS. */
export function Thumb({ path, sport }: { path?: string; sport: string }) {
  const fam = sportMeta(sport).fam;
  if (!path) return <span className="thumb" style={{ display: "grid", placeItems: "center" }}><SportIcon sport={sport} size={40} /></span>;
  return (
    <span className="thumb" aria-hidden="true">
      <svg viewBox="0 0 100 100"><path d={path} fill="none" stroke={SPORT_COLOR[fam] ?? "var(--run)"} strokeWidth="5" strokeLinejoin="round" strokeLinecap="round" /></svg>
    </span>
  );
}

export type ActLite = { id: string; sport: string; start_utc: string; name: string | null; distance_m: string | number | null; moving_s: string | number | null; elapsed_s: string | number | null; elev_gain_m: string | number | null; avg_hr: string | number | null };

/** Scheda attività: miniatura, nome (da Strava se disponibile), tre numeri. */
export function ActCard({ a, path, compact = false }: { a: ActLite; path?: string; compact?: boolean }) {
  const t = a.moving_s ?? a.elapsed_s;
  const foot = ON_FOOT.includes(a.sport) && a.distance_m;
  const climb = Number(a.elev_gain_m ?? 0) >= 50;
  return (
    <Link href={`/attivita/${a.id}`} className={`card acard${compact ? " compact" : ""}`}>
      <Thumb path={path} sport={a.sport} />
      <div style={{ minWidth: 0 }}>
        <div className="n">{a.name ?? sportLabel(a.sport)}</div>
        <div className="t">{sportLabel(a.sport)} · {compact ? day(a.start_utc, { weekday: "short", day: "numeric", month: "short" }) : when(a.start_utc)}</div>
        <div className="m">
          {a.distance_m ? (a.sport === "swim" ? <Num v={int(a.distance_m)} unit="m" /> : <Num v={km(a.distance_m)} unit="km" />) : null}
          <Num v={dur(t)} />
          {foot && !climb ? <Num v={pace(a.distance_m, t)} unit="/km" /> : null}
          {a.sport === "swim" && a.distance_m && t ? <Num v={pace(Number(a.distance_m) * 10, t)} unit="/100 m" /> : null}
          {climb ? <Num v={int(a.elev_gain_m)} unit="m D+" /> : null}
          {!compact && a.avg_hr ? <Num v={int(a.avg_hr)} unit="bpm" /> : null}
        </div>
      </div>
    </Link>
  );
}

type Step = { kind?: string; m?: number; s?: number | null; pace?: number; limit?: number };
/**
 * Struttura PREVISTA della seduta Runna: un blocco per passo del programma, largo quanto la sua durata stimata
 * (distanza × passo obiettivo, 5:30/km se il passo è libero; durata esatta quando Runna la indica), alto quanto l'intensità.
 */
export function StructBar({ steps }: { steps?: unknown[] }) {
  const st = (steps ?? []) as Step[];
  if (!st.length) return null;
  const est = (s: Step) => s.s ?? ((s.m ?? 0) / 1000) * (s.pace ?? s.limit ?? 330);
  const cls = (k?: string) => (k === "work" ? "t" : k === "rest" ? "r" : k === "warm" || k === "cool" ? "w" : k === "float" ? "s" : "e");
  const tot = st.reduce((a, s) => a + est(s), 0) || 1;
  return (
    <div className="struct" role="img" aria-label={`Struttura prevista: ${st.length} blocchi (${st.filter((x) => x.kind === "work").length} di lavoro); larghezze in proporzione alla durata stimata`} title="Struttura prevista: larghezza = durata stimata">
      {st.map((s, i) => <span key={i} className={cls(s.kind)} style={{ flex: `${est(s) / tot} 0 0` }} />)}
    </div>
  );
}
