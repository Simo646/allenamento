// Uso senza rete: l'app sta tutta in cache. Generato da prepara-web.mjs, non modificare a mano.
const CACHE = "allenamento-4ad8f56fed";
const FILE = ["./","./index.html","./stile.css","./manifest.webmanifest","./analisi-file.js","./analisi.js","./app.js","./archivio.js","./dati.js","./dettaglio.js","./grafici.js","./impostazioni.js","./registra.js","./schede.js","./settimana.js","./stato.js","./util.js","./icone/icona-192.png","./icone/icona-512.png","./icone/icona-maskable-512.png","./icone/apple-touch-icon.png"];
// Il lettore FIT (licenza Garmin) e i caratteri non stanno nel repository: si salvano dal sito d'origine.
const ESTERNI = ["https://cdn.jsdelivr.net/npm/@garmin/fitsdk@21.218.0/+esm"];
const ESTERNI_OK = /^(fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.jsdelivr\.net)$/;

self.addEventListener("install", (e) => e.waitUntil((async () => {
  const c = await caches.open(CACHE);
  await c.addAll(FILE);
  await Promise.all(ESTERNI.map((u) => c.add(u).catch(() => {})));
  await self.skipWaiting();
})()));

self.addEventListener("activate", (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k.startsWith("allenamento-") && k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const esterno = url.origin !== location.origin;
  if (esterno && !ESTERNI_OK.test(url.hostname)) return;
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    if (req.mode === "navigate") return (await c.match("./index.html")) ?? fetch(req);
    const salvata = await c.match(req, { ignoreSearch: !esterno });
    if (salvata) return salvata;
    const risposta = await fetch(req);
    if (esterno && risposta.ok) c.put(req, risposta.clone());
    return risposta;
  })());
});
