/**
 * Sintesi "Oggi": confronta i segnali del giorno con la TUA norma recente e con la seduta in programma.
 * Regole fisse e dichiarate (nessun punteggio proprietario, nessuna prescrizione). Testata in tests/today.test.ts.
 *
 * Segnale "da considerare" quando:
 * - variabilità notturna sotto il limite basso della fascia abituale calcolata da Garmin;
 * - battito a riposo di 5 bpm o più sopra la media dei 7 giorni precedenti;
 * - sonno sotto le 6 ore, oppure più di 1 ora sotto la media dei 7 notti precedenti;
 * - rapporto carico acuto/cronico sopra 1,3 (aumento rapido rispetto alle 4 settimane).
 * Un segnale vale solo se il dato è di oggi (sonno e variabilità sono attribuiti al giorno del risveglio).
 */
export type Sig = { key: string; label: string; state: "ok" | "warn" | "na"; text: string; value?: string };
export type TodayIn = {
  today: string;
  hrv?: { day: string; value: number } | null; hrvLo?: number | null; hrvHi?: number | null;
  rhr?: { day: string; value: number } | null; rhrMean7?: number | null;
  sleep?: { day: string; value: number } | null; sleepMean7?: number | null;
  acwr?: number | null;
  session?: { title: string; type: string; km?: number | null } | null;
  fmtSleep: (s: number) => string;
};
export type TodayOut = { level: "ok" | "one" | "more" | "na"; title: string; signals: Sig[]; plan: string; available: number; warn: number };

const HARD = ["qualita", "lungo", "gara", "test"];

export function todaySummary(i: TodayIn): TodayOut {
  const sig: Sig[] = [];
  const fresh = (p?: { day: string } | null) => !!p && p.day === i.today;
  const r1 = (v: number) => Math.round(v).toLocaleString("it-IT");

  if (fresh(i.hrv) && i.hrvLo != null) {
    const v = i.hrv!.value, low = v < i.hrvLo;
    sig.push({ key: "hrv", label: "Variabilità notturna", state: low ? "warn" : "ok", value: `${r1(v)} ms`,
      text: low ? `sotto la tua fascia abituale (${r1(i.hrvLo)}–${r1(i.hrvHi ?? i.hrvLo)} ms)` : `nella tua fascia abituale o sopra (${r1(i.hrvLo)}–${r1(i.hrvHi ?? i.hrvLo)} ms)` });
  } else sig.push({ key: "hrv", label: "Variabilità notturna", state: "na", text: i.hrv ? `nessun dato di stanotte (ultimo del ${i.hrv.day.split("-").reverse().slice(0, 2).join("/")})` : "nessun dato" });

  if (fresh(i.rhr) && i.rhrMean7 != null) {
    const d = i.rhr!.value - i.rhrMean7, high = d >= 5;
    sig.push({ key: "rhr", label: "Battito a riposo", state: high ? "warn" : "ok", value: `${r1(i.rhr!.value)} bpm`,
      text: `${d >= 0 ? "+" : "−"}${r1(Math.abs(d))} rispetto alla media dei 7 giorni prima${high ? " (soglia 5)" : ""}` });
  } else sig.push({ key: "rhr", label: "Battito a riposo", state: "na", text: "nessun dato di oggi" });

  if (fresh(i.sleep)) {
    const v = i.sleep!.value, short = v < 6 * 3600, below = i.sleepMean7 != null && v < i.sleepMean7 - 3600;
    sig.push({ key: "sleep", label: "Sonno", state: short || below ? "warn" : "ok", value: i.fmtSleep(v),
      text: short ? "sotto le 6 ore" : below ? `più di 1 ora sotto la media delle 7 notti prima (${i.fmtSleep(i.sleepMean7!)})` : i.sleepMean7 != null ? `media delle 7 notti prima ${i.fmtSleep(i.sleepMean7)}` : "nessuna media di confronto" });
  } else sig.push({ key: "sleep", label: "Sonno", state: "na", text: "notte non registrata dall'orologio" });

  if (i.acwr != null) {
    const high = i.acwr > 1.3;
    sig.push({ key: "load", label: "Carico 7/28 giorni", state: high ? "warn" : "ok", value: i.acwr.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      text: high ? "aumento rapido rispetto alle ultime 4 settimane (sopra 1,3)" : i.acwr < 0.8 ? "carico in calo rispetto al solito" : "in linea con le ultime 4 settimane" });
  } else sig.push({ key: "load", label: "Carico 7/28 giorni", state: "na", text: "servono 4 settimane di carico Garmin" });

  const available = sig.filter((s) => s.state !== "na").length;
  const warn = sig.filter((s) => s.state === "warn").length;
  const level: TodayOut["level"] = available < 2 ? "na" : warn === 0 ? "ok" : warn === 1 ? "one" : "more";
  const title = level === "na" ? "Dati insufficienti per una sintesi" : level === "ok" ? "Segnali in linea con la tua norma" : level === "one" ? "Un segnale da considerare" : `${warn} segnali da considerare`;

  let plan: string;
  if (!i.session) plan = "Oggi nessuna seduta Runna in programma.";
  else {
    const hard = HARD.includes(i.session.type);
    const what = `In programma: ${i.session.title}${i.session.km ? ` (${i.session.km.toLocaleString("it-IT")} km)` : ""}.`;
    plan = level === "more" && hard ? `${what} Con più segnali fuori dalla tua norma e una seduta impegnativa, valuta tu se mantenerla com'è o spostarla in Runna.`
      : level === "one" ? `${what} Tienine conto mentre ti scaldi.`
      : level === "na" ? `${what} Senza dati di recupero di oggi, regolati sulle sensazioni.`
      : what;
  }
  return { level, title, signals: sig, plan, available, warn };
}
