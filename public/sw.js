/*
 * Altura: avvio istantaneo.
 * - File statici di Next (/_next/static, nomi con impronta, mai modificati): prima la cache.
 * - Pagine: si mostra subito l'ultima versione salvata sul dispositivo e intanto si scarica quella nuova,
 *   che sostituisce la copia in cache; l'app chiede comunque i dati aggiornati appena si apre.
 * - API, accesso e richieste dei dati dell'app (RSC): sempre dalla rete, mai in cache.
 */
const STATIC = "altura-static-v1";
const PAGES = "altura-pages-v1";
// se la stessa pagina viene richiesta di nuovo entro 15 s (es. ricarica dopo un aggiornamento dell'app) si va in rete
const served = new Map();

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (![STATIC, PAGES].includes(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname.endsWith(".woff2")) {
    e.respondWith(caches.open(STATIC).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) c.put(req, res.clone());
      return res;
    }));
    return;
  }
  const isPage = req.mode === "navigate" && !url.pathname.startsWith("/api") && !url.pathname.startsWith("/accesso");
  if (!isPage) return;
  e.respondWith(caches.open(PAGES).then(async (c) => {
    const key = url.pathname; // una copia per pagina, senza i filtri
    const hit = await c.match(key);
    const net = fetch(req).then((res) => {
      // si salva solo una pagina vera dell'app (non un rinvio all'accesso)
      // (e non una schermata d'errore: quella non deve ricomparire al prossimo avvio)
      if (res.ok && !res.redirected && res.headers.get("content-type")?.includes("text/html")) {
        const copy = res.clone();
        e.waitUntil(copy.text().then((t) => {
          if (t.includes("data-altura-error")) return c.delete(key);
          return c.put(key, new Response(t, { headers: { "content-type": "text/html; charset=utf-8" } }));
        }).catch(() => {}));
      }
      return res;
    });
    const recent = Date.now() - (served.get(key) ?? 0) < 15000;
    if (hit && !url.search && !recent) { served.set(key, Date.now()); e.waitUntil(net.catch(() => {})); return hit; }
    try { return await net; } catch { return hit ?? Response.error(); }
  }));
});
