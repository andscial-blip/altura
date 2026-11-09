/**
 * Lettura del feed iCal di Runna. Runna non ha API pubbliche: il calendario iCal è l'unico canale ufficiale.
 * Porta TypeScript di runna_cal.py (app attuale, testato su eventi reali). Funzioni pure.
 */

export interface IcsEvent {
  id?: string; summary?: string; description?: string; status?: string; updated?: string; location?: string;
  start?: { date?: string; dateTime?: string; timeZone?: string | null };
  end?: { date?: string; dateTime?: string; timeZone?: string | null };
}

export function icsEvents(text: string): IcsEvent[] {
  const lines: string[] = [];
  for (const raw of text.replace(/\r\n/g, "\n").split("\n")) {
    if ((raw[0] === " " || raw[0] === "\t") && lines.length) lines[lines.length - 1] += raw.slice(1);
    else lines.push(raw);
  }
  const unesc = (s: string) => s.replace(/\\[nN]/g, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");
  const tval = (k: string, v: string): { date?: string; dateTime?: string; timeZone?: string | null } => {
    v = v.trim();
    if (/^\d{8}$/.test(v)) return { date: `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}` };
    const base = `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}T${v.slice(9, 11)}:${v.slice(11, 13)}:${v.slice(13, 15)}`;
    if (v.endsWith("Z")) return { dateTime: base + "Z" };
    const tz = /TZID=([^;:]+)/.exec(k);
    return { dateTime: base, timeZone: tz ? tz[1] : null };
  };
  const out: IcsEvent[] = [];
  let ev: IcsEvent | null = null;
  for (const ln of lines) {
    if (ln === "BEGIN:VEVENT") { ev = {}; continue; }
    if (ln === "END:VEVENT") { if (ev) out.push(ev); ev = null; continue; }
    if (!ev || !ln.includes(":")) continue;
    const i = ln.indexOf(":");
    const k = ln.slice(0, i), v = ln.slice(i + 1);
    const name = k.split(";")[0].toUpperCase();
    if (name === "UID") ev.id = v.split("@")[0];
    else if (name === "SUMMARY") ev.summary = unesc(v);
    else if (name === "DESCRIPTION") ev.description = unesc(v);
    else if (name === "DTSTART") ev.start = tval(k, v);
    else if (name === "DTEND") ev.end = tval(k, v);
    else if (name === "LAST-MODIFIED") ev.updated = `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}T${v.slice(9, 11)}:${v.slice(11, 13)}:${v.slice(13, 15)}Z`;
    else if (name === "STATUS") ev.status = v.toLowerCase();
    else if (name === "LOCATION") ev.location = unesc(v);
  }
  return out;
}

const PACE = String.raw`(\d{1,2}):(\d{2})\s*/km`;
const TYPE_MAP: [string, string][] = [["facile", "facile"], ["lungo", "lungo"], ["cronometr", "test"], ["test", "test"], ["gara", "gara"],
  ["salit", "qualita"], ["ripetut", "qualita"], ["veloc", "qualita"], ["progressiv", "qualita"], ["tempo", "qualita"],
  ["ritmo", "qualita"], ["fartlek", "qualita"], ["soglia", "qualita"]];
const KIND_MAP: Record<string, string> = { EASY_RUN: "facile", LONG_RUN: "lungo", TEMPO: "qualita", INTERVALS: "qualita", HILLS: "qualita",
  TIME_TRIAL: "test", RACE: "gara", PROGRESSION: "qualita", FARTLEK: "qualita" };

const ps = (m: string, s: string) => Number(m) * 60 + Number(s);
const numIt = (s: string) => Number(s.replace(",", "."));

export function durTxt(s: string | undefined | null): number | null {
  const m = /^\s*(?:(\d+)h)?\s*(?:(\d+)m)?\s*$/.exec(s ?? "");
  if (!m || !(m[1] || m[2])) return null;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60;
}

export function typeOf(title?: string | null, header?: string | null, kind?: string | null): string {
  if (kind && KIND_MAP[kind]) return KIND_MAP[kind];
  const t = `${header ?? ""} ${title ?? ""}`.toLowerCase();
  for (const [k, v] of TYPE_MAP) if (t.includes(k)) return v;
  return "facile";
}

export interface Step { txt?: string; kind: "work" | "warm" | "cool" | "rest" | "easy" | "float"; m?: number; s?: number | null; pace?: number; lo?: number; hi?: number; limit?: number; rest_s?: number }

export function parseStep(line: string): Step | null {
  const L = line.trim().replace(/^•+/, "").trim();
  if (!L || /^-+$/.test(L)) return null;
  const st: Partial<Step> & { txt: string } = { txt: L };
  const md = /^(\d+(?:[.,]\d+)?)\s*(km|m)\b/.exec(L);
  if (md) st.m = Math.round(numIt(md[1]) * (md[2] === "km" ? 1000 : 1));
  const mt = /^(\d+)\s*s(?:ta|\b)/.exec(L);
  if (mt && st.m === undefined) st.s = Number(mt[1]);
  const mp = new RegExp(String.raw`\ba\s+` + PACE).exec(L);
  if (mp && !L.slice(0, mp.index).includes("conversazional")) st.pace = ps(mp[1], mp[2]);
  const mr = /\((\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\s*\/km\)/.exec(L);
  if (mr) { st.lo = ps(mr[1], mr[2]); st.hi = ps(mr[3], mr[4]); }
  const ml = new RegExp(String.raw`non più veloce di\s+` + PACE).exec(L);
  if (ml) st.limit = ps(ml[1], ml[2]);
  const rr = /[Cc]amminata di riposo di\s+(\d+)\s*s/.exec(L);
  if (rr) st.rest_s = Number(rr[1]);
  const low = L.toLowerCase();
  if (st.pace !== undefined) st.kind = "work";
  else if (low.includes("intensamente") || (low.includes("salita") && st.s !== undefined)) st.kind = "work";
  else if (low.includes("riscaldamento")) st.kind = "warm";
  else if (low.includes("raffredd")) st.kind = "cool";
  else if (low.startsWith("camminata di riposo")) { st.kind = "rest"; st.s = st.rest_s ?? null; delete st.rest_s; }
  else st.kind = "easy";
  if (st.m === undefined && st.s === undefined && st.kind !== "rest") return st.pace ? (st as Step) : null;
  return st as Step;
}

export function parseStructure(text: string | null | undefined): Step[] {
  const lines = (text ?? "").split("\n");
  const out: Step[] = [];
  const emit = (st: Step | null) => {
    if (!st) return;
    const rest = st.rest_s; delete st.rest_s;
    if (st.kind !== "rest" || st.s) out.push(st);
    if (rest) out.push({ kind: "rest", s: rest, txt: `recupero ${rest} s` });
  };
  let i = 0;
  while (i < lines.length) {
    const l = lines[i].trim();
    const m1 = /^Ripeti i seguenti passaggi\s+(\d+)x/.exec(l);
    const m2 = /^(\d+)\s+ripetizioni di/.exec(l);
    if (m1) {
      const n = Number(m1[1]);
      let j = i + 1;
      while (j < lines.length && !lines[j].trim().startsWith("---")) j++;
      let k = j + 1;
      while (k < lines.length && !lines[k].trim().startsWith("---")) k++;
      const sub = parseStructure(lines.slice(j + 1, k).join("\n"));
      for (let x = 0; x < n; x++) out.push(...(JSON.parse(JSON.stringify(sub)) as Step[]));
      i = k + 1; continue;
    }
    if (m2) {
      const n = Number(m2[1]);
      let j = i + 1;
      const bl: string[] = [];
      while (j < lines.length && lines[j].trim().startsWith("•")) { bl.push(lines[j]); j++; }
      const sub: Step[] = [];
      for (const b of bl) {
        const st = parseStep(b);
        if (!st) continue;
        const rest = st.rest_s; delete st.rest_s; sub.push(st);
        if (rest) sub.push({ kind: "rest", s: rest, txt: `recupero ${rest} s` });
      }
      for (let x = 0; x < n; x++) out.push(...(JSON.parse(JSON.stringify(sub)) as Step[]));
      i = j; continue;
    }
    if (l && !l.startsWith("📲") && !l.startsWith("Questo è un limite")) emit(parseStep(l));
    i++;
  }
  if (out.some((x) => x.pace !== undefined && x.pace < 315)) {
    for (const x of out) if (x.kind === "work" && x.pace !== undefined && x.pace >= 315) x.kind = "float";
  }
  return out;
}

function escapeRe(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

export function section(desc: string | undefined, head: string): string {
  // equivalente di (?=\n\S{1,2} [A-ZÀ-Ü][^\n]*:\s*\n|\n📲|\Z) con re.S; \S in JS con flag u per le emoji
  const re = new RegExp(escapeRe(head) + String.raw`\s*:?\s*\n([\s\S]*?)(?=\n\S{1,2} [A-ZÀ-Ü][^\n]*:\s*\n|\n📲|$(?![\s\S]))`, "u");
  const m = re.exec(desc ?? "");
  return m ? m[1].trim() : "";
}

export interface Planned {
  event_id?: string; updated?: string; status?: string;
  key: string; date: string; title: string; header: string | null; km: number | null;
  dur_min_s: number | null; dur_max_s: number | null; week: number | null; kind: string | null; type: string; text: string; steps: Step[];
}
export interface Completed {
  event_id?: string; updated?: string; status?: string;
  start_utc: string; end_utc: string | null; tz: string | null; title: string; date: string | null; km: number | null; time_s: number | null;
  garmin_id: string | null; type: string; text: string; steps: Step[]; segments: [number, number][];
}

export function parseEvent(ev: IcsEvent): ["planned", Planned] | ["completed", Completed] | [null, null] {
  const summ = ev.summary ?? "", desc = ev.description ?? "";
  if (!desc.toLowerCase().includes("runna") && !summ.startsWith("🏃")) return [null, null];
  let title = summ.replace(/^[^\p{L}\p{N}_]+/u, "").trim();
  const st = ev.start ?? {}, en = ev.end ?? {};
  const base = { event_id: ev.id, updated: ev.updated, status: ev.status ?? "confirmed" };
  if (st.date) {
    const tkm = /\s-\s(\d+(?:[.,]\d+)?)\s*km$/.exec(title);
    let km = tkm ? numIt(tkm[1]) : null;
    if (tkm) title = title.slice(0, tkm.index).trim();
    const first = desc.split("\n", 1)[0];
    const hm = /^([^-\n]+?)\s+-\s+(\d+(?:[.,]\d+)?)\s*km\s+-\s+([\dhm]+)\s+-\s+([\dhm]+)/.exec(first);
    const header = hm ? hm[1].trim() : null;
    if (hm && km === null) km = numIt(hm[2]);
    const kd = /plan_week_(\d+)_([A-Z_]+?)_(\d+)/.exec(desc);
    let body = hm && desc.includes("\n") ? desc.slice(desc.indexOf("\n") + 1) : desc;
    body = body.split("📲")[0];
    return ["planned", {
      ...base,
      key: kd ? `w${kd[1]}_${kd[2]}_${kd[3]}` : `${st.date}_${title}`,
      date: st.date, title, header, km,
      dur_min_s: hm ? durTxt(hm[3]) : null, dur_max_s: hm ? durTxt(hm[4]) : null,
      week: kd ? Number(kd[1]) : null, kind: kd ? kd[2] : null,
      type: typeOf(title, header, kd ? kd[2] : null), text: body.trim(), steps: parseStructure(body),
    }];
  }
  if (st.dateTime) {
    const sint = section(desc, "📊 In sintesi");
    const g = /activityId=garmin-(\d+)/.exec(desc);
    const dist = /Distanza:\s*([\d.,]+)\s*km/.exec(sint);
    const tt = /Ora:\s*([\d:]+)/.exec(sint);
    let tsec: number | null = null;
    if (tt) { const p = tt[1].split(":").map(Number); tsec = p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1]; }
    const presc = section(desc, "📋 Descrizione");
    const segs: [number, number][] = [];
    for (const m of section(desc, "♻️ Segmenti").matchAll(new RegExp(String.raw`(\d+[.,]\d+)\s*km\s*@\s*` + PACE, "g"))) {
      segs.push([Math.round(numIt(m[1]) * 1000), ps(m[2], m[3])]);
    }
    const steps = parseStructure(presc);
    let type = typeOf(title);
    if (type === "facile" && steps.some((s) => s.kind === "work")) type = "qualita";
    return ["completed", {
      ...base, start_utc: st.dateTime, end_utc: en.dateTime ?? null, tz: st.timeZone ?? null, title, date: null,
      km: dist ? numIt(dist[1]) : null, time_s: tsec, garmin_id: g ? g[1] : null, type, text: presc, steps, segments: segs,
    }];
  }
  return [null, null];
}

/** Confronto prescrizione / giri reali (verdetto per la seduta). */
export function compare(steps: Step[], segs: [number, number][], kmPlan?: number | null, durRng?: [number | null, number | null] | null, km?: number | null, timeS?: number | null) {
  const seg = segs.filter((s) => s[0] >= 30);
  const res: Record<string, unknown> & { work: { m: number; pace: number; target: number; lo: number; hi: number; ok: boolean; fast: boolean; slow: boolean }[]; easy_over: { m: number; pace: number; limit: number }[]; notes: string[] } =
    { n_plan: steps.length, n_segs: seg.length, aligned: false, work: [], easy_over: [], notes: [] };
  if (kmPlan && km) { res.km_plan = kmPlan; res.km_diff_pct = pyRound((km / kmPlan - 1) * 100, 1); }
  if (durRng && timeS && durRng[0] && durRng[1]) { res.dur_plan = durRng; res.dur_ok = durRng[0] * 0.9 <= timeS && timeS <= durRng[1] * 1.1; }
  if (steps.length && seg.length === steps.length) {
    res.aligned = true;
    steps.forEach((st, i) => {
      const [m, p] = seg[i];
      if (st.kind === "work" && st.pace) {
        let lo = st.lo, hi = st.hi;
        if (lo === undefined || hi === undefined) { lo = st.pace - 5; hi = st.pace + 5; }
        res.work.push({ m, pace: p, target: st.pace, lo, hi, ok: lo - 3 <= p && p <= hi + 3, fast: p < lo - 3, slow: p > hi + 3 });
      } else if (st.limit && ["easy", "warm", "cool"].includes(st.kind) && p < st.limit - 3) {
        res.easy_over.push({ m, pace: p, limit: st.limit });
      }
    });
  } else if (steps.length) res.notes.push("struttura e giri non allineati: confronto solo sui totali");
  const w = res.work;
  if (w.length) {
    const ok = w.filter((x) => x.ok).length;
    const pc = w.map((x) => x.pace);
    const mean = pc.reduce((a, b) => a + b, 0) / pc.length;
    const sd = Math.sqrt(pc.reduce((a, x) => a + (x - mean) ** 2, 0) / pc.length);
    Object.assign(res, { work_ok: ok, work_n: w.length, work_cv: pyRound((sd / mean) * 100, 1), work_mean: pyRound(mean) });
    res.verdict = ok === w.length ? "centrata" : ok >= 0.7 * w.length ? "quasi centrata"
      : w.filter((x) => x.fast).length > w.filter((x) => x.slow).length ? "troppo veloce" : "sotto ritmo";
  } else {
    const d = res.km_diff_pct as number | undefined;
    res.verdict = d !== undefined && d < -10 ? "più corta" : d !== undefined && d > 15 ? "più lunga" : "fatta";
    if (res.easy_over.length) res.verdict = "facile troppo veloce";
  }
  return res;
}

/** Arrotondamento come round() di Python (metà al pari), per restare identici all'app attuale. */
export function pyRound(x: number, nd = 0): number {
  const p = 10 ** nd, y = x * p, f = Math.floor(y), d = y - f;
  const r = d === 0.5 ? (f % 2 === 0 ? f : f + 1) : Math.round(y);
  return r / p;
}

export const normTitle = (t?: string | null) => (t ?? "").toLowerCase().replace(/\s*-\s*[\d.,]+\s*km$/, "").replace(/\s+/g, " ").trim();
