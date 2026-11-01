// Piano › Schede: l'elenco delle schede e la vista di lettura di una scheda, compatta come un foglio da palestra,
// con Registra, Modifica e Duplica. L'editor sta in settimana.js.
import { stato, registraVista, vai, testata, iconaTipo, nomeTipo, attive, chipZona, intervalloZona } from "./stato.js";
import { GIORNI, NOMI_GIORNI, CARDIO, durataHiit, durataForza, riassuntoSerie, ultimaVolta, giornoDi } from "./dati.js";
import { TIPI } from "./analisi-file.js";
import { el, metti, oggi, fmtGiorno, fmtData, ricorda } from "./util.js";
import { apriDettaglio, metriche } from "./dettaglio.js";

const fmtRec = (s) => (s < 60 ? `${s}"` : `${String(s / 60).replace(".", ",")}'`);

// Le due parti del Piano, in cima a entrambe; l'ultima scelta resta per la prossima volta.
export function sceltaPiano(attiva) {
  return el("div", { class: "seg", role: "group", "aria-label": "Parte del piano" },
    [["settimana", "Settimana"], ["schede", "Schede"]].map(([v, t]) =>
      el("button", { type: "button", "aria-pressed": String(attiva === v), onclick: () => { ricorda.scrivi("piano", v); vai(v); } }, t)));
}

export function riassuntoScheda(s) {
  if (s.tipo === "Forza") return `${s.esercizi?.length ?? 0} esercizi · ${(s.esercizi ?? []).reduce((a, e) => a + (e.serie?.length ?? 0), 0)} serie · circa ${durataForza(s)} min`;
  if (s.tipo === "HIIT") return `${s.esercizi?.length ?? 0} esercizi · ${s.giri} giri · circa ${durataHiit(s)} min`;
  return [nomeTipo(s.tipo, s.sottotipo), s.durata_min ? `${s.durata_min} min` : null, s.km ? `${String(s.km).replace(".", ",")} km` : null, s.zona ? `Z${s.zona}` : null].filter(Boolean).join(" · ");
}

// Contenuto compatto di una scheda (nel programma di oggi e durante la registrazione): serie e carichi per la forza,
// tempi ed esercizi per l'HIIT.
export function contenutoScheda(s) {
  if (s.tipo === "Forza") return el("ul", { class: "lista-scheda" }, (s.esercizi ?? []).map((e) =>
    el("li", {}, el("b", {}, e.nome), el("span", { class: "num" }, riassuntoSerie(e.serie, e.unita)))));
  if (s.tipo === "HIIT") return el("div", { style: "display:grid;gap:6px" },
    el("span", { class: "num" }, `${s.lavoro_s}" lavoro · ${s.pausa_s}" pausa · ${s.giri} giri · ${s.recupero_giri_s}" tra i giri · circa ${durataHiit(s)} min`),
    el("ul", { class: "lista-scheda" }, (s.esercizi ?? []).map((e, i) => el("li", {}, el("b", {}, `${i + 1}. ${e.nome}`)))));
  return null;
}

export const giorniDellaScheda = (id) => GIORNI.filter((g) => (stato.settimana[g] ?? []).some((v) => v.scheda === id));
const ultimaSessione = (id) => stato.sessioni.filter((s) => s.scheda === id).sort((a, b) => (b.data + (b.inizio ?? "")).localeCompare(a.data + (a.inizio ?? "")))[0];
const elencoGiorni = (giorni) => {
  const n = giorni.map((g) => NOMI_GIORNI[g].toLowerCase());
  return n.length > 1 ? `${n.slice(0, -1).join(", ")} e ${n[n.length - 1]}` : n[0];
};

// Da una scheda si va a Registra sessione con attività e scheda già scelte: si parte quando si è pronti.
export function iniziaScheda(id) { if (stato.schede[id]) vai("dal-vivo", { scheda: id }); }

/* ---------- elenco ---------- */
registraVista("schede", { vivo: true, render(main) {
  const schede = Object.values(stato.schede).sort((a, b) => TIPI.indexOf(a.tipo) - TIPI.indexOf(b.tipo) || (a.titolo ?? "").localeCompare(b.titolo ?? ""));
  const gruppi = [["Forza", (s) => s.tipo === "Forza"], ["HIIT", (s) => s.tipo === "HIIT"], ["Cardio", (s) => CARDIO.includes(s.tipo)], ["Altre", (s) => !TIPI.includes(s.tipo)]];
  const nuove = [["Forza", "+ Forza"], ["HIIT", "+ HIIT"], ["Corsa", "+ Cardio"]]
    .filter(([t]) => (t === "Corsa" ? CARDIO.some((c) => attive().includes(c)) : attive().includes(t)));
  metti(main,
    testata({ titolo: "Piano" }),
    sceltaPiano("schede"),
    schede.length
      ? gruppi.map(([nome, filtro]) => {
        const lista = schede.filter(filtro);
        return lista.length ? el("section", { class: "card", style: "gap:0" }, el("h2", { style: "margin-bottom:4px" }, nome), lista.map(rigaScheda)) : null;
      })
      : el("section", { class: "card" }, el("p", { class: "vuoto" }, "Nessuna scheda. Creane una per avere esercizi, serie e carichi pronti quando ti alleni.")),
    el("div", { class: "azioni" }, nuove.map(([t, testo]) => el("button", { type: "button", class: "btn", onclick: () => vai("scheda", { nuova: t }) }, testo))));
} });

