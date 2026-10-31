// Settimana tipo (lunedì-domenica), voci dei giorni e schede modificabili.
import { stato, registraVista, vai, rivai, testata, salvaSettimana, iconaTipo, nomeTipo, attive, descriviVoce, ZONE, intervalloZona } from "./stato.js";
import { GIORNI, NOMI_GIORNI, ESERCIZI, nuovaScheda, durataHiit, statoVoci, spostaVoce, idCasuale } from "./dati.js";
import { TIPI, SOTTOTIPI_BICI } from "./analisi-file.js";
import { el, metti, icona, ICONE, oggi, piuGiorni, lunediDi, fmtData, numero, avviso, esito, conConferma } from "./util.js";

const CARDIO = ["Corsa", "Camminata", "Trekking", "Bici"];

/* ---------- Settimana ---------- */
registraVista("settimana", { vivo: true, render(main) {
  const d = oggi(), lun = lunediDi(d);
  const giorni = GIORNI.map((g, i) => {
    const data = piuGiorni(lun, i);
    const voci = statoVoci(stato.settimana[g] ?? [], stato.sessioni.filter((s) => s.data === data));
    return el("div", { class: "giorno-sett" + (data === d ? " oggi" : "") },
      el("h3", {}, NOMI_GIORNI[g], el("span", { class: "num" }, (data === d ? "oggi · " : "") + fmtData(data, { day: "numeric", month: "short" }))),
      voci.length ? voci.map((v) => {
        const { titolo, sotto } = descriviVoce(v);
        return el("button", { type: "button", class: "voce-sett", onclick: () => vai("voce", { giorno: g, id: v.id }) },
          iconaTipo(v.tipo),
          el("span", { class: "voce-testo" }, el("b", {}, titolo), el("span", {}, sotto)),
          v.fatta ? el("span", { class: "fatto-segno" }, icona(ICONE.spunta, { spessore: 2.6 }), "Fatto") : null);
      }) : el("p", { class: "riposo" }, "Riposo"),
      el("button", { type: "button", class: "lnk", style: "justify-self:start", onclick: () => vai("voce", { giorno: g }) }, "+ Aggiungi a " + NOMI_GIORNI[g].toLowerCase()));
  });
  const schede = Object.values(stato.schede).sort((a, b) => TIPI.indexOf(a.tipo) - TIPI.indexOf(b.tipo) || (a.titolo ?? "").localeCompare(b.titolo ?? ""));
  const nuove = [["Forza", "+ Forza"], ["HIIT", "+ HIIT"], ["Corsa", "+ Cardio"]].filter(([t]) => t === "Corsa" ? CARDIO.some((c) => attive().includes(c)) : attive().includes(t));
  metti(main, 
    testata({ titolo: "Settimana" }),
    el("p", { class: "sotto" }, "La tua settimana tipo: si ripete ogni settimana. Tocca un'attività per cambiarla o spostarla in un altro giorno."),
    el("section", { class: "card" }, giorni),
    el("section", { class: "card" },
      el("div", { class: "card-testa" }, el("h2", {}, "Schede"), el("span", { class: "sotto" }, "Esercizi, serie e obiettivi")),
      schede.length ? el("div", {}, schede.map((s) => el("button", { type: "button", class: "scheda-riga", onclick: () => vai("scheda", { id: s.id }) },
        iconaTipo(s.tipo === "Forza" || s.tipo === "HIIT" ? s.tipo : s.tipo),
        el("span", { class: "voce-testo" }, el("b", {}, s.titolo || nomeTipo(s.tipo)), el("span", {}, riassuntoScheda(s))))))
        : el("p", { class: "vuoto" }, "Nessuna scheda. Creane una per avere esercizi, serie e carichi pronti quando ti alleni."),
      el("div", { class: "azioni" }, nuove.map(([t, testo]) => el("button", { type: "button", class: "btn piccolo", onclick: () => vai("scheda", { nuova: t }) }, testo)))));
} });

