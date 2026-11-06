// Un allenamento: riga negli elenchi e foglio di dettaglio (numeri, traccia, curve, zone, serie, modifica).
import { stato, limiti, ZONE, intervalloZona, coloreTipo, nomeTipo, attive, vai } from "./stato.js";
import { SOTTOTIPI_BICI, volume, massimale, trovaVuoti, salitaDaCurvaGps, gpxDa } from "./analisi-file.js";
import { salvaFile } from "./sorgenti.js";
import { $, el, metti, icona, ICONE, fmtData, fmtDataLunga, fmtNum, fmtDur, fmtOre, fmtPasso, fmtKg, numero, avviso, esito, conConferma, somma, campo } from "./util.js";
import { COLORE_ZONA, graficoTraccia, graficoCurva, graficoTempo, creaCursore } from "./grafici.js";
import { leggiMappa, scaricaMappa, eliminaMappa, mappeAttive, quotaDalTerreno } from "./mappe.js";
import { testoSerie, CARDIO } from "./dati.js";
import { recordDi } from "./record.js";
import { caricoSessione, FATICA } from "./carico.js";

export const zoneDi = (s) => [s.z1_min, s.z2_min, s.z3_min, s.z4_min, s.z5_min];
export const haZone = (s) => zoneDi(s).some((z) => z != null);
export const perData = (a, b) => (b.data + (b.inizio ?? "")).localeCompare(a.data + (a.inizio ?? ""));
export const conPasso = (t) => ["Corsa", "Camminata", "Trekking"].includes(t);
export const volumeSessione = (s) => (s.esercizi ?? []).reduce((a, e) => a + volume(e.serie), 0);

export function metriche(s) {
  const p = [fmtDur(s.durata_min)];
  if (s.km != null) p.push(fmtNum(s.km, 2) + " km");
  if (s.salita_m) p.push("↑ " + fmtNum(s.salita_m) + " m");
  if (s.tipo === "Bici" && s.vel_media) p.push(fmtNum(s.vel_media, 1) + " km/h");
  if (conPasso(s.tipo) && s.km > 0 && s.durata_min) p.push(fmtPasso(s.km, s.durata_min) + " /km");
  if (s.fc_media != null) p.push(`FC ${s.fc_media}${s.fc_max != null ? "/" + s.fc_max : ""}`);
  if (s.hiit) p.push(`${s.hiit.giri_fatti ?? s.hiit.giri} giri × ${s.hiit.esercizi?.length ?? 0} esercizi`);
  if (s.esercizi?.length) {
    p.push(`${s.esercizi.length} esercizi`);
    const v = volumeSessione(s);
    if (v) p.push(fmtNum(v) + " kg");
  }
  return p.join(" · ");
}

export function barraZone(s) {
  const z = zoneDi(s).map((x) => x ?? 0);
  const tot = z.reduce((a, b) => a + b, 0);
  if (!tot) return null;
  return el("div", { class: "barra-zone", "aria-label": "Tempo in zona: " + z.map((m, i) => `${ZONE[i]} ${fmtNum(m)} min`).join(", ") },
    z.map((m, i) => (m > 0 ? el("i", { style: `width:${(m / tot) * 100}%;background:${COLORE_ZONA[i]}`, title: `${ZONE[i]} ${fmtNum(m, 1)} min` }) : null)));
}

export function voceSessione(s) {
  return el("button", { type: "button", class: "voce", onclick: () => apriDettaglio(s.id) },
    el("div", { class: "giorno" }, el("b", {}, fmtData(s.data, { day: "numeric" })), fmtData(s.data, { weekday: "short" })),
    el("div", { style: "min-width:0" },
      el("div", { class: "testa" }, el("i", { class: "dot", style: `background:${coloreTipo(s.tipo)}` }), el("span", {}, s.nome || nomeTipo(s.tipo, s.sottotipo)),
        s.nome ? el("em", {}, nomeTipo(s.tipo, s.sottotipo)) : null),
      el("div", { class: "metriche num" }, metriche(s)),
      barraZone(s)));
}

