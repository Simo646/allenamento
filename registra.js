// Registrare: sessione di forza serie per serie, file dei dispositivi (FIT, GPX, TCX), allenamento a mano, notte, peso.
import { stato, registraVista, vai, rivai, testata, salvaGiorno, limiti, nomeTipo, coloreTipo, attive, modulo, ledDalBattito } from "./stato.js";
import { precompilaEsercizio, vociDelGiorno, ESERCIZI, testoSerie } from "./dati.js";
import { riassumiFit, riassumiXml, idSessione, CAMPI_FILE, CAMPI_DETTAGLIO, TIPI, SOTTOTIPI_BICI, volume } from "./analisi-file.js";
import { $, el, metti, icona, ICONE, oggi, fmtData, fmtGiorno, fmtNum, fmtKg, fmtSec, numero, avviso, esito, ricorda, conConferma, campo, opzione, testoKg } from "./util.js";
import { caricaLettoreFit } from "./lettore-fit.js";
import { metriche, barraZone, correggiDislivello } from "./dettaglio.js";
import { contenutoScheda, riassuntoScheda } from "./schede.js";
import { Registratore } from "./registratore.js";
import { disponibile, collegaFascia, schermoAcceso } from "./sorgenti.js";
import { programmaSegnali, sbloccaAudio, suoniAttivi, impostaSuoni } from "./suoni.js";
import { scaricaMappa, eliminaMappa } from "./mappe.js";

const occupato = (id) => stato.sessioni.some((s) => s.id === id);

registraVista("registra", {
  vivo: false,
  // Uscendo dalla forza in corso si spengono bip del recupero e schermo acceso; tornandoci ripartono.
  lascia() { annullaBipRecupero?.(); annullaBipRecupero = null; fermaSchermoForza?.(); fermaSchermoForza = null; },
  render(main, param) {
    if (param.tipo === "forza") return moduloForza(main, param);
    if (param.tipo === "mano") return moduloMano(main, param);
    if (param.tipo === "notte") return moduloNotte(main, param);
    if (param.tipo === "peso") return moduloPeso(main, param);
    return moduloFile(main, param);
  },
});

/* ---------- Forza ---------- */
let timer = 0;
// Fascia collegata durante la forza: resta collegata anche se la pagina si ridisegna o si cambia vista.
let fasciaForza = null; // { rec: Registratore, fascia, stato }
async function staccaFasciaForza() { const f = fasciaForza; fasciaForza = null; await f?.fascia?.scollega?.(); }
const zonaForza = () => (fasciaForza ? fasciaForza.rec.zonaAttuale(Date.now(), limiti()) : null);
// Bip a 3-2-1 prima della fine del recupero (uno alla volta: una nuova spunta lo sostituisce) e schermo acceso.
let annullaBipRecupero = null, fermaSchermoForza = null, schermoInArrivo = false;
function programmaRecupero(fine) {
  annullaBipRecupero?.();
  const tra = ((fine ?? 0) - Date.now()) / 1000;
  annullaBipRecupero = tra > 0.5 ? programmaSegnali([{ tra_s: tra, tono: "via" }]) : null;
}

// Forza avviata da Registra sessione: parte il cronometro e la fascia collegata nella preparazione manda il battito qui.
export function iniziaForza({ scheda, avvio, fascia, collega }) {
  if (fasciaForza && fasciaForza.fascia !== fascia) staccaFasciaForza();
  if (fascia) {
    const rec = new Registratore({ tipo: "Forza", conGps: false });
    rec.avvia(avvio);
    const f = { rec, fascia, stato: "connessa" };
    collega((m) => rec.battito(m), (st) => (f.stato = st));
    fasciaForza = f;
    ledDalBattito(zonaForza);
  }
  ricorda.scrivi("bozza-forza", null);
  vai("registra", { tipo: "forza", scheda, data: oggi(), avvio });
}
// Scarta la sessione di forza in corso (da Oggi).
export async function scartaForza() { ricorda.scrivi("bozza-forza", null); programmaRecupero(null); await staccaFasciaForza(); }

