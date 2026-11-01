// Primo avvio guidato, impostazioni (profilo, zone, attività, moduli) e dati (backup, ripristino, cancellazione).
import { stato, registraVista, vai, rivai, testata, salvaProfilo, salvaSettimana, ZONE, coloreTipo, limiti } from "./stato.js";
import { PROFILO_PREDEFINITO, MODELLI_SETTIMANA, settimanaDaModello, etaDa, creaBackup, validaBackup, COLLEZIONI, GIORNI } from "./dati.js";
import { calcolaZone, fcMaxDaEta, zoneDaCurva, validaLimiti, TIPI } from "./analisi-file.js";
import { el, metti, oggi, numero, avviso, esito, conConferma, campo, ricorda } from "./util.js";
import { nativo, condividiFile } from "./sorgenti.js";
import { scartaInterrotta } from "./dal-vivo.js";

const ANNO = new Date().getFullYear();
const numInput = (id, valore, ph, onv) => el("input", { id, inputmode: "numeric", value: valore ?? "", placeholder: ph ?? "", oninput: (e) => onv(numero(e.target.value)) });

/* ---------- blocco zone, comune ad avvio e impostazioni ---------- */
// p: {metodo_zone, anno_nascita, fc_riposo, fc_max_misurata, zone}; restituisce il nodo e una funzione che calcola i limiti.
function bloccoZone(p, alCambio) {
  const box = el("div", { class: "modulo" });
  let manuali = p.metodo_zone === "manuale" && validaLimiti(p.zone) ? [...p.zone] : null;
  const calcola = () => {
    try {
      return { ...calcolaZone({ metodo: p.metodo_zone, eta: etaDa(p.anno_nascita), fcMax: p.fc_max_misurata, fcRiposo: p.fc_riposo, manuali }), errore: null };
    } catch (e) { return { limiti: null, fcMax: null, errore: e.message }; }
  };
  function disegna() {
    const r = calcola();
    if (!manuali && r.limiti) manuali = [...r.limiti];
    const metodi = [["eta", "Dall'età"], ["karvonen", "Con la FC a riposo"], ["manuale", "A mano"]];
    const spiegazione = p.metodo_zone === "eta"
      ? `FC massima ${p.fc_max_misurata ? "misurata" : "stimata con 208 − 0,7 × età"}: ${r.fcMax ?? "—"} bpm. Zone al 60, 70, 80 e 90% della FC massima.`
      : p.metodo_zone === "karvonen" ? `Metodo di Karvonen: percentuali della riserva cardiaca, tra la FC a riposo (${p.fc_riposo ?? "—"}) e la massima (${r.fcMax ?? "—"}). Più preciso se conosci la FC a riposo.`
      : "Scrivi il limite superiore di Z1, Z2, Z3 e Z4, per esempio quelli di un test o del tuo orologio.";
    metti(box, 
      el("div", { class: "seg", role: "group", "aria-label": "Metodo" }, metodi.map(([m, t]) =>
        el("button", { type: "button", "aria-pressed": String(p.metodo_zone === m), onclick: () => { p.metodo_zone = m; if (m !== "manuale") manuali = null; disegna(); alCambio?.(); } }, t))),
      el("p", { class: "sotto" }, spiegazione),
      p.metodo_zone === "manuale" ? el("div", { class: "righe" }, [0, 1, 2, 3].map((i) =>
        campo(`Fine Z${i + 1}`, numInput(`z-lim-${i}`, manuali?.[i], "", (v) => { manuali[i] = v; anteprima(); alCambio?.(); })))) : null,
      el("div", { class: "zone-anteprima", id: "z-anteprima" }));
    anteprima();
  }
  function anteprima() {
    const r = calcola(), a = box.querySelector("#z-anteprima");
    if (!a) return;
    if (!r.limiti) return a.replaceChildren(el("p", { class: "esito err" }, r.errore));
    const l = r.limiti;
    const range = (i) => (i === 0 ? `fino a ${l[0]}` : i === 4 ? `da ${l[3] + 1}${r.fcMax ? " a " + r.fcMax : ""}` : `${l[i - 1] + 1}–${l[i]}`);
    const nomi = ["Recupero", "Fondo, aerobico", "Ritmo", "Soglia", "Massimo"];
    a.replaceChildren(...ZONE.map((z, i) => el("div", {},
      el("span", { class: "chip-zona", style: `background:var(--z${i + 1});color:var(--z${i + 1}-ink)` }, z),
      el("span", {}, el("b", {}, nomi[i]), el("span", { class: "sotto", style: "display:block" }, range(i) + " bpm")))));
  }
  disegna();
  return { nodo: box, calcola };
}

