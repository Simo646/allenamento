// Avvio dell'app, vista Oggi ed elenco degli allenamenti. Le altre viste stanno nei loro moduli e si registrano da sole.
import { stato, avvia, registraVista, vai, programmaRender, testata, coloreTipo, nomeTipo, iconaTipo, chipZona, modulo, descriviVoce, intervalloZona } from "./stato.js";
import { GIORNI, vociDelGiorno, statoVoci, recupero } from "./dati.js";
import { TIPI } from "./analisi-file.js";
import { $, el, metti, icona, ICONE, oggi, piuGiorni, lunediDi, fmtData, fmtNum, fmtDur, fmtOre, somma, ricorda } from "./util.js";
import { voceSessione, perData, metriche, apriDettaglio } from "./dettaglio.js";
import { contenutoScheda } from "./schede.js";
import "./settimana.js";
import "./registra.js";
import "./analisi.js";
import "./impostazioni.js";
import { leggiBozza, riprendiInterrotta, scartaInterrotta, registrazioneInCorso } from "./dal-vivo.js";
import { disponibile, nativo } from "./sorgenti.js";
import { conConferma } from "./util.js";

/* ---------- Oggi ---------- */
const aperte = new Set(); // voci con la scheda aperta

registraVista("oggi", { vivo: true, render(main) {
  const d = oggi();
  const delGiorno = stato.sessioni.filter((s) => s.data === d);
  const voci = statoVoci(vociDelGiorno(stato.settimana, d), delGiorno);
  const usate = new Set(voci.map((v) => v.fatta).filter(Boolean));
  const fuori = delGiorno.filter((s) => !usate.has(s));

  metti(main, 
    testata({ titolo: "Oggi" }),
    bandaInterrotta(),
    bandaAggiornamento(),
    striscia(d),
    cardProgramma(d, voci, fuori),
    azioniRapide(),
    modulo("sonno") || modulo("ossigeno") ? cardRecupero(d) : null,
    cardSettimana(d),
    cardUltimi());
} });

// I sette giorni della settimana in corso, con un pallino per ogni attività in programma.
function striscia(d) {
  const lun = lunediDi(d);
  return el("nav", { class: "striscia", "aria-label": "Questa settimana" }, GIORNI.map((g, i) => {
    const data = piuGiorni(lun, i);
    const fatto = stato.sessioni.some((s) => s.data === data);
    const voci = stato.settimana[g] ?? [];
    return el("button", { type: "button", class: (data === d ? "oggi " : "") + (fatto ? "fatto" : ""), onclick: () => vai("settimana"),
      "aria-label": `${fmtData(data, { weekday: "long", day: "numeric" })}: ${voci.length ? voci.map((v) => descriviVoce(v).titolo).join(", ") : "riposo"}${fatto ? ", allenamento fatto" : ""}` },
      el("b", {}, fmtData(data, { weekday: "narrow" })),
      el("span", { class: "num" }, String(Number(data.slice(8)))),
      el("div", { class: "punti" }, voci.slice(0, 3).map((v) => el("i", { style: `background:${coloreTipo(v.tipo)}` }))));
  }));
}

function cardProgramma(d, voci, fuori) {
  const righe = voci.map((v) => rigaVoce(d, v));
  for (const s of fuori) righe.push(el("div", { class: "voce-oggi" },
    el("div", { class: "voce-riga" }, iconaTipo(s.tipo),
      el("button", { type: "button", class: "voce-testo", onclick: () => apriDettaglio(s.id) },
        el("b", {}, s.nome || nomeTipo(s.tipo, s.sottotipo)), el("span", { class: "num" }, "Fuori programma · " + metriche(s))),
      fattoSegno())));
  // Barra nera con le attività del giorno in grande e i riquadri delle zone obiettivo, come la pagina di un ciclocomputer.
  const tipi = [...new Set(voci.map((v) => v.tipo))];
  const nome = tipi.length ? tipi.join(" + ") : "Riposo";
  const zone = [...new Set(voci.filter((v) => v.tipo !== "Forza").map((v) => descriviVoce(v).zona).filter(Boolean))].sort();
  return el("section", { class: "programma-oggi", "aria-label": "In programma oggi" },
    el("div", { class: "programma-barra" },
      el("div", { style: "min-width:0" }, el("div", { class: "etichetta" }, "In programma oggi"), el("div", { class: "programma-nome" + (nome.length > 9 ? " lungo" : "") }, nome)),
      zonaBox(zone, tipi.includes("Forza"))),
    righe.length ? el("div", { class: "voci" }, righe)
      : el("p", { class: "vuoto" }, "Giorno di riposo. Se ti alleni lo stesso, registralo con i pulsanti qui sotto."),
    el("div", { class: "programma-piede" }, el("button", { type: "button", class: "lnk", onclick: () => vai("settimana") }, "Tutta la settimana")));
}