// Tre modi: dal vivo (`avvio`, o `riprendi` la bozza salvata), a mano (`aMano`, da Allenamenti) e modifica (`id`).
function moduloForza(main, param) {
  clearInterval(timer);
  const esistente = param.id ? stato.sessioni.find((s) => s.id === param.id) : null;
  const schedeForza = Object.entries(stato.schede).filter(([, s]) => s.tipo === "Forza");
  let b = param.bozza;
  if (!b && esistente) {
    b = { data: esistente.data, scheda: esistente.scheda ?? null, inizioMs: null, durata: esistente.durata_min ?? null, fc_media: esistente.fc_media ?? null, fc_max: esistente.fc_max ?? null, nota: esistente.nota ?? "",
      esercizi: (esistente.esercizi ?? []).map((e) => ({ nome: e.nome, recupero_s: e.recupero_s ?? null, unita: e.unita ?? null, ultima: null, serie: (e.serie ?? []).map((s) => ({ kg: s.kg ?? null, rip: s.rip ?? null, sec: s.sec ?? null, fatta: true })) })) };
  }
  if (!b && param.riprendi) { b = ricorda.leggi("bozza-forza"); if (b && b.vivo === undefined) b.vivo = !!b.inizioMs; } // le bozze delle versioni 1.0 non avevano `vivo`
  if (!b) {
    const data = param.data ?? oggi();
    const scheda = param.scheda ?? (param.aMano && schedeForza.length === 1 ? schedeForza[0][0] : null);
    b = { data, scheda, inizioMs: param.aMano ? null : param.avvio ?? Date.now(), vivo: !param.aMano, durata: null, fc_media: null, fc_max: null, nota: "", esercizi: dallaScheda(scheda, data) };
  }
  // Solo la sessione dal vivo resta salvata nel browser, per riprenderla da Oggi.
  const conserva = () => { if (b.vivo && !esistente) ricorda.scrivi("bozza-forza", b); };
  const ridisegna = () => { conserva(); rivai("registra", { ...param, bozza: b }); };
  const memorizza = () => { conserva(); aggiornaBarra(); };
  const scheda = b.scheda ? stato.schede[b.scheda] : null;
  const torna = () => vai(esistente || param.aMano ? "allenamenti" : "oggi");
  if (b.vivo) {
    conserva();
    if (!fermaSchermoForza && !schermoInArrivo) {
      schermoInArrivo = true;
      schermoAcceso(true).then((f) => { schermoInArrivo = false; if (stato.vista === "registra" && stato.param.tipo === "forza") fermaSchermoForza = f; else f(); });
    }
    programmaRecupero(b.finePausa);
  }

  const data = el("input", { id: "fz-data", type: "date", value: b.data, onchange: (e) => { b.data = e.target.value || oggi(); b.esercizi.forEach((x) => (x.ultima = precompilaEsercizio(x, stato.sessioni, b.data).ultima)); ridisegna(); } });
  const sel = el("select", { id: "fz-scheda", onchange: (e) => { b.scheda = e.target.value || null; b.esercizi = dallaScheda(b.scheda, b.data); ridisegna(); } },
    el("option", { value: "" }, "Senza scheda"), schedeForza.map(([id, s]) => el("option", { value: id, selected: id === b.scheda }, s.titolo)));

  // Battito dalla fascia durante le serie: a fine sessione diventano curva, zone e battito medio.
  const battitoVivo = el("b", { class: "num" }, "");
  const esitoFascia = el("span", { class: "esito", role: "status" });
  const collega = el("button", { type: "button", class: "btn piccolo" }, "Collega la fascia");
  collega.onclick = async () => {
    collega.disabled = true;
    esito(esitoFascia, "Cerco la fascia…");
    try {
      const rec = new Registratore({ tipo: "Forza", conGps: false });
      rec.avvia(Date.now());
      const f = { rec, fascia: null, stato: "connessa" };
      f.fascia = await collegaFascia((m) => rec.battito(m), (s) => (f.stato = s));
      fasciaForza = f;
      ledDalBattito(zonaForza);
      ridisegna();
    } catch (e) { esito(esitoFascia, e?.name === "NotFoundError" ? "Nessuna fascia scelta." : "Non collegata: " + (e?.message ?? "errore"), "err"); collega.disabled = false; }
  };
  const boxFascia = !b.vivo || esistente || !disponibile().fascia ? null : fasciaForza
    ? el("div", { class: "fascia-riga" }, el("span", {}, el("small", {}, fasciaForza.fascia?.nome ?? "Fascia"), battitoVivo),
      el("button", { type: "button", class: "lnk", onclick: async () => { await staccaFasciaForza(); ridisegna(); } }, "Scollega"))
    : el("div", { class: "fascia-riga" }, collega, esitoFascia);
  const audio = b.vivo ? el("button", { type: "button", class: "lnk", style: "justify-self:start",
    onclick: (ev) => { impostaSuoni(!suoniAttivi()); sbloccaAudio(); programmaRecupero(b.finePausa); ev.target.textContent = testoAudio(); } }, testoAudio()) : null;

  const tempo = el("b", { class: "num" }, "—");
  const contaSerie = el("b", { class: "num" }, "—");
  const volumeTile = el("b", { class: "num" }, "—");
  const riass = el("div", { class: "riass" }, el("span", {}, ""), el("b", {}, ""));
  // La fine del recupero sta nella bozza: resta anche se la pagina si ridisegna.

  function aggiornaBarra() {
    const tutte = b.esercizi.flatMap((e) => e.serie);
    const fatte = tutte.filter((s) => s.fatta).length;
    const vol = b.esercizi.reduce((a, e) => a + volume(serieDaSalvare(e, b)), 0);
    contaSerie.textContent = `${fatte} / ${tutte.length}`;
    volumeTile.replaceChildren(fmtNum(vol), el("em", {}, "kg"));
    const esFatti = b.esercizi.filter((e) => e.serie.length && e.serie.every((s) => s.fatta)).length;
    const resta = ((b.finePausa ?? 0) - Date.now()) / 1000;
    riass.children[0].textContent = resta > 0 ? "Recupero" : `${esFatti} di ${b.esercizi.length} esercizi`;
    riass.children[1].textContent = resta > 0 ? fmtSec(resta) : `Volume ${fmtNum(vol)} kg`;
    riass.children[1].className = resta > 0 ? "recupero" : "";
    tempo.textContent = b.inizioMs ? fmtSec((Date.now() - b.inizioMs) / 1000) : b.durata ? `${b.durata} min` : "—";
    if (fasciaForza && battitoVivo.isConnected) {
      const fc = fasciaForza.rec.fcAttuale(Date.now()), z = fasciaForza.rec.zonaAttuale(Date.now(), limiti());
      battitoVivo.textContent = fasciaForza.stato === "persa" ? "segnale perso, riprovo…" : fc ? `${fc} bpm · Z${z}` : "in attesa del battito…";
    }
    b.esercizi.forEach((e, i) => { const p = $(`fz-delta-${i}`); if (p) { const [t, c] = delta(e, b); p.textContent = t; p.className = "delta " + c; p.hidden = !t; } });
  }

  const esercizi = b.esercizi.map((e, i) => {
    const u = e.ultima, aTempo = e.unita === "sec";
    const griglia = el("div", { class: "griglia-serie" },
      el("span", { class: "intest" }, "Serie"), el("span", { class: "intest" }, "kg"), el("span", { class: "intest" }, aTempo ? "Sec." : "Rip."), el("span", { class: "intest", style: "text-align:center" }, "Fatta"),
      e.serie.map((s, j) => {
        const spunta = el("button", { type: "button", class: "spunta", "aria-pressed": String(!!s.fatta), "aria-label": `${e.nome}, serie ${j + 1} fatta` }, icona(ICONE.spunta, { spessore: 2.6 }));
        spunta.onclick = () => {
          s.fatta = !s.fatta;
          spunta.setAttribute("aria-pressed", String(s.fatta));
          if (s.fatta && b.vivo && e.recupero_s) { sbloccaAudio(); b.finePausa = Date.now() + e.recupero_s * 1000; programmaRecupero(b.finePausa); }
          memorizza();
        };
        return [
          el("span", { class: "n" }, String(j + 1)),
          el("input", { id: `fz-${i}-${j}-kg`, inputmode: "decimal", value: testoKg(s.kg), placeholder: "—", "aria-label": `${e.nome}, serie ${j + 1}, chili`, oninput: (ev) => { s.kg = numero(ev.target.value); memorizza(); } }),
          aTempo
            ? el("input", { id: `fz-${i}-${j}-sec`, inputmode: "numeric", value: s.sec ?? "", placeholder: "—", "aria-label": `${e.nome}, serie ${j + 1}, secondi`, oninput: (ev) => { s.sec = numero(ev.target.value); memorizza(); } })
            : el("input", { id: `fz-${i}-${j}-rip`, inputmode: "numeric", value: s.rip ?? "", placeholder: "—", "aria-label": `${e.nome}, serie ${j + 1}, ripetizioni`, oninput: (ev) => { s.rip = numero(ev.target.value); memorizza(); } }),
          spunta,
        ];
      }));
    return el("section", { class: "card esercizio" },
      el("div", { class: "esercizio-testa" }, el("h2", {}, `${i + 1}. ${e.nome}`), e.recupero_s ? el("span", {}, `rec. ${e.recupero_s < 60 ? e.recupero_s + " s" : String(e.recupero_s / 60).replace(".", ",") + " min"}`) : null),
      (e.nota || scheda?.esercizi?.find((x) => x.nome === e.nome)?.nota) ? el("p", { class: "nota-esercizio" }, e.nota || scheda.esercizi.find((x) => x.nome === e.nome).nota) : null,
      el("p", { class: "sotto num" }, u ? `Ultima volta, ${fmtData(u.data, { day: "numeric", month: "short" })}: ${u.serie.map((x) => testoSerie(x, u.unita)).join(" · ")}` : aTempo ? "Prima volta: scegli una durata che tieni bene fino in fondo." : "Prima volta: scegli carichi che ti lasciano 2 ripetizioni di margine."),
      griglia,
      el("div", { style: "display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap" },
        el("div", { style: "display:flex;gap:4px" },
          el("button", { type: "button", class: "btn tratteggio piccolo", onclick: () => { const x = e.serie[e.serie.length - 1]; e.serie.push({ kg: x?.kg ?? null, rip: x?.rip ?? null, sec: x?.sec ?? null, fatta: false }); ridisegna(); } }, "+ Serie"),
          e.serie.length > 1 ? el("button", { type: "button", class: "btn piccolo pericolo", onclick: () => { e.serie.pop(); ridisegna(); } }, "− Serie") : null),
        el("button", { type: "button", class: "lnk", onclick: () => { e.unita = aTempo ? null : "sec"; ridisegna(); } }, aTempo ? "Conta le ripetizioni" : "Conta i secondi"),
        el("span", { id: `fz-delta-${i}`, class: "delta", hidden: true })));
  });

  const nuovoNome = el("input", { id: "fz-nuovo", class: "input", list: "fz-elenco", placeholder: "Aggiungi un esercizio" });
  const aggiungi = () => {
    const nome = nuovoNome.value.trim();
    if (!nome) return;
    b.esercizi.push(precompilaEsercizio({ nome, serie: [{ kg: null, rip: null }, { kg: null, rip: null }, { kg: null, rip: null }] }, stato.sessioni, b.data));
    ridisegna();
  };
  nuovoNome.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); aggiungi(); } });
  const nomi = new Set([...Object.values(ESERCIZI).flat(), ...stato.sessioni.flatMap((s) => (s.esercizi ?? []).map((x) => x.nome))]);

  const num = (k, etichetta, id, aiuto) => campo(etichetta, el("input", { id, inputmode: "numeric", value: b[k] ?? "", placeholder: aiuto ?? "", oninput: (e) => { b[k] = numero(e.target.value); memorizza(); } }));
  const nota = el("textarea", { id: "fz-nota", placeholder: "Sensazioni, esercizi cambiati, dolori", oninput: (e) => { b.nota = e.target.value; memorizza(); } });
  nota.value = b.nota ?? "";
  const esitoF = el("span", { class: "esito", role: "status" });

  const salva = el("button", { type: "button", class: "btn primario" }, esistente ? "Salva le modifiche" : "Salva sessione");
  salva.onclick = async () => {
    const lista = b.esercizi.map((e) => ({ nome: e.nome, recupero_s: e.recupero_s ?? null, ...(e.unita === "sec" ? { unita: "sec" } : {}),
      serie: serieDaSalvare(e, b).map(({ kg, rip, sec }) => (e.unita === "sec" ? { kg, sec } : { kg, rip })) })).filter((e) => e.serie.length);
    if (!lista.length) return esito(esitoF, "Compila almeno una serie con ripetizioni, secondi o chili.", "err");
    salva.disabled = true;
    try {
      const durata = b.durata ?? (b.inizioMs ? Math.max(1, Math.round((Date.now() - b.inizioMs) / 60000)) : null);
      // Con la fascia collegata: battito medio e massimo, zone e curva misurati invece di quelli scritti a mano.
      const misure = !esistente && fasciaForza?.rec.punti.length > 30 ? fasciaForza.rec.riassunto(limiti(), Date.now()) : null;
      const battito = misure ? { fc_media: misure.fc_media, fc_max: misure.fc_max, z1_min: misure.z1_min, z2_min: misure.z2_min, z3_min: misure.z3_min, z4_min: misure.z4_min, z5_min: misure.z5_min, rmssd_ms: misure.rmssd_ms } : {};
      const base = { tipo: "Forza", data: b.data, scheda: b.scheda, esercizi: lista, durata_min: durata, fc_media: b.fc_media, fc_max: b.fc_max, nota: (b.nota ?? "").trim(), ...battito };
      // Se quel giorno c'è già una forza importata da file senza esercizi, le serie vanno lì (battito e zone restano).
      const daFile = !esistente && !misure && stato.sessioni.find((s) => s.data === b.data && s.tipo === "Forza" && !s.esercizi?.length);
      const doc = esistente ?? daFile;
      const id = doc?.id ?? idSessione(b.data, "Forza", occupato);
      if (doc) {
        await stato.archivio.scrivi("sessioni", id, { ...doc, ...base, durata_min: doc.durata_min ?? base.durata_min, fc_media: base.fc_media ?? doc.fc_media ?? null, fc_max: base.fc_max ?? doc.fc_max ?? null, nome: doc.nome || scheda?.titolo || "Forza" });
      } else {
        await stato.archivio.scrivi("sessioni", id, { ...base, nome: scheda?.titolo || "Forza", fonte: misure ? "Inserita nell'app, battito dalla fascia" : "Inserita nell'app" });
      }
      if (misure) await stato.archivio.scrivi("dettagli", id, { curva_fc: misure.curva_fc, curve: null, traccia: null });
      if (!esistente && b.vivo) await scartaForza();
      clearInterval(timer);
      avviso(esistente ? "Sessione aggiornata" : "Sessione di forza salvata");
      torna();
    } catch (e) { esito(esitoF, "Non salvata: " + (e?.message ?? "errore"), "err"); salva.disabled = false; }
  };
  const annulla = b.vivo && !esistente ? conConferma(el("button", { type: "button", class: "lnk" }, "Ricomincia da capo"), "Tocca di nuovo: perdi le serie segnate", async () => {
    await scartaForza();
    vai("registra", { tipo: "forza", data: b.data, scheda: b.scheda, avvio: Date.now() });
  }) : null;

  metti(main,
    testata({ titolo: scheda?.titolo || "Forza", sopra: fmtGiorno(b.data) + (esistente ? " · modifica" : param.aMano ? " · a mano" : ""), indietro: torna }),
    el("section", { class: "card modulo" },
      el("div", { class: "righe" }, campo("Giorno", data), esistente ? null : campo("Scheda", sel)),
      el("div", { class: "tiles riquadri" },
        el("div", { class: "tile" }, el("small", {}, "Tempo"), tempo),
        el("div", { class: "tile" }, el("small", {}, "Serie fatte"), contaSerie),
        el("div", { class: "tile" }, el("small", {}, "Volume"), volumeTile)),
      boxFascia,
      scheda?.nota ? el("p", { class: "nota-scheda" }, scheda.nota) : null,
      el("p", { class: "sotto" }, b.vivo ? "Spunta le serie mentre le fai: parte il recupero. Se non spunti niente, salvo tutte le serie compilate." : "Spunta le serie fatte, oppure lascia tutto: salvo le serie compilate."),
      audio, annulla),
    esercizi.length ? esercizi : el("p", { class: "vuoto" }, schedeForza.length ? "Scegli una scheda qui sopra o aggiungi gli esercizi uno alla volta." : "Aggiungi gli esercizi uno alla volta, oppure crea una scheda nel Piano."),
    el("section", { class: "card" }, el("div", { style: "display:flex;gap:8px" }, nuovoNome, el("button", { type: "button", class: "btn", onclick: aggiungi }, "Aggiungi")),
      el("datalist", { id: "fz-elenco" }, [...nomi].sort((x, y) => x.localeCompare(y)).map((n) => el("option", { value: n })))),
    el("section", { class: "card modulo" }, el("h2", {}, "Durata, battito e note"),
      el("div", { class: "righe" }, num("durata", "Durata (min)", "fz-durata", b.vivo ? "dal cronometro" : ""), num("fc_media", "FC media", "fz-fcm"), num("fc_max", "FC massima", "fz-fcx")),
      campo("Nota", nota), esitoF));

  const barra = $("barra-fondo");
  barra.replaceChildren(el("div", {}, riass, salva));
  barra.hidden = false;
  document.body.classList.add("con-barra");
  aggiornaBarra();
  timer = setInterval(() => { if (!riass.isConnected) return clearInterval(timer); aggiornaBarra(); }, 1000);
}

