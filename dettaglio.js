// Un allenamento: riga negli elenchi e foglio di dettaglio (numeri, traccia, curve, zone, serie, modifica).
import { stato, limiti, ZONE, intervalloZona, coloreTipo, nomeTipo, attive, vai } from "./stato.js";
import { TIPI, SOTTOTIPI_BICI, volume, massimale } from "./analisi-file.js";
import { $, el, metti, icona, ICONE, fmtData, fmtDataLunga, fmtNum, fmtDur, fmtOre, fmtPasso, fmtKg, numero, avviso, esito, conConferma } from "./util.js";
import { COLORE_ZONA, graficoTraccia, graficoCurva, graficoTempo } from "./grafici.js";

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
  ].filter((c) => c && c[1] != null);
  // Griglia senza buchi, come nel diario: l'ultimo campo si allarga sulle colonne rimaste vuote.
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
        el("td", {}, (e.serie ?? []).map((x) => (x.kg ? `${fmtKg(x.kg)}×${x.rip ?? "—"}` : `${x.rip ?? "—"} rip`)).join(" · ") || "—"),
        el("td", {}, volume(e.serie) ? fmtNum(volume(e.serie)) + " kg" : "—"),
        el("td", {}, massimale(e.serie) ? fmtKg(massimale(e.serie)) + " kg" : "—")))))),
    el("p", { class: "sotto" }, "Massimale stimato con la formula di Epley, dalla serie migliore.")) : null;

  // Modifica
  const campo = (etichetta, input) => el("label", { class: "campo" }, el("span", {}, etichetta), input);
  const nome = el("input", { id: "d-nome", value: s.nome ?? "", placeholder: nomeTipo(s.tipo, s.sottotipo) });
  const tipo = el("select", { id: "d-tipo" }, [...new Set([...attive(), s.tipo].filter(Boolean))].map((t) => el("option", { value: t, selected: t === s.tipo }, t)));
  const sottotipo = el("select", { id: "d-sottotipo" }, el("option", { value: "" }, "Non indicato"), SOTTOTIPI_BICI.map((t) => el("option", { value: t, selected: t === s.sottotipo }, t)));
  const campoSotto = campo("Bici", sottotipo);
  campoSotto.hidden = s.tipo !== "Bici";
  tipo.onchange = () => (campoSotto.hidden = tipo.value !== "Bici");
  const nota = el("textarea", { id: "d-nota" });
  nota.value = s.nota ?? "";
  const numeri = Object.fromEntries(CAMPI_MODIFICABILI.map(([k]) => [k, el("input", { id: "d-" + k, type: "text", inputmode: "decimal", value: s[k] ?? "" })]));
  const esitoD = el("span", { class: "esito", role: "status" });
  const salva = el("button", { class: "btn primario", type: "button" }, "Salva le modifiche");
  salva.onclick = async () => {
    salva.disabled = true;
    try {
      const nuovo = { ...s, nome: nome.value.trim(), nota: nota.value.trim(), tipo: tipo.value, sottotipo: tipo.value === "Bici" ? sottotipo.value || null : null,
        ...Object.fromEntries(CAMPI_MODIFICABILI.map(([k]) => [k, numero(numeri[k].value)])) };
      await stato.archivio.scrivi("sessioni", s.id, nuovo);
      esito(esitoD, "Salvato", "ok");
    } catch (e) { esito(esitoD, "Non salvato: " + (e?.message ?? "errore"), "err"); }
    finally { salva.disabled = false; }
  };
  const elimina = conConferma(el("button", { class: "btn pericolo", type: "button" }, "Elimina"), "Tocca di nuovo per eliminare", async () => {
    try {
      await stato.archivio.elimina("sessioni", s.id);
      await stato.archivio.elimina("dettagli", s.id);
      chiudi();
      avviso("Allenamento eliminato");
    } catch (e) { esito(esitoD, "Non eliminato: " + (e?.message ?? "errore"), "err"); }
  });

  const pesanti = el("div", { style: "display:grid;gap:14px" }, el("p", { class: "sotto" }, "Carico traccia e curve…"));
  const foglio = el("div", { class: "foglio", role: "dialog", "aria-modal": "true", "aria-labelledby": "d-titolo" },
    el("div", { class: "foglio-testa" },
      el("div", {}, el("h2", { id: "d-titolo" }, s.nome || nomeTipo(s.tipo, s.sottotipo)), el("p", {}, `${fmtDataLunga(s.data)} · ${nomeTipo(s.tipo, s.sottotipo)}`)),
      el("button", { class: "tondo chiudi", type: "button", "aria-label": "Chiudi", onclick: chiudi }, icona(ICONE.chiudi))),
    riquadri, pesanti, zoneBox, esercizi,
    el("section", { class: "card modulo" }, el("h2", {}, "Modifica"),
      campo("Nome", nome),
      el("div", { class: "righe" }, campo("Tipo", tipo), campoSotto),
      el("div", { class: "righe" }, CAMPI_MODIFICABILI.map(([k, etichetta]) => campo(etichetta, numeri[k]))),
      campo("Nota", nota),
      el("div", { class: "azioni" }, salva, elimina, esitoD),
      s.fonte ? el("p", { class: "fonte" }, s.fonte + (s.file ? ` · ${s.file}` : "")) : null));
  velo.replaceChildren(foglio);
  velo.hidden = false;
  foglio.querySelector(".chiudi").focus();
  caricaPesanti(s, pesanti, lim);
}

// Traccia e curve stanno in dettagli/<id> e si scaricano solo aprendo l'allenamento.
async function caricaPesanti(s, box, lim) {
  let d = null;
  try { d = await stato.archivio.leggi("dettagli", s.id); } catch { /* senza dettagli si vede il resto */ }
  d ??= {};
  const pezzi = [];
  const grafici = [];
  if (d.traccia?.lat?.length > 1) {
    const g = el("div");
    pezzi.push(el("section", { class: "card" }, el("h2", {}, "Traccia"), el("p", { class: "sotto" }, "Ogni tratto ha il colore della zona del battito. Tocca la traccia per tempo e battito."), g));
    grafici.push(() => graficoTraccia(g, d.traccia, d.curva_fc, lim));
  }
  if (d.curva_fc?.fc?.some((v) => v != null)) {
    const g = el("div");
    pezzi.push(el("section", { class: "card" }, el("h2", {}, "Battito"), el("p", { class: "sotto" }, `Media ogni ${d.curva_fc.passo_s} secondi, sulle bande delle tue zone.`), g));
    grafici.push(() => graficoCurva(g, d.curva_fc, lim));
  }
  const c = d.curve;
  const extra = c ? [
    ["quota", "Quota", "var(--t-trekking)", (v) => `${fmtNum(v)} m`],
    s.tipo === "Bici" || !conPasso(s.tipo) ? ["velocita", "Velocità", "var(--t-bici)", (v) => `${fmtNum(v * 3.6, 1)} km/h`] : null,
    ["potenza", "Potenza", "var(--t-hiit)", (v) => `${fmtNum(v)} W`],
    ["cadenza", "Cadenza", "var(--t-corsa)", (v) => `${fmtNum(v)}`],
  ].filter((x) => x && c[x[0]]) : [];
  for (const [k, nome, colore, formato] of extra) {
    const g = el("div");
    pezzi.push(el("section", { class: "card" }, el("h2", {}, nome), g));
    grafici.push(() => graficoTempo(g, { valori: c[k], passo_s: c.passo_s, colore, formato, nome }));
  }
  if (!pezzi.length) { box.remove(); return; }
  metti(box, ...pezzi);
  requestAnimationFrame(() => grafici.forEach((f) => f()));
}
