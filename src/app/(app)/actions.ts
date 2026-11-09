"use server";
import { revalidatePath } from "next/cache";
import { invalidate } from "@/lib/cache";
import { q } from "@/lib/db";
import { todayLocal } from "@/lib/fmt";

const CTX = ["caldo", "viaggio", "alcol", "malattia", "febbre"];
const RUN = ["run", "trail_run", "treadmill"];
const PRESET: Record<string, number> = { "5": 5000, "10": 10000, "21": 21097.5, "42": 42195 };

/** Domanda del mattino: come ti senti (1-5) e contesto del giorno. Una riga per giorno, aggiornabile. */
export async function saveCheckin(fd: FormData) {
  const day = todayLocal();
  const feelRaw = fd.get("feel");
  const feel = feelRaw ? Math.max(1, Math.min(5, Number(feelRaw))) : null;
  const context = fd.getAll("ctx").map(String).filter((c) => CTX.includes(c));
  const keepFeel = fd.get("keep") === "1";
  await q(
    `insert into sport.checkins(day, feel, context, updated_at) values ($1::date, $2, $3::text[], now())
     on conflict (day) do update set feel = case when $4 then sport.checkins.feel else excluded.feel end, context = excluded.context, updated_at = now()`,
    [day, feel, context, keepFeel]);
  invalidate();
  revalidatePath("/");
  revalidatePath("/corpo");
}

/** Tempo da "h:mm:ss", "mm:ss" o minuti decimali; null se non leggibile. */
function parseTime(t: string): number | null {
  const p = t.trim().replace(/[.,]/g, ":").split(":").map((x) => Number(x));
  if (!p.length || p.some((x) => !Number.isFinite(x) || x < 0)) return null;
  const s = p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p.length === 2 ? p[0] * 60 + p[1] : p[0] * 60;
  return s > 0 ? s : null;
}

export async function addResult(fd: FormData) {
  const name = String(fd.get("name") ?? "").trim().slice(0, 80);
  const dayS = String(fd.get("day") ?? "");
  const preset = String(fd.get("dist") ?? "");
  const other = Number(String(fd.get("km") ?? "").replace(",", "."));
  const dist = PRESET[preset] ?? (other > 0 ? other * 1000 : 0);
  const time = parseTime(String(fd.get("time") ?? ""));
  const kind = String(fd.get("kind") ?? "gara") === "test" ? "test" : "gara";
  if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(dayS) || !(dist > 0) || !time) return;
  // abbinamento automatico alla corsa dello stesso giorno con distanza simile (±8%)
  const [act] = await q<{ id: string }>(
    `select a.id from sport.activities a where not a.hidden and a.sport = any($1) and coalesce(a.start_local, a.start_utc at time zone 'Indian/Antananarivo')::date = $2::date
      order by abs(a.distance_m - $3) limit 1`, [RUN, dayS, dist]);
  let actId: string | null = act?.id ?? null;
  if (actId) {
    const [d] = await q<{ m: number }>("select distance_m::float8 as m from sport.activities where id = $1", [actId]);
    if (!d || Math.abs(d.m - dist) / dist > 0.08) actId = null;
  }
  await q("insert into sport.results(id, day, name, kind, dist_m, time_s, activity_id) values (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6)", [dayS, name, kind, dist, time, actId]);
  invalidate();
  revalidatePath("/gara");
}
export async function delResult(fd: FormData) {
  await q("delete from sport.results where id = $1", [String(fd.get("id"))]);
  invalidate();
  revalidatePath("/gara");
}

