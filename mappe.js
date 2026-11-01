// Mappa topografica sotto le tracce GPS (app Android). Salvando un allenamento con la traccia, o aprendolo se la mappa
// manca, si scaricano da OpenTopoMap le poche tessere che coprono il percorso e si compongono in un'immagine 4:3,
// tenuta sul telefono (IndexedDB "allenamento-mappe"). Le mappe non vanno nei backup: si riscaricano aprendo
// l'allenamento. Stessa proiezione Web Mercator del disegno della traccia (mondo() di analisi-file.js), quindi la
// traccia ci sta sopra allineata. Chi gestisce le mappe vede la zona richiesta: per questo si possono spegnere.
import { mondo } from "./analisi-file.js";
import { nativo } from "./sorgenti.js";
import { ricorda } from "./util.js";

const W = 1024, H = 768, TESSERA = 256, Z_MAX = 16, Z_MIN = 9;
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

// Scarica la mappa di un allenamento, se non c'è già. Una alla volta, e mai due volte la stessa insieme.
const inCorso = new Map();
let coda = Promise.resolve();
export function scaricaMappa(id, traccia) {
  if (!mappeAttive() || !(traccia?.lat?.length > 1)) return Promise.resolve(false);
  if (inCorso.has(id)) return inCorso.get(id);
  const lavoro = coda.then(async () => {
    if (await archivio("readonly", (s) => s.getKey(id))) return true;
    const riquadro = inquadra(traccia);
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
    return { z: m.z, x0: m.x0, y0: m.y0, w: m.w, h: m.h, url: ultimoUrl };
  } catch { return null; }
}
export const eliminaMappa = (id) => archivio("readwrite", (s) => s.delete(id)).catch(() => {});
export const eliminaTutteLeMappe = () => archivio("readwrite", (s) => s.clear()).catch(() => {});