// Riquadri delle zone nel colore della zona; per la sola forza un riquadro neutro.
function zonaBox(zone, forza) {
  if (!zone.length) return forza ? el("div", { class: "zone-box" }, el("div", { class: "zona-box forza" }, el("b", {}, "F"), el("span", {}, "FORZA"))) : null;
  return el("div", { class: "zone-box" }, zone.map((z) => el("div", { class: "zona-box", style: `background:var(--z${z});color:var(--z${z}-ink)`, "aria-label": `Zona Z${z}, ${intervalloZona(z - 1)} bpm` },
    el("b", {}, `Z${z}`), el("span", { class: "num" }, intervalloZona(z - 1)))));
}

const fattoSegno = () => el("span", { class: "fatto-segno" }, icona(ICONE.spunta, { spessore: 2.6 }), "Fatto");

function rigaVoce(d, v) {
  const { titolo, sotto, zona, scheda } = descriviVoce(v);
  const aperta = aperte.has(v.id);
  const azione = v.fatta ? fattoSegno()
    : v.tipo === "Forza" ? el("button", { type: "button", class: "btn primario piccolo", onclick: () => vai("registra", { tipo: "forza", scheda: v.scheda, data: d }) }, "Registra")
    : dalVivo() ? el("button", { type: "button", class: "btn primario piccolo", onclick: () => vai("dal-vivo", { voce: v }) }, "Inizia")
    : el("button", { type: "button", class: "btn piccolo", onclick: () => vai("registra", { tipo: "file", data: d, voce: v }) }, v.tipo === "HIIT" ? "Registra" : "Importa");
  const dettaglio = [];
  // Si apre solo se c'è qualcosa da leggere: esercizi, tempi o una nota.
  const apribile = !!(scheda && (scheda.tipo === "Forza" || scheda.tipo === "HIIT")) || !!(v.nota || scheda?.nota);
  if (v.fatta) dettaglio.push(el("button", { type: "button", class: "lnk", style: "justify-self:start", onclick: () => apriDettaglio(v.fatta.id) }, metriche(v.fatta) + " ›"));
  else if (zona && v.tipo !== "Forza") dettaglio.push(el("div", { style: "display:flex;gap:8px;align-items:center" }, el("span", {}, "Zona obiettivo"), chipZona(zona)));
  if (aperta && scheda) dettaglio.push(contenutoScheda(scheda));
  if (aperta && (v.nota || scheda?.nota)) dettaglio.push(el("p", {}, v.nota || scheda.nota));
  return el("div", { class: "voce-oggi" },
    el("div", { class: "voce-riga" }, iconaTipo(v.tipo),
      el("button", { type: "button", class: "voce-testo", "aria-expanded": apribile ? String(aperta) : null, disabled: !apribile,
        onclick: () => { aperta ? aperte.delete(v.id) : aperte.add(v.id); programmaRender(); } },
        el("b", {}, titolo), el("span", {}, sotto + (apribile && !v.fatta ? (aperta ? " · chiudi" : scheda?.tipo === "Forza" || scheda?.tipo === "HIIT" ? " · vedi la scheda" : " · vedi la nota") : ""))),
      azione),
    dettaglio.length ? el("div", { class: "voce-dettaglio" }, dettaglio) : null);
}


// Registrazione dal vivo: solo dove GPS o fascia funzionano (app Android, app dal sito), non dentro claude.ai.
const dalVivo = () => { const d = disponibile(); return !d.inClaude && (d.gps || d.fascia); };