function riassuntoScheda(s) {
  if (s.tipo === "Forza") return `${s.esercizi?.length ?? 0} esercizi · ${(s.esercizi ?? []).reduce((a, e) => a + (e.serie?.length ?? 0), 0)} serie`;
  if (s.tipo === "HIIT") return `${s.esercizi?.length ?? 0} esercizi · ${s.giri} giri · circa ${durataHiit(s)} min`;
  return [nomeTipo(s.tipo, s.sottotipo), s.durata_min ? `${s.durata_min} min` : null, s.km ? `${s.km} km` : null, s.zona ? `Z${s.zona}` : null].filter(Boolean).join(" · ");
}

/* ---------- una voce della settimana ---------- */
registraVista("voce", { vivo: false, render(main, { giorno, id, dopoScheda }) {
  const esistente = id ? (stato.settimana[giorno] ?? []).find((v) => v.id === id) : null;
  const v = { tipo: attive()[0] ?? "Forza", sottotipo: null, scheda: null, durata_min: null, zona: null, nota: "", ...esistente, ...(dopoScheda ?? {}) };
  const torna = () => vai("settimana");

  const selGiorno = el("select", { id: "v-giorno" }, GIORNI.map((g) => el("option", { value: g, selected: g === giorno }, NOMI_GIORNI[g])));
  const tipi = el("div", { class: "seg", role: "radiogroup", "aria-label": "Tipo" });
  const sotto = el("div", { class: "seg", role: "radiogroup", "aria-label": "Bici" });
  const selScheda = el("select", { id: "v-scheda" });
  const durata = el("input", { id: "v-durata", inputmode: "numeric", value: v.durata_min ?? "", placeholder: "dalla scheda" });
  const zone = el("div", { class: "seg", role: "radiogroup", "aria-label": "Zona obiettivo" });
  const nota = el("textarea", { id: "v-nota", placeholder: "Per esempio: con il cane, in salita, recupero attivo" });
  nota.value = v.nota ?? "";
  const campoSotto = el("fieldset", { class: "campo" }, el("legend", {}, "Bici"), sotto);
  const campoDurata = el("label", { class: "campo" }, el("span", {}, "Durata obiettivo (min)"), durata);
  const campoZona = el("fieldset", { class: "campo" }, el("legend", {}, "Zona obiettivo"), zone);
  const opzione = (gruppo, valore, testo, attivo, onchange) =>
    el("label", {}, el("input", { type: "radio", name: gruppo, value: valore, checked: attivo, onchange }), el("span", {}, testo));

  function aggiorna() {
    tipi.replaceChildren(...attive().map((t) => opzione("v-tipo", t, t, v.tipo === t, () => { v.tipo = t; v.scheda = null; aggiorna(); })));
    sotto.replaceChildren(...["Qualsiasi", ...SOTTOTIPI_BICI].map((t) => opzione("v-sotto", t, t, (v.sottotipo ?? "Qualsiasi") === t, () => { v.sottotipo = t === "Qualsiasi" ? null : t; })));
    campoSotto.hidden = v.tipo !== "Bici";
    const adatte = Object.values(stato.schede).filter((s) => s.tipo === v.tipo || (CARDIO.includes(v.tipo) && CARDIO.includes(s.tipo) && s.tipo === v.tipo));
    selScheda.replaceChildren(el("option", { value: "" }, "Nessuna scheda"),
      ...adatte.map((s) => el("option", { value: s.id, selected: s.id === v.scheda }, s.titolo || nomeTipo(s.tipo))),
      el("option", { value: "+nuova" }, "Crea una nuova scheda…"));
    campoDurata.hidden = v.tipo === "Forza";
    campoZona.hidden = v.tipo === "Forza";
    zone.replaceChildren(...[null, 1, 2, 3, 4, 5].map((z) => opzione("v-zona", String(z), z ? `Z${z} ${intervalloZona(z - 1)}` : "Nessuna", v.zona === z, () => { v.zona = z; })));
  }
  aggiorna();

  const esitoV = el("span", { class: "esito", role: "status" });
  const raccogli = () => ({ id: esistente?.id ?? idCasuale(), tipo: v.tipo, sottotipo: v.tipo === "Bici" ? v.sottotipo : null,
    scheda: selScheda.value && selScheda.value !== "+nuova" ? selScheda.value : null,
    durata_min: v.tipo === "Forza" ? null : numero(durata.value), zona: v.tipo === "Forza" ? null : v.zona, nota: nota.value.trim() });
  async function salva(voce) {
    let s = { ...stato.settimana };
    for (const g of GIORNI) s[g] = [...(s[g] ?? [])];
    const g0 = GIORNI.find((g) => s[g].some((x) => x.id === voce.id));
    if (g0) { s[g0] = s[g0].map((x) => (x.id === voce.id ? voce : x)); if (g0 !== selGiorno.value) s = spostaVoce(s, voce.id, selGiorno.value); }
    else s[selGiorno.value].push(voce);
    await salvaSettimana(s);
  }
  const salvaBtn = el("button", { type: "button", class: "btn primario" }, esistente ? "Salva" : "Aggiungi");
  salvaBtn.onclick = async () => {
    salvaBtn.disabled = true;
    try {
      const voce = raccogli();
      await salva(voce);
      if (selScheda.value === "+nuova") return vai("scheda", { nuova: v.tipo, collega: { giorno: selGiorno.value, id: voce.id } });
      avviso(esistente ? "Settimana aggiornata" : "Aggiunta a " + NOMI_GIORNI[selGiorno.value].toLowerCase());
      torna();
    } catch (e) { esito(esitoV, "Non salvato: " + (e?.message ?? "errore"), "err"); salvaBtn.disabled = false; }
  };
  const elimina = esistente ? conConferma(el("button", { type: "button", class: "btn pericolo" }, "Togli"), "Tocca di nuovo per togliere", async () => {
    const s = { ...stato.settimana };
    for (const g of GIORNI) s[g] = (s[g] ?? []).filter((x) => x.id !== esistente.id);
    await salvaSettimana(s);
    avviso("Tolta dalla settimana");
    torna();
  }) : null;

  metti(main, 
    testata({ titolo: esistente ? "Modifica attività" : "Nuova attività", sopra: "Settimana", indietro: torna }),
    el("section", { class: "card modulo" },
      el("label", { class: "campo" }, el("span", {}, "Giorno"), selGiorno),
      el("fieldset", { class: "campo" }, el("legend", {}, "Attività"), tipi),
      campoSotto,
      el("label", { class: "campo" }, el("span", {}, "Scheda"), selScheda,
        el("small", {}, "La scheda contiene esercizi, serie o obiettivi. Puoi lasciarla vuota.")),
      el("div", { class: "righe" }, campoDurata),
      campoZona,
      el("label", { class: "campo" }, el("span", {}, "Nota"), nota),
      el("div", { class: "azioni" }, salvaBtn, elimina, esitoV)));
} });