const CAMPI_MODIFICABILI = [["durata_min", "Durata (min)"], ["km", "Km"], ["salita_m", "Salita (m)"], ["fc_media", "FC media"], ["fc_max", "FC massima"]];

// Dislivello e curva della quota dalle quote del terreno lungo la traccia (serve la rete; si spegne insieme alle mappe),
// una volta sola: per le registrazioni dell'app fatte senza barometro e per i file senza quota.
export const daCorreggere = (s) => CARDIO.includes(s?.tipo) && (s.fonte === "Registrata con l'app" ? s.salita_da === "gps" || s.salita_da == null
  : /^File/.test(s.fonte ?? "") && s.salita_m == null && s.km > 0); // per esempio i TCX di Mi Fitness
export async function correggiDislivello(s) {
  if (!daCorreggere(s) || !mappeAttive()) return null;
  const d = (await stato.archivio.leggi("dettagli", s.id)) ?? {};
  const c = await quotaDalTerreno(d.traccia, { bici: s.tipo === "Bici", passo: d.curve?.passo_s ?? 15 });
  if (c?.salita_m == null) return null;
  await stato.archivio.scrivi("dettagli", s.id, { ...d, curve: { ...(d.curve ?? {}), passo_s: d.curve?.passo_s ?? 15, quota: c.quota } });
  await stato.archivio.scrivi("sessioni", s.id, { ...s, salita_m: c.salita_m, salita_da: "terreno" });
  return c.salita_m;
}