// Una registrazione rimasta a metà (app chiusa o telefono spento): riprenderla, salvarla o scartarla.
function bandaInterrotta() {
  const b = stato.interrotta;
  if (!b || registrazioneInCorso()) return null;
  const quando = new Date(b.rec.inizio).toLocaleString("it-IT", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const chiudi = () => { stato.interrotta = null; programmaRender(); };
  return el("section", { class: "banda", style: "display:grid;gap:8px" },
    el("span", {}, `Registrazione di ${nomeTipo(b.rec.tipo, b.rec.sottotipo).toLowerCase()} interrotta (${quando}).`),
    el("div", { class: "azioni" },
      el("button", { type: "button", class: "btn piccolo primario", onclick: () => { chiudi(); riprendiInterrotta(b, "riprendi"); } }, "Riprendi"),
      el("button", { type: "button", class: "btn piccolo", onclick: () => { chiudi(); riprendiInterrotta(b, "salva"); } }, "Salva"),
      conConferma(el("button", { type: "button", class: "btn piccolo pericolo" }, "Scarta"), "Tocca di nuovo", async () => { await scartaInterrotta(); chiudi(); })));
}

// App Android: se sul sito c'è una versione più nuova, lo dice con il collegamento per scaricarla.
function bandaAggiornamento() {
  const a = stato.aggiornamento;
  return a ? el("p", { class: "banda info" }, `Nuova versione dell'app (${a.versione}). `, el("a", { href: a.pagina, target: "_blank", rel: "noopener" }, "Scaricala")) : null;
}

function azioniRapide() {
  const b = (testo, f) => el("button", { type: "button", class: "btn", onclick: f }, testo);
  return el("div", { class: "azioni-rapide", role: "group", "aria-label": "Registra" },
    dalVivo() ? el("button", { type: "button", class: "btn primario", onclick: () => vai("dal-vivo", {}) }, "Dal vivo") : null,
    stato.profilo.attivita.includes("Forza") ? b("+ Forza", () => vai("registra", { tipo: "forza", data: oggi() })) : null,
    b("Importa file", () => vai("registra", { tipo: "file", data: oggi() })),
    b("+ A mano", () => vai("registra", { tipo: "file", data: oggi(), aMano: true })),
    modulo("sonno") || modulo("ossigeno") ? b("+ Notte", () => vai("registra", { tipo: "notte", data: oggi() })) : null,
    modulo("peso") ? b("+ Peso", () => vai("registra", { tipo: "peso", data: oggi() })) : null);
}

function cardRecupero(d) {
  const sonno = modulo("sonno"), ossigeno = modulo("ossigeno");
  const notti = [...stato.notti].sort((a, b) => b.data.localeCompare(a.data));
  const stanotte = notti.find((n) => n.data === d);
  const ultima = stanotte ?? notti[0];
  const prima = ultima ? notti.filter((n) => n.data < ultima.data).slice(0, stato.profilo.recupero.notti) : [];
  const mediaDi = (k) => { const v = prima.map((n) => n[k]).filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const tile = (titolo, k, unita, fmt = (x) => fmtNum(x)) => {
    const m = mediaDi(k);
    return el("div", { class: "tile" }, el("small", {}, titolo),
      el("b", {}, ultima?.[k] == null ? "—" : fmt(ultima[k]), unita ? el("em", {}, unita) : null),
      el("span", {}, m == null ? "" : `media ${fmt(m)}`));
  };
  const r = sonno ? recupero(stato.notti, d, stato.profilo.recupero) : null;
  const PILL = { ok: ["ok", "Via libera"], attenzione: ["attenzione", "Battito alto"], riduci: ["riduci", "Riduci il carico"], manca: ["neutro", "Manca la notte"], dati: ["neutro", "Media in costruzione"] };
  const tiles = [
    sonno ? tile("Battito nel sonno", "fc_sonno", "bpm") : null,
    sonno ? tile("Sonno", "durata_min", "h", fmtOre) : null,
    ossigeno ? tile("SpO₂ minima", "spo2_min", "%") : null,
    ossigeno && !sonno ? tile("SpO₂ media", "spo2_media", "%") : null,
  ].filter(Boolean);
  return el("section", { class: "card" },
    el("div", { class: "card-testa" }, el("h2", {}, sonno ? "Recupero" : "Ossigeno nel sonno"),
      r ? el("span", { class: "pill " + PILL[r.stato][0] }, PILL[r.stato][1])
        : el("button", { type: "button", class: "lnk", onclick: () => vai("registra", { tipo: "notte", data: d }) }, "Inserisci la notte")),
    ultima ? el("p", { class: "sotto" }, ultima === stanotte ? "Stanotte" : "Ultima notte inserita: " + fmtData(ultima.data, { weekday: "short", day: "numeric", month: "short" })) : null,
    el("div", { class: "tiles" + (tiles.length === 2 ? " due" : "") }, tiles),
    r ? el("p", { class: "sotto" }, r.testo + (r.soglia ? ` La tua media è ${fmtNum(r.media, 1)} bpm, soglia ${r.soglia}.` : "")) : null,
    r?.stato === "manca" ? el("button", { type: "button", class: "btn piccolo", style: "justify-self:start", onclick: () => vai("registra", { tipo: "notte", data: d }) }, "Inserisci la notte") : null);
}

function cardSettimana(d) {
  const lun = lunediDi(d);
  const sett = stato.sessioni.filter((s) => s.data >= lun && s.data <= piuGiorni(lun, 6));
  let previste = 0, fatte = 0;
  GIORNI.forEach((g, i) => {
    const data = piuGiorni(lun, i);
    const voci = statoVoci(stato.settimana[g] ?? [], stato.sessioni.filter((s) => s.data === data));
    previste += voci.length;
    fatte += voci.filter((v) => v.fatta).length;
  });
  const perTipo = [...TIPI, "altro"].map((t) => [t, somma(sett.filter((s) => (TIPI.includes(s.tipo) ? s.tipo : "altro") === t), (s) => s.durata_min)]).filter(([, m]) => m > 0);
  const tot = somma(perTipo, ([, m]) => m);
  return el("section", { class: "card" },
    el("div", { class: "card-testa" }, el("h2", {}, "Questa settimana"), previste ? el("span", { class: "sotto num" }, `${fatte} di ${previste} fatti`) : null),
    el("div", { class: "tiles" },
      el("div", { class: "tile" }, el("small", {}, "Tempo"), el("b", {}, fmtOre(tot), el("em", {}, "h"))),
      el("div", { class: "tile" }, el("small", {}, "Allenamenti"), el("b", {}, String(sett.length))),
      el("div", { class: "tile" }, el("small", {}, "In Z2"), el("b", {}, fmtOre(somma(sett, (s) => s.z2_min)), el("em", {}, "h")))),
    perTipo.length
      ? [el("div", { class: "barra-tipi" }, perTipo.map(([t, m]) => el("i", { style: `flex:${m};background:${coloreTipo(t)}` }))),
        el("div", { class: "legenda num" }, perTipo.map(([t, m]) => el("span", {}, el("i", { style: `background:${coloreTipo(t)}` }), `${t === "altro" ? "Altro" : t} ${fmtDur(m)}`)))]
      : el("p", { class: "vuoto" }, "Ancora nessun allenamento questa settimana."));
}

function cardUltimi() {
  const ultimi = [...stato.sessioni].sort(perData).slice(0, 3);
  return el("section", { class: "card" },
    el("div", { class: "card-testa" }, el("h2", {}, "Ultimi allenamenti"), ultimi.length ? el("button", { type: "button", class: "lnk", onclick: () => vai("allenamenti") }, "Vedi tutti") : null),
    ultimi.length ? el("div", { class: "elenco" }, ultimi.map(voceSessione))
      : el("p", { class: "vuoto" }, "Nessun allenamento ancora. Importa un file dal tuo orologio o ciclocomputer, oppure registra una sessione di forza."));
}

/* ---------- Allenamenti ---------- */
const filtro = { tipo: "Tutti", sottotipo: "Tutte" };

registraVista("allenamenti", { vivo: true, render(main) {
  const tipi = [...TIPI, ...new Set(stato.sessioni.map((s) => s.tipo))].filter((t, i, a) => a.indexOf(t) === i && stato.sessioni.some((s) => s.tipo === t));
  if (filtro.tipo !== "Tutti" && !tipi.includes(filtro.tipo)) filtro.tipo = "Tutti";
  const sottotipi = filtro.tipo === "Bici" ? [...new Set(stato.sessioni.filter((s) => s.tipo === "Bici" && s.sottotipo).map((s) => s.sottotipo))] : [];
  const bottoni = (valori, chiave, colore) => el("div", { class: "filtri", role: "group" }, valori.map((t) =>
    el("button", { type: "button", "aria-pressed": String(filtro[chiave] === t), onclick: () => { filtro[chiave] = t; if (chiave === "tipo") filtro.sottotipo = "Tutte"; programmaRender(); } },
      colore && t !== "Tutti" ? el("i", { class: "dot", style: `background:${coloreTipo(t)}` }) : null, t)));
  const righe = stato.sessioni.filter((s) => (filtro.tipo === "Tutti" || s.tipo === filtro.tipo) && (filtro.sottotipo === "Tutte" || s.sottotipo === filtro.sottotipo)).sort(perData);
  const settimane = [...new Set(righe.map((s) => lunediDi(s.data)))];
  metti(main, 
    testata({ titolo: "Allenamenti" }),
    tipi.length > 1 ? bottoni(["Tutti", ...tipi], "tipo", true) : null,
    sottotipi.length > 1 ? bottoni(["Tutte", ...sottotipi], "sottotipo", false) : null,
    el("section", { class: "card", style: "gap:0" }, righe.length
      ? settimane.flatMap((w) => {
        const sett = righe.filter((s) => lunediDi(s.data) === w);
        return [
          el("div", { class: "settimana-testa" }, el("b", {}, "Settimana del " + fmtData(w, { day: "numeric", month: "long" })),
            el("span", { class: "num" }, `${fmtDur(somma(sett, (s) => s.durata_min))} · ${sett.length} ${sett.length === 1 ? "allenamento" : "allenamenti"}`)),
          ...sett.map(voceSessione),
        ];
      })
      : el("p", { class: "vuoto" }, stato.sessioni.length ? "Nessun allenamento di questo tipo." : "Qui compariranno i tuoi allenamenti, divisi per settimana.")));
} });

/* ---------- avvio ---------- */
// Il tasto Piano riapre la parte vista l'ultima volta: settimana o schede.
for (const b of document.querySelectorAll(".schede-nav [data-vai]"))
  b.addEventListener("click", () => vai(b.dataset.vai === "settimana" && ricorda.leggi("piano") === "schede" ? "schede" : b.dataset.vai));
let larghezza = 0;
new ResizeObserver(([e]) => {
  const w = Math.round(e.contentRect.width);
  if (w !== larghezza) { larghezza = w; if (stato.vista === "analisi") programmaRender(); }
}).observe($("vista"));
// A mezzanotte "oggi" cambia: ridisegno quando la pagina torna visibile.
document.addEventListener("visibilitychange", () => { if (!document.hidden) programmaRender(); });

// Registrazione dal vivo rimasta a metà dall'ultima volta.
leggiBozza().then((b) => { if (b?.rec?.inizio) { stato.interrotta = b; programmaRender(); } });

// App Android: confronto la versione installata (versione.json nell'app) con quella pubblicata sul sito.
if (nativo()) (async () => {
  try {
    const qui = await (await fetch("versione.json")).json();
    const sito = await (await fetch("https://simo646.github.io/allenamento/android/versione.json", { cache: "no-store" })).json();
    // Il collegamento si accetta solo se porta alla pagina dell'app sul sito (mai un indirizzo qualsiasi letto dalla rete).
    const pagina = "https://simo646.github.io/allenamento/android/";
    if (Number(sito.codice) > Number(qui.codice)) { stato.aggiornamento = { versione: String(sito.versione).slice(0, 20), pagina }; programmaRender(); }
  } catch { /* senza rete si controlla la prossima volta */ }
})();

vai("oggi");
avvia();