/* ---------- editor di una scheda ---------- */
registraVista("scheda", { vivo: false, render(main, param) {
  const esistente = param.id ? stato.schede[param.id] : null;
  const bozza = param.bozza ?? structuredClone(esistente ?? nuovaScheda(param.nuova ?? "Forza"));
  if (!esistente && !param.bozza && CARDIO.includes(bozza.tipo)) bozza.titolo = "";
  const torna = () => vai("settimana");
  const ridisegna = () => rivai("scheda", { ...param, bozza });

  const titolo = el("input", { id: "s-titolo", value: bozza.titolo ?? "", placeholder: bozza.tipo === "Forza" ? "Per esempio: Parte alta" : bozza.tipo === "HIIT" ? "Per esempio: HIIT 25'" : "Per esempio: Fondo lento", oninput: (e) => (bozza.titolo = e.target.value) });
  const nota = el("textarea", { id: "s-nota", placeholder: "Indicazioni da ricordare: tecnica, sostituzioni, sensazioni", oninput: (e) => (bozza.nota = e.target.value) });
  nota.value = bozza.nota ?? "";
  const corpo = bozza.tipo === "Forza" ? editorForza(bozza, ridisegna) : bozza.tipo === "HIIT" ? editorHiit(bozza, ridisegna) : editorCardio(bozza, ridisegna);

  const esitoS = el("span", { class: "esito", role: "status" });
  const salvaBtn = el("button", { type: "button", class: "btn primario" }, "Salva la scheda");
  salvaBtn.onclick = async () => {
    const pulita = pulisci(bozza);
    if (!pulita.titolo) pulita.titolo = bozza.tipo === "Forza" || bozza.tipo === "HIIT" ? bozza.tipo : nomeTipo(pulita.tipo, pulita.sottotipo);
    if ((pulita.tipo === "Forza" || pulita.tipo === "HIIT") && !pulita.esercizi.length) return esito(esitoS, "Aggiungi almeno un esercizio.", "err");
    salvaBtn.disabled = true;
    try {
      const id = esistente?.id ?? `${pulita.tipo.toLowerCase()}-${idCasuale()}`;
      await stato.archivio.scrivi("schede", id, pulita);
      if (param.collega) {
        const s = { ...stato.settimana };
        s[param.collega.giorno] = (s[param.collega.giorno] ?? []).map((x) => (x.id === param.collega.id ? { ...x, scheda: id } : x));
        await salvaSettimana(s);
      }
      avviso("Scheda salvata");
      torna();
    } catch (e) { esito(esitoS, "Non salvata: " + (e?.message ?? "errore"), "err"); salvaBtn.disabled = false; }
  };
  const elimina = esistente ? conConferma(el("button", { type: "button", class: "btn pericolo" }, "Elimina la scheda"), "Tocca di nuovo per eliminare", async () => {
    await stato.archivio.elimina("schede", esistente.id);
    const s = { ...stato.settimana };
    let cambiata = false;
    for (const g of GIORNI) s[g] = (s[g] ?? []).map((x) => { if (x.scheda !== esistente.id) return x; cambiata = true; return { ...x, scheda: null }; });
    if (cambiata) await salvaSettimana(s);
    avviso("Scheda eliminata");
    torna();
  }) : null;

  metti(main, 
    testata({ titolo: esistente ? "Modifica scheda" : "Nuova scheda", sopra: nomeTipo(bozza.tipo === "Forza" || bozza.tipo === "HIIT" ? bozza.tipo : "Cardio"), indietro: torna }),
    el("section", { class: "card modulo" },
      el("label", { class: "campo" }, el("span", {}, "Nome della scheda"), titolo),
      el("label", { class: "campo" }, el("span", {}, "Nota"), nota)),
    corpo,
    el("div", { class: "azioni" }, salvaBtn, elimina, esitoS),
    elencoEsercizi());
} });