/* ---------- primo avvio ---------- */
let avvio = null;

registraVista("avvio", { vivo: false, render(main) {
  avvio ??= { passo: 0, modello: "equilibrio", p: { ...structuredClone(PROFILO_PREDEFINITO), ...stato.profilo, avvio_completato: false } };
  const { p } = avvio;
  const passi = ["Chi sei", "Le tue zone", "Cosa fai", "La tua settimana"];
  const esitoA = el("p", { class: "esito", role: "status" });
  const avanti = (n) => { avvio.passo = n; rivai("avvio", {}); window.scrollTo({ top: 0 }); };
  let corpo, extra = null, puoiAndare = () => true;

  if (avvio.passo === 0) {
    const eta = el("p", { class: "sotto num" });
    const aggiornaEta = () => { const e = etaDa(p.anno_nascita); eta.textContent = e ? `${e} anni · FC massima stimata ${fcMaxDaEta(e)} bpm` : ""; };
    corpo = [
      el("p", {}, "Questa app ti aiuta a programmare la settimana, registrare forza e uscite e vedere come migliori. Prima, due dati per calcolare le tue zone di battito."),
      campo("Come ti chiami (facoltativo)", el("input", { id: "a-nome", value: p.nome ?? "", autocomplete: "given-name", oninput: (e) => (p.nome = e.target.value.trim()) })),
      el("div", { class: "righe" },
        campo("Anno di nascita *", numInput("a-anno", p.anno_nascita, "1990", (v) => { p.anno_nascita = v; aggiornaEta(); })),
        campo("FC a riposo", numInput("a-riposo", p.fc_riposo, "60", (v) => (p.fc_riposo = v)), "Appena sveglio, sdraiato. Facoltativa."),
        campo("FC massima misurata", numInput("a-max", p.fc_max_misurata, "", (v) => (p.fc_max_misurata = v)), "Solo se l'hai misurata davvero.")),
      eta];
    const esitoB = el("p", { class: "esito", role: "status" });
    const [scegli, importa] = bloccoImporta(esitoB, () => { avvio = null; avviso("Backup importato"); vai("oggi"); });
    extra = el("details", { class: "card" }, el("summary", { style: "cursor:pointer;font-weight:700" }, "Hai già usato l'app? Importa un backup"),
      el("div", { class: "modulo", style: "margin-top:12px" }, el("div", { class: "azioni" }, scegli, importa), esitoB));
    aggiornaEta();
    puoiAndare = () => {
      if (!p.anno_nascita || p.anno_nascita < 1925 || p.anno_nascita > ANNO - 8) return "Scrivi un anno di nascita valido.";
      if (p.fc_riposo != null && (p.fc_riposo < 30 || p.fc_riposo > 110)) return "La FC a riposo deve stare tra 30 e 110.";
      if (p.fc_max_misurata != null && (p.fc_max_misurata < 120 || p.fc_max_misurata > 225)) return "La FC massima deve stare tra 120 e 225.";
      if (p.metodo_zone !== "manuale") p.metodo_zone = p.fc_riposo ? "karvonen" : "eta";
      return true;
    };
  } else if (avvio.passo === 1) {
    const z = bloccoZone(p);
    corpo = [el("p", {}, "Le zone servono per colorare i grafici, misurare il tempo in ogni zona e darti un obiettivo nelle uscite. Puoi cambiarle quando vuoi."), z.nodo];
    puoiAndare = () => { const r = z.calcola(); if (!r.limiti) return r.errore; p.zone = r.limiti; return true; };
  } else if (avvio.passo === 2) {
    corpo = [
      el("p", {}, "Scegli le attività che fai: le altre non compaiono nei menu."),
      sceltaAttivita(p, () => {}),
      el("h2", { style: "font-size:15px;margin-top:6px" }, "Da aggiungere se vuoi"),
      interruttoriModuli(p, () => {})];
    puoiAndare = () => (p.attivita.length ? true : "Scegli almeno un'attività.");
  } else {
    corpo = [
      el("p", {}, "Parti da un modello e poi cambialo come vuoi: giorni, attività, esercizi, serie e carichi."),
      el("div", { style: "display:grid;gap:10px" }, Object.entries(MODELLI_SETTIMANA).map(([k, m]) =>
        el("button", { type: "button", class: "modello", "aria-pressed": String(avvio.modello === k), onclick: () => { avvio.modello = k; rivai("avvio", {}); } },
          el("b", {}, m.nome), el("span", {}, m.descrizione))))];
  }

  const fine = avvio.passo === passi.length - 1;
  const bottoneAvanti = el("button", { type: "button", class: "btn primario" }, fine ? "Inizia" : "Avanti");
  bottoneAvanti.onclick = async () => {
    const ok = puoiAndare();
    if (ok !== true) return esito(esitoA, ok, "err");
    if (!fine) return avanti(avvio.passo + 1);
    bottoneAvanti.disabled = true;
    try {
      const { settimana, schede } = settimanaDaModello(avvio.modello);
      for (const g of GIORNI) settimana[g] = settimana[g].filter((v) => p.attivita.includes(v.tipo));
      for (const [id, s] of Object.entries(schede)) if (!stato.schede[id]) await stato.archivio.scrivi("schede", id, s);
      await salvaSettimana(settimana);
      await salvaProfilo({ ...p, avvio_completato: true });
      avvio = null;
      avviso("Pronto. Buon allenamento!");
      vai("oggi");
    } catch (e) { esito(esitoA, "Non salvato: " + (e?.message ?? "errore"), "err"); bottoneAvanti.disabled = false; }
  };

  metti(main, 
    testata({ titolo: passi[avvio.passo], sopra: `Primo avvio · ${avvio.passo + 1} di ${passi.length}`, destra: el("span") }),
    el("div", { class: "passi", "aria-hidden": "true" }, passi.map((_, i) => el("i", { class: i <= avvio.passo ? "fatto" : "" }))),
    el("section", { class: "card modulo" }, corpo),
    esitoA,
    el("div", { class: "azioni" }, avvio.passo ? el("button", { type: "button", class: "btn", onclick: () => avanti(avvio.passo - 1) }, "Indietro") : null, bottoneAvanti),
    extra);
} });

