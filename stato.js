// Stato dell'app, caricamento dei dati, navigazione e piccoli pezzi condivisi dalle viste.
import { apriArchivio } from "./archivio.js";
import { profiloCompleto, settimanaVuota, etaDa, vociDelGiorno } from "./dati.js";
import { calcolaZone, TIPI } from "./analisi-file.js";
import { $, el, metti, icona, ICONE, fmtDataLunga, oggi } from "./util.js";

export const stato = {
  archivio: null, caricati: new Set(), errore: null,
  profilo: profiloCompleto({}), haProfilo: false, settimana: settimanaVuota(), schede: {},
  sessioni: [], nottiMesi: [], pesoMesi: [], notti: [], peso: [],
  vista: "oggi", param: {},
};
const VIVE = ["config", "schede", "sessioni", "notti", "peso"];
export const pronto = () => VIVE.every((c) => stato.caricati.has(c));

/* ---------- caricamento ---------- */
export async function avvia() {
  try { stato.archivio = await apriArchivio(); }
  catch (e) { stato.errore = "Non riesco ad aprire l'archivio dei dati. Ricarica la pagina."; console.error(e); programmaRender(); return; }
  const a = stato.archivio;
  const segna = (c) => { stato.caricati.add(c); programmaRender(); };
  const errore = (e) => {
    console.error(e);
    stato.errore = e?.code === "revoked" ? "Accesso ai dati revocato: ricarica la pagina." : "Non riesco a leggere i dati. Ricarica la pagina.";
    programmaRender();
  };
  a.ascolta("config", (docs) => {
    const p = docs.find((d) => d.id === "profilo");
    stato.haProfilo = !!p;
    stato.profilo = profiloCompleto(p ? { ...p, id: undefined } : {});
    const s = docs.find((d) => d.id === "settimana");
    stato.settimana = { ...settimanaVuota(), ...(s ?? {}) };
    delete stato.settimana.id;
    segna("config");
  }, errore);
  a.ascolta("schede", (docs) => { stato.schede = Object.fromEntries(docs.map((d) => [d.id, d])); segna("schede"); }, errore);
  a.ascolta("sessioni", (docs) => { stato.sessioni = docs; segna("sessioni"); }, errore);
  a.ascolta("notti", (docs) => { stato.nottiMesi = docs; stato.notti = appiattisci(docs); segna("notti"); }, errore);
  a.ascolta("peso", (docs) => { stato.pesoMesi = docs; stato.peso = appiattisci(docs); segna("peso"); }, errore);
}

// Notti e peso stanno in un documento per mese ({giorni: {data: valori}}), per consumare pochi documenti.
const appiattisci = (mesi) => mesi.flatMap((m) => Object.entries(m.giorni ?? {}).map(([data, v]) => ({ ...v, data }))).sort((a, b) => a.data.localeCompare(b.data));
export async function salvaGiorno(collezione, data, valori) {
  const mese = data.slice(0, 7);
  const doc = (collezione === "notti" ? stato.nottiMesi : stato.pesoMesi).find((m) => m.id === mese);
  const giorni = { ...(doc?.giorni ?? {}) };
  if (valori) giorni[data] = valori; else delete giorni[data];
  if (!Object.keys(giorni).length) return stato.archivio.elimina(collezione, mese);
  return stato.archivio.scrivi(collezione, mese, { giorni });
}
export const salvaProfilo = (p) => stato.archivio.scrivi("config", "profilo", p);
export const salvaSettimana = (s) => stato.archivio.scrivi("config", "settimana", s);

/* ---------- navigazione ---------- */
// Ogni vista: {render(main, param), vivo}. Le viste "vive" si ridisegnano quando cambiano i dati;
// i moduli (vivo: false) no, per non cancellare quello che stai scrivendo.
const viste = {};
const SCHEDA_DI = { oggi: "oggi", registra: "oggi", settimana: "settimana", schede: "settimana", "scheda-vista": "settimana", scheda: "settimana", voce: "settimana", allenamenti: "allenamenti", analisi: "analisi" };
export function registraVista(nome, def) { viste[nome] = def; }

export function vai(nome, param = {}) {
  stato.vista = nome;
  stato.param = param;
  document.body.classList.remove("con-barra");
  $("barra-fondo").hidden = true;
  $("barra-fondo").replaceChildren();
  for (const b of document.querySelectorAll(".schede-nav [data-vai]")) b.setAttribute("aria-current", b.dataset.vai === SCHEDA_DI[nome] ? "page" : "false");
  window.scrollTo({ top: 0 });
  disegna();
}

// Ridisegna la stessa vista con nuovi parametri senza tornare in cima (per i moduli che cambiano forma).
export function rivai(nome, param) {
  const y = window.scrollY;
  vai(nome, param);
  window.scrollTo({ top: y });
}

let raf = 0;
export function programmaRender() {
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(() => { if (viste[stato.vista]?.vivo || !pronto()) disegna(); });
}