// Nomi proposti mentre scrivi: l'elenco di base più quelli che hai già usato.
function elencoEsercizi() {
  const nomi = new Set([...Object.values(ESERCIZI).flat(),
    ...Object.values(stato.schede).flatMap((s) => (s.esercizi ?? []).map((e) => e.nome)),
    ...stato.sessioni.flatMap((s) => (s.esercizi ?? []).map((e) => e.nome))]);
  return el("datalist", { id: "elenco-esercizi" }, [...nomi].filter(Boolean).sort((a, b) => a.localeCompare(b)).map((n) => el("option", { value: n })));
}
const sposta = (lista, i, d) => { const j = i + d; if (j < 0 || j >= lista.length) return; [lista[i], lista[j]] = [lista[j], lista[i]]; };
const piccoloBtn = (etichetta, ic, f) => el("button", { type: "button", class: "togli", "aria-label": etichetta, onclick: f }, icona(ic));

function editorForza(b, ridisegna) {
  b.esercizi ??= [];
  const RECUPERI = [30, 45, 60, 90, 120, 150, 180, 240];
  const schede = b.esercizi.map((e, i) => {
    e.serie ??= [{ kg: null, rip: 10 }];
    const nome = el("input", { id: `s-e${i}-nome`, list: "elenco-esercizi", value: e.nome ?? "", placeholder: "Scegli o scrivi un esercizio", oninput: (ev) => (e.nome = ev.target.value) });
    const rec = el("select", { id: `s-e${i}-rec`, onchange: (ev) => (e.recupero_s = numero(ev.target.value)) },
      el("option", { value: "" }, "—"), RECUPERI.map((s) => el("option", { value: s, selected: e.recupero_s === s }, s < 60 ? `${s} s` : `${s / 60} min`.replace(".5", ",5"))));
    const griglia = el("div", { class: "griglia-scheda" },
      el("span", { class: "intest" }, "Serie"), el("span", { class: "intest" }, "kg"), el("span", { class: "intest" }, "Ripetizioni"), el("span"),
      e.serie.map((s, j) => [
        el("span", { class: "n" }, String(j + 1)),
        el("input", { id: `s-e${i}-s${j}-kg`, class: "input num", inputmode: "decimal", value: s.kg == null ? "" : String(s.kg).replace(".", ","), placeholder: "corpo libero", "aria-label": `${e.nome || "Esercizio"}, serie ${j + 1}, chili`, oninput: (ev) => (s.kg = numero(ev.target.value)) }),
        el("input", { id: `s-e${i}-s${j}-rip`, class: "input num", inputmode: "numeric", value: s.rip ?? "", "aria-label": `${e.nome || "Esercizio"}, serie ${j + 1}, ripetizioni`, oninput: (ev) => (s.rip = numero(ev.target.value)) }),
        piccoloBtn(`Togli la serie ${j + 1}`, ICONE.chiudi, () => { e.serie.splice(j, 1); ridisegna(); }),
      ]));
    return el("section", { class: "card esercizio" },
      el("div", { class: "esercizio-testa" }, el("h2", {}, `Esercizio ${i + 1}`),
        el("div", { style: "display:flex" },
          piccoloBtn("Sposta su", ICONE.su, () => { sposta(b.esercizi, i, -1); ridisegna(); }),
          piccoloBtn("Sposta giù", ICONE.giu, () => { sposta(b.esercizi, i, 1); ridisegna(); }),
          piccoloBtn("Togli l'esercizio", ICONE.cestino, () => { b.esercizi.splice(i, 1); ridisegna(); }))),
      el("div", { class: "righe", style: "grid-template-columns:minmax(0,2fr) minmax(0,1fr)" },
        el("label", { class: "campo" }, el("span", {}, "Esercizio"), nome),
        el("label", { class: "campo" }, el("span", {}, "Recupero"), rec)),
      griglia,
      el("button", { type: "button", class: "btn tratteggio piccolo", style: "justify-self:start", onclick: () => { const u = e.serie[e.serie.length - 1]; e.serie.push({ kg: u?.kg ?? null, rip: u?.rip ?? 10 }); ridisegna(); } }, "+ Aggiungi serie"));
  });
  return el("div", { style: "display:grid;gap:14px" }, schede,
    el("button", { type: "button", class: "btn", onclick: () => { b.esercizi.push({ nome: "", recupero_s: 90, serie: [{ kg: null, rip: 10 }, { kg: null, rip: 10 }, { kg: null, rip: 10 }] }); ridisegna(); } }, "+ Aggiungi esercizio"),
    el("p", { class: "sotto" }, "I chili qui sono il punto di partenza. Quando registri, l'app ti propone i carichi dell'ultima volta."));
}