const testoAudio = () => (suoniAttivi() ? "Bip a fine recupero: sì" : "Bip a fine recupero: no");
function dallaScheda(id, data) {
  const s = id ? stato.schede[id] : null;
  return (s?.esercizi ?? []).map((e) => precompilaEsercizio(e, stato.sessioni, data));
}
// Con almeno una serie spuntata nella sessione si salvano solo le spuntate; altrimenti tutte quelle compilate.
function serieDaSalvare(e, b) {
  const qualcunaFatta = b.esercizi.some((x) => x.serie.some((s) => s.fatta));
  return e.serie.filter((s) => (qualcunaFatta ? s.fatta : true) && (s.kg > 0 || (e.unita === "sec" ? s.sec > 0 : s.rip > 0)));
}
// Differenza con l'ultima volta: chili massimi, altrimenti ripetizioni (o secondi) totali.
function delta(e, b) {
  const ora = serieDaSalvare(e, b), prima = e.ultima?.serie ?? [];
  if (!ora.length || !prima.length || (e.ultima.unita ?? null) !== (e.unita ?? null)) return ["", ""];
  const maxKg = (l) => Math.max(0, ...l.map((s) => s.kg ?? 0));
  const dk = maxKg(ora) - maxKg(prima);
  if (dk) return [`${dk > 0 ? "+" : "−"}${fmtKg(Math.abs(dk))} kg`, dk > 0 ? "su" : "giu"];
  const k = e.unita === "sec" ? "sec" : "rip";
  const tot = (l) => l.reduce((a, s) => a + (s[k] ?? 0), 0);
  const dr = tot(ora) - tot(prima);
  if (dr) return [`${dr > 0 ? "+" : "−"}${Math.abs(dr)}${k === "sec" ? '"' : " rip"}`, dr > 0 ? "su" : "giu"];
  return ["come l'ultima volta", ""];
}

