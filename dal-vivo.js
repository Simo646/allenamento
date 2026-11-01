// Registra dal vivo: cardio con GPS e fascia, HIIT con la sola fascia. Preparazione, schermata da ciclocomputer durante
// l'allenamento, riassunto e salvataggio come un file importato. La registrazione in corso si salva ogni 10 s in
// IndexedDB: se l'app si chiude, Oggi propone di riprenderla o salvarla. GPS e fascia arrivano da sorgenti.js.
import { stato, registraVista, vai, testata, limiti, attive, nomeTipo } from "./stato.js";
import { SOTTOTIPI_BICI } from "./analisi-file.js";
import { CARDIO } from "./dati.js";
import { el, metti, oggi, fmtNum, fmtSec, fmtPasso, avviso, esito, conConferma, ricorda, opzione } from "./util.js";
import { Registratore } from "./registratore.js";
import { disponibile, avviaGps, collegaFascia, schermoAcceso, permessoNotifiche, apriImpostazioniPosizione, nativo } from "./sorgenti.js";
import { metriche, barraZone, apriDettaglio } from "./dettaglio.js";
import { salvaRiassunto } from "./registra.js";
import { contenutoScheda, riassuntoScheda } from "./schede.js";

const TIPI_VIVO = [...CARDIO, "HIIT"];
const PAUSA_AUTO = ["Corsa", "Bici"];

// Una sola registrazione alla volta, viva finché la pagina è aperta (anche cambiando vista).
let s = null; // { rec, param, fascia, statoFascia, fermaSchermo, ultimoGps, erroreGps, salvataAlle, finita }
export const registrazioneInCorso = () => !!s?.rec?.avviata && !s.finita;

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
  salvaBozza({ rec: s.rec.serializza(), param: { voce: s.param.voce ?? null }, alle: ora });
}

// Ripresa di una registrazione interrotta (da Oggi): "riprendi" la continua, "salva" la chiude e mostra il riassunto.
export async function riprendiInterrotta(bozza, azione) {
  s = { rec: Registratore.da(bozza.rec), param: bozza.param ?? {}, statoFascia: null };
  if (azione === "salva") { s.rec.pausa(bozza.alle); return finisci(bozza.alle); }
  s.rec.pausa(bozza.alle);
  // Riparte in pausa: GPS di nuovo acceso, la fascia si ricollega dalla schermata, poi "Riprendi".
  if (s.rec.conGps && disponibile().gps) {
    try { await gpsAcceso((p) => { s?.rec.posizione(p); if (s) s.ultimoGps = p; forseSalva(); }, (t) => { if (s) s.erroreGps = t; }, { sfondo: true }); }
    catch (e) { s.erroreGps = e?.message ?? "GPS non disponibile"; }
  }
  s.fermaSchermo = await schermoAcceso();
  vai("dal-vivo", s.param);
}
export async function scartaInterrotta() { await salvaBozza(null); }

/* ---------- vista ---------- */
registraVista("dal-vivo", {
  vivo: false,
  // Uscendo dalla preparazione (con le schede in basso) si spengono GPS e fascia; una registrazione in corso continua.
  lascia() { if (s && !s.rec?.avviata && !s.finita) { chiudiSorgenti(); s = null; } },
  render(main, param) {
  const disp = disponibile();
  if (disp.inClaude || (!disp.gps && !disp.fascia)) return metti(main, testata({ titolo: "Dal vivo", sopra: "Registra", indietro: () => vai("oggi") }),
    el("section", { class: "card" }, el("p", {}, "La registrazione dal vivo usa GPS e Bluetooth del telefono, che qui non sono disponibili."),
      el("p", { class: "sotto" }, "Usa l'app Android o l'app installata dal sito: https://simo646.github.io/allenamento/")));
  if (s?.finita) return schermataFine(main);
  if (s?.rec?.avviata) return schermataRegistrazione(main);
  return schermataPreparazione(main, param);
  },
});

