// Registra sessione: si scelgono attività e scheda, si preparano fascia (facoltativa) e GPS, e si parte con Avvia quando
// si è pronti. Cardio: schermata da ciclocomputer con GPS e battito (senza, solo il tempo). HIIT: timer con l'esercizio
// in corso e il successivo, e segnali sonori a 3-2-1. Forza: si passa alla scheda serie per serie di registra.js, con la
// fascia già collegata. La registrazione in corso si salva ogni 10 s in IndexedDB: se l'app si chiude, Oggi propone di
// riprenderla o salvarla. GPS e fascia arrivano da sorgenti.js, i segnali da suoni.js.
import { stato, registraVista, vai, testata, limiti, attive, nomeTipo } from "./stato.js";
import { SOTTOTIPI_BICI } from "./analisi-file.js";
import { CARDIO, statoVoci, vociDelGiorno } from "./dati.js";
import { el, metti, oggi, fmtNum, fmtSec, fmtPasso, numero, avviso, esito, conConferma, ricorda, opzione, campo } from "./util.js";
import { Registratore } from "./registratore.js";
import { disponibile, avviaGps, collegaFascia, schermoAcceso, permessoNotifiche, apriImpostazioniPosizione, nativo } from "./sorgenti.js";
import { metriche, barraZone, apriDettaglio } from "./dettaglio.js";
import { salvaRiassunto, iniziaForza } from "./registra.js";
import { contenutoScheda, riassuntoScheda } from "./schede.js";
import { impostazioniDa, eserciziDelGiro, fasiHiit, durataFasi, statoTimer, inizioFaseDopo, segnaliHiit } from "./timer-hiit.js";
import { programmaSegnali, sbloccaAudio, suoniAttivi, impostaSuoni } from "./suoni.js";

const PAUSA_AUTO = ["Corsa", "Bici"];
const NOME_FASE = { preparazione: "Preparati", lavoro: "Lavoro", pausa: "Pausa", recupero: "Recupero" };

// Una sola registrazione alla volta, viva finché la pagina è aperta (anche cambiando vista).
let s = null; // { rec, param, scelta, hiit, fascia, statoFascia, fermaSchermo, ultimoGps, erroreGps, salvataAlle, finita, riassunto }
export const registrazioneInCorso = () => !!s?.rec?.avviata && !s.finita;

// La fascia collegata nella preparazione resta collegata partendo: le misure vanno alla registrazione in corso oppure,
// per la forza, alla scheda serie per serie (iniziaForza cambia il destinatario).
const fasciaVerso = {};
const versoRegistrazione = () => Object.assign(fasciaVerso, { misura: (m) => s?.rec?.battito(m), stato: (st) => { if (s) s.statoFascia = st; } });
versoRegistrazione();
const colleghiFascia = () => collegaFascia((m) => fasciaVerso.misura?.(m), (st) => fasciaVerso.stato?.(st));

// Un solo GPS acceso alla volta. avviaGps è asincrono: se nel frattempo ne parte un altro, o viene spento, quello in
// ritardo si ferma appena pronto. Così non resta mai un GPS (o la notifica fissa dell'app Android) acceso per sbaglio.
let gps = { giro: 0, ferma: null };
function gpsAcceso(onPos, onErrore, opzioni) {
  spegniGps();
  const giro = gps.giro;
  return avviaGps(onPos, onErrore, opzioni).then((ferma) => { if (giro === gps.giro) gps.ferma = ferma; else ferma(); });
}
function spegniGps() {
  gps.giro++;
  gps.ferma?.();
  gps.ferma = null;
}
const gpsInSfondo = () => gpsAcceso((p) => { s?.rec.posizione(p); if (s) s.ultimoGps = p; forseSalva(); }, (t) => { if (s) s.erroreGps = t; }, { sfondo: true })
  .catch((e) => { if (s) s.erroreGps = e?.message ?? "GPS non disponibile"; });

