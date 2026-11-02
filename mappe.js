// Mappa topografica sotto le tracce GPS (app Android) e quote del terreno per il dislivello dei telefoni senza barometro. Salvando un allenamento con la traccia, o aprendolo se la mappa
// manca, si scaricano da OpenTopoMap le poche tessere che coprono il percorso e si compongono in un'immagine 4:3,
// tenuta sul telefono (IndexedDB "allenamento-mappe"). Le mappe non vanno nei backup: si riscaricano aprendo
// l'allenamento. Stessa proiezione Web Mercator del disegno della traccia (mondo() di analisi-file.js), quindi la
// traccia ci sta sopra allineata. Chi gestisce le mappe vede la zona richiesta: per questo si possono spegnere.
import { mondo, salitaDalTerreno } from "./analisi-file.js";
import { nativo } from "./sorgenti.js";
import { ricorda } from "./util.js";

const W = 1024, H = 768, TESSERA = 256, Z_MAX = 16, Z_MIN = 9, Z_TESSERE_MAX = 17;
const MARGINE = 1.3; // la traccia occupa al massimo il 77% del riquadro
const SCHIARISCI = 0.22; // la mappa un po' più chiara, perché la traccia colorata spicchi

// Nell'app Android (e nelle prove sul PC); sul sito le regole di sicurezza della pagina non lasciano chiamare le mappe.
export const mappePossibili = () => nativo() || location.hostname === "127.0.0.1";
export const mappeAttive = () => mappePossibili() && ricorda.leggi("mappe") !== false;
export const impostaMappe = (si) => ricorda.scrivi("mappe", si ? null : false);

// Livello più dettagliato in cui la traccia, con il margine, sta nel riquadro; riquadro centrato sulla traccia.
export function inquadra({ lat, lon }) {
  const base = lat.map((la, i) => mondo(la, lon[i], 0));
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const { x, y } of base) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  for (let z = Z_MAX; z >= Z_MIN; z--) {
    const k = 2 ** z;
    if (((maxX - minX) * k * MARGINE <= W && (maxY - minY) * k * MARGINE <= H) || z === Z_MIN)
      return { z, x0: Math.round(((minX + maxX) / 2) * k - W / 2), y0: Math.round(((minY + maxY) / 2) * k - H / 2), w: W, h: H };
  }
}

// Lo stesso riquadro al livello dopo: il doppio dei pixel (e 4 volte le tessere), per ingrandire fino a 2× senza sfocare.
export const raddoppia = (q) => (q.z < Z_TESSERE_MAX ? { z: q.z + 1, x0: q.x0 * 2, y0: q.y0 * 2, w: q.w * 2, h: q.h * 2 } : q);

async function tessera(z, x, y) {
  const r = await fetch(`https://${"abc"[(x + y) % 3]}.tile.opentopomap.org/${z}/${x}/${y}.png`);
  if (!r.ok) throw new Error(`mappa non disponibile (${r.status})`);
  return createImageBitmap(await r.blob());
}

async function componi({ z, x0, y0, w, h }) {
  const tela = document.createElement("canvas");
  tela.width = w;
  tela.height = h;
  const c = tela.getContext("2d");
  c.fillStyle = "#ffffff";
  c.fillRect(0, 0, w, h);
  const tessere = [];
  for (let tx = Math.floor(x0 / TESSERA); tx <= Math.floor((x0 + w - 1) / TESSERA); tx++)
    for (let ty = Math.max(0, Math.floor(y0 / TESSERA)); ty <= Math.min(2 ** z - 1, Math.floor((y0 + h - 1) / TESSERA)); ty++) tessere.push([tx, ty]);
  // Quattro alla volta: è un servizio gratuito.
  for (let i = 0; i < tessere.length; i += 4) await Promise.all(tessere.slice(i, i + 4).map(async ([tx, ty]) => {
    const img = await tessera(z, tx, ty);
    c.drawImage(img, tx * TESSERA - x0, ty * TESSERA - y0);
    img.close?.();
  }));
  c.globalAlpha = SCHIARISCI;
  c.fillRect(0, 0, w, h);
  return new Promise((ok, ko) => tela.toBlob((b) => (b ? ok(b) : ko(new Error("immagine della mappa non creata"))), "image/jpeg", 0.8));
}

/* ---------- archivio delle mappe sul telefono ---------- */
const db = () => new Promise((ok, ko) => {
  const r = indexedDB.open("allenamento-mappe", 1);
  r.onupgradeneeded = () => r.result.createObjectStore("mappe");
  r.onsuccess = () => ok(r.result);
  r.onerror = () => ko(r.error);
});
async function archivio(modo, f) {
  const d = await db();
  return new Promise((ok, ko) => {
    const t = d.transaction("mappe", modo);
    const r = f(t.objectStore("mappe"));
    t.oncomplete = () => ok(r?.result);
    t.onerror = () => ko(t.error);
  });
}