export function apriDettaglio(id) {
  const s = stato.sessioni.find((x) => x.id === id);
  if (!s) return;
  const velo = $("velo");
  const chiudi = () => { velo.hidden = true; velo.replaceChildren(); document.removeEventListener("keydown", esc); };
  const esc = (e) => { if (e.key === "Escape") chiudi(); };
  document.addEventListener("keydown", esc);
  velo.onclick = (e) => { if (e.target === velo) chiudi(); };
  const lim = limiti();

  const campi = [
    ["Durata", s.durata_min != null ? fmtOre(s.durata_min) : null, "h"],
    ["Distanza", s.km != null ? fmtNum(s.km, 2) : null, "km"],
    ["Salita", s.salita_m ? fmtNum(s.salita_m) : null, "m"],
    s.tipo === "Bici" ? ["Velocità media", s.vel_media ? fmtNum(s.vel_media, 1) : null, "km/h"] : null,
    conPasso(s.tipo) ? ["Passo medio", s.km > 0 && s.durata_min ? fmtPasso(s.km, s.durata_min) : null, "/km"] : null,
    ["FC media", s.fc_media, "bpm"], ["FC massima", s.fc_max, "bpm"],
    ["Cadenza", s.cadenza_media, s.tipo === "Corsa" ? "ppm" : "rpm"],
    ["Potenza media", s.potenza_media, "W"], ["Potenza normalizzata", s.potenza_np, "W"],
    ["Calorie", s.calorie, "kcal"], ["Temperatura", s.temp_media, "°C"], ["Variabilità (RMSSD)", s.rmssd_ms, "ms"],
    s.esercizi?.length ? ["Volume", fmtNum(volumeSessione(s)), "kg"] : null,
    (() => { const c = caricoSessione(s); return c.carico ? [c.da === "stima" ? "Carico (stima)" : "Carico", fmtNum(c.carico), "pt"] : null; })(),
  ].filter((c) => c && c[1] != null);
  // Griglia senza buchi: l'ultimo campo si allarga sulle colonne rimaste vuote.
  const colonne = campi.length === 4 ? 2 : Math.min(3, campi.length);
  const avanzo = campi.length % colonne;
  const riquadri = campi.length ? el("div", { class: "tiles riquadri", style: `grid-template-columns:repeat(${colonne},minmax(0,1fr))` },
    campi.map(([k, v, u], i) => el("div", { class: "tile", style: avanzo && i === campi.length - 1 ? `grid-column:span ${colonne - avanzo + 1}` : null },
      el("small", {}, k), el("b", {}, String(v), el("em", {}, u))))) : null;

  let zoneBox = null;
  if (haZone(s)) {
    const z = zoneDi(s), tot = z.reduce((a, b) => a + (b ?? 0), 0);
    zoneBox = el("section", { class: "card" }, el("h2", {}, "Tempo in zona"), barraZone(s),
      el("div", { class: "tabella" }, el("table", {},
        el("thead", {}, el("tr", {}, el("th", {}, "Zona"), el("th", {}, "bpm"), el("th", {}, "Minuti"), el("th", {}, "Quota"))),
        el("tbody", {}, z.map((m, i) => el("tr", {},
          el("td", {}, el("span", { style: "display:inline-flex;align-items:center;gap:6px" }, el("i", { class: "dot", style: `background:${COLORE_ZONA[i]}` }), ZONE[i])),
          el("td", {}, intervalloZona(i, lim)), el("td", {}, fmtNum(m ?? 0, 1)), el("td", {}, tot ? fmtNum(((m ?? 0) / tot) * 100) + "%" : "—")))))));
  }

  const esercizi = s.esercizi?.length ? el("section", { class: "card" },
    el("div", { class: "card-testa" }, el("h2", {}, "Esercizi"), el("button", { type: "button", class: "lnk", onclick: () => { chiudi(); vai("registra", { tipo: "forza", id: s.id }); } }, "Modifica le serie")),
    el("div", { class: "tabella" }, el("table", {},
      el("thead", {}, el("tr", {}, el("th", {}, "Esercizio"), el("th", {}, "Serie"), el("th", {}, "Volume"), el("th", {}, "Massimale stimato"))),
      el("tbody", {}, s.esercizi.map((e) => el("tr", {},
        el("td", {}, e.nome),
        el("td", { style: "white-space:normal" }, (e.serie ?? []).map((x) => testoSerie(x, e.unita)).join(" · ") || "—"),
        el("td", {}, volume(e.serie) ? fmtNum(volume(e.serie)) + " kg" : "—"),
        el("td", {}, massimale(e.serie) ? fmtKg(massimale(e.serie)) + " kg" : "—")))))),
    el("p", { class: "sotto" }, "Massimale stimato con la formula di Epley, dalla serie migliore.")) : null;

  // HIIT registrato col timer: tempi, giri fatti ed esercizi del giro.
  const h = s.hiit;
  const timer = h ? el("section", { class: "card" }, el("h2", {}, "Timer HIIT"),
    el("p", { class: "num" }, `${h.giri_fatti ?? h.giri} giri su ${h.giri} · ${h.lavoro_s}" per esercizio · ${h.pausa_s}" di pausa · ${h.recupero_giri_s}" tra i giri`),
    el("ol", { class: "foglio-scheda" }, (h.esercizi ?? []).map((nome, i) => el("li", {}, el("span", { class: "n" }, String(i + 1)), el("b", {}, nome))))) : null;

  // Modifica
  const nome = el("input", { id: "d-nome", value: s.nome ?? "", placeholder: nomeTipo(s.tipo, s.sottotipo) });
  const tipo = el("select", { id: "d-tipo" }, [...new Set([...attive(), s.tipo].filter(Boolean))].map((t) => el("option", { value: t, selected: t === s.tipo }, t)));
  const sottotipo = el("select", { id: "d-sottotipo" }, el("option", { value: "" }, "Non indicato"), SOTTOTIPI_BICI.map((t) => el("option", { value: t, selected: t === s.sottotipo }, t)));
  const campoSotto = campo("Bici", sottotipo);
  campoSotto.hidden = s.tipo !== "Bici";
  tipo.onchange = () => (campoSotto.hidden = tipo.value !== "Bici");
  const nota = el("textarea", { id: "d-nota" });
  nota.value = s.nota ?? "";
  const numeri = Object.fromEntries(CAMPI_MODIFICABILI.map(([k]) => [k, el("input", { id: "d-" + k, type: "text", inputmode: "decimal", value: s[k] ?? "" })]));
  let fatica = s.fatica ?? null;
  const selFatica = sceltaFatica("d-fatica", fatica, (v) => (fatica = v));
  const esitoD = el("span", { class: "esito", role: "status" });
  const salva = el("button", { class: "btn primario", type: "button" }, "Salva le modifiche");
  salva.onclick = async () => {
    salva.disabled = true;
    try {
      const nuovo = { ...s, nome: nome.value.trim(), nota: nota.value.trim(), tipo: tipo.value, sottotipo: tipo.value === "Bici" ? sottotipo.value || null : null,
        ...Object.fromEntries(CAMPI_MODIFICABILI.map(([k]) => [k, numero(numeri[k].value)])), fatica };
      await stato.archivio.scrivi("sessioni", s.id, nuovo);
      esito(esitoD, "Salvato", "ok");
    } catch (e) { esito(esitoD, "Non salvato: " + (e?.message ?? "errore"), "err"); }
    finally { salva.disabled = false; }
  };
  const elimina = conConferma(el("button", { class: "btn pericolo", type: "button" }, "Elimina"), "Tocca di nuovo per eliminare", async () => {
    try {
      await stato.archivio.elimina("sessioni", s.id);
      await stato.archivio.elimina("dettagli", s.id);
      await eliminaMappa(s.id);
      chiudi();
      avviso("Allenamento eliminato");
    } catch (e) { esito(esitoD, "Non eliminato: " + (e?.message ?? "errore"), "err"); }
  });

  const pesanti = el("div", { style: "display:grid;gap:14px" }, el("p", { class: "sotto" }, "Carico traccia e curve…"));
  const foglio = el("div", { class: "foglio", role: "dialog", "aria-modal": "true", "aria-labelledby": "d-titolo" },
    el("div", { class: "foglio-testa" },
      el("div", {}, el("h2", { id: "d-titolo" }, s.nome || nomeTipo(s.tipo, s.sottotipo)), el("p", {}, `${fmtDataLunga(s.data)} · ${nomeTipo(s.tipo, s.sottotipo)}`)),
      el("button", { class: "tondo chiudi", type: "button", "aria-label": "Chiudi", onclick: chiudi }, icona(ICONE.chiudi))),
    recordBox(s), riquadri, pesanti, zoneBox, esercizi, timer,
    el("section", { class: "card modulo" }, el("h2", {}, "Modifica"),
      campo("Nome", nome),
      el("div", { class: "righe" }, campo("Tipo", tipo), campoSotto),
      el("div", { class: "righe" }, CAMPI_MODIFICABILI.map(([k, etichetta]) => campo(etichetta, numeri[k]))),
      campo("Fatica percepita", selFatica, AIUTO_FATICA),
      campo("Nota", nota),
      el("div", { class: "azioni" }, salva, elimina, esitoD),
      s.fonte ? el("p", { class: "fonte" }, s.fonte + (s.file ? ` · ${s.file}` : "")) : null));
  velo.replaceChildren(foglio);
  velo.hidden = false;
  foglio.querySelector(".chiudi").focus();
  // Il riquadro della salita si aggiorna se la salita viene ricalcolata aprendo l'allenamento.
  const tileSalita = [...(riquadri?.children ?? [])].find((t) => t.querySelector("small")?.textContent === "Salita");
  caricaPesanti(s, pesanti, lim, (v) => { const b = tileSalita?.querySelector("b"); if (b?.firstChild) b.firstChild.textContent = fmtNum(v); });
}