/* ---------- salvataggio della registrazione in corso ---------- */
const db = () => new Promise((ok, ko) => {
  const r = indexedDB.open("allenamento-dal-vivo", 1);
  r.onupgradeneeded = () => r.result.createObjectStore("corrente");
  r.onsuccess = () => ok(r.result);
  r.onerror = () => ko(r.error);
});
async function salvaBozza(valore) {
  try {
    const d = await db();
    await new Promise((ok, ko) => { const t = d.transaction("corrente", "readwrite"); valore ? t.objectStore("corrente").put(valore, "registrazione") : t.objectStore("corrente").delete("registrazione"); t.oncomplete = ok; t.onerror = () => ko(t.error); });
  } catch { /* senza IndexedDB si perde solo la ripresa dopo una chiusura */ }
}
export async function leggiBozza() {
  try {
    const d = await db();
    return await new Promise((ok) => { const r = d.transaction("corrente").objectStore("corrente").get("registrazione"); r.onsuccess = () => ok(r.result ?? null); r.onerror = () => ok(null); });
  } catch { return null; }
}
function forseSalva(forza = false) {
  if (!s?.rec?.avviata || s.finita) return;
  const ora = Date.now();
  if (!forza && ora - (s.salvataAlle ?? 0) < 10000) return;
  s.salvataAlle = ora;
  const hiit = s.hiit ? { imp: s.hiit.imp, esercizi: s.hiit.esercizi, salto: s.hiit.salto } : null;
  salvaBozza({ rec: s.rec.serializza(), param: { scheda: s.scelta?.scheda ?? null, hiit }, alle: ora });
}

// Ripresa di una registrazione interrotta (da Oggi): "riprendi" la continua, "salva" la chiude e mostra il riassunto.
export async function riprendiInterrotta(bozza, azione) {
  const p = bozza.param ?? {};
  const rec = Registratore.da(bozza.rec);
  s = { rec, param: {}, scelta: { tipo: rec.tipo, sottotipo: rec.sottotipo, scheda: p.scheda ?? p.voce?.scheda ?? null }, statoFascia: null,
    hiit: p.hiit ? conFasi(p.hiit) : null };
  rec.pausa(bozza.alle);
  if (azione === "salva") return finisci(bozza.alle);
  // Riparte in pausa: GPS di nuovo acceso, la fascia si ricollega dalla schermata, poi "Riprendi".
  if (rec.conGps && disponibile().gps) await gpsInSfondo();
  s.fermaSchermo = await schermoAcceso(!!s.hiit);
  vai("dal-vivo", {});
}
export async function scartaInterrotta() { await salvaBozza(null); }

/* ---------- vista ---------- */
registraVista("dal-vivo", {
  vivo: false,
  // Uscendo dalla preparazione (con le schede in basso) si spengono GPS e fascia; una registrazione in corso continua.
  lascia() { if (s && !s.rec?.avviata && !s.finita) { chiudiSorgenti(); s = null; } },
  render(main, param) {
    if (s?.finita) return schermataFine(main);
    if (s?.rec?.avviata) return s.hiit ? schermataHiit(main) : schermataRegistrazione(main);
    return schermataPreparazione(main, param);
  },
});

// Attività e scheda proposte: quella da cui sei partito, altrimenti la prima voce di oggi non ancora fatta.
function sceltaIniziale(param) {
  const sc = param.scheda ? stato.schede[param.scheda] : null;
  if (sc) return { tipo: sc.tipo, sottotipo: sc.sottotipo ?? null, scheda: param.scheda, autoPausa: PAUSA_AUTO.includes(sc.tipo), hiit: null };
  const voce = vociDiOggi().find((v) => attive().includes(v.tipo));
  return sceltaPer(voce?.tipo ?? attive()[0] ?? "Corsa");
}
const vociDiOggi = (d = oggi()) => statoVoci(vociDelGiorno(stato.settimana, d), stato.sessioni.filter((x) => x.data === d)).filter((v) => !v.fatta);
// Per un'attività: la scheda della sua voce di oggi, altrimenti l'unica scheda di forza o HIIT che c'è.
function sceltaPer(tipo) {
  const voce = vociDiOggi().find((v) => v.tipo === tipo);
  const tutte = Object.values(stato.schede).filter((x) => x.tipo === tipo);
  const scheda = voce?.scheda && stato.schede[voce.scheda] ? voce.scheda : (tipo === "Forza" || tipo === "HIIT") && tutte.length === 1 ? tutte[0].id : null;
  return { tipo, sottotipo: voce?.sottotipo ?? stato.schede[scheda]?.sottotipo ?? null, scheda, autoPausa: PAUSA_AUTO.includes(tipo), hiit: null };
}

