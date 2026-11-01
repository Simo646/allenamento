// Piano › Settimana (lunedì-domenica), le voci dei giorni e l'editor delle schede. L'elenco e la vista di lettura
// delle schede stanno in schede.js.
import { stato, registraVista, vai, rivai, testata, salvaSettimana, iconaTipo, nomeTipo, attive, descriviVoce, intervalloZona } from "./stato.js";
import { GIORNI, NOMI_GIORNI, ESERCIZI, CARDIO, nuovaScheda, durataHiit, durataForza, statoVoci, spostaVoce, idCasuale, tutteUguali } from "./dati.js";
import { SOTTOTIPI_BICI } from "./analisi-file.js";
import { el, metti, icona, ICONE, oggi, piuGiorni, lunediDi, fmtData, numero, avviso, esito, conConferma, campo, opzione, testoKg } from "./util.js";
import { sceltaPiano } from "./schede.js";

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
  metti(main,
    testata({ titolo: "Piano" }),
    sceltaPiano("settimana"),
    el("p", { class: "sotto" }, "La tua settimana tipo: si ripete ogni settimana. Tocca un'attività per cambiarla o spostarla in un altro giorno."),
    el("section", { class: "card" }, giorni));
} });

/* ---------- una voce della settimana ---------- */
// `preset`: tipo, sottotipo e scheda già scelti (per esempio da "Aggiungila" nella vista di una scheda).
registraVista("voce", { vivo: false, render(main, { giorno, id, preset }) {
  const esistente = id ? (stato.settimana[giorno] ?? []).find((v) => v.id === id) : null;
  const v = { tipo: attive()[0] ?? "Forza", sottotipo: null, scheda: null, durata_min: null, zona: null, nota: "", ...esistente, ...(preset ?? {}) };
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
    testata({ titolo: esistente ? "Modifica attività" : "Nuova attività", sopra: "Piano · settimana", indietro: torna }),
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
  // Si torna da dove si è partiti: la scheda letta, la settimana (scheda nuova per un giorno) o l'elenco.
  const torna = () => (esistente ? vai("scheda-vista", { id: esistente.id }) : param.collega ? vai("settimana") : vai("schede"));
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
    if (pulita.tipo === "HIIT" && !(pulita.lavoro_s >= 5 && pulita.giri >= 1)) return esito(esitoS, "Servono almeno 5 secondi per esercizio e un giro.", "err");
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
      if (param.collega) vai("settimana"); else vai("scheda-vista", { id });
    } catch (e) { esito(esitoS, "Non salvata: " + (e?.message ?? "errore"), "err"); salvaBtn.disabled = false; }
  };
  const elimina = esistente ? conConferma(el("button", { type: "button", class: "btn pericolo" }, "Elimina la scheda"), "Tocca di nuovo per eliminare", async () => {
    await stato.archivio.elimina("schede", esistente.id);
    const s = { ...stato.settimana };
    let cambiata = false;
    for (const g of GIORNI) s[g] = (s[g] ?? []).map((x) => { if (x.scheda !== esistente.id) return x; cambiata = true; return { ...x, scheda: null }; });
    if (cambiata) await salvaSettimana(s);
    avviso("Scheda eliminata");
    vai("schede");
  }) : null;

  metti(main, 
    testata({ titolo: esistente ? "Modifica scheda" : param.copia ? "Copia della scheda" : "Nuova scheda",
      sopra: bozza.tipo === "Forza" || bozza.tipo === "HIIT" ? bozza.tipo : "Cardio", indietro: torna }),
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


// Esercizi di forza. Di solito le serie sono uguali: una riga "serie, ripetizioni, chili". Per piramidi o serie a
// scalare si aprono le serie una per una ("Serie diverse"), e si torna indietro con "Tutte uguali". Ogni esercizio si
// conta in ripetizioni o in secondi (plank, tenute).
function editorForza(b, ridisegna) {
  b.esercizi ??= [];
  const RECUPERI = [30, 45, 60, 90, 120, 150, 180, 240];
  const durata = el("p", { class: "sotto num" });
  const aggiornaDurata = () => (durata.textContent = `Durata stimata: circa ${durataForza(b)} minuti, contando 40" per serie (o i suoi secondi) più il recupero.`);
  aggiornaDurata();
  const schede = b.esercizi.map((e, i) => {
    e.serie ??= [{ kg: null, rip: 10 }];
    e._diverse ??= e.serie.length > 1 && !tutteUguali(e.serie);
    const nome = el("input", { id: `s-e${i}-nome`, list: "elenco-esercizi", value: e.nome ?? "", placeholder: "Scegli o scrivi un esercizio", oninput: (ev) => (e.nome = ev.target.value) });
    const rec = el("select", { id: `s-e${i}-rec`, onchange: (ev) => { e.recupero_s = numero(ev.target.value); aggiornaDurata(); } },
      el("option", { value: "" }, "—"), RECUPERI.map((s) => el("option", { value: s, selected: e.recupero_s === s }, s < 60 ? `${s} s` : `${s / 60} min`.replace(".5", ",5"))));
    const nota = el("input", { id: `s-e${i}-nota`, value: e.nota ?? "", placeholder: "Tecnica, varianti, attrezzo (facoltativa)", oninput: (ev) => (e.nota = ev.target.value) });
    const aTempo = e.unita === "sec", q = aTempo ? "sec" : "rip", nomeQ = aTempo ? "Secondi" : "Ripetizioni";
    const misura = el("div", { class: "seg", role: "radiogroup", "aria-label": "Misura" },
      [["rip", "Ripetizioni"], ["sec", "Secondi"]].map(([u, t]) => opzione(`s-e${i}-unita`, u, t, q === u, () => {
        e.unita = u === "sec" ? "sec" : undefined;
        e.serie = e.serie.map((x) => (u === "sec" ? { kg: x.kg ?? null, sec: x.sec ?? 30 } : { kg: x.kg ?? null, rip: x.rip ?? 10 }));
        ridisegna();
      })));

    let serie;
    if (!e._diverse) {
      const v = { n: e.serie.length, q: e.serie[0]?.[q] ?? null, kg: e.serie[0]?.kg ?? null };
      const applica = () => { e.serie = Array.from({ length: Math.max(1, Math.min(v.n ?? 1, 20)) }, () => ({ kg: v.kg, [q]: v.q })); aggiornaDurata(); };
      serie = [
        el("div", { class: "righe", style: "grid-template-columns:repeat(3,minmax(0,1fr))" },
          campo("Serie", el("input", { id: `s-e${i}-n`, class: "num", inputmode: "numeric", value: v.n, oninput: (ev) => { v.n = numero(ev.target.value) ?? 1; applica(); } })),
          campo(nomeQ, el("input", { id: `s-e${i}-${q}`, class: "num", inputmode: "numeric", value: v.q ?? "", oninput: (ev) => { v.q = numero(ev.target.value); applica(); } })),
          campo("Chili", el("input", { id: `s-e${i}-kg`, class: "num", inputmode: "decimal", value: testoKg(v.kg), placeholder: "corpo libero", oninput: (ev) => { v.kg = numero(ev.target.value); applica(); } }))),
        el("button", { type: "button", class: "lnk", style: "justify-self:start", onclick: () => { e._diverse = true; ridisegna(); } }, "Serie diverse tra loro"),
      ];
    } else {
      serie = [
        el("div", { class: "griglia-scheda" },
          el("span", { class: "intest" }, "Serie"), el("span", { class: "intest" }, "kg"), el("span", { class: "intest" }, nomeQ), el("span"),
          e.serie.map((s, j) => [
            el("span", { class: "n" }, String(j + 1)),
            el("input", { id: `s-e${i}-s${j}-kg`, class: "input num", inputmode: "decimal", value: testoKg(s.kg), placeholder: "corpo libero", "aria-label": `${e.nome || "Esercizio"}, serie ${j + 1}, chili`, oninput: (ev) => (s.kg = numero(ev.target.value)) }),
            el("input", { id: `s-e${i}-s${j}-${q}`, class: "input num", inputmode: "numeric", value: s[q] ?? "", "aria-label": `${e.nome || "Esercizio"}, serie ${j + 1}, ${nomeQ.toLowerCase()}`, oninput: (ev) => { s[q] = numero(ev.target.value); aggiornaDurata(); } }),
            e.serie.length > 1 ? piccoloBtn(`Togli la serie ${j + 1}`, ICONE.chiudi, () => { e.serie.splice(j, 1); ridisegna(); }) : el("span"),
          ])),
        el("div", { class: "azioni" },
          el("button", { type: "button", class: "btn tratteggio piccolo", onclick: () => { const u = e.serie[e.serie.length - 1]; e.serie.push({ kg: u?.kg ?? null, [q]: u?.[q] ?? (aTempo ? 30 : 10) }); ridisegna(); } }, "+ Serie"),
          el("button", { type: "button", class: "lnk", onclick: () => { e.serie = e.serie.map(() => ({ ...e.serie[0] })); e._diverse = false; ridisegna(); } }, "Tutte uguali alla prima")),
      ];
    }
    return el("section", { class: "card esercizio" },
      el("div", { class: "esercizio-testa" }, el("h2", {}, `Esercizio ${i + 1}`),
        el("div", { style: "display:flex" },
          piccoloBtn("Sposta su", ICONE.su, () => { sposta(b.esercizi, i, -1); ridisegna(); }),
          piccoloBtn("Sposta giù", ICONE.giu, () => { sposta(b.esercizi, i, 1); ridisegna(); }),
          piccoloBtn("Togli l'esercizio", ICONE.cestino, () => { b.esercizi.splice(i, 1); ridisegna(); }))),
      el("div", { class: "righe", style: "grid-template-columns:minmax(0,2fr) minmax(0,1fr)" }, campo("Esercizio", nome), campo("Recupero", rec)),
      misura,
      serie,
      campo("Nota dell'esercizio", nota));
  });
  return el("div", { style: "display:grid;gap:14px" }, schede,
    el("button", { type: "button", class: "btn", onclick: () => { b.esercizi.push({ nome: "", recupero_s: 90, serie: [{ kg: null, rip: 10 }, { kg: null, rip: 10 }, { kg: null, rip: 10 }] }); ridisegna(); } }, "+ Aggiungi esercizio"),
    durata,
    el("p", { class: "sotto" }, "I chili qui sono il punto di partenza. Quando registri, l'app ti propone i carichi dell'ultima volta."));
}

// HIIT: i tempi del timer e gli esercizi del giro (quanti sono = esercizi per giro), uguali in ogni giro.
function editorHiit(b, ridisegna) {
  b.esercizi ??= [];
  if (!b.esercizi.length) b.esercizi.push({ nome: "" });
  const durata = el("p", { class: "sotto num" });
  const aggiornaDurata = () => (durata.textContent = `Durata: circa ${durataHiit(b)} minuti.`);
  aggiornaDurata();
  const num = (k, etichetta, id) => campo(etichetta, el("input", { id, class: "num", inputmode: "numeric", value: b[k] ?? "", oninput: (e) => { b[k] = numero(e.target.value) ?? 0; aggiornaDurata(); } }));
  const quanti = campo("Esercizi per giro", el("input", { id: "s-quanti", class: "num", inputmode: "numeric", value: b.esercizi.length, onchange: (e) => {
    const n = Math.max(1, Math.min(30, Math.round(numero(e.target.value) ?? 1)));
    while (b.esercizi.length < n) b.esercizi.push({ nome: "" });
    b.esercizi.length = n;
    ridisegna();
  } }));
  return el("div", { style: "display:grid;gap:14px" },
    el("section", { class: "card modulo" }, el("h2", {}, "Timer"),
      el("div", { class: "righe", style: "align-items:end" }, num("lavoro_s", "Durata esercizio (s)", "s-lavoro"), quanti, num("pausa_s", "Pausa tra gli esercizi (s)", "s-pausa"),
        num("giri", "Giri", "s-giri"), num("recupero_giri_s", "Pausa tra i giri (s)", "s-recgiri")),
      durata),
    el("section", { class: "card modulo" }, el("h2", {}, "Esercizi del giro"),
      el("p", { class: "sotto" }, "In quest'ordine in ogni giro. Durante il timer vedi quello in corso e il successivo; quelli senza nome hanno solo il numero."),
      b.esercizi.map((e, i) => el("div", { style: "display:flex;gap:6px;align-items:center" },
        el("span", { class: "num", style: "width:20px;font-weight:700;text-align:center" }, String(i + 1)),
        el("input", { id: `s-h${i}`, class: "input", list: "elenco-esercizi", value: e.nome ?? "", placeholder: `Esercizio ${i + 1}`, "aria-label": `Esercizio ${i + 1}`, oninput: (ev) => (e.nome = ev.target.value) }),
        piccoloBtn("Sposta su", ICONE.su, () => { sposta(b.esercizi, i, -1); ridisegna(); }),
        b.esercizi.length > 1 ? piccoloBtn("Togli", ICONE.chiudi, () => { b.esercizi.splice(i, 1); ridisegna(); }) : null)),
      el("button", { type: "button", class: "btn tratteggio piccolo", style: "justify-self:start", onclick: () => { b.esercizi.push({ nome: "" }); ridisegna(); } }, "+ Aggiungi esercizio")));
}

function editorCardio(b, ridisegna) {
  const tipi = CARDIO.filter((t) => attive().includes(t) || t === b.tipo);
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
  if (out.tipo === "Forza") out.esercizi = (b.esercizi ?? []).filter((e) => e.nome?.trim()).map((e) => {
    const aTempo = e.unita === "sec";
    return { nome: e.nome.trim(), recupero_s: e.recupero_s ?? null, ...(aTempo ? { unita: "sec" } : {}), ...(e.nota?.trim() ? { nota: e.nota.trim() } : {}),
      serie: (e.serie ?? []).filter((s) => s.kg || (aTempo ? s.sec : s.rip)).map((s) => (aTempo ? { kg: s.kg ?? null, sec: s.sec ?? null } : { kg: s.kg ?? null, rip: s.rip ?? null })) };
  });
  if (out.tipo === "HIIT") out.esercizi = (b.esercizi ?? []).map((e, i) => ({ nome: e.nome?.trim() || `Esercizio ${i + 1}` }));
  return out;
}