function sceltaAttivita(p, alCambio) {
  const box = el("div", { class: "seg", role: "group", "aria-label": "Attività" });
  const disegna = () => metti(box, ...TIPI.map((t) => el("button", { type: "button", "aria-pressed": String(p.attivita.includes(t)),
    onclick: () => { p.attivita = p.attivita.includes(t) ? p.attivita.filter((x) => x !== t) : TIPI.filter((x) => x === t || p.attivita.includes(x)); disegna(); alCambio(); } },
    el("i", { class: "dot", style: `background:${coloreTipo(t)}` }), t === "Bici" ? "Bici (strada, gravel, MTB)" : t)));
  disegna();
  return box;
}

function interruttoriModuli(p, alCambio) {
  const voce = (k, titolo, testo) => el("label", { class: "interruttore" },
    el("span", {}, el("b", {}, titolo), el("small", {}, testo)),
    el("input", { type: "checkbox", id: "m-" + k, role: "switch", checked: !!p.moduli[k], onchange: (e) => { p.moduli = { ...p.moduli, [k]: e.target.checked }; alCambio(); } }));
  return el("div", {},
    voce("sonno", "Sonno e recupero", "Ore di sonno e battito notturno: ti avvisa quando è più alto del solito."),
    voce("ossigeno", "Ossigeno nel sonno", "SpO₂ minima, media e massima della notte."),
    voce("peso", "Peso", "Per seguire l'andamento nel tempo."));
}