function schermataPreparazione(main, param) {
  const disp = disponibile();
  const tipoIniziale = TIPI_VIVO.includes(param.voce?.tipo) ? param.voce.tipo : TIPI_VIVO.find((t) => attive().includes(t)) ?? "Corsa";
  if (!s || s.rec?.avviata) s = { rec: null, param, fascia: s?.fascia ?? null, statoFascia: s?.statoFascia ?? null };
  s.param = param;
  const scelta = s.scelta ?? (s.scelta = { tipo: tipoIniziale, sottotipo: param.voce?.sottotipo ?? null, autoPausa: PAUSA_AUTO.includes(tipoIniziale) });
  const conGps = () => CARDIO.includes(scelta.tipo);
  s.rec = new Registratore({ tipo: scelta.tipo, sottotipo: scelta.sottotipo, conGps: conGps(), autoPausa: scelta.autoPausa, scheda: param.voce?.scheda ?? null });
  const ridisegna = () => schermataPreparazione(main, param);

  const tipi = el("div", { class: "seg", role: "radiogroup", "aria-label": "Attività" },
    TIPI_VIVO.filter((t) => attive().includes(t) || t === scelta.tipo).map((t) => opzione("dv-tipo", t, t, scelta.tipo === t, () => { scelta.tipo = t; scelta.autoPausa = PAUSA_AUTO.includes(t); if (t !== "Bici") scelta.sottotipo = null; ridisegna(); })));
  const sotto = scelta.tipo === "Bici" ? el("div", { class: "seg", role: "radiogroup", "aria-label": "Bici" },
    ["Non indicata", ...SOTTOTIPI_BICI].map((t) => opzione("dv-sotto", t, t, (scelta.sottotipo ?? "Non indicata") === t, () => { scelta.sottotipo = t === "Non indicata" ? null : t; s.rec.sottotipo = scelta.sottotipo; }))) : null;
  const autoPausa = conGps() ? el("label", { class: "interruttore" },
    el("span", {}, el("b", {}, "Pausa automatica da fermo"), el("small", {}, "Come il ciclocomputer: quando ti fermi il tempo si ferma.")),
    el("input", { type: "checkbox", role: "switch", id: "dv-auto", checked: scelta.autoPausa, onchange: (e) => { scelta.autoPausa = e.target.checked; s.rec.autoPausa = e.target.checked; } })) : null;

  // GPS: parte subito per avere il segnale pronto; la precisione si vede prima di partire. Se il permesso è negato,
  // nell'app Android compare il collegamento alle impostazioni.
  const statoGps = el("p", { class: "stato-sorgente" }, conGps() ? "GPS: cerco il segnale…" : "Senza GPS: registro tempo e battito.");
  const impostazioniGps = el("button", { type: "button", class: "lnk", hidden: true, onclick: apriImpostazioniPosizione }, "Apri le impostazioni");
  const erroreGps = (testo) => {
    if (!statoGps.isConnected) return;
    statoGps.textContent = "GPS: " + testo;
    impostazioniGps.hidden = !(nativo() && /permesso/i.test(testo));
  };
  if (conGps() && disp.gps) {
    gpsAcceso((p) => {
      s?.rec?.posizione(p);
      if (s) s.ultimoGps = p;
      if (statoGps.isConnected) statoGps.textContent = p.precisione != null && p.precisione > 30 ? `GPS: segnale debole, ±${Math.round(p.precisione)} m` : `GPS pronto, ±${Math.round(p.precisione ?? 0)} m`;
    }, erroreGps).catch((e) => erroreGps(e?.message ?? "non disponibile"));
  } else spegniGps();

  // Fascia
  const battito = el("b", { class: "num" }, "");
  const esitoFascia = el("span", { class: "esito", role: "status" });
  const boxFascia = !disp.fascia ? el("p", { class: "sotto" }, "Su questo telefono la fascia non si può collegare: registro solo il percorso.")
    : s.fascia ? el("div", { class: "fascia-riga" }, el("span", {}, el("small", {}, s.fascia.nome), battito),
      el("button", { type: "button", class: "lnk", onclick: async () => { await s.fascia?.scollega(); s.fascia = null; ridisegna(); } }, "Scollega"))
    : el("div", { class: "fascia-riga" }, (() => {
      const b = el("button", { type: "button", class: "btn" }, "Collega la fascia");
      b.onclick = async () => {
        b.disabled = true;
        esito(esitoFascia, "Cerco la fascia: tienila addosso o inumidisci gli elettrodi.");
        try { s.fascia = await collegaFascia((m) => s.rec?.battito(m), (st) => (s.statoFascia = st)); ridisegna(); }
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
    if (!conGps() && !s.fascia) return esito(esitoAvvio, "Per l'HIIT senza GPS serve la fascia.", "err");
    avvia.disabled = true; // un secondo tocco non deve far partire due registrazioni
    await permessoNotifiche();
    s.rec.avvia(Date.now());
    // Nell'app Android il GPS riparte in modalità "anche a schermo spento", con la notifica fissa.
    if (conGps() && disp.gps) {
      try { await gpsAcceso((p) => { s?.rec.posizione(p); if (s) s.ultimoGps = p; forseSalva(); }, (t) => { if (s) s.erroreGps = t; }, { sfondo: true }); }
      catch (e) { s.erroreGps = e?.message ?? "GPS non disponibile"; }
    }
    s.fermaSchermo = await schermoAcceso();
    forseSalva(true);
    vai("dal-vivo", param);
  };
  const esitoAvvio = el("span", { class: "esito", role: "status" });
  const avvisoSfondo = !disp.sfondo
    ? el("p", { class: "banda" }, "Tieni l'app aperta e lo schermo acceso: se si spegne, la registrazione si ferma finché non lo riaccendi.")
    : ricorda.leggi("avviso-batteria") ? null
    : el("p", { class: "banda info" }, "Su Xiaomi, Samsung e altri telefoni togli il risparmio energetico per Allenamento (Impostazioni › App › Allenamento › Batteria › Nessuna restrizione), altrimenti a schermo spento il telefono può fermarla.",
      el("button", { type: "button", class: "lnk", style: "margin-left:8px", onclick: (e) => { ricorda.scrivi("avviso-batteria", true); e.target.parentElement.remove(); } }, "Fatto"));

  metti(main,
    testata({ titolo: "Dal vivo", sopra: param.voce?.scheda ? stato.schede[param.voce.scheda]?.titolo ?? "Registra" : "Registra", indietro: () => { chiudiSorgenti(); s = null; vai("oggi"); } }),
    el("section", { class: "card modulo" },
      el("fieldset", { class: "campo" }, el("legend", {}, "Attività"), tipi),
      sotto, autoPausa),
    el("section", { class: "card modulo" }, el("h2", {}, "Sensori"), statoGps, impostazioniGps, boxFascia),
    schedaBox(param),
    avvisoSfondo,
    el("div", { class: "azioni" }, avvia, esitoAvvio),
    el("button", { type: "button", class: "lnk", style: "justify-self:start", onclick: () => { chiudiSorgenti(); s = null; vai("registra", { tipo: "file", data: oggi(), voce: param.voce }); } }, "Hai già il file dell'allenamento? Importalo"));
}

// La scheda da cui sei partito (esercizi e tempi dell'HIIT, obiettivo del cardio), sotto gli occhi.
function schedaBox(param) {
  const sc = param?.voce?.scheda ? stato.schede[param.voce.scheda] : null;
  if (!sc) return null;
  return el("section", { class: "card" },
    el("div", { class: "card-testa" }, el("h2", {}, sc.titolo || nomeTipo(sc.tipo)), el("span", { class: "sotto" }, riassuntoScheda(sc))),
    sc.nota ? el("p", { class: "nota-scheda" }, sc.nota) : null,
    contenutoScheda(sc));
}

function chiudiSorgenti() {
  clearInterval(s?.timer);
  spegniGps();
  s?.fascia?.scollega?.();
  s?.fermaSchermo?.();
}

/* ---------- durante ---------- */
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

  // Fascia da collegare anche a registrazione iniziata (dopo una ripresa, o se all'inizio non c'era).
  const collega = disponibile().fascia && !s.fascia ? el("button", { type: "button", class: "lnk" }, "Collega la fascia") : null;
  if (collega) collega.onclick = async () => {
    collega.disabled = true;
    try { s.fascia = await collegaFascia((m) => s.rec?.battito(m), (st) => (s.statoFascia = st)); collega.remove(); aggiorna(); }
    catch { collega.disabled = false; }
  };
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
    } else {
      const valori = r.punti.filter((p) => p.fc).map((p) => p.fc);
      media.v.textContent = valori.length ? Math.round(valori.reduce((a, b) => a + b, 0) / valori.length) : "—";
    }
    const vecchio = s.ultimoGps ? Math.round((t - s.ultimoGps.t) / 1000) : null;
    stato1.textContent = [
      conGps ? (s.erroreGps && !s.ultimoGps ? `GPS: ${s.erroreGps}` : vecchio == null ? "GPS: cerco il segnale…" : vecchio > 15 ? `GPS: nessuna posizione da ${vecchio} s` : `GPS ±${Math.round(s.ultimoGps.precisione ?? 0)} m`) : null,
      s.fascia ? (s.statoFascia === "persa" ? "Fascia: segnale perso, riprovo…" : `Fascia: ${s.fascia.nome}`) : "Senza fascia",
    ].filter(Boolean).join(" · ");
    fascione.hidden = !r.inPausa;
    fascione.textContent = r.pausaManuale ? "In pausa" : "Pausa automatica";
    pausa.textContent = r.pausaManuale ? "Riprendi" : "Pausa";
    forseSalva();
  }

  metti(main,
    led,
    el("header", { class: "testata-vivo" }, el("span", {}, nomeTipo(r.tipo, r.sottotipo)), el("span", { class: "num" }, new Date(r.inizio).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }))),
    fascione,
    el("section", { class: "campi-vivo" + (conGps ? "" : " due") }, campi.map((c) => c.nodo)),
    stato1,
    collega,
    !disponibile().sfondo ? el("p", { class: "sotto" }, "Lo schermo resta acceso da solo: non bloccarlo e non passare ad altre app, o la registrazione si ferma.") : el("p", { class: "sotto" }, "Puoi bloccare lo schermo: la registrazione continua, lo vedi dalla notifica."),
    schedaBox(s.param));
  const barra = document.getElementById("barra-fondo");
  barra.replaceChildren(el("div", { class: "comandi-vivo" }, pausa, fine));
  barra.hidden = false;
  document.body.classList.add("con-barra");
  document.getElementById("nav").hidden = true;
  aggiorna();
  clearInterval(s.timer);
  s.timer = setInterval(() => { if (!led.isConnected) return; aggiorna(); }, 1000);
}