/* ---------- File ---------- */
let sdk = null;

function moduloFile(main, param) {
  // Avviato da Registra sessione (HIIT o cardio): la scheda resta sotto gli occhi, con esercizi, tempi e nota.
  const s = param.voce?.scheda ? stato.schede[param.voce.scheda] : null;
  const schedaBox = s ? el("section", { class: "card" },
    el("div", { class: "card-testa" }, el("h2", {}, s.titolo || nomeTipo(s.tipo)), el("span", { class: "sotto" }, riassuntoScheda(s))),
    s.nota ? el("p", { class: "nota-scheda" }, s.nota) : null,
    contenutoScheda(s)) : null;
  metti(main,
    testata({ titolo: "Importa file", sopra: "Registra", indietro: () => vai("oggi") }),
    schedaBox,
    formFile(param));
}
// Salva un allenamento riassunto da un file o da una registrazione dal vivo: documento leggero in sessioni, traccia e
// curve in dettagli. Un allenamento con lo stesso inizio, o inserito a mano quel giorno, viene aggiornato. `extra`:
// altri campi da salvare (per esempio i tempi del timer HIIT). Con la traccia si scarica subito la mappa, se non si
// chiede `mappa: false` (import di molti file insieme: le mappe arrivano aprendo gli allenamenti).
export async function salvaRiassunto(r, param = {}, presi = new Set()) {
  const stessa = (r.inizio && stato.sessioni.find((s) => s.inizio && s.inizio === r.inizio))
    ?? stato.sessioni.find((s) => s.data === r.data && s.tipo === r.tipo && !s.inizio && !s.file);
  const id = stessa?.id ?? idSessione(r.data, r.tipo, (x) => presi.has(x) || occupato(x));
  presi.add(id);
  const campi = { ...Object.fromEntries(CAMPI_FILE.map((c) => [c, r[c] ?? null])), ...(param.extra ?? {}) };
  const idScheda = schedaPer(param, r.tipo, r.data);
  const schedaVoce = idScheda ? stato.schede[idScheda] : null;
  const doc = stessa
    ? { ...stessa, ...campi, tipo: r.tipo, sottotipo: r.sottotipo ?? stessa.sottotipo ?? null, ...(param.nota ? { nota: param.nota } : {}) }
    : { data: r.data, tipo: r.tipo, sottotipo: r.sottotipo ?? null, nome: schedaVoce?.titolo ?? r.nome_file ?? "", nota: param.nota ?? "", scheda: idScheda, ...campi };
  await stato.archivio.scrivi("sessioni", id, doc);
  await stato.archivio.scrivi("dettagli", id, Object.fromEntries(CAMPI_DETTAGLIO.map((c) => [c, r[c] ?? null])));
  if (r.traccia) {
    if (stessa) await eliminaMappa(id); // la traccia può essere cambiata
    // Mappa e, se serve (niente barometro, file senza quota), dislivello dal terreno; altrimenti aprendo l'allenamento.
    if (param.mappa !== false) {
      scaricaMappa(id, r.traccia).catch(() => {});
      correggiDislivello({ ...doc, id }).catch(() => {});
    }
  }
  return id;
}

