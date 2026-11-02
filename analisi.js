// Analisi: volume e zone per settimana, distanze, andamento per attività, forza per esercizio, sonno, ossigeno, peso.
import { stato, registraVista, rivai, testata, coloreTipo, modulo, limiti, intervalloZona, ZONE } from "./stato.js";
import { recupero, CARDIO, testoSerie } from "./dati.js";
import { TIPI, volume, massimale } from "./analisi-file.js";
import { el, metti, oggi, piuGiorni, lunediDi, fmtData, fmtGiorno, fmtNum, fmtDur, fmtKg, fmtSec, somma } from "./util.js";
import { COLORE_ZONA, graficoColonne, graficoLinea, graficoIntervalli, vuoto } from "./grafici.js";
import { zoneDi, haZone, conPasso, volumeSessione } from "./dettaglio.js";

const scelte = { settimane: 8, andamento: null, esercizio: null };

// Promemoria: che cosa allena ogni zona (con i limiti al 60, 70, 80 e 90% usati dall'app).
const A_COSA_SERVONO = [
  ["Recupero", "Riscaldamento, defaticamento e recupero attivo."],
  ["Fondo", "Resistenza di base e consumo dei grassi: si regge a lungo."],
  ["Aerobica", "Migliora la capacità aerobica e l'efficienza di cuore e polmoni."],
  ["Soglia", "Alza la soglia: tieni più a lungo ritmi veloci."],
  ["Massimo", "Potenza e VO₂max: scatti e ripetute brevi, con recuperi lunghi."],
];