/* ---------- fine ---------- */
async function finisci(t) {
  s.rec.pausa(t);
  chiudiSorgenti();
  s.riassunto = s.rec.riassunto(limiti(), t);
  s.finita = true;
  await salvaBozza(null);
  document.getElementById("nav").hidden = false;
  vai("dal-vivo", s.param);
}

function schermataFine(main) {
  const r = s.riassunto;
  const nota = el("textarea", { id: "dv-nota", placeholder: "Sensazioni, percorso, meteo…" });
  const esitoF = el("span", { class: "esito", role: "status" });
  const salva = el("button", { type: "button", class: "btn primario" }, "Salva l'allenamento");
  salva.onclick = async () => {
    salva.disabled = true;
    try {
      const id = await salvaRiassunto(r, { ...s.param, nota: nota.value.trim() });
      s = null;
      avviso("Allenamento salvato");
      vai("oggi");
      setTimeout(() => apriDettaglio(id), 300);
    } catch (e) { esito(esitoF, "Non salvato: " + (e?.message ?? "errore"), "err"); salva.disabled = false; }
  };
  const scarta = conConferma(el("button", { type: "button", class: "btn pericolo" }, "Scarta"), "Tocca di nuovo: la perdi", async () => { s = null; avviso("Registrazione scartata"); vai("oggi"); });
  const vuota = r.durata_min < 1 && !r.km;
  metti(main,
    testata({ titolo: "Fine", sopra: nomeTipo(r.tipo, r.sottotipo) }),
    el("section", { class: "card" },
      el("div", { class: "tiles" },
        el("div", { class: "tile" }, el("small", {}, "Tempo"), el("b", {}, fmtSec(r.durata_min * 60).replace(/:00$/, ""), el("em", {}, "min"))),
        el("div", { class: "tile" }, el("small", {}, r.km != null ? "Distanza" : "FC media"), el("b", {}, r.km != null ? fmtNum(r.km, 2) : fmtNum(r.fc_media), el("em", {}, r.km != null ? "km" : "bpm"))),
        el("div", { class: "tile" }, el("small", {}, "FC massima"), el("b", {}, fmtNum(r.fc_max), el("em", {}, "bpm")))),
      el("p", { class: "sotto num" }, metriche(r)),
      barraZone(r),
      vuota ? el("p", { class: "esito err" }, "Registrazione molto corta: forse non vale la pena salvarla.") : null),
    el("section", { class: "card modulo" }, el("label", { class: "campo" }, el("span", {}, "Nota"), nota)),
    el("div", { class: "azioni" }, salva, scarta, esitoF));
}