// La scheda da collegare all'allenamento: quella scelta partendo (anche nessuna), se è dello stesso tipo, altrimenti
// quella della voce del giorno.
const schedaPer = (param, tipo, data) => (param.voce?.tipo === tipo ? param.voce.scheda ?? null : vociDelGiorno(stato.settimana, data).find((v) => v.tipo === tipo)?.scheda ?? null);

function formFile(param) {
  const attesa = [];
  const box = el("div", { class: "anteprima" });
  const esitoI = el("span", { class: "esito", role: "status" });
  const salva = el("button", { type: "button", class: "btn primario", hidden: true }, "Salva");
  const input = el("input", { type: "file", id: "file-allenamenti", multiple: true, accept: ".fit,.gpx,.tcx,application/gpx+xml,application/vnd.garmin.tcx+xml,application/octet-stream" });

  // File scelti qui o arrivati da un'altra app ("Apri con", "Condividi": param.files).
  async function leggi(files) {
    attesa.length = 0;
    metti(box, );
    salva.hidden = true;
    if (!files.length) return;
    esito(esitoI, "Leggo i file…");
    for (const f of files) {
      const riga = el("div", { class: "riga-file" });
      box.append(riga);
      try {
        let r;
        if (/\.fit$/i.test(f.name)) {
          try { sdk ??= await caricaLettoreFit(); }
          catch (e) { throw new Error(e?.message?.startsWith("il lettore") || e?.message?.startsWith("non riesco") ? e.message : "non riesco a caricare il lettore FIT: controlla la connessione"); }
          const { messages, errors } = new sdk.Decoder(sdk.Stream.fromArrayBuffer(await f.arrayBuffer())).read();
          if (!messages.sessionMesgs?.length) throw new Error(errors?.[0]?.message ?? "file illeggibile");
          r = riassumiFit(messages, { limiti: limiti(), nomeFile: f.name });
        } else if (/\.(gpx|tcx)$/i.test(f.name)) r = riassumiXml(await f.text(), { limiti: limiti(), nomeFile: f.name });
        else throw new Error("formato non riconosciuto: servono file .fit, .gpx o .tcx");
        if (!r.tipo && param.voce?.tipo) r.tipo = param.voce.tipo;
        const voce = { r };
        attesa.push(voce);
        disegnaRiga(riga, voce);
      } catch (e) {
        riga.append(el("div", { class: "testa" }, el("i", { class: "dot", style: "background:var(--crit)" }), f.name), el("small", {}, "Saltato: " + (e?.message ?? "errore di lettura")));
      }
    }
    esito(esitoI, attesa.length ? "" : "Nessun file valido.", attesa.length ? "" : "err");
    salva.hidden = !attesa.length;
    salva.textContent = attesa.length === 1 ? "Salva l'allenamento" : `Salva ${attesa.length} allenamenti`;
  }
  input.addEventListener("change", () => leggi([...input.files]));
  if (param.files?.length) leggi(param.files);

  function disegnaRiga(riga, voce) {
    const r = voce.r;
    const stessa = stato.sessioni.find((s) => s.inizio && s.inizio === r.inizio);
    const tipo = el("select", { "aria-label": "Tipo di allenamento", onchange: (e) => { r.tipo = e.target.value || null; if (r.tipo !== "Bici") r.sottotipo = null; disegnaRiga(riga, voce); } },
      el("option", { value: "" }, "Scegli il tipo…"), [...new Set([...TIPI])].map((t) => el("option", { value: t, selected: t === r.tipo }, t)));
    const sotto = el("select", { "aria-label": "Tipo di bici", onchange: (e) => (r.sottotipo = e.target.value || null) },
      el("option", { value: "" }, "Bici non indicata"), SOTTOTIPI_BICI.map((t) => el("option", { value: t, selected: t === r.sottotipo }, t)));
    metti(riga,
      el("div", { class: "testa" }, el("i", { class: "dot", style: `background:${coloreTipo(r.tipo)}` }), `${fmtGiorno(r.data)}${r.inizio ? " · " + new Date(r.inizio).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) : ""}`,
        el("span", { class: "sotto", style: "font-weight:600" }, stessa ? "· aggiorna quello già salvato" : "· nuovo")),
      el("div", { class: "righe" }, el("label", { class: "campo" }, el("span", {}, "Tipo"), tipo), r.tipo === "Bici" ? el("label", { class: "campo" }, el("span", {}, "Bici"), sotto) : null),
      el("div", { class: "sotto num" }, metriche(r)),
      barraZone(r),
      el("small", {}, `${r.fonte} · ${r.file}` + (r.traccia ? "" : " · senza traccia GPS") + (r.curva_fc ? "" : " · senza battito")));
  }

  salva.addEventListener("click", async () => {
    if (attesa.some((v) => !v.r.tipo)) return esito(esitoI, "Scegli il tipo per ogni file.", "err");
    salva.disabled = true;
    const presi = new Set();
    let fatti = 0;
    try {
      for (const { r } of attesa) { await salvaRiassunto(r, { ...param, mappa: attesa.length <= 5 }, presi); fatti++; }
      avviso(fatti === 1 ? "Allenamento salvato" : `${fatti} allenamenti salvati`);
      vai("oggi");
    } catch (e) {
      esito(esitoI, `Salvati ${fatti}, poi un errore: ${e?.message ?? "riprova"}.`, "err");
      salva.disabled = false;
    }
  });

  return el("section", { class: "card modulo" },
    el("p", { class: "sotto" }, "File FIT da Garmin, Wahoo, Coros, Polar, Suunto e altri; GPX e TCX da Strava, Komoot o dalle app dell'orologio. Anche più file insieme. Le zone si calcolano sui tuoi limiti."),
    el("label", { class: "scegli-file", for: "file-allenamenti" }, el("b", {}, "Scegli i file"), el("small", {}, "Sul telefono puoi aprire anche Dropbox o Google Drive dal selettore"), input),
    box,
    el("div", { class: "azioni" }, salva, esitoI));
}

