import "server-only";
import { Pool, type PoolClient, type QueryResultRow } from "pg";

/**
 * Connessione al database (schema "sport" nel progetto Supabase di Cairn).
 * Ruolo dedicato sport_app: vede solo lo schema sport. URL solo lato server (variabile DATABASE_URL su Vercel).
 * Pooler Supabase in modalità transazione: niente prepared statements nominati.
 */
const g = globalThis as unknown as { __alturaPool?: Pool };

function pool(): Pool {
  if (!g.__alturaPool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL mancante");
    g.__alturaPool = new Pool({
      connectionString: url,
      max: 3,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 8_000,
      // Supabase richiede TLS; il database locale dei test d'integrazione no (sslmode=disable nell'URL)
      ssl: /sslmode=disable/.test(url) ? false : { rejectUnauthorized: false },
    });
  }
  return g.__alturaPool;
}

export async function q<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []): Promise<T[]> {
  const r = await pool().query<T>(text, params);
  return r.rows;
}

export async function one<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []): Promise<T | null> {
  const rows = await q<T>(text, params);
  return rows[0] ?? null;
}

export async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool().connect();
  try {
    await c.query("begin");
    const out = await fn(c);
    await c.query("commit");
    return out;
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

export async function getSetting<T>(key: string): Promise<T | null> {
  const r = await one<{ value: T }>("select value from sport.settings where key = $1", [key]);
  return r ? r.value : null;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await q(
    "insert into sport.settings(key, value, updated_at) values ($1, $2::jsonb, now()) on conflict (key) do update set value = excluded.value, updated_at = now()",
    [key, JSON.stringify(value)],
  );
}