function schermataPreparazione(main, param) {
  const disp = disponibile();
  if (!s) { versoRegistrazione(); s = { rec: null, param, fascia: null, statoFascia: null }; }
  s.param = param;
  const scelta = (s.scelta ??= sceltaIniziale(param));
  const cardio = CARDIO.includes(scelta.tipo), hiit = scelta.tipo === "HIIT", forza = scelta.tipo === "Forza";
  const conGps = cardio && disp.gps;
  const sc = scelta.scheda ? stato.schede[scelta.scheda] : null;
  if (hiit) scelta.hiit ??= impostazioniDa(sc);
  s.rec = new Registratore({ tipo: scelta.tipo, sottotipo: scelta.sottotipo, conGps, autoPausa: conGps && scelta.autoPausa, scheda: scelta.scheda });
  const ridisegna = () => schermataPreparazione(main, param);

  const tipi = el("div", { class: "seg", role: "radiogroup", "aria-label": "Attività" },
    attive().map((t) => opzione("dv-tipo", t, t, scelta.tipo === t, () => { Object.assign(scelta, sceltaPer(t)); ridisegna(); })));
  const sotto = scelta.tipo === "Bici" ? el("div", { class: "seg", role: "radiogroup", "aria-label": "Bici" },
    ["Non indicata", ...SOTTOTIPI_BICI].map((t) => opzione("dv-sotto", t, t, (scelta.sottotipo ?? "Non indicata") === t, () => { scelta.sottotipo = t === "Non indicata" ? null : t; s.rec.sottotipo = scelta.sottotipo; }))) : null;
  const schede = Object.values(stato.schede).filter((x) => x.tipo === scelta.tipo);
  const selScheda = schede.length ? campo("Scheda", el("select", { id: "dv-scheda", onchange: (e) => {
    scelta.scheda = e.target.value || null;
    scelta.hiit = null;
    if (scelta.scheda && stato.schede[scelta.scheda].sottotipo) scelta.sottotipo = stato.schede[scelta.scheda].sottotipo;
    ridisegna();
  } }, el("option", { value: "" }, "Nessuna scheda"), schede.map((x) => el("option", { value: x.id, selected: x.id === scelta.scheda }, x.titolo || nomeTipo(x.tipo, x.sottotipo))))) : null;
  const autoPausa = conGps ? el("label", { class: "interruttore" },
    el("span", {}, el("b", {}, "Pausa automatica da fermo"), el("small", {}, "Come il ciclocomputer: quando ti fermi il tempo si ferma.")),
    el("input", { type: "checkbox", role: "switch", id: "dv-auto", checked: scelta.autoPausa, onchange: (e) => { scelta.autoPausa = e.target.checked; s.rec.autoPausa = e.target.checked; } })) : null;

  // GPS: parte subito per avere il segnale pronto; la precisione si vede prima di partire. Se il permesso è negato,
  // nell'app Android compare il collegamento alle impostazioni. Si può partire anche senza segnale.
  const statoGps = cardio ? el("p", { class: "stato-sorgente" }, conGps ? "GPS: cerco il segnale…" : "GPS non disponibile qui: registro tempo e battito.") : null;
  const impostazioniGps = el("button", { type: "button", class: "lnk", hidden: true, onclick: apriImpostazioniPosizione }, "Apri le impostazioni");
  const erroreGps = (testo) => {
    if (!statoGps?.isConnected) return;
    statoGps.textContent = "GPS: " + testo;
    impostazioniGps.hidden = !(nativo() && /permesso/i.test(testo));
  };
  if (conGps) {
    gpsAcceso((p) => {
      s?.rec?.posizione(p);
      if (s) s.ultimoGps = p;
      if (statoGps.isConnected) statoGps.textContent = p.precisione != null && p.precisione > 30 ? `GPS: segnale debole, ±${Math.round(p.precisione)} m` : `GPS pronto, ±${Math.round(p.precisione ?? 0)} m`;
    }, erroreGps).catch((e) => erroreGps(e?.message ?? "non disponibile"));
  } else spegniGps();

  // Fascia: facoltativa, per battito e zone.
  const battito = el("b", { class: "num" }, "");
  const esitoFascia = el("span", { class: "esito", role: "status" });
  const boxFascia = !disp.fascia ? el("p", { class: "sotto" }, "Qui la fascia non si può collegare: registro senza battito.")
    : s.fascia ? el("div", { class: "fascia-riga" }, el("span", {}, el("small", {}, s.fascia.nome), battito),
      el("button", { type: "button", class: "lnk", onclick: async () => { await s.fascia?.scollega(); s.fascia = null; ridisegna(); } }, "Scollega"))
    : el("div", { class: "fascia-riga" }, (() => {
      const b = el("button", { type: "button", class: "btn" }, "Collega la fascia");
      b.onclick = async () => {
        b.disabled = true;
        esito(esitoFascia, "Cerco la fascia: tienila addosso o inumidisci gli elettrodi.");
        try { s.fascia = await colleghiFascia(); ridisegna(); }
        catch (e) { esito(esitoFascia, e?.name === "NotFoundError" ? "Nessuna fascia scelta." : "Non collegata: " + (e?.message ?? "errore"), "err"); b.disabled = false; }
      };
      return b;
    })(), esitoFascia);
  clearInterval(s.timer);
  s.timer = setInterval(() => {
    if (!battito.isConnected) return;
    const fc = s.rec?.fcAttuale(Date.now());
    battito.textContent = fc ? `${fc} bpm · Z${s.rec.zonaAttuale(Date.now(), limiti())}` : "in attesa del battito…";
  }, 1000);

  const avvia = el("button", { type: "button", class: "btn primario grande" }, "Avvia");
  avvia.onclick = async () => {
    avvia.disabled = true; // un secondo tocco non deve far partire due registrazioni
    sbloccaAudio(); // l'audio dei segnali si accende solo dentro un tocco
    const t = Date.now();
    if (forza) {
      const fascia = s.fascia;
      clearInterval(s.timer);
      s = null; // la fascia passa alla forza: uscendo da qui non va scollegata
      return iniziaForza({ scheda: scelta.scheda, avvio: t, fascia, collega: (misura, st) => Object.assign(fasciaVerso, { misura, stato: st }) });
    }
    if (conGps) await permessoNotifiche();
    s.rec.avvia(t);
    if (hiit) s.hiit = conFasi({ imp: { ...scelta.hiit }, esercizi: eserciziDelGiro(sc?.esercizi?.map((e) => e.nome), scelta.hiit.n), salto: 0 });
    // Nell'app Android il GPS riparte in modalità "anche a schermo spento", con la notifica fissa.
    if (conGps) await gpsInSfondo();
    s.fermaSchermo = await schermoAcceso(hiit);
    forseSalva(true);
    vai("dal-vivo", param);
  };
  const avvisoSchermo = !cardio ? (hiit ? el("p", { class: "sotto" }, "Durante il timer lo schermo resta acceso. I segnali usano il volume dei contenuti multimediali.") : null)
    : !disp.sfondo ? el("p", { class: "banda" }, "Tieni l'app aperta e lo schermo acceso: se si spegne, la registrazione si ferma finché non lo riaccendi.")
    : ricorda.leggi("avviso-batteria") ? null
    : el("p", { class: "banda info" }, "Su Xiaomi, Samsung e altri telefoni togli il risparmio energetico per Allenamento (Impostazioni › App › Allenamento › Batteria › Nessuna restrizione), altrimenti a schermo spento il telefono può fermarla.",
      el("button", { type: "button", class: "lnk", style: "margin-left:8px", onclick: (e) => { ricorda.scrivi("avviso-batteria", true); e.target.parentElement.remove(); } }, "Fatto"));

  metti(main,
    testata({ titolo: "Registra sessione", sopra: "Registra", indietro: () => { chiudiSorgenti(); s = null; vai("oggi"); } }),
    el("section", { class: "card modulo" },
      el("fieldset", { class: "campo" }, el("legend", {}, "Attività"), tipi),
      sotto, selScheda, autoPausa),
    hiit ? boxTimer(scelta.hiit, sc) : schedaBox(sc),
    el("section", { class: "card modulo" }, el("h2", {}, cardio ? "GPS e fascia cardio" : "Fascia cardio"),
      statoGps, impostazioniGps, boxFascia,
      el("p", { class: "sotto" }, cardio ? "La fascia è facoltativa: senza, niente battito e zone." : "Facoltativa: senza, registro lo stesso tempo ed esercizi.")),
    avvisoSchermo,
    el("div", { class: "azioni" }, avvia),
    !forza ? el("button", { type: "button", class: "lnk", style: "justify-self:start", onclick: () => { chiudiSorgenti(); s = null; vai("registra", { tipo: "file", data: oggi(), voce: { tipo: scelta.tipo, sottotipo: scelta.sottotipo, scheda: scelta.scheda } }); } }, "Hai già il file dell'allenamento? Importalo") : null);
}