/* ---------- A mano (da Allenamenti) ---------- */
function moduloMano(main, param) {
  metti(main,
    testata({ titolo: "Allenamento a mano", sopra: "Allenamenti", indietro: () => vai("allenamenti") }),
    formManuale(param));
}

// La forza ha la sua scheda serie per serie; gli altri tipi durata, distanza e battito.
function formManuale(param) {
  const v = { tipo: param.voce?.tipo ?? (attive().find((t) => t !== "Forza") ?? "Corsa"), sottotipo: param.voce?.sottotipo ?? null };
  const tipi = el("div", { class: "seg tipi", role: "radiogroup", "aria-label": "Tipo" });
  const sotto = el("div", { class: "seg", role: "radiogroup", "aria-label": "Bici" });
  const campoSotto = el("fieldset", { class: "campo" }, el("legend", {}, "Bici"), sotto);
  const inp = (id, tipo = "text", extra = {}) => el("input", { id, type: tipo, inputmode: tipo === "text" ? "decimal" : undefined, ...extra });
  const data = inp("m-data", "date", { value: param.data ?? oggi() });
  const disegna = () => {
    tipi.replaceChildren(...attive().map((t) => opzione("m-tipo", t, t, v.tipo === t, () => {
      if (t === "Forza") return vai("registra", { tipo: "forza", aMano: true, data: data.value || oggi(), sezione: "allenamenti" });
      v.tipo = t;
      disegna();
    })));
    sotto.replaceChildren(...["Non indicata", ...SOTTOTIPI_BICI].map((t) => opzione("m-sotto", t, t, (v.sottotipo ?? "Non indicata") === t, () => (v.sottotipo = t === "Non indicata" ? null : t))));
    campoSotto.hidden = v.tipo !== "Bici";
  };
  disegna();
  const campi = { durata_min: inp("m-durata"), km: inp("m-km"), salita_m: inp("m-salita"), fc_media: inp("m-fcm"), fc_max: inp("m-fcx") };
  const nota = el("textarea", { id: "m-nota" });
  const esitoM = el("span", { class: "esito", role: "status" });
  const salva = el("button", { type: "button", class: "btn primario" }, "Salva");
  salva.onclick = async () => {
    const valori = Object.fromEntries(Object.entries(campi).map(([k, i]) => [k, numero(i.value)]));
    if (!data.value || !valori.durata_min) return esito(esitoM, "Servono il giorno e la durata.", "err");
    salva.disabled = true;
    try {
      const idScheda = schedaPer(param, v.tipo, data.value);
      const schedaVoce = idScheda ? stato.schede[idScheda] : null;
      const id = idSessione(data.value, v.tipo, occupato);
      await stato.archivio.scrivi("sessioni", id, { data: data.value, tipo: v.tipo, sottotipo: v.tipo === "Bici" ? v.sottotipo : null, nome: schedaVoce?.titolo ?? "", scheda: idScheda,
        ...valori, z1_min: null, z2_min: null, z3_min: null, z4_min: null, z5_min: null, nota: nota.value.trim(), fonte: "Inserito a mano" });
      avviso("Allenamento salvato");
      vai("allenamenti");
    } catch (e) { esito(esitoM, "Non salvato: " + (e?.message ?? "errore"), "err"); salva.disabled = false; }
  };
  return el("section", { class: "card modulo" },
    el("fieldset", { class: "campo" }, el("legend", {}, "Attività"), tipi), campoSotto,
    el("div", { class: "righe" }, campo("Giorno", data), campo("Durata (min) *", campi.durata_min)),
    el("div", { class: "righe" }, campo("Distanza (km)", campi.km), campo("Salita (m)", campi.salita_m), campo("FC media", campi.fc_media), campo("FC massima", campi.fc_max)),
    campo("Nota", nota),
    el("p", { class: "sotto" }, "Senza file non ci sono traccia, curva del battito e tempo in zona. Per la forza si apre la scheda serie per serie."),
    el("div", { class: "azioni" }, salva, esitoM));
}