/* ---------- impostazioni ---------- */
registraVista("impostazioni", { vivo: false, render(main) {
  const p = structuredClone(stato.profilo);
  const torna = () => vai("oggi");

  // Profilo e zone: si salvano insieme col pulsante.
  const esitoP = el("span", { class: "esito", role: "status" });
  const z = bloccoZone(p);
  const salvaP = el("button", { type: "button", class: "btn primario" }, "Salva profilo e zone");
  const ricalcola = el("button", { type: "button", class: "btn" }, "Ricalcola le zone degli allenamenti salvati");
  salvaP.onclick = async () => {
    if (!p.anno_nascita || p.anno_nascita < 1925 || p.anno_nascita > ANNO - 8) return esito(esitoP, "Scrivi un anno di nascita valido.", "err");
    const r = z.calcola();
    if (!r.limiti) return esito(esitoP, r.errore, "err");
    salvaP.disabled = true;
    try {
      const cambiate = JSON.stringify(r.limiti) !== JSON.stringify(stato.profilo.zone);
      await salvaProfilo({ ...stato.profilo, nome: p.nome, anno_nascita: p.anno_nascita, fc_riposo: p.fc_riposo, fc_max_misurata: p.fc_max_misurata, metodo_zone: p.metodo_zone, zone: r.limiti });
      esito(esitoP, cambiate ? "Salvato. Le nuove zone valgono per i prossimi file: puoi ricalcolare anche quelli già salvati." : "Salvato.", "ok");
    } catch (e) { esito(esitoP, "Non salvato: " + (e?.message ?? "errore"), "err"); }
    finally { salvaP.disabled = false; }
  };
  ricalcola.onclick = async () => {
    const lista = stato.sessioni.filter((s) => s.fonte?.startsWith("File"));
    if (!lista.length) return esito(esitoP, "Nessun allenamento importato da file.", "");
    ricalcola.disabled = true;
    let fatti = 0;
    try {
      for (const s of lista) {
        esito(esitoP, `Ricalcolo ${fatti + 1} di ${lista.length}…`);
        const d = await stato.archivio.leggi("dettagli", s.id);
        const zone = zoneDaCurva(d?.curva_fc, limiti());
        if (zone) { await stato.archivio.scrivi("sessioni", s.id, { ...s, ...zone }); fatti++; }
      }
      esito(esitoP, `Zone ricalcolate su ${fatti} allenamenti, dalla curva del battito salvata (approssimata ai 15 secondi).`, "ok");
    } catch (e) { esito(esitoP, `Ricalcolati ${fatti}, poi un errore: ${e?.message ?? "riprova"}.`, "err"); }
    finally { ricalcola.disabled = false; }
  };

  // Attività e moduli: si salvano subito.
  const salvaSubito = async () => { try { await salvaProfilo({ ...stato.profilo, attivita: p.attivita, moduli: p.moduli, recupero: p.recupero }); avviso("Salvato"); } catch (e) { avviso("Non salvato: " + (e?.message ?? "errore")); } };
  const recuperoBox = el("div", { class: "righe" },
    campo("Avviso sopra la media di (bpm)", el("select", { id: "r-scarto", onchange: (e) => { p.recupero = { ...p.recupero, scarto_bpm: Number(e.target.value) }; salvaSubito(); } },
      [2, 3, 4, 5, 6, 8].map((n) => el("option", { value: n, selected: p.recupero.scarto_bpm === n }, `+${n}`)))),
    campo("Media sulle ultime", el("select", { id: "r-notti", onchange: (e) => { p.recupero = { ...p.recupero, notti: Number(e.target.value) }; salvaSubito(); } },
      [7, 14, 28].map((n) => el("option", { value: n, selected: p.recupero.notti === n }, `${n} notti`)))));
  recuperoBox.hidden = !p.moduli.sonno;

  metti(main, 
    testata({ titolo: "Impostazioni", sopra: stato.profilo.nome || "Il tuo profilo", indietro: torna }),
    el("section", { class: "card modulo" }, el("h2", {}, "Profilo"),
      campo("Nome", el("input", { id: "i-nome", value: p.nome ?? "", oninput: (e) => (p.nome = e.target.value.trim()) })),
      el("div", { class: "righe" },
        campo("Anno di nascita", numInput("i-anno", p.anno_nascita, "", (v) => (p.anno_nascita = v))),
        campo("FC a riposo", numInput("i-riposo", p.fc_riposo, "", (v) => (p.fc_riposo = v))),
        campo("FC massima misurata", numInput("i-max", p.fc_max_misurata, "", (v) => (p.fc_max_misurata = v)))),
      el("p", { class: "sotto" }, "Età e FC servono solo per calcolare le zone. Restano nei tuoi dati.")),
    el("section", { class: "card modulo" }, el("h2", {}, "Zone di battito"), z.nodo,
      el("div", { class: "azioni" }, salvaP, esitoP), ricalcola),
    el("section", { class: "card modulo" }, el("h2", {}, "Attività"), sceltaAttivita(p, salvaSubito)),
    el("section", { class: "card modulo" }, el("h2", {}, "Moduli facoltativi"),
      interruttoriModuli(p, () => { recuperoBox.hidden = !p.moduli.sonno; salvaSubito(); }), recuperoBox),
    cardDati());
} });

