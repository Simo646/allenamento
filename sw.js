// Uso senza rete: l'app sta tutta in cache. Generato da prepara-web.mjs, non modificare a mano.
const CACHE = "allenamento-81ab367fa1";
const FILE = ["./","./index.html","./stile.css","./manifest.webmanifest","./registra-sw.js","./analisi-file.js","./analisi.js","./app.js","./archivio.js","./dal-vivo.js","./dati.js","./dettaglio.js","./grafici.js","./impostazioni.js","./lettore-fit.js","./mappe.js","./registra.js","./registratore.js","./schede.js","./settimana.js","./sorgenti.js","./stato.js","./suoni.js","./timer-hiit.js","./util.js","./fonti/barlow-400-latin-ext.woff2","./fonti/barlow-400-latin.woff2","./fonti/barlow-500-latin-ext.woff2","./fonti/barlow-500-latin.woff2","./fonti/barlow-600-latin-ext.woff2","./fonti/barlow-600-latin.woff2","./fonti/barlow-semi-condensed-500-latin-ext.woff2","./fonti/barlow-semi-condensed-500-latin.woff2","./fonti/barlow-semi-condensed-600-latin-ext.woff2","./fonti/barlow-semi-condensed-600-latin.woff2","./fonti/barlow-semi-condensed-700-latin-ext.woff2","./fonti/barlow-semi-condensed-700-latin.woff2","./fonti/fonti.css","./fonti/OFL-Barlow.txt","./fonti/OFL-BarlowSemiCondensed.txt","./icone/icona-192.png","./icone/icona-512.png","./icone/icona-maskable-512.png","./icone/apple-touch-icon.png"];
// Il lettore FIT (licenza Garmin) non sta nel repository: si salva da jsDelivr. L'app ne controlla l'impronta.
const ESTERNI = ["https://cdn.jsdelivr.net/npm/@garmin/fitsdk@21.218.0/src/accumulator.js","https://cdn.jsdelivr.net/npm/@garmin/fitsdk@21.218.0/src/bit-stream.js","https://cdn.jsdelivr.net/npm/@garmin/fitsdk@21.218.0/src/crc-calculator.js","https://cdn.jsdelivr.net/npm/@garmin/fitsdk@21.218.0/src/decoder.js","https://cdn.jsdelivr.net/npm/@garmin/fitsdk@21.218.0/src/encoder.js","https://cdn.jsdelivr.net/npm/@garmin/fitsdk@21.218.0/src/fit.js","https://cdn.jsdelivr.net/npm/@garmin/fitsdk@21.218.0/src/index.js","https://cdn.jsdelivr.net/npm/@garmin/fitsdk@21.218.0/src/mesg-definition.js","https://cdn.jsdelivr.net/npm/@garmin/fitsdk@21.218.0/src/output-stream.js","https://cdn.jsdelivr.net/npm/@garmin/fitsdk@21.218.0/src/profile.js","https://cdn.jsdelivr.net/npm/@garmin/fitsdk@21.218.0/src/stream.js","https://cdn.jsdelivr.net/npm/@garmin/fitsdk@21.218.0/src/utils-hr-mesg.js","https://cdn.jsdelivr.net/npm/@garmin/fitsdk@21.218.0/src/utils-internal.js","https://cdn.jsdelivr.net/npm/@garmin/fitsdk@21.218.0/src/utils-memo-glob.js","https://cdn.jsdelivr.net/npm/@garmin/fitsdk@21.218.0/src/utils.js"];
const PAGINE_APP = [new URL("./", location).pathname, new URL("./index.html", location).pathname];

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
  if (esterno && !ESTERNI.includes(url.href)) return;
  // Le aperture di pagina mostrano l'app dalla cache, ma non le altre pagine del sito (android/ e l'APK da scaricare).
  if (req.mode === "navigate" && !PAGINE_APP.includes(url.pathname)) return;
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