/* ---------- Notte ---------- */
function moduloNotte(main, param) {
  const sonno = modulo("sonno"), ossigeno = modulo("ossigeno");
  const data = el("input", { id: "n-data", type: "date", value: param.data ?? oggi() });
  const inp = (id, ph) => el("input", { id, inputmode: "numeric", placeholder: ph });
  const c = { ore: inp("n-ore", "7"), min: inp("n-min", "30"), fc_sonno: inp("n-fc", "52"), spo2_min: inp("n-spo2-min", "92"), spo2_media: inp("n-spo2-media", "96"), spo2_max: inp("n-spo2-max", "99") };
  const nota = el("textarea", { id: "n-nota", placeholder: "Risvegli, caldo, mal di testa…" });
  const esitoN = el("span", { class: "esito", role: "status" });
  const salva = el("button", { type: "button", class: "btn primario" }, "Salva la notte");
  const togli = el("button", { type: "button", class: "btn pericolo", hidden: true }, "Elimina la notte");
  const compila = () => {
    const n = stato.notti.find((x) => x.data === data.value);
    c.ore.value = n?.durata_min != null ? Math.floor(n.durata_min / 60) : "";
    c.min.value = n?.durata_min != null ? n.durata_min % 60 : "";
    for (const k of ["fc_sonno", "spo2_min", "spo2_media", "spo2_max"]) c[k].value = n?.[k] ?? "";
    nota.value = n?.nota ?? "";
    salva.textContent = n ? "Aggiorna la notte" : "Salva la notte";
    togli.hidden = !n;
    esito(esitoN, "");
  };
  data.addEventListener("change", compila);
  compila();
  salva.onclick = async () => {
    const ore = numero(c.ore.value), mm = numero(c.min.value), fc = numero(c.fc_sonno.value);
    const valori = {
      durata_min: ore != null || mm != null ? Math.round((ore ?? 0) * 60 + (mm ?? 0)) : null,
      fc_sonno: fc != null ? Math.round(fc) : null,
      spo2_min: numero(c.spo2_min.value), spo2_media: numero(c.spo2_media.value), spo2_max: numero(c.spo2_max.value), nota: nota.value.trim(),
    };
    if (!Object.entries(valori).some(([k, x]) => k !== "nota" && x != null)) return esito(esitoN, "Inserisci almeno un valore.", "err");
    if (fc != null && (fc < 30 || fc > 120)) return esito(esitoN, "Il battito nel sonno deve stare tra 30 e 120 bpm.", "err");
    if ([valori.spo2_min, valori.spo2_media, valori.spo2_max].some((x) => x != null && (x < 70 || x > 100))) return esito(esitoN, "L'ossigeno va tra 70 e 100%.", "err");
    salva.disabled = true;
    try { await salvaGiorno("notti", data.value, valori); avviso("Notte salvata"); vai("oggi"); }
    catch (e) { esito(esitoN, "Non salvata: " + (e?.message ?? "errore"), "err"); salva.disabled = false; }
  };
  conConferma(togli, "Tocca di nuovo per eliminare", async () => { await salvaGiorno("notti", data.value, null); avviso("Notte eliminata"); compila(); });
  metti(main, 
    testata({ titolo: "Notte", sopra: "Registra", indietro: () => vai("oggi") }),
    el("section", { class: "card modulo" },
      el("p", { class: "sotto" }, "Copia i valori dall'app del tuo orologio o anello. Se la data c'è già, la aggiorni."),
      campo("Mattina del", data),
      sonno ? el("div", { class: "righe" }, campo("Ore di sonno", c.ore), campo("Minuti", c.min), campo("Battito medio nel sonno", c.fc_sonno, "bpm")) : null,
      ossigeno ? el("div", { class: "righe" }, campo("SpO₂ minima", c.spo2_min, "%"), campo("SpO₂ media", c.spo2_media, "%"), campo("SpO₂ massima", c.spo2_max, "%")) : null,
      campo("Nota", nota),
      el("div", { class: "azioni" }, salva, togli, esitoN)));
}

