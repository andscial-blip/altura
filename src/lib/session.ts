import { createHmac, timingSafeEqual, createHash, randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

/**
 * Sessione firmata (HMAC-SHA256) in un cookie httpOnly. Un solo proprietario: nessun utente o password propri,
 * l'accesso avviene con una passkey del dispositivo (Face ID, Touch ID, Windows Hello).
 */
export const SESSION_COOKIE = "altura_s";
export const CHALLENGE_COOKIE = "altura_c";
const SESSION_DAYS = 30;

function secret(): Buffer {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET mancante o troppo corto");
  return Buffer.from(s);
}

const b64u = (b: Buffer | string) => Buffer.from(b).toString("base64url");

export function sign(payload: Record<string, unknown>): string {
  const body = b64u(JSON.stringify(payload));
  const mac = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function verify<T extends { exp: number }>(token: string | undefined | null): T | null {
  if (!token) return null;
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const want = createHmac("sha256", secret()).update(body).digest();
  let got: Buffer;
  try { got = Buffer.from(mac, "base64url"); } catch { return null; }
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString()) as T;
    if (typeof p.exp !== "number" || p.exp < Date.now()) return null;
    return p;
  } catch { return null; }
}

export function newSession(): { value: string; maxAge: number } {
  const maxAge = SESSION_DAYS * 86400;
  return { value: sign({ sub: "owner", exp: Date.now() + maxAge * 1000, n: randomBytes(8).toString("hex") }), maxAge };
}

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** Cifratura AES-256-GCM per token di terze parti salvati nel database (es. refresh token Strava). */
function key(): Buffer { return createHash("sha256").update(Buffer.concat([secret(), Buffer.from("|altura-enc")])).digest(); }
export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64url")).join(".");
}
export function decrypt(token: string): string {
  const [iv, tag, enc] = token.split(".").map((p) => Buffer.from(p, "base64url"));
  if (!iv || !tag || !enc) throw new Error("token cifrato non valido");
  const d = createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}