// La scheda scelta (esercizi della forza, obiettivo del cardio), sotto gli occhi.
function schedaBox(sc) {
  if (!sc) return null;
  return el("section", { class: "card" },
    el("div", { class: "card-testa" }, el("h2", {}, sc.titolo || nomeTipo(sc.tipo)), el("span", { class: "sotto" }, riassuntoScheda(sc))),
    sc.nota ? el("p", { class: "nota-scheda" }, sc.nota) : null,
    contenutoScheda(sc));
}

// Impostazioni del timer HIIT: dalla scheda, modificabili per questa sessione.
function boxTimer(h, sc) {
  const totale = el("p", { class: "sotto num" });
  const elenco = el("ol", { class: "foglio-scheda" });
  const aggiorna = () => {
    const es = eserciziDelGiro(sc?.esercizi?.map((e) => e.nome), h.n);
    totale.textContent = `Durata: ${fmtSec(durataFasi(fasiHiit(h, es)))}, preparazione compresa.`;
    metti(elenco, es.map((nome, i) => el("li", {}, el("span", { class: "n" }, String(i + 1)), el("b", {}, nome))));
  };
  const num = (k, etichetta, min, max) => campo(etichetta, el("input", { id: `dv-${k}`, class: "num", inputmode: "numeric", value: h[k],
    oninput: (e) => { const v = numero(e.target.value); if (v != null) { h[k] = Math.min(max, Math.max(min, Math.round(v))); aggiorna(); } } }));
  aggiorna();
  return el("section", { class: "card modulo" },
    el("div", { class: "card-testa" }, el("h2", {}, "Timer"), sc ? el("span", { class: "sotto" }, sc.titolo) : null),
    el("div", { class: "righe", style: "align-items:end" },
      num("lavoro_s", "Durata esercizio (s)", 5, 600), num("n", "Esercizi per giro", 1, 30), num("pausa_s", "Pausa tra gli esercizi (s)", 0, 600),
      num("giri", "Giri", 1, 30), num("recupero_giri_s", "Pausa tra i giri (s)", 0, 900), num("preparazione_s", "Preparazione (s)", 0, 60)),
    totale,
    el("label", { class: "interruttore" },
      el("span", {}, el("b", {}, "Segnali sonori"), el("small", {}, "Bip a 3, 2 e 1 secondo prima che l'esercizio inizi e finisca.")),
      el("input", { type: "checkbox", role: "switch", id: "dv-suoni", checked: suoniAttivi(), onchange: (e) => impostaSuoni(e.target.checked) })),
    sc?.nota ? el("p", { class: "nota-scheda" }, sc.nota) : null,
    el("p", { class: "sotto" }, sc ? "Gli esercizi vengono dalla scheda; questi tempi valgono per oggi (per cambiarli sempre, modifica la scheda)." : "Senza scheda gli esercizi hanno solo il numero."),
    elenco);
}

