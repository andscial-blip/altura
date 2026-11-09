/**
 * Semaforo del recupero (sostituisce la vecchia sintesi). Regole dal parere del medico dello sport:
 * - HRV: media mobile di 7 notti sotto la fascia personale, oppure le ultime 2 notti entrambe sotto (Plews 2013);
 * - battito a riposo: almeno +5 bpm sulla media dei 30 giorni per 2 giorni, oppure +5 insieme all'HRV bassa;
 * - sonno: ultima notte sotto le 6 ore (la durata, non le fasi né il punteggio);
 * - come ti senti: 1 o 2 su 5 vale quanto un segnale misurato (Saw 2016).
 * 0 segnali verde, 1 giallo, 2 o più rosso. Il contesto (caldo, viaggio, alcol) abbassa il rosso a giallo:
 * quei fattori alzano il battito e abbassano l'HRV senza vera fatica. Febbre: sempre rosso, niente allenamento.
 * Funzione pura, testata in tests/readiness.test.ts.
 */
export type DayVal = { day: string; value: number };
export type Context = "caldo" | "viaggio" | "alcol" | "malattia" | "febbre";
export const CONTEXT_LABEL: Record<Context, string> = { caldo: "Caldo", viaggio: "Viaggio", alcol: "Alcol ieri sera", malattia: "Mi sento malato", febbre: "Febbre" };