/* ---------- dati: backup, ripristino, cancellazione ---------- */
// Scelta del file e pulsante di importazione; `dopo` si chiama a importazione finita (dal primo avvio: vai a Oggi).
function bloccoImporta(esitoD, dopo) {
  let daImportare = null;
  const importa = el("button", { type: "button", class: "btn primario", hidden: true }, "Importa il backup");
  const file = el("input", { type: "file", id: "backup-file", accept: ".json,application/json", class: "vh" });
  file.addEventListener("change", async () => {
    importa.hidden = true;
    daImportare = null;
    const f = file.files?.[0];
    if (!f) return;
    try {
      daImportare = validaBackup(await f.text());
      const n = COLLEZIONI.reduce((a, c) => a + daImportare[c].length, 0);
      esito(esitoD, `Backup letto: ${daImportare.sessioni.length} allenamenti, ${daImportare.schede.length} schede, ${n} documenti in tutto. I documenti con lo stesso nome vengono sostituiti, gli altri restano.`);
      importa.hidden = false;
    } catch (e) { esito(esitoD, "File non valido: " + (e?.message ?? "errore"), "err"); }
  });
  conConferma(importa, "Tocca di nuovo per importare", async () => {
    let fatti = 0;
    try {
      for (const c of COLLEZIONI) for (const d of daImportare[c]) { await stato.archivio.scrivi(c, d.id, d); fatti++; }
      if (daImportare.settimana) await salvaSettimana(daImportare.settimana);
      if (daImportare.profilo) await salvaProfilo({ ...daImportare.profilo, avvio_completato: true });
      esito(esitoD, `Importati ${fatti} documenti.`, "ok");
      importa.hidden = true;
      dopo?.();
    } catch (e) { esito(esitoD, `Importati ${fatti}, poi un errore: ${e?.message ?? "riprova"}.`, "err"); }
  });
  return [el("label", { class: "btn", for: "backup-file" }, "Scegli un backup da importare", file), importa];
}