function chiudiSorgenti() {
  clearInterval(s?.timer);
  s?.hiit?.annullaBip?.();
  spegniGps();
  s?.fascia?.scollega?.();
  s?.fermaSchermo?.();
}

/* ---------- durante: cardio ---------- */
function schermataRegistrazione(main) {
  const r = s.rec, conGps = r.conGps, corsaPasso = ["Corsa", "Camminata", "Trekking"].includes(r.tipo);
  // Un campo dati grande come sul ciclocomputer: etichetta, numero e unità.
  const campoVivo = (etichetta, unita) => {
    const v = el("b", { class: "num" }, "—");
    return { nodo: el("div", { class: "campo-vivo" }, el("small", {}, etichetta), el("div", {}, v, el("em", {}, unita ?? ""))), v };
  };
  const tempo = campoVivo("Tempo"), distanza = campoVivo("Distanza", "km"), fc = campoVivo("Battito", "bpm"), vel = campoVivo(corsaPasso ? "Passo" : "Velocità", corsaPasso ? "/km" : "km/h"),
    salita = campoVivo("Salita", "m"), media = campoVivo(conGps ? (corsaPasso ? "Passo medio" : "Velocità media") : "FC media", conGps ? (corsaPasso ? "/km" : "km/h") : "bpm");
  const zona = campoVivo("Zona");
  const campi = conGps ? [tempo, distanza, fc, vel, salita, media] : [tempo, fc, zona, media];
  const stato1 = el("p", { class: "stato-sorgente" });
  const fascione = el("div", { class: "fascione-pausa", hidden: true });
  const led = el("div", { class: "led", "aria-hidden": "true" }, Array.from({ length: 9 }, () => el("i")));

  const collega = bottoneCollega(() => aggiorna());
  const pausa = el("button", { type: "button", class: "btn grande" }, "Pausa");
  pausa.onclick = () => { const t = Date.now(); r.inPausa ? r.riprendi(t) : r.pausa(t); forseSalva(true); aggiorna(); };
  const fine = conConferma(el("button", { type: "button", class: "btn primario grande" }, "Fine"), "Tocca di nuovo per finire", async () => finisci(Date.now()));

  function aggiorna() {
    const t = Date.now();
    const att = r.tempoAttivoS(t);
    tempo.v.textContent = att >= 3600 ? `${Math.floor(att / 3600)}:${fmtSec(att % 3600).padStart(5, "0")}` : fmtSec(att);
    const f = r.fcAttuale(t), z = r.zonaAttuale(t, limiti());
    fc.v.textContent = f ?? "—";
    zona.v.textContent = z ? `Z${z}` : "—";
    led.style.setProperty("--led", z ? `var(--z${z})` : "var(--faint)");
    if (conGps) {
      distanza.v.textContent = fmtNum(r.km, 2);
      salita.v.textContent = fmtNum(r.salita);
      const v = r.vel;
      vel.v.textContent = v == null ? "—" : corsaPasso ? (v > 0.3 ? fmtSec(1000 / v) : "—") : fmtNum(v * 3.6, 1);
      media.v.textContent = att > 0 && r.km > 0 ? (corsaPasso ? fmtPasso(r.km, att / 60) : fmtNum((r.km / att) * 3600, 1)) : "—";
    } else media.v.textContent = fcMedia(r) ?? "—";
    const vecchio = s.ultimoGps ? Math.round((t - s.ultimoGps.t) / 1000) : null;
    stato1.textContent = [
      conGps ? (s.erroreGps && !s.ultimoGps ? `GPS: ${s.erroreGps}` : vecchio == null ? "GPS: cerco il segnale…" : vecchio > 15 ? `GPS: nessuna posizione da ${vecchio} s` : `GPS ±${Math.round(s.ultimoGps.precisione ?? 0)} m`) : null,
      testoFascia(),
    ].filter(Boolean).join(" · ");
    fascione.hidden = !r.inPausa;
    fascione.textContent = r.pausaManuale ? "In pausa" : "Pausa automatica";
    pausa.textContent = r.pausaManuale ? "Riprendi" : "Pausa";
    forseSalva();
  }

  metti(main,
    led,
    el("header", { class: "testata-vivo" }, el("span", {}, nomeTipo(r.tipo, r.sottotipo)), el("span", { class: "num" }, oraInizio(r))),
    fascione,
    el("section", { class: "campi-vivo" + (conGps ? "" : " due") }, campi.map((c) => c.nodo)),
    stato1,
    collega,
    !conGps ? null : !disponibile().sfondo ? el("p", { class: "sotto" }, "Lo schermo resta acceso da solo: non bloccarlo e non passare ad altre app, o la registrazione si ferma.") : el("p", { class: "sotto" }, "Puoi bloccare lo schermo: la registrazione continua, lo vedi dalla notifica."),
    schedaBox(s.scelta?.scheda ? stato.schede[s.scelta.scheda] : null));
  mostraComandi([pausa, fine]);
  aggiorna();
  clearInterval(s.timer);
  s.timer = setInterval(() => { if (!led.isConnected) return; aggiorna(); }, 1000);
}