export type Signal = { key: "hrv" | "rhr" | "sleep" | "feel"; label: string; state: "ok" | "warn" | "na"; text: string; value: string | null };
export type Level = "verde" | "giallo" | "rosso" | "na";
export type Readiness = { level: Level; title: string; advice: string; signals: Signal[]; softened: boolean; context: Context[] };

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const addDays = (d: string, n: number) => { const x = new Date(d + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

export function readiness(i: {
  today: string;
  hrv: DayVal[];                 // HRV notturna, giorni recenti in ordine
  hrvLo: number | null; hrvHi: number | null;
  rhr: DayVal[];                 // battito a riposo, ultimi ~35 giorni
  sleep: DayVal[];               // secondi di sonno per notte
  feel: number | null;           // 1-5, domanda del mattino
  context: Context[];
  session: { title: string; type: string } | null;
  fmtSleep: (s: number) => string;
}): Readiness {
  const signals: Signal[] = [];
  const within = (xs: DayVal[], from: string, to: string) => xs.filter((p) => p.day >= from && p.day <= to);

  // HRV: media delle ultime 7 notti (almeno 3) e ultime 2 notti
  const h7 = within(i.hrv, addDays(i.today, -6), i.today);
  const h7m = h7.length >= 3 ? mean(h7.map((p) => p.value)) : null;
  const last2 = i.hrv.slice(-2);
  const fresh = i.hrv.length && i.hrv[i.hrv.length - 1].day >= addDays(i.today, -1);
  if (h7m === null || i.hrvLo === null || !fresh) signals.push({ key: "hrv", label: "Variabilità notturna", state: "na", text: "dati insufficienti nelle ultime notti", value: null });
  else {
    const two = last2.length === 2 && last2.every((p) => p.value < i.hrvLo!);
    const low = h7m < i.hrvLo || two;
    signals.push({ key: "hrv", label: "Variabilità notturna", state: low ? "warn" : "ok",
      text: low ? (two ? "sotto la tua fascia nelle ultime 2 notti" : "media di 7 notti sotto la tua fascia") : "nella tua fascia",
      value: `${Math.round(h7m)} ms (fascia ${Math.round(i.hrvLo)}–${Math.round(i.hrvHi ?? i.hrvLo)})` });
  }
  const hrvLow = signals[0].state === "warn";

  // battito a riposo rispetto alla media dei 30 giorni precedenti
  const base = within(i.rhr, addDays(i.today, -31), addDays(i.today, -1));
  const b30 = base.length >= 7 ? mean(base.map((p) => p.value)) : null;
  const t = i.rhr.find((p) => p.day === i.today) ?? null;
  const y = i.rhr.find((p) => p.day === addDays(i.today, -1)) ?? null;
  if (!t || b30 === null) signals.push({ key: "rhr", label: "Battito a riposo", state: "na", text: "nessun dato di oggi", value: null });
  else {
    const d = t.value - b30;
    const up = d >= 5 && ((y && y.value - b30 >= 5) || hrvLow);
    signals.push({ key: "rhr", label: "Battito a riposo", state: up ? "warn" : "ok",
      text: up ? `${d > 0 ? "+" : ""}${Math.round(d)} sulla tua media di 30 giorni` : d >= 5 ? `+${Math.round(d)} oggi, da tenere d'occhio` : "nella tua norma",
      value: `${Math.round(t.value)} bpm (media ${Math.round(b30)})` });
  }

  // sonno: ultima notte
  const s = i.sleep.find((p) => p.day === i.today) ?? null;
  if (!s) signals.push({ key: "sleep", label: "Sonno", state: "na", text: "notte non registrata", value: null });
  else signals.push({ key: "sleep", label: "Sonno", state: s.value < 6 * 3600 ? "warn" : "ok", text: s.value < 6 * 3600 ? "meno di 6 ore" : "durata sufficiente", value: i.fmtSleep(s.value) });

  // come ti senti
  if (i.feel === null) signals.push({ key: "feel", label: "Come ti senti", state: "na", text: "non ancora risposto", value: null });
  else signals.push({ key: "feel", label: "Come ti senti", state: i.feel <= 2 ? "warn" : "ok", text: i.feel <= 2 ? "stanco o giù" : i.feel >= 4 ? "bene" : "nella media", value: `${i.feel}/5` });

  const warn = signals.filter((x) => x.state === "warn").length;
  const known = signals.filter((x) => x.state !== "na").length;
  const sick = i.context.includes("febbre") || i.context.includes("malattia");
  const mitig = i.context.some((c) => c === "caldo" || c === "viaggio" || c === "alcol");
  let level: Level = known === 0 ? "na" : warn === 0 ? "verde" : warn === 1 ? "giallo" : "rosso";
  let softened = false;
  if (level === "rosso" && mitig && !sick) { level = "giallo"; softened = true; }
  if (sick) level = "rosso";

  const q = i.session && ["qualita", "test", "gara"].includes(i.session.type);
  const ses = i.session ? `«${i.session.title}»` : null;
  let title: string, advice: string;
  if (i.context.includes("febbre")) {
    title = "Febbre: oggi niente allenamento.";
    advice = "Riposo finché la febbre non passa. In Madagascar, con la febbre fai un test per la malaria.";
  } else if (level === "rosso") {
    title = sick ? "Ti senti malato: oggi riposo o corsa molto facile." : "Più segnali di fatica: oggi corsa facile o riposo.";
    advice = ses ? `${ses} può aspettare: se corri, tienilo facile e breve.` : "Giornata di recupero.";
  } else if (level === "giallo") {
    const which = signals.find((x) => x.state === "warn");
    title = softened ? "Segnali di fatica, ma c'è il contesto: prudenza." : `Un segnale da tenere d'occhio: ${which?.label.toLowerCase()}.`;
    advice = ses ? (q ? `${ses}: falla, ma se le prime ripetute pesano trasformala in corsa facile.` : `${ses}: va bene, senza forzare.`) : "Giornata libera: movimento leggero.";
  } else if (level === "verde") {
    title = "Recupero nella norma.";
    advice = ses ? `Via libera: ${ses} come previsto.` : "Nessuna seduta in programma: giornata libera.";
  } else {
    title = "Dati del recupero non ancora arrivati.";
    advice = ses ? `In programma ${ses}. Rispondi a «come ti senti» per avere un giudizio.` : "Rispondi a «come ti senti» per avere un giudizio.";
  }
  return { level, title, advice, signals, softened, context: i.context };
}