// Fatica percepita da 1 a 10 (scala di Borg CR10): serve al carico di allenamento quando il battito non basta.
export const AIUTO_FATICA = "Quanto ti è sembrato duro, da 1 a 10. Serve al carico di allenamento, soprattutto per la forza e senza fascia.";
export const sceltaFatica = (id, valore, cambia) => el("select", { id, onchange: (e) => cambia(e.target.value ? Number(e.target.value) : null) },
  el("option", { value: "" }, "Non indicata"), FATICA.map(([n, t]) => el("option", { value: n, selected: valore === n }, t ? `${n} · ${t}` : String(n))));

// Riquadro dei record personali che questo allenamento detiene ancora.
function recordBox(s) {
  const r = recordDi(stato.sessioni, s.id);
  return r.length ? el("p", { class: "record-badge" }, el("b", {}, r.length > 1 ? "Record personali" : "Record personale"), r.join(" · ")) : null;
}

// Esporta la traccia in GPX (con quota e battito) per Strava, Komoot, Garmin Connect o per mandarla a qualcuno.
function bottoneGpx(s, d) {
  const esitoG = el("span", { class: "esito", role: "status" });
  const b = el("button", { type: "button", class: "btn" }, "Esporta GPX");
  b.onclick = async () => {
    const testo = gpxDa(s, d, s.nome || nomeTipo(s.tipo, s.sottotipo));
    if (!testo) return esito(esitoG, "Traccia non esportabile.", "err");
    b.disabled = true;
    try {
      await salvaFile(`allenamento-${s.data}-${s.tipo.toLowerCase()}.gpx`, testo, { tipo: "application/gpx+xml", titolo: "Esporta la traccia" });
      esito(esitoG, "GPX pronto.", "ok");
    } catch (e) { if (!/cancel|abort/i.test(`${e?.name} ${e?.message}`)) esito(esitoG, "Non esportato: " + (e?.message ?? "errore"), "err"); }
    finally { b.disabled = false; }
  };
  return el("div", { class: "azioni" }, b, esitoG);
}