const oraInizio = (r) => new Date(r.inizio).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
const fcMedia = (r) => { const v = r.punti.filter((p) => p.fc).map((p) => p.fc); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null; };
const testoFascia = () => (s.fascia ? (s.statoFascia === "persa" ? "Fascia: segnale perso, riprovo…" : `Fascia: ${s.fascia.nome}`) : "Senza fascia");

// Fascia da collegare anche a registrazione iniziata (dopo una ripresa, o se all'inizio non c'era).
function bottoneCollega(dopo) {
  if (!disponibile().fascia || s.fascia) return null;
  const b = el("button", { type: "button", class: "lnk" }, "Collega la fascia");
  b.onclick = async () => {
    b.disabled = true;
    try { s.fascia = await colleghiFascia(); b.remove(); dopo(); }
    catch { b.disabled = false; }
  };
  return b;
}

// Comandi in basso, al posto delle schede di navigazione.
function mostraComandi(bottoni) {
  const barra = document.getElementById("barra-fondo");
  barra.replaceChildren(el("div", { class: "comandi-vivo" + (bottoni.length === 3 ? " tre" : "") }, bottoni));
  barra.hidden = false;
  document.body.classList.add("con-barra");
  document.getElementById("nav").hidden = true;
}

/* ---------- durante: timer HIIT ---------- */
const conFasi = (h) => ({ ...h, fasi: fasiHiit(h.imp, h.esercizi) });
const posizioneHiit = (t = Date.now()) => s.rec.tempoAttivoS(t) + s.hiit.salto;