function rigaScheda(s) {
  const giorni = giorniDellaScheda(s.id);
  const ultima = ultimaSessione(s.id);
  const quando = [giorni.length ? giorni.map((g) => NOMI_GIORNI[g].slice(0, 3)).join(", ") : "Non in settimana", ultima ? "ultima " + fmtData(ultima.data, { day: "numeric", month: "short" }) : null].filter(Boolean).join(" · ");
  return el("button", { type: "button", class: "scheda-riga", onclick: () => vai("scheda-vista", { id: s.id }) },
    iconaTipo(s.tipo),
    el("span", { class: "voce-testo" }, el("b", {}, s.titolo || nomeTipo(s.tipo)), el("span", {}, riassuntoScheda(s)), el("span", {}, quando)),
    el("span", { class: "freccia", "aria-hidden": "true" }, "›"));
}

/* ---------- vista di lettura ---------- */
registraVista("scheda-vista", { vivo: true, render(main, { id }) {
  const s = stato.schede[id];
  const torna = () => vai("schede");
  if (!s) return metti(main, testata({ titolo: "Scheda", sopra: "Piano", indietro: torna }), el("p", { class: "vuoto" }, "Questa scheda non c'è più."));
  const giorni = giorniDellaScheda(id);
  const ultima = ultimaSessione(id);
  const forza = s.tipo === "Forza", hiit = s.tipo === "HIIT";

  const campi = forza ? [["Esercizi", String(s.esercizi?.length ?? 0), ""], ["Serie", String((s.esercizi ?? []).reduce((a, e) => a + (e.serie?.length ?? 0), 0)), ""], ["Durata", `${durataForza(s)}`, "min"]]
    : hiit ? [["Esercizi", String(s.esercizi?.length ?? 0), ""], ["Giri", String(s.giri), ""], ["Durata", `${durataHiit(s)}`, "min"]]
    : [["Durata", s.durata_min ? String(s.durata_min) : "—", s.durata_min ? "min" : ""], ["Distanza", s.km ? String(s.km).replace(".", ",") : "—", s.km ? "km" : ""], ["Zona", s.zona ? `Z${s.zona}` : "—", ""]];

  const programma = el("section", { class: "card" },
    el("div", { class: "tiles" }, campi.map(([k, v, u]) => el("div", { class: "tile" }, el("small", {}, k), el("b", {}, v, u ? el("em", {}, u) : null)))),
    el("p", {}, giorni.length ? `In programma ${elencoGiorni(giorni)}. ` : "Non è in nessun giorno della settimana. ",
      el("button", { type: "button", class: "lnk", onclick: () => vai("voce", { giorno: giornoDi(oggi()), preset: { tipo: s.tipo, sottotipo: s.sottotipo ?? null, scheda: id } }) },
        giorni.length ? "Aggiungi un giorno" : "Aggiungila")),
    ultima ? el("p", {}, `Ultima volta ${fmtGiorno(ultima.data)}: `, el("button", { type: "button", class: "lnk", onclick: () => apriDettaglio(ultima.id) }, metriche(ultima))) : null,
    s.nota ? el("p", { class: "nota-scheda" }, s.nota) : null);

  let contenuto;
  if (forza) {
    contenuto = el("section", { class: "card" }, el("h2", {}, "Esercizi"),
      el("ol", { class: "foglio-scheda" }, (s.esercizi ?? []).map((e, i) => {
        const u = ultimaVolta(stato.sessioni, e.nome, "9999-12-31");
        return el("li", {},
          el("span", { class: "n" }, String(i + 1)),
          el("b", {}, e.nome),
          el("span", { class: "serie num" }, riassuntoSerie(e.serie, e.unita) || "—", e.recupero_s ? el("em", {}, "rec. " + fmtRec(e.recupero_s)) : null),
          e.nota ? el("small", {}, e.nota) : null,
          u ? el("small", { class: "num" }, `Ultima volta ${fmtData(u.data, { day: "numeric", month: "short" })}: ${riassuntoSerie(u.serie, u.unita)}`) : null);
      })));
  } else if (hiit) {
    contenuto = el("section", { class: "card" }, el("h2", {}, "Esercizi del giro"),
      el("p", { class: "sotto num" }, `${s.lavoro_s}" per esercizio e ${s.pausa_s}" di pausa tra uno e l'altro, ${s.giri} giri, ${s.recupero_giri_s}" di pausa tra un giro e l'altro.`),
      el("ol", { class: "foglio-scheda" }, (s.esercizi ?? []).map((e, i) => el("li", {}, el("span", { class: "n" }, String(i + 1)), el("b", {}, e.nome)))));
  } else {
    contenuto = el("section", { class: "card" }, el("h2", {}, "Obiettivo"),
      el("p", {}, [nomeTipo(s.tipo, s.sottotipo), s.durata_min ? `${s.durata_min} minuti` : null, s.km ? `${String(s.km).replace(".", ",")} km` : null].filter(Boolean).join(", ") + "."),
      s.zona ? el("div", { style: "display:flex;gap:8px;align-items:center" }, el("span", {}, "Zona obiettivo"), chipZona(s.zona), el("span", { class: "sotto" }, `${intervalloZona(s.zona - 1)} bpm`)) : null);
  }

  const duplica = () => vai("scheda", { nuova: s.tipo, copia: true, bozza: { ...structuredClone(s), id: undefined, titolo: `${s.titolo || nomeTipo(s.tipo)} (copia)` } });
  metti(main,
    testata({ titolo: s.titolo || nomeTipo(s.tipo), sopra: forza || hiit ? s.tipo : "Cardio · " + nomeTipo(s.tipo, s.sottotipo), indietro: torna }),
    el("div", { class: "azioni-scheda" },
      el("button", { type: "button", class: "btn primario", onclick: () => iniziaScheda(id) }, "Registra"),
      el("button", { type: "button", class: "btn", onclick: () => vai("scheda", { id }) }, "Modifica"),
      el("button", { type: "button", class: "btn", onclick: duplica }, "Duplica")),
    programma,
    contenuto);
} });