// Traccia e curve stanno in dettagli/<id> e si scaricano solo aprendo l'allenamento.
async function caricaPesanti(s, box, lim, aggiornaSalita) {
  let d = null;
  try { d = await stato.archivio.leggi("dettagli", s.id); } catch { /* senza dettagli si vede il resto */ }
  d ??= {};
  // Senza barometro il dislivello viene dal terreno (con la rete); altrimenti, per le registrazioni fino alla 1.2.0 che
  // sommavano la quota GPS grezza, dalla curva della quota lisciata.
  if (daCorreggere(s) && mappeAttive()) {
    try {
      const v = await correggiDislivello(s);
      if (v != null) { s = { ...s, salita_m: v, salita_da: "terreno" }; aggiornaSalita(v); d = (await stato.archivio.leggi("dettagli", s.id)) ?? d; }
    } catch { /* senza rete resta quello che c'è */ }
  }
  if (s.fonte === "Registrata con l'app" && s.salita_da == null && d.curve?.quota?.length) {
    const v = salitaDaCurvaGps(d.curve.quota);
    if (v != null) {
      try { await stato.archivio.scrivi("sessioni", s.id, { ...s, salita_m: v, salita_da: "gps" }); s = { ...s, salita_m: v, salita_da: "gps" }; aggiornaSalita(v); }
      catch { /* resta il valore vecchio */ }
    }
  }
  const pezzi = [];
  const grafici = [];
  if (d.traccia?.lat?.length > 1) {
    const g = el("div");
    const nota = el("p", { class: "sotto" }, "Ogni tratto ha il colore della zona del battito. Tocca la traccia per tempo e battito.");
    pezzi.push(el("section", { class: "card card-grafico" }, el("h2", {}, "Traccia"), nota, g, bottoneGpx(s, d)));
    let mappa = await leggiMappa(s.id);
    grafici.push((cur) => graficoTraccia(g, d.traccia, d.curva_fc, lim, mappa, cur));
    // Mappa che manca (allenamento salvato senza rete, o tornato da un backup) o salvata a metà dettaglio prima della
    // 1.4.0: la riscarico e ridisegno.
    if ((!mappa || !mappa.alta) && mappeAttive()) scaricaMappa(s.id, d.traccia, { rifai: !!mappa })
      .then(async (ok) => { const m = ok && g.isConnected ? await leggiMappa(s.id) : null; if (m) { mappa = m; graficoTraccia(g, d.traccia, d.curva_fc, lim, m, cursore); } })
      .catch(() => { if (nota.isConnected) nota.textContent += " La mappa non si è scaricata: riprova con la rete aprendo di nuovo l'allenamento."; });
  }
  // Soste (dispositivo in pausa, nessun dato) e tratti senza fascia, per segnarli sui grafici.
  const vuoti = d.curva_fc ? trovaVuoti(d.curva_fc, { traccia: d.traccia, curve: d.curve }) : [];
  const soste = vuoti.filter((v) => v.tipo === "sosta");
  const senzaFc = vuoti.filter((v) => v.tipo !== "sosta");
  if (d.curva_fc?.fc?.some((v) => v != null)) {
    const g = el("div");
    const nota = [`Media ogni ${d.curva_fc.passo_s} secondi, sulle bande delle tue zone.`];
    if (soste.length) nota.push(`In grigio ${soste.length === 1 ? "la sosta" : `le ${soste.length} soste`} (${fmtDur(somma(soste, (v) => v.a - v.da) / 60)} in tutto): il dispositivo era in pausa e non registrava, il tratteggio ricollega il battito di prima e di dopo.`);
    if (senzaFc.length) nota.push(`"No FC": ${senzaFc.length === 1 ? "un tratto" : `${senzaFc.length} tratti`} senza battito dalla fascia.`);
    pezzi.push(el("section", { class: "card card-grafico" }, el("h2", {}, "Battito"), el("p", { class: "sotto" }, nota.join(" ")), g));
    grafici.push((cur) => graficoCurva(g, d.curva_fc, lim, vuoti, cur));
  }
  const c = d.curve;
  const extra = c ? [
    ["quota", "Quota", "var(--t-trekking)", (v) => `${fmtNum(v)} m`],
    s.tipo === "Bici" || !conPasso(s.tipo) ? ["velocita", "Velocità", "var(--t-bici)", (v) => `${fmtNum(v * 3.6, 1)} km/h`, (v) => `${fmtNum(v * 3.6)} km/h`] : null,
    ["potenza", "Potenza", "var(--t-hiit)", (v) => `${fmtNum(v)} W`],
    ["cadenza", "Cadenza", "var(--t-corsa)", (v) => `${fmtNum(v)}`],
  ].filter((x) => x && c[x[0]]) : [];
  const fonteQuota = { barometro: "Quota dal barometro del telefono.",
    terreno: "Quota del terreno lungo la traccia (Terrain Tiles su AWS, dati EU-DEM e SRTM): la quota misurata mancava o non era affidabile.",
    gps: "Quota dal GPS del telefono: il dislivello è calcolato sulla quota lisciata, perché il GPS in verticale sbaglia di qualche metro." }[s.salita_da];
  for (const [k, nome, colore, formato, formatoAsse] of extra) {
    const g = el("div");
    pezzi.push(el("section", { class: "card card-grafico" }, el("h2", {}, nome), k === "quota" && fonteQuota ? el("p", { class: "sotto" }, fonteQuota) : null, g));
    grafici.push((cur) => graficoTempo(g, { valori: c[k], passo_s: c.passo_s, colore, formato, formatoAsse, nome, vuoti: soste, cursore: cur }));
  }
  if (!pezzi.length) { box.remove(); return; }
  metti(box, ...pezzi);
  // Un cursore comune: toccando un istante su un grafico, gli altri e la mappa mostrano lo stesso istante. Se cambia la
  // larghezza (telefono girato in orizzontale) i grafici si ridisegnano più larghi.
  let cursore = null, larghezza = box.clientWidth;
  const disegna = () => { larghezza = box.clientWidth; cursore = creaCursore(); grafici.forEach((f) => f(cursore)); };
  requestAnimationFrame(disegna);
  new ResizeObserver(() => { if (box.isConnected && Math.abs(box.clientWidth - larghezza) > 8) requestAnimationFrame(disegna); }).observe(box);
}
