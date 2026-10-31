// Utilità comuni: costruzione del DOM, date e numeri in italiano, icone.

export const $ = (id) => document.getElementById(id);

export function el(tag, attrs = {}, ...figli) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k === "style") e.style.cssText = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (k === "value") e.value = v;
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const f of figli.flat(Infinity)) if (f != null && f !== false) e.append(f instanceof Node ? f : String(f));
  return e;
}

// Sostituisce il contenuto di un nodo saltando i pezzi assenti (replaceChildren scriverebbe "null").
export const metti = (nodo, ...figli) => nodo.replaceChildren(...figli.flat(Infinity).filter((f) => f != null && f !== false));

export function sv(tag, attrs = {}, testo) {
  const e = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) e.setAttribute(k, v);
  if (testo != null) e.textContent = testo;
  return e;
}

// Icona a tratto: uno o più percorsi SVG su una griglia 24×24.
export function icona(d, { spessore = 2 } = {}) {
  const s = sv("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": spessore, "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" });
  for (const p of [].concat(d)) s.append(sv("path", { d: p }));
  return s;
}
export const ICONE = {
  Forza: "M6 7v10M18 7v10M3 10v4M21 10v4M6 12h12",
  HIIT: "M13 2L4 14h7l-1 8 9-12h-7z",
  Corsa: ["M13.5 5.5a1.5 1.5 0 1 0 0-.01", "M8 21l3-6 3 2v5", "M7 12l3-4 4 1 3 3", "M10 8l-1 5"],
  Camminata: ["M13 4.5a1.5 1.5 0 1 0 0-.01", "M10 21l2-7 3 3v4", "M9 11l2-3 3 1 2 3", "M11 8l-1.5 6"],
  Trekking: ["M3 20l6-10 4 6 3-4 5 8z", "M9 10l1.5-2.5"],
  Bici: ["M5.5 17.5a3.5 3.5 0 1 0 0-.01", "M18.5 17.5a3.5 3.5 0 1 0 0-.01", "M5.5 17.5L9 9h6l3.5 8.5", "M12 17.5L9 9", "M14 6h3"],
  altro: "M12 6v12M6 12h12",
  impostazioni: ["M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z", "M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"],
  indietro: "M15 18l-6-6 6-6",
  spunta: "M5 12l5 5 9-10",
  chiudi: "M6 6l12 12M18 6L6 18",
  su: "M6 15l6-6 6 6",
  giu: "M6 9l6 6 6-6",
  cestino: ["M4 7h16", "M9 7V4h6v3", "M6 7l1 13h10l1-13"],
  oggi: "M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z",
  settimana: ["M4 5h16v15H4z", "M4 10h16", "M9 3v4", "M15 3v4"],
  allenamenti: ["M4 6h16", "M4 12h16", "M4 18h10"],
  analisi: ["M4 20V10", "M10 20V4", "M16 20v-7", "M22 20H2"],
};

// Le date sono stringhe "AAAA-MM-GG" nel fuso di chi usa l'app; i conti si fanno a mezzogiorno UTC.
export const oggi = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
export const ms = (d) => Date.parse(d + "T12:00:00Z");
export const giorniTra = (a, b) => Math.round((ms(b) - ms(a)) / 864e5);
export const piuGiorni = (d, n) => new Date(ms(d) + n * 864e5).toISOString().slice(0, 10);
export const lunediDi = (d) => piuGiorni(d, -((new Date(ms(d)).getUTCDay() + 6) % 7));
export const fmtData = (d, o) => new Date(ms(d)).toLocaleDateString("it-IT", { timeZone: "UTC", ...o });
export const fmtGiorno = (d) => fmtData(d, { weekday: "short", day: "numeric", month: "short" });
const maiuscola = (s) => s.charAt(0).toUpperCase() + s.slice(1);
export const fmtDataLunga = (d) => maiuscola(fmtData(d, { weekday: "long", day: "numeric", month: "long" }));

export const fmtNum = (x, dec = 0) =>
  x == null || Number.isNaN(x) ? "—" : Number(x).toLocaleString("it-IT", { minimumFractionDigits: dec, maximumFractionDigits: dec });
export const fmtKg = (x) => fmtNum(x, Number.isInteger(x) ? 0 : 1);
export function fmtDur(min) {
  if (min == null) return "—";
  const m = Math.round(min);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`;
}
export const fmtOre = (min) => { const m = Math.round(min ?? 0); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`; };
export const fmtSec = (s) => { const t = Math.max(0, Math.round(s)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`; };
// Passo in min/km da km e minuti.
export const fmtPasso = (km, min) => (km > 0 && min > 0 ? `${fmtSec((min * 60) / km)}` : "—");

export const numero = (v) => { if (v === "" || v == null) return null; const n = Number(String(v).replace(",", ".")); return Number.isFinite(n) ? n : null; };
export const somma = (lista, f) => lista.reduce((a, x) => a + (f(x) ?? 0), 0);
export const media = (valori) => (valori.length ? valori.reduce((a, b) => a + b, 0) / valori.length : null);

export function avviso(testo) {
  const a = $("avviso");
  a.textContent = testo;
  a.hidden = false;
  clearTimeout(avviso.t);
  avviso.t = setTimeout(() => (a.hidden = true), 2800);
}
export function esito(nodo, testo, tipo) {
  nodo.textContent = testo;
  nodo.className = "esito" + (tipo ? " " + tipo : "");
}

// Pulsante che chiede conferma con un secondo tocco (i dialoghi del browser negli artifact non compaiono).
export function conConferma(pulsante, testoConferma, azione) {
  const originale = pulsante.textContent;
  pulsante.addEventListener("click", async () => {
    if (pulsante.dataset.conferma !== "1") {
      pulsante.dataset.conferma = "1";
      pulsante.textContent = testoConferma;
      setTimeout(() => { if (pulsante.isConnected) { pulsante.dataset.conferma = ""; pulsante.textContent = originale; } }, 4000);
      return;
    }
    pulsante.disabled = true;
    try { await azione(); } finally { if (pulsante.isConnected) { pulsante.disabled = false; pulsante.dataset.conferma = ""; pulsante.textContent = originale; } }
  });
  return pulsante;
}

// Promemoria per-browser (scheda aperta, bozza): mai dati importanti.
export const ricorda = {
  leggi(k) { try { return JSON.parse(localStorage.getItem("allenamento." + k)); } catch { return null; } },
  scrivi(k, v) { try { v == null ? localStorage.removeItem("allenamento." + k) : localStorage.setItem("allenamento." + k, JSON.stringify(v)); } catch { /* niente */ } },
};