/* ---------- Peso ---------- */
function moduloPeso(main, param) {
  const data = el("input", { id: "p-data", type: "date", value: param.data ?? oggi() });
  const kg = el("input", { id: "p-kg", inputmode: "decimal", placeholder: "75,0" });
  const esitoP = el("span", { class: "esito", role: "status" });
  const salva = el("button", { type: "button", class: "btn primario" }, "Salva il peso");
  const togli = el("button", { type: "button", class: "btn pericolo", hidden: true }, "Elimina");
  const compila = () => { const p = stato.peso.find((x) => x.data === data.value); kg.value = p?.kg != null ? String(p.kg).replace(".", ",") : ""; togli.hidden = !p; };
  data.addEventListener("change", compila);
  compila();
  salva.onclick = async () => {
    const v = numero(kg.value);
    if (!data.value || v == null) return esito(esitoP, "Servono il giorno e il peso.", "err");
    if (v < 30 || v > 250) return esito(esitoP, "Il peso deve stare tra 30 e 250 kg.", "err");
    salva.disabled = true;
    try { await salvaGiorno("peso", data.value, { kg: Math.round(v * 10) / 10 }); avviso("Peso salvato"); vai("oggi"); }
    catch (e) { esito(esitoP, "Non salvato: " + (e?.message ?? "errore"), "err"); salva.disabled = false; }
  };
  conConferma(togli, "Tocca di nuovo per eliminare", async () => { await salvaGiorno("peso", data.value, null); avviso("Peso eliminato"); compila(); });
  metti(main, 
    testata({ titolo: "Peso", sopra: "Registra", indietro: () => vai("oggi") }),
    el("section", { class: "card modulo" },
      el("div", { class: "righe" }, campo("Giorno", data), campo("Peso (kg)", kg)),
      el("p", { class: "sotto" }, "Pesati sempre nelle stesse condizioni, per esempio al mattino a digiuno."),
      el("div", { class: "azioni" }, salva, togli, esitoP)));
}