function editorHiit(b, ridisegna) {
  b.esercizi ??= [];
  const num = (k, etichetta, id) => el("label", { class: "campo" }, el("span", {}, etichetta),
    el("input", { id, inputmode: "numeric", value: b[k] ?? "", oninput: (e) => { b[k] = numero(e.target.value) ?? 0; durata.textContent = `Durata: circa ${durataHiit(b)} minuti.`; } }));
  const durata = el("p", { class: "sotto num" }, `Durata: circa ${durataHiit(b)} minuti.`);
  return el("div", { style: "display:grid;gap:14px" },
    el("section", { class: "card modulo" }, el("h2", {}, "Tempi"),
      el("div", { class: "righe" }, num("lavoro_s", "Lavoro (secondi)", "s-lavoro"), num("pausa_s", "Pausa (secondi)", "s-pausa"), num("giri", "Giri", "s-giri"), num("recupero_giri_s", "Recupero tra i giri (s)", "s-recgiri")),
      durata),
    el("section", { class: "card modulo" }, el("h2", {}, "Esercizi del giro"),
      b.esercizi.map((e, i) => el("div", { style: "display:flex;gap:6px;align-items:center" },
        el("span", { class: "num", style: "width:20px;font-weight:700;text-align:center" }, String(i + 1)),
        el("input", { id: `s-h${i}`, class: "input", list: "elenco-esercizi", value: e.nome ?? "", placeholder: "Scegli o scrivi un esercizio", "aria-label": `Esercizio ${i + 1}`, oninput: (ev) => (e.nome = ev.target.value) }),
        piccoloBtn("Sposta su", ICONE.su, () => { sposta(b.esercizi, i, -1); ridisegna(); }),
        piccoloBtn("Togli", ICONE.chiudi, () => { b.esercizi.splice(i, 1); ridisegna(); }))),
      el("button", { type: "button", class: "btn tratteggio piccolo", style: "justify-self:start", onclick: () => { b.esercizi.push({ nome: "" }); ridisegna(); } }, "+ Aggiungi esercizio")));
}