registraVista("analisi", { vivo: true, render(main) {
  const d = oggi();
  const settimane = Array.from({ length: scelte.settimane }, (_, i) => piuGiorni(lunediDi(d), -7 * (scelte.settimane - 1 - i)));
  const primo = settimane[0];
  const sess = stato.sessioni.filter((s) => s.data >= primo && s.data <= d);
  const perSett = (w) => sess.filter((s) => lunediDi(s.data) === w);
  const etichetta = (w) => fmtData(w, { day: "numeric", month: "short" });
  const titoloSett = (w) => `Settimana del ${fmtData(w, { day: "numeric", month: "long" })}`;
  const fmtMin = { asse: (v) => (v >= 60 ? `${fmtNum(v / 60, v % 60 ? 1 : 0)} h` : v ? `${v}'` : "0"), tip: fmtDur, minuti: true };
  const tipi = [...TIPI, ...new Set(sess.map((s) => s.tipo))].filter((t, i, a) => a.indexOf(t) === i && sess.some((s) => s.tipo === t));

  const card = (titolo, sotto, ...resto) => { const g = el("div"); return [el("section", { class: "card" }, el("h2", {}, titolo), sotto ? el("p", { class: "sotto" }, sotto) : null, ...resto, g), g]; };
  const disegni = [];
  const sezioni = [];

  // Minuti per tipo
  const [cVol, gVol] = card("Minuti a settimana", "Per tipo di allenamento.");
  sezioni.push(cVol);
  disegni.push(() => tipi.length ? graficoColonne(gVol, {
    categorie: settimane, serie: tipi.map((t) => ({ nome: t, colore: coloreTipo(t) })),
    valore: (w, s) => somma(perSett(w).filter((x) => x.tipo === s.nome), (x) => x.durata_min),
    etichettaX: etichetta, formato: fmtMin, titoloTip: titoloSett, extraTip: (w) => [[null, "Allenamenti", String(perSett(w).length)]],
  }) : vuoto(gVol, "Nessun allenamento nel periodo."));

  // Zone
  const conZone = sess.filter(haZone);
  const z2 = somma(conZone, (s) => s.z2_min), totZ = somma(conZone, (s) => zoneDi(s).reduce((b, z) => b + (z ?? 0), 0));
  const senza = sess.length - conZone.length;
  const [cZone, gZone] = card("Tempo in zona a settimana",
    sess.length ? (totZ ? `Z2 nel periodo: ${fmtDur(z2)}, il ${fmtNum((z2 / totZ) * 100)}% del tempo misurato. ` : "") + (senza ? `Righe oblique: ${senza} allenament${senza === 1 ? "o" : "i"} senza battito.` : "") : "");
  sezioni.push(cZone);
  const lim = limiti();
  disegni.push(() => sess.length ? graficoColonne(gZone, {
    categorie: settimane,
    serie: [...ZONE.map((z, i) => ({ nome: `${z} ${intervalloZona(i, lim)}`, colore: COLORE_ZONA[i], i })), { nome: "Senza battito", colore: "var(--tratteggio)", tratteggio: true, i: -1 }],
    valore: (w, s) => (s.i < 0 ? somma(perSett(w).filter((x) => !haZone(x)), (x) => x.durata_min) : somma(perSett(w).filter(haZone), (x) => zoneDi(x)[s.i])),
    etichettaX: etichetta, formato: fmtMin, titoloTip: titoloSett,
  }) : vuoto(gZone, "Nessun allenamento nel periodo."));

  sezioni.push(el("section", { class: "card" }, el("h2", {}, "A cosa servono le zone"),
    el("div", { class: "tabella" }, el("table", {},
      el("thead", {}, el("tr", {}, el("th", {}, "Zona"), el("th", {}, "bpm"), el("th", {}, "Allena"))),
      el("tbody", {}, A_COSA_SERVONO.map(([nome, testo], i) => el("tr", {},
        el("td", {}, el("span", { style: "display:inline-flex;align-items:center;gap:6px;white-space:nowrap" }, el("i", { class: "dot", style: `background:${COLORE_ZONA[i]}` }), `${ZONE[i]} ${nome}`)),
        el("td", { class: "num", style: "white-space:nowrap" }, intervalloZona(i, lim)),
        el("td", { style: "white-space:normal;min-width:140px" }, testo))))))));

  // Distanza
  const conKm = tipi.filter((t) => sess.some((s) => s.tipo === t && s.km > 0));
  if (conKm.length) {
    const [c, g] = card("Distanza a settimana", "In chilometri, per tipo.");
    sezioni.push(c);
    disegni.push(() => graficoColonne(g, {
      categorie: settimane, serie: conKm.map((t) => ({ nome: t, colore: coloreTipo(t) })),
      valore: (w, s) => somma(perSett(w).filter((x) => x.tipo === s.nome), (x) => x.km),
      etichettaX: etichetta, formato: { asse: (v) => fmtNum(v), tip: (v) => `${fmtNum(v, 1)} km`, minimo: 5 }, titoloTip: titoloSett,
    }));
  }

  // Andamento per attività: velocità per la bici, passo per corsa, camminata e trekking.
  const opzioni = CARDIO.flatMap((t) => {
    const lista = stato.sessioni.filter((s) => s.tipo === t && s.km > 0 && s.durata_min);
    if (!lista.length) return [];
    const sotto = t === "Bici" ? [...new Set(lista.map((s) => s.sottotipo).filter(Boolean))].map((st) => `Bici|${st}`) : [];
    return [t, ...(sotto.length > 1 ? sotto : [])];
  });
  if (opzioni.length) {
    if (!opzioni.includes(scelte.andamento)) scelte.andamento = opzioni[0];
    const [t, st] = scelte.andamento.split("|");
    const lista = sess.filter((s) => s.tipo === t && (!st || s.sottotipo === st) && s.km > 0 && s.durata_min);
    const passo = conPasso(t);
    const sel = el("select", { class: "input", "aria-label": "Attività", onchange: (e) => { scelte.andamento = e.target.value; ridisegnaAnalisi(); } },
      opzioni.map((o) => { const [a, b] = o.split("|"); return el("option", { value: o, selected: o === scelte.andamento }, b ? `Bici ${b === "MTB" ? "MTB" : b.toLowerCase()}` : a); }));
    const [c, g] = card(passo ? "Passo medio" : "Velocità media", passo ? "Minuti al chilometro per allenamento: più in basso è più veloce." : "Chilometri all'ora per uscita.", sel);
    sezioni.push(c);
    disegni.push(() => graficoLinea(g, {
      punti: lista.map((s) => ({ data: s.data, v: passo ? (s.durata_min * 60) / s.km : s.vel_media ?? (s.km / s.durata_min) * 60,
        extra: [[null, "Distanza", `${fmtNum(s.km, 1)} km`], [null, "FC media", s.fc_media ? `${s.fc_media} bpm` : "—"], ...(s.salita_m ? [[null, "Salita", `${fmtNum(s.salita_m)} m`]] : [])] })),
      formato: passo ? { asse: (v) => fmtSec(v), tip: (v) => `${fmtSec(v)} /km`, nome: "Passo", margine: 10 } : { asse: (v) => fmtNum(v), tip: (v) => `${fmtNum(v, 1)} km/h`, nome: "Velocità" },
      titoloTip: (p) => fmtGiorno(p.data), colore: coloreTipo(t),
    }));
  }

  // Forza
  const forza = stato.sessioni.filter((s) => s.esercizi?.length).sort((a, b) => a.data.localeCompare(b.data));
  if (forza.length) {
    const nomi = [...new Set(forza.flatMap((s) => s.esercizi.map((e) => e.nome)))];
    const conteggio = (n) => forza.filter((s) => s.esercizi.some((e) => e.nome === n)).length;
    nomi.sort((a, b) => conteggio(b) - conteggio(a));
    if (!nomi.includes(scelte.esercizio)) scelte.esercizio = nomi[0];
    const storia = forza.map((s) => ({ s, e: s.esercizi.find((e) => e.nome === scelte.esercizio) })).filter((x) => x.e);
    const sel = el("select", { class: "input", "aria-label": "Esercizio", onchange: (e) => { scelte.esercizio = e.target.value; ridisegnaAnalisi(); } },
      nomi.map((n) => el("option", { value: n, selected: n === scelte.esercizio }, n)));
    const tabella = el("div", { class: "tabella" }, el("table", {},
      el("thead", {}, el("tr", {}, el("th", {}, "Giorno"), el("th", {}, "Serie"), el("th", {}, "Volume"), el("th", {}, "Massimale"))),
      el("tbody", {}, [...storia].reverse().slice(0, 6).map(({ s, e }) => el("tr", {},
        el("td", {}, fmtGiorno(s.data)),
        el("td", { style: "white-space:normal" }, (e.serie ?? []).map((x) => testoSerie(x, e.unita)).join(" · ")),
        el("td", {}, volume(e.serie) ? `${fmtNum(volume(e.serie))} kg` : "—"),
        el("td", {}, massimale(e.serie) ? `${fmtKg(massimale(e.serie))} kg` : "—"))))));
    const conKg = storia.filter(({ e }) => massimale(e.serie));
    const aTempo = storia.some(({ e }) => e.unita === "sec");
    const [c, g] = card("Forza per esercizio", conKg.length ? "Massimale stimato (Epley) dalla serie migliore di ogni sessione." : aTempo ? "Esercizio a tempo: i secondi di ogni serie sono nella tabella." : "Esercizio a corpo libero: conta le ripetizioni nella tabella.", sel);
    c.append(tabella);
    sezioni.push(c);
    disegni.push(() => conKg.length ? graficoLinea(g, {
      punti: conKg.map(({ s, e }) => ({ data: s.data, v: massimale(e.serie), extra: [[null, "Volume", `${fmtNum(volume(e.serie))} kg`]] })),
      formato: { asse: (v) => fmtNum(v), tip: (v) => `${fmtKg(Math.round(v * 10) / 10)} kg`, nome: "Massimale" }, titoloTip: (p) => fmtGiorno(p.data), colore: "var(--t-forza)",
    }) : g.remove());
    const [cv, gv] = card("Volume di forza a settimana", "Chili sollevati: serie × ripetizioni × carico.");
    sezioni.push(cv);
    disegni.push(() => graficoColonne(gv, {
      categorie: settimane, serie: [{ nome: "Volume", colore: "var(--t-forza)" }],
      valore: (w) => somma(perSett(w), volumeSessione), etichettaX: etichetta,
      formato: { asse: (v) => (v >= 1000 ? `${fmtNum(v / 1000, v % 1000 ? 1 : 0)} t` : fmtNum(v)), tip: (v) => `${fmtNum(v)} kg`, minimo: 100 }, titoloTip: titoloSett, conLegenda: false,
    }));
  }

  // Sonno e ossigeno
  const notti = stato.notti.filter((n) => n.data >= primo);
  if (modulo("sonno")) {
    const r = recupero(stato.notti, d, stato.profilo.recupero);
    const [c, g] = card("Battito nel sonno", r.soglia ? `Linea tratteggiata: la tua soglia di oggi, ${r.soglia} bpm (media ${fmtNum(r.media, 1)} + ${stato.profilo.recupero.scarto_bpm}).` : "La soglia compare dopo 5 notti.");
    sezioni.push(c);
    disegni.push(() => graficoLinea(g, {
      punti: notti.filter((n) => n.fc_sonno != null).map((n) => ({ data: n.data, v: n.fc_sonno, extra: [[null, "Sonno", fmtDur(n.durata_min)]] })),
      formato: { asse: String, tip: (v) => `${v} bpm`, nome: "Battito" }, soglia: r.soglia ?? undefined, etichettaSoglia: r.soglia ? `${r.soglia}` : "", titoloTip: (p) => fmtGiorno(p.data), colore: "var(--sonno)",
    }));
    const conDurata = notti.filter((n) => n.durata_min != null);
    const [c2, g2] = card("Ore di sonno", "Per notte.");
    sezioni.push(c2);
    disegni.push(() => conDurata.length ? graficoColonne(g2, {
      categorie: conDurata.map((n) => n.data), serie: [{ nome: "Sonno", colore: "var(--sonno)" }],
      valore: (dd) => conDurata.find((n) => n.data === dd)?.durata_min ?? 0, etichettaX: (dd) => fmtData(dd, { day: "numeric", month: "short" }),
      formato: { ...fmtMin, asse: (v) => `${fmtNum(v / 60, v % 60 ? 1 : 0)} h` }, titoloTip: fmtGiorno, conLegenda: false,
    }) : vuoto(g2, "Nessuna notte con la durata nel periodo."));
  }
  if (modulo("ossigeno")) {
    const [c, g] = card("Ossigeno nel sonno", "SpO₂ per notte.");
    sezioni.push(c);
    disegni.push(() => graficoIntervalli(g, {
      punti: notti.filter((n) => n.spo2_media != null || n.spo2_min != null)
        .map((n) => ({ data: n.data, lo: n.spo2_min ?? n.spo2_media, mid: n.spo2_media ?? n.spo2_min, hi: n.spo2_max ?? n.spo2_media ?? n.spo2_min })),
      titoloTip: (p) => fmtGiorno(p.data),
    }));
  }
  if (modulo("peso")) {
    const [c, g] = card("Peso", "In chili.");
    sezioni.push(c);
    disegni.push(() => graficoLinea(g, {
      punti: stato.peso.filter((p) => p.data >= primo && p.kg != null).map((p) => ({ data: p.data, v: p.kg })),
      formato: { asse: (v) => fmtNum(v, 0), tip: (v) => `${fmtNum(v, 1)} kg`, nome: "Peso" }, titoloTip: (p) => fmtGiorno(p.data),
    }));
  }

  const periodo = el("div", { class: "seg", role: "group", "aria-label": "Periodo" },
    [[4, "4 settimane"], [8, "8 settimane"], [26, "6 mesi"], [52, "1 anno"]].map(([n, t]) =>
      el("button", { type: "button", "aria-pressed": String(scelte.settimane === n), onclick: () => { scelte.settimane = n; ridisegnaAnalisi(); } }, t)));
  metti(main, testata({ titolo: "Analisi" }), periodo,
    stato.sessioni.length || stato.notti.length ? el("div", { class: "griglia2" }, sezioni) : el("section", { class: "card" }, el("p", { class: "vuoto" }, "I grafici compaiono dopo i primi allenamenti.")));
  requestAnimationFrame(() => disegni.forEach((f) => f()));
} });

function ridisegnaAnalisi() { rivai("analisi", {}); }