function cardDati() {
  const modo = stato.archivio?.modo;
  const testoModo = modo === "account" ? "I tuoi dati sono salvati nel tuo account claude.ai: li vedi solo tu, dal telefono e dal computer."
    : modo === "browser" ? "I tuoi dati sono salvati in questo browser, su questo dispositivo. Se cancelli i dati del sito li perdi: fai un backup ogni tanto."
    : "Questo browser non permette di salvare (forse è una finestra privata): quello che inserisci si perde alla chiusura. Esporta un backup prima di uscire.";
  const esitoD = el("p", { class: "esito", role: "status" });

  const esporta = el("button", { type: "button", class: "btn" }, "Esporta un backup");
  esporta.onclick = async () => {
    esporta.disabled = true;
    try {
      const dettagli = await stato.archivio.elenco("dettagli");
      const backup = creaBackup({ profilo: stato.profilo, settimana: stato.settimana, schede: Object.values(stato.schede), sessioni: stato.sessioni,
        dettagli, notti: stato.nottiMesi, peso: stato.pesoMesi });
      const testo = JSON.stringify(backup);
      // App Android: il file va nel pannello Condividi (Drive, Dropbox, File…).
      if (nativo()) {
        try { await condividiFile(`allenamento-backup-${oggi()}.json`, testo); esito(esitoD, "Backup pronto: scegli dove salvarlo.", "ok"); }
        catch (e) { esito(esitoD, /cancel/i.test(e?.message ?? "") ? "Backup annullato." : "Backup non riuscito: " + (e?.message ?? "errore"), /cancel/i.test(e?.message ?? "") ? "" : "err"); }
        return;
      }
      const dl = await window.claude?.use?.("downloads");
      if (dl) {
        try { await dl.save({ filename: `allenamento-backup-${oggi()}.json`, data: testo }); esito(esitoD, "Backup salvato.", "ok"); return; }
        catch (e) { if (e?.code === "declined") return esito(esitoD, "Backup annullato."); }
      }
      // Fuori da claude.ai (app installata dal sito) il file si condivide dal telefono o si scarica come su un sito normale.
      if (!window.claude) {
        const nome = `allenamento-backup-${oggi()}.json`;
        const file = new File([testo], nome, { type: "application/json" });
        if (matchMedia("(pointer: coarse)").matches && navigator.canShare?.({ files: [file] })) {
          try { await navigator.share({ files: [file], title: "Backup allenamento" }); esito(esitoD, "Backup pronto: salvalo in File, Drive o Dropbox.", "ok"); return; }
          catch (e) { if (e?.name === "AbortError") return esito(esitoD, "Backup annullato."); }
        }
        const a = el("a", { href: URL.createObjectURL(file), download: nome });
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 10000);
        return esito(esitoD, "Backup scaricato.", "ok");
      }
      try { await navigator.clipboard.writeText(testo); esito(esitoD, "Backup copiato negli appunti: incollalo in un file di testo e salvalo.", "ok"); }
      catch { esito(esitoD, "Non riesco a salvare il file da qui. Prova dal computer.", "err"); }
    } catch (e) { esito(esitoD, "Backup non riuscito: " + (e?.message ?? "errore"), "err"); }
    finally { esporta.disabled = false; }
  };

  const [scegli, importa] = bloccoImporta(esitoD);

  const cancella = conConferma(el("button", { type: "button", class: "btn pericolo" }, "Cancella tutti i dati"), "Tocca di nuovo: cancello tutto", async () => {
    try {
      for (const c of [...COLLEZIONI, "config"]) for (const d of await stato.archivio.elenco(c)) await stato.archivio.elimina(c, d.id);
      // Anche ciò che resta solo su questo dispositivo: registrazione interrotta, bozza della forza, preferenze.
      await scartaInterrotta();
      stato.interrotta = null;
      ricorda.svuota();
      avviso("Dati cancellati");
      vai("avvio");
    } catch (e) { esito(esitoD, "Cancellazione interrotta: " + (e?.message ?? "errore"), "err"); }
  });

  return el("section", { class: "card modulo" }, el("h2", {}, "I tuoi dati"),
    el("p", { class: "sotto" }, testoModo),
    el("div", { class: "azioni" }, esporta, scegli, importa),
    el("p", { class: "sotto" }, "Il backup contiene anche le tracce GPS, che mostrano da dove parti: salvalo in un posto privato e non condividerlo."),
    esitoD,
    el("div", { class: "azioni", style: "border-top:1px solid var(--line);padding-top:12px" }, cancella));
}