// Tutti i segnali da qui alla fine, programmati in una volta (all'avvio, alla ripresa, dopo un salto, riaccendendo
// l'audio): così suonano anche se il telefono rallenta la pagina.
function programmaBipHiit() {
  s.hiit.annullaBip?.();
  s.hiit.annullaBip = null;
  if (s.rec.inPausa) return;
  const pos = posizioneHiit();
  s.hiit.annullaBip = programmaSegnali(segnaliHiit(s.hiit.fasi).filter((x) => x.t > pos).map((x) => ({ tra_s: x.t - pos, tono: x.tono })));
}

function schermataHiit(main) {
  const r = s.rec, h = s.hiit;
  const led = el("div", { class: "led", "aria-hidden": "true" }, Array.from({ length: 9 }, () => el("i")));
  const fase = el("div", { class: "hiit-fase" });
  const conto = el("b", { class: "hiit-conto num" });
  const etichetta = el("small", {});
  const nome = el("b", { class: "hiit-nome" });
  const poi = el("p", { class: "hiit-poi" });
  const giro = el("b", { class: "num" }), esercizio = el("b", { class: "num" }), resta = el("b", { class: "num" }), battito = el("b", { class: "num" });
  const stato1 = el("p", { class: "stato-sorgente" });
  const audio = el("button", { type: "button", class: "lnk" });
  audio.onclick = () => { impostaSuoni(!suoniAttivi()); sbloccaAudio(); programmaBipHiit(); aggiorna(); };

  const pausa = el("button", { type: "button", class: "btn grande" }, "Pausa");
  pausa.onclick = () => { sbloccaAudio(); const t = Date.now(); r.inPausa ? r.riprendi(t) : r.pausa(t); programmaBipHiit(); forseSalva(true); aggiorna(); };
  const salta = el("button", { type: "button", class: "btn grande" }, "Salta");
  salta.onclick = () => { const pos = posizioneHiit(); h.salto += inizioFaseDopo(h.fasi, pos) - pos; programmaBipHiit(); forseSalva(true); aggiorna(); };
  const fine = conConferma(el("button", { type: "button", class: "btn primario grande" }, "Fine"), "Tocca di nuovo", async () => finisci(Date.now()));

  const tile = (k, v) => el("div", { class: "tile" }, el("small", {}, k), v);
  const box = el("section", { class: "hiit" }, fase, conto, el("div", { class: "hiit-esercizio" }, etichetta, nome), poi);
  function aggiorna() {
    const t = Date.now();
    const st = statoTimer(h.fasi, posizioneHiit(t));
    if (st.finito) { if (!h.finendo) { h.finendo = true; finisci(t, { naturale: true }); } return; }
    const f = st.fase, lavoro = f.tipo === "lavoro";
    box.dataset.fase = r.pausaManuale ? "ferma" : f.tipo;
    fase.textContent = r.pausaManuale ? "In pausa" : NOME_FASE[f.tipo];
    conto.textContent = fmtSec(Math.ceil(st.resta - 0.05));
    etichetta.textContent = lavoro ? "Adesso" : "Prossimo";
    nome.textContent = st.ora?.esercizio ?? "";
    poi.textContent = st.poi ? `Poi: ${st.poi.esercizio}` : lavoro ? "Ultimo esercizio" : "Poi: fine";
    giro.textContent = `${f.giro}/${h.imp.giri}`;
    esercizio.textContent = `${f.n}/${h.esercizi.length}`;
    resta.textContent = fmtSec(st.restaTotale);
    const fc = r.fcAttuale(t), z = r.zonaAttuale(t, limiti());
    battito.replaceChildren(fc ? String(fc) : "—", fc ? el("em", {}, ` Z${z}`) : "");
    led.style.setProperty("--led", z ? `var(--z${z})` : lavoro ? "var(--z5)" : "var(--faint)");
    stato1.textContent = testoFascia();
    audio.textContent = suoniAttivi() ? "Audio sì" : "Audio no";
    pausa.textContent = r.pausaManuale ? "Riprendi" : "Pausa";
    forseSalva();
  }

  metti(main,
    led,
    el("header", { class: "testata-vivo" }, el("span", {}, (s.scelta?.scheda && stato.schede[s.scelta.scheda]?.titolo) || "HIIT"), el("span", { class: "num" }, oraInizio(r))),
    box,
    el("div", { class: "tiles quattro" }, tile("Giro", giro), tile("Esercizio", esercizio), tile("Manca", resta), tile("Battito", battito)),
    el("div", { style: "display:flex;justify-content:space-between;align-items:center;gap:12px" }, stato1, audio),
    bottoneCollega(() => aggiorna()));
  mostraComandi([pausa, salta, fine]);
  programmaBipHiit();
  aggiorna();
  clearInterval(s.timer);
  s.timer = setInterval(() => { if (!led.isConnected) return; aggiorna(); }, 250);
}