function disegna() {
  const main = $("vista");
  if (stato.errore) return metti(main, testata({ titolo: "Allenamento" }), statoApp("I dati non sono raggiungibili", stato.errore));
  if (!pronto()) return metti(main, testata({ titolo: "Allenamento" }), statoApp("Sto aprendo i tuoi dati", "Programma di oggi, settimana e allenamenti compaiono appena arrivano."));
  if (!stato.profilo.avvio_completato && stato.vista !== "avvio") { stato.vista = "avvio"; stato.param = {}; }
  $("nav").hidden = stato.vista === "avvio";
  viste[stato.vista]?.render(main, stato.param);
}

/* ---------- pezzi condivisi ---------- */
export const statoApp = (titolo, testo) => el("div", { class: "stato-app" }, el("b", {}, titolo), el("span", {}, testo));

// Testata di una vista: data e titolo con l'ingranaggio delle impostazioni, oppure "indietro".
export function testata({ titolo, sopra = fmtDataLunga(oggi()), indietro = null, destra = null }) {
  const sinistra = el("div", { class: "indietro" },
    indietro ? el("button", { type: "button", class: "tondo", "aria-label": "Indietro", onclick: indietro }, icona(ICONE.indietro)) : null,
    el("div", {}, el("div", { class: "data" }, sopra), el("h1", {}, titolo)));
  const ingranaggio = destra === null && !indietro && stato.profilo.avvio_completato
    ? el("button", { type: "button", class: "tondo", "aria-label": "Impostazioni", onclick: () => vai("impostazioni") }, icona(ICONE.impostazioni, { spessore: 1.8 }))
    : destra;
  return el("header", { class: "testata" }, led(), el("div", { class: "testata-riga" }, sinistra, ingranaggio));
}

// Striscia dei LED come sul ciclocomputer: colore della zona obiettivo di oggi, grigia per forza o riposo.
function led() {
  const zona = pronto() ? vociDelGiorno(stato.settimana, oggi()).map((v) => (v.tipo === "Forza" ? null : descriviVoce(v).zona)).find(Boolean) : null;
  return el("div", { class: "led", "aria-hidden": "true", style: `--led:${zona ? `var(--z${zona})` : "var(--faint)"}` }, Array.from({ length: 9 }, () => el("i")));
}

export const limiti = () => stato.profilo.zone ?? calcolaZone({ eta: etaDa(stato.profilo.anno_nascita) ?? 35 }).limiti;
export const ZONE = ["Z1", "Z2", "Z3", "Z4", "Z5"];
export const intervalloZona = (i, lim = limiti()) => (i === 0 ? `≤${lim[0]}` : i === 4 ? `>${lim[3]}` : `${lim[i - 1] + 1}–${lim[i]}`);
export const chipZona = (z, conBpm = true) => el("span", { class: "chip-zona num", style: `background:var(--z${z});color:var(--z${z}-ink)` }, `Z${z}` + (conBpm ? ` · ${intervalloZona(z - 1)}` : ""));

export const coloreTipo = (t) => (TIPI.includes(t) ? `var(--t-${t.toLowerCase()})` : "var(--t-altro)");
export const nomeTipo = (tipo, sottotipo) => (tipo ?? "Altro") + (sottotipo ? ` ${sottotipo.toLowerCase() === "mtb" ? "MTB" : sottotipo.toLowerCase()}` : "");
export const iconaTipo = (t) => el("span", { class: "icona-tipo", style: `--c:${coloreTipo(t)}` }, icona(ICONE[t] ?? ICONE.altro));
export const attive = () => stato.profilo.attivita?.length ? stato.profilo.attivita : TIPI;
export const modulo = (m) => !!stato.profilo.moduli?.[m];

// Titolo e descrizione breve di una voce della settimana.
export function descriviVoce(v) {
  const s = v.scheda ? stato.schede[v.scheda] : null;
  const titolo = s?.titolo || nomeTipo(v.tipo, v.sottotipo ?? s?.sottotipo);
  const parti = [];
  if (s?.tipo === "Forza") parti.push(`${s.esercizi?.length ?? 0} esercizi`);
  if (s?.tipo === "HIIT") parti.push(`${s.esercizi?.length ?? 0} esercizi × ${s.giri} giri`);
  const durata = v.durata_min ?? s?.durata_min;
  const km = v.km ?? s?.km;
  if (km) parti.push(`${String(km).replace(".", ",")} km`);
  if (durata) parti.push(`${durata} min`);
  const zona = v.zona ?? s?.zona;
  if (zona) parti.push(`in Z${zona}`);
  if (s?.tipo !== "Forza" && s?.tipo !== "HIIT" && (v.sottotipo || s?.sottotipo) && s?.titolo) parti.unshift(nomeTipo(v.tipo, v.sottotipo ?? s?.sottotipo));
  return { titolo, sotto: parti.join(" · ") || (v.nota ?? ""), zona, scheda: s };
}