// Scarica la mappa di un allenamento, se non c'è già (con `rifai` anche se c'è, per le mappe salvate prima a metà
// dettaglio). Una alla volta, e mai due volte la stessa insieme.
const inCorso = new Map();
let coda = Promise.resolve();
export function scaricaMappa(id, traccia, { rifai = false } = {}) {
  if (!mappeAttive() || !(traccia?.lat?.length > 1)) return Promise.resolve(false);
  if (inCorso.has(id)) return inCorso.get(id);
  const lavoro = coda.then(async () => {
    if (!rifai && await archivio("readonly", (s) => s.getKey(id))) return true;
    const riquadro = raddoppia(inquadra(traccia));
    const immagine = await componi(riquadro);
    await archivio("readwrite", (s) => s.put({ ...riquadro, immagine }, id));
    return true;
  }).finally(() => inCorso.delete(id));
  coda = lavoro.catch(() => {});
  inCorso.set(id, lavoro);
  return lavoro;
}

// {z, x0, y0, w, h, url} per graficoTraccia, oppure null. L'indirizzo dell'immagine precedente si libera.
let ultimoUrl = null;
export async function leggiMappa(id) {
  try {
    const m = await archivio("readonly", (s) => s.get(id));
    if (!m) return null;
    if (ultimoUrl) URL.revokeObjectURL(ultimoUrl);
    ultimoUrl = URL.createObjectURL(m.immagine);
    return { z: m.z, x0: m.x0, y0: m.y0, w: m.w, h: m.h, url: ultimoUrl, alta: m.w > W };
  } catch { return null; }
}
export const eliminaMappa = (id) => archivio("readwrite", (s) => s.delete(id)).catch(() => {});
export const eliminaTutteLeMappe = () => archivio("readwrite", (s) => s.clear()).catch(() => {});

/* ---------- quote del terreno ---------- */
// Terrain Tiles su AWS (Mapzen; in Italia EU-DEM a 25 m): tessere PNG in cui il colore è la quota. Come per la mappa,
// il servizio vede solo la zona richiesta.
async function quoteTerreno(lat, lon) {
  let z = 14, chiavi;
  for (; ; z--) {
    chiavi = new Set();
    for (let i = 0; i < lat.length; i++) { const p = mondo(lat[i], lon[i], z); for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) chiavi.add(`${Math.floor((p.x - 0.5 + dx) / 256)}/${Math.floor((p.y - 0.5 + dy) / 256)}`); }
    if (chiavi.size <= 24 || z === 10) break;
  }
  const tessere = new Map();
  const lista = [...chiavi];
  for (let i = 0; i < lista.length; i += 4) await Promise.all(lista.slice(i, i + 4).map(async (k) => {
    const r = await fetch(`https://elevation-tiles-prod.s3.amazonaws.com/terrarium/${z}/${k}.png`);
    if (!r.ok) throw new Error(`quote del terreno non disponibili (${r.status})`);
    const img = await createImageBitmap(await r.blob(), { colorSpaceConversion: "none", premultiplyAlpha: "none" });
    const tela = document.createElement("canvas");
    tela.width = tela.height = 256;
    const c = tela.getContext("2d", { willReadFrequently: true });
    c.drawImage(img, 0, 0);
    img.close?.();
    tessere.set(k, c.getImageData(0, 0, 256, 256).data);
  }));
  const h = (x, y) => { const t = tessere.get(`${Math.floor(x / 256)}/${Math.floor(y / 256)}`); const i = ((y % 256) * 256 + (x % 256)) * 4; return t[i] * 256 + t[i + 1] + t[i + 2] / 256 - 32768; };
  return lat.map((la, i) => {
    const p = mondo(la, lon[i], z), fx = p.x - 0.5, fy = p.y - 0.5, ix = Math.floor(fx), iy = Math.floor(fy), a = fx - ix, b = fy - iy;
    return h(ix, iy) * (1 - a) * (1 - b) + h(ix + 1, iy) * a * (1 - b) + h(ix, iy + 1) * (1 - a) * b + h(ix + 1, iy + 1) * a * b;
  });
}

// Salita e curva della quota (a passo `passo` secondi) dalle quote del terreno lungo la traccia {t, lat, lon}.
export async function quotaDalTerreno(traccia, { bici = false, passo = 15 } = {}) {
  if (!mappeAttive() || !(traccia?.lat?.length > 10)) return null;
  const quote = await quoteTerreno(traccia.lat, traccia.lon);
  const salita_m = salitaDalTerreno(traccia.lat, traccia.lon, quote, { bici });
  const secchi = Array.from({ length: Math.floor(traccia.t.at(-1) / passo) + 1 }, () => []);
  // Un punto può avere un tempo di poco negativo: il fix GPS preso un attimo prima di Avvia.
  traccia.t.forEach((s, i) => secchi[Math.min(secchi.length - 1, Math.max(0, Math.floor(s / passo)))].push(quote[i]));
  return { salita_m, quota: secchi.map((a) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null)) };
}