/* ---------- fine ---------- */
async function finisci(t, { naturale = false } = {}) {
  const pos = s.hiit ? posizioneHiit(t) : 0;
  s.rec.pausa(t);
  if (naturale) s.hiit.annullaBip = null; // il bip finale sta suonando: non va interrotto
  chiudiSorgenti();
  s.riassunto = s.rec.riassunto(limiti(), t);
  if (s.hiit) {
    const { imp, esercizi, fasi } = s.hiit;
    const giriFatti = fasi.filter((f) => f.tipo === "lavoro" && f.n === esercizi.length && f.a <= pos + 0.5).length;
    s.extra = { hiit: { lavoro_s: imp.lavoro_s, pausa_s: imp.pausa_s, giri: imp.giri, recupero_giri_s: imp.recupero_giri_s, esercizi, giri_fatti: giriFatti } };
  }
  s.finita = true;
  await salvaBozza(null);
  document.getElementById("nav").hidden = false;
  vai("dal-vivo", s.param);
}

function schermataFine(main) {
  const r = s.riassunto, hiit = s.extra?.hiit;
  const nota = el("textarea", { id: "dv-nota", placeholder: "Sensazioni, percorso, meteo…" });
  // Cardio senza GPS (in casa, GPS spento): la distanza si può scrivere.
  const km = CARDIO.includes(r.tipo) && !r.km ? el("input", { id: "dv-km", inputmode: "decimal", placeholder: "facoltativa" }) : null;
  const esitoF = el("span", { class: "esito", role: "status" });
  const salva = el("button", { type: "button", class: "btn primario" }, "Salva l'allenamento");
  salva.onclick = async () => {
    salva.disabled = true;
    try {
      const k = km ? numero(km.value) : null;
      if (k > 0) Object.assign(r, { km: k, vel_media: r.durata_min ? Math.round((k / r.durata_min) * 600) / 10 : null });
      const id = await salvaRiassunto(r, { voce: { tipo: r.tipo, scheda: s.scelta?.scheda ?? null }, nota: nota.value.trim(), extra: s.extra });
      s = null;
      avviso("Allenamento salvato");
      vai("oggi");
      setTimeout(() => apriDettaglio(id), 300);
    } catch (e) { esito(esitoF, "Non salvato: " + (e?.message ?? "errore"), "err"); salva.disabled = false; }
  };
  const scarta = conConferma(el("button", { type: "button", class: "btn pericolo" }, "Scarta"), "Tocca di nuovo: la perdi", async () => { s = null; avviso("Registrazione scartata"); vai("oggi"); });
  const vuota = r.durata_min < 1 && !r.km;
  const tile = (k, v, u) => el("div", { class: "tile" }, el("small", {}, k), el("b", {}, v ?? "—", v != null && u ? el("em", {}, u) : null));
  metti(main,
    testata({ titolo: "Fine", sopra: nomeTipo(r.tipo, r.sottotipo) }),
    el("section", { class: "card" },
      el("div", { class: "tiles" },
        tile("Tempo", fmtSec(r.durata_min * 60).replace(/:00$/, ""), "min"),
        r.km != null ? tile("Distanza", fmtNum(r.km, 2), "km") : hiit ? tile("Giri", `${hiit.giri_fatti} di ${hiit.giri}`) : tile("FC media", r.fc_media != null ? fmtNum(r.fc_media) : null, "bpm"),
        tile("FC massima", r.fc_max != null ? fmtNum(r.fc_max) : null, "bpm")),
      el("p", { class: "sotto num" }, metriche(r)),
      barraZone(r),
      vuota ? el("p", { class: "esito err" }, "Registrazione molto corta: forse non vale la pena salvarla.") : null),
    el("section", { class: "card modulo" }, km ? campo("Distanza (km)", km, "Senza GPS non l'ho misurata: scrivila se la sai.") : null, el("label", { class: "campo" }, el("span", {}, "Nota"), nota)),
    el("div", { class: "azioni" }, salva, scarta, esitoF));
}