function editorCardio(b, ridisegna) {
  const tipi = CARDIO.filter((t) => attive().includes(t) || t === b.tipo);
  const opzione = (gruppo, valore, testo, attivo, onchange) => el("label", {}, el("input", { type: "radio", name: gruppo, value: valore, checked: attivo, onchange }), el("span", {}, testo));
  return el("section", { class: "card modulo" },
    el("fieldset", { class: "campo" }, el("legend", {}, "Attività"),
      el("div", { class: "seg" }, tipi.map((t) => opzione("s-tipo", t, t, b.tipo === t, () => { b.tipo = t; if (t !== "Bici") b.sottotipo = null; ridisegna(); })))),
    b.tipo === "Bici" ? el("fieldset", { class: "campo" }, el("legend", {}, "Bici"),
      el("div", { class: "seg" }, ["Qualsiasi", ...SOTTOTIPI_BICI].map((t) => opzione("s-sotto", t, t, (b.sottotipo ?? "Qualsiasi") === t, () => (b.sottotipo = t === "Qualsiasi" ? null : t))))) : null,
    el("div", { class: "righe" },
      el("label", { class: "campo" }, el("span", {}, "Durata (min)"), el("input", { id: "s-durata", inputmode: "numeric", value: b.durata_min ?? "", oninput: (e) => (b.durata_min = numero(e.target.value)) })),
      el("label", { class: "campo" }, el("span", {}, "Distanza (km)"), el("input", { id: "s-km", inputmode: "decimal", value: b.km ?? "", placeholder: "facoltativa", oninput: (e) => (b.km = numero(e.target.value)) }))),
    el("fieldset", { class: "campo" }, el("legend", {}, "Zona obiettivo"),
      el("div", { class: "seg" }, [null, 1, 2, 3, 4, 5].map((z) => opzione("s-zona", String(z), z ? `Z${z} ${intervalloZona(z - 1)}` : "Nessuna", b.zona === z, () => (b.zona = z))))));
}

function pulisci(b) {
  const out = { ...b, titolo: (b.titolo ?? "").trim(), nota: (b.nota ?? "").trim() };
  delete out.id;
  if (out.tipo === "Forza") out.esercizi = (b.esercizi ?? []).filter((e) => e.nome?.trim()).map((e) => ({ nome: e.nome.trim(), recupero_s: e.recupero_s ?? null, serie: (e.serie ?? []).filter((s) => s.rip || s.kg) }));
  if (out.tipo === "HIIT") out.esercizi = (b.esercizi ?? []).filter((e) => e.nome?.trim()).map((e) => ({ nome: e.nome.trim() }));
  return out;
}
