import { SPORT_LABEL, type Sport } from "@/lib/model";

export const SOURCE_LABEL: Record<string, string> = { garmin: "Garmin", strava: "Strava", runna: "Runna", apple_health: "Apple Salute", manual: "Manuale" };
export const KIND_LABEL: Record<string, string> = { misura: "misurato", stima: "stima del dispositivo", derivato: "calcolato" };
export const TZ = "Indian/Antananarivo";

const n = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));

export function km(m: unknown, nd = 1): string {
  const v = n(m); if (v === null) return "–";
  return (v / 1000).toLocaleString("it-IT", { minimumFractionDigits: nd, maximumFractionDigits: nd });
}
export function dur(s: unknown): string {
  const v = n(s); if (v === null) return "–";
  const t = Math.round(v), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), ss = t % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}` : `${m}:${String(ss).padStart(2, "0")}`;
}
export function hm(s: unknown): string {
  const v = n(s); if (v === null) return "–";
  const h = Math.floor(v / 3600), m = Math.round((v % 3600) / 60);
  return h ? `${h} h ${String(m).padStart(2, "0")}` : `${m} min`;
}
/** Passo in min/km da metri e secondi, o da m/s. */
export function pace(distM: unknown, sec: unknown): string {
  const d = n(distM), t = n(sec); if (!d || !t) return "–";
  const p = t / (d / 1000);
  return `${Math.floor(p / 60)}:${String(Math.round(p % 60)).padStart(2, "0")}`;
}
export function paceS(sPerKm: number | null | undefined): string {
  if (!sPerKm) return "–";
  const r = Math.round(sPerKm);
  return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, "0")}`;
}
export function int(v: unknown): string { const x = n(v); return x === null ? "–" : Math.round(x).toLocaleString("it-IT"); }
export function dec(v: unknown, nd = 1): string { const x = n(v); return x === null ? "–" : x.toLocaleString("it-IT", { minimumFractionDigits: nd, maximumFractionDigits: nd }); }

export function day(d: string | Date, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }): string {
  const x = typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(d + "T12:00:00Z") : new Date(d);
  return x.toLocaleDateString("it-IT", { timeZone: typeof d === "string" && d.length === 10 ? "UTC" : TZ, ...opts });
}
export function when(d: string | Date): string {
  return new Date(d).toLocaleString("it-IT", { timeZone: TZ, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
export function ago(d: string | Date | null | undefined): string {
  if (!d) return "mai";
  const m = Math.round((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 1) return "adesso";
  if (m < 60) return `${m} min fa`;
  const h = Math.round(m / 60);
  if (h < 36) return `${h} h fa`;
  return `${Math.round(h / 24)} giorni fa`;
}
export function sportLabel(s: string): string { return SPORT_LABEL[s as Sport] ?? s; }
export function todayLocal(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
