// Notti e peso da Health Connect (app Android). Le sessioni di sonno arrivano quasi grezze dal plugin: spesso la
// stessa notte c'è due volte (due app, o la stessa che la riscrive) o spezzata in più pezzi, quindi qui le sessioni
// sovrapposte o vicine si uniscono in blocchi; per ogni mattina vale il blocco più lungo (i pisolini restano fuori).
// Durata: i tratti di sonno delle fasi (senza quelli da sveglio), uniti; senza fasi, le sessioni unite. Battito e
// ossigeno: i campioni dentro quei tratti. Le voci inserite a mano non si toccano: si completano solo i valori che
// mancano, e quelli completati si ricordano in `importati` per poterli correggere dopo.
import { stato, salvaGiorni } from "./stato.js";
import { ricorda } from "./util.js";
import { dataLocale } from "./analisi-file.js";
import { salute } from "./sorgenti.js";

export const FONTE_SALUTE = "Health Connect";
const VERSIONE = 2;              // alzarla quando cambia il calcolo: alla prossima apertura si reimporta tutto
const MIN_NOTTE = 120;           // minuti di sonno perché un blocco conti come notte
const PAUSA_MAX = 90 * 60000;    // sessioni separate da meno di così sono la stessa notte
const SVEGLIO = new Set([1, 3, 7]); // fasi da sveglio di Health Connect: sveglio, fuori dal letto, sveglio a letto
const GIORNI = 31;               // Health Connect fa leggere gli ultimi 30 giorni prima del permesso

export const saluteAttiva = () => ricorda.leggi("salute") === true;
export const impostaSalute = (si) => ricorda.scrivi("salute", si || null);

// Intervalli [inizio, fine] uniti e ordinati; durata totale in ms.
function unione(intervalli) {
  const out = [];
  for (const [a, b] of [...intervalli].filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0])) {
    const u = out[out.length - 1];
    if (u && a <= u[1]) u[1] = Math.max(u[1], b);
    else out.push([a, b]);
  }
  return out;
}
const durata = (intervalli) => intervalli.reduce((s, [a, b]) => s + b - a, 0);

// Valori dei campioni [[t, v]] (ordinati) che cadono dentro gli intervalli.
function dentro(campioni, intervalli) {
  const out = [];
  for (const [a, b] of intervalli) {
    let lo = 0, hi = campioni.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (campioni[m][0] < a) lo = m + 1; else hi = m; }
    for (let i = lo; i < campioni.length && campioni[i][0] <= b; i++) if (campioni[i][1] > 0) out.push(campioni[i][1]);
  }
  return out;
}

// → { "2026-11-05": { durata_min, fc_sonno, spo2_min, spo2_media, spo2_max } }, solo per le mattine da `dalGiorno`.
export function nottiDaSessioni(sessioni = [], battito = [], ossigeno = [], { dalGiorno = "" } = {}) {
  const blocchi = [];
  for (const s of [...sessioni].filter((s) => s.fine > s.inizio).sort((x, y) => x.inizio - y.inizio)) {
    const b = blocchi[blocchi.length - 1];
    if (b && s.inizio <= b.fine + PAUSA_MAX) { b.sessioni.push(s); b.fine = Math.max(b.fine, s.fine); }
    else blocchi.push({ inizio: s.inizio, fine: s.fine, sessioni: [s] });
  }
  const perData = new Map();
  for (const b of blocchi) {
    const conFasi = b.sessioni.filter((s) => s.fasi?.length);
    const tratti = unione(conFasi.length
      ? conFasi.flatMap((s) => s.fasi.filter((f) => !SVEGLIO.has(f[2])).map((f) => [f[0], f[1]]))
      : b.sessioni.map((s) => [s.inizio, s.fine]));
    const minuti = durata(tratti) / 60000;
    const d = dataLocale(new Date(b.fine));
    if (d < dalGiorno || minuti < MIN_NOTTE) continue;
    if ((perData.get(d)?.minuti ?? 0) < minuti) perData.set(d, { minuti, tratti });
  }
  const fc = [...battito].sort((x, y) => x[0] - y[0]), sp = [...ossigeno].sort((x, y) => x[0] - y[0]);
  const media = (v) => (v.length ? v.reduce((a, x) => a + x, 0) / v.length : null);
  const out = {};
  for (const [d, { minuti, tratti }] of perData) {
    const f = dentro(fc, tratti), o = dentro(sp, tratti);
    out[d] = {
      durata_min: Math.round(minuti),
      fc_sonno: f.length ? Math.round(media(f)) : null,
      spo2_min: o.length ? Math.round(Math.min(...o)) : null,
      spo2_media: o.length ? Math.round(media(o)) : null,
      spo2_max: o.length ? Math.round(Math.max(...o)) : null,
    };
  }
  return out;
}

// Pesi dal plugin → { "2026-11-05": { kg } }: l'ultima pesata del giorno, al decimo di chilo.
export function pesiDaMisure(pesi = [], { dalGiorno = "" } = {}) {
  const out = {};
  for (const p of [...pesi].sort((a, b) => a.t - b.t)) {
    const d = dataLocale(new Date(p.t));
    if (d < dalGiorno || !(p.kg >= 30 && p.kg <= 250)) continue;
    out[d] = { kg: Math.round(p.kg * 10) / 10 };
  }
  return out;
}

// La voce da salvare, o undefined se non cambia niente. `letti`: i campi per cui c'è il permesso, quindi un valore
// mancante vuol dire che in Health Connect non c'è. Voce importata: si rifà con i valori nuovi. Voce a mano: si
// riempiono i campi vuoti e si possono correggere solo quelli riempiti così (`importati`).
export function unisci(esistente, nuovo, letti = Object.keys(nuovo)) {
  const { data, ...prima } = esistente ?? {};
  const manuale = !!esistente && prima.fonte !== FONTE_SALUTE;
  const dopo = { ...prima };
  const importati = new Set(prima.importati ?? []);
  for (const [k, v] of Object.entries(nuovo)) {
    const mio = !manuale || importati.has(k) || dopo[k] == null;
    if (!mio) continue;
    if (v != null) { dopo[k] = v; if (manuale) importati.add(k); }
    else if (letti.includes(k) && (!manuale || importati.has(k))) { delete dopo[k]; importati.delete(k); }
  }
  if (manuale) { if (importati.size) dopo.importati = [...importati].sort(); else delete dopo.importati; }
  else dopo.fonte = FONTE_SALUTE;
  const chiavi = (o) => JSON.stringify(Object.keys(o).sort().map((k) => [k, o[k]]));
  return chiavi(prima) === chiavi(dopo) ? undefined : dopo;
}

const CAMPI = { sonno: ["durata_min"], battito: ["fc_sonno"], ossigeno: ["spo2_min", "spo2_media", "spo2_max"], peso: ["kg"] };

// Correzione una tantum dell'import delle versioni 1.6.0-1.7.0, che sommava le sessioni doppie e non segnava i campi
// riempiti nelle notti inserite a mano. Rifà quel calcolo: se la durata di una notte a mano è identica a quella che
// avrebbe scritto, l'aveva messa l'import e si può correggere. → { data: minuti }
export function durateVecchie(sessioni = []) {
  const perData = new Map();
  for (const s of sessioni) {
    if (!(s.fine > s.inizio)) continue;
    let dormito = 0;
    for (const f of s.fasi ?? []) if (!SVEGLIO.has(f[2])) dormito += f[1] - f[0];
    if (!s.fasi?.length) dormito = s.fine - s.inizio;
    const d = dataLocale(new Date(s.fine));
    if (!perData.has(d)) perData.set(d, []);
    perData.get(d).push(Math.round(dormito / 60000));
  }
  const out = {};
  for (const [d, lista] of perData) {
    const lunghe = lista.filter((m) => m >= 120);
    out[d] = (lunghe.length ? lunghe : lista).reduce((a, m) => a + m, 0) || null;
  }
  return out;
}

// Che cosa salvare: { cambi: { notti: {data: voce | null}, peso: {...} }, tolte }. null toglie la voce.
export function cambiDaImport({ notti, pesi, nottiSalvate = [], pesiSalvati = [], letti, permessi, dalGiorno, migra = false, sessioni = [] }) {
  const cambi = { notti: {}, peso: {} };
  let tolte = 0;
  const baseNotti = new Map(nottiSalvate.map((n) => [n.data, n]));
  // Prima volta col calcolo nuovo: le durate messe dal vecchio import nelle notti a mano diventano correggibili.
  if (migra && permessi?.sonno) {
    const vecchie = durateVecchie(sessioni);
    for (const n of nottiSalvate) {
      // Voci importate più corte di una notte: col calcolo nuovo non ci sarebbero (primo giorno monco, pisolini).
      if (n.fonte === FONTE_SALUTE && n.durata_min != null && n.durata_min < MIN_NOTTE && !n.nota) { cambi.notti[n.data] = null; tolte++; baseNotti.delete(n.data); continue; }
      if (n.fonte === FONTE_SALUTE || n.data < dalGiorno || n.durata_min == null || n.durata_min !== vecchie[n.data]) continue;
      if (n.importati?.includes("durata_min") || notti[n.data]?.durata_min === n.durata_min) continue;
      const segnata = { ...n, importati: [...(n.importati ?? []), "durata_min"].sort() };
      baseNotti.set(n.data, segnata);
      if (!notti[n.data]) {
        // Quella mattina non c'è una notte vera: la durata sbagliata si toglie, il resto (scritto a mano) resta.
        const { data, durata_min, importati, ...resto } = segnata;
        const altri = importati.filter((k) => k !== "durata_min");
        const v = { ...resto, ...(altri.length ? { importati: altri } : {}) };
        cambi.notti[n.data] = Object.keys(v).length ? v : null;
      }
    }
  }
  const basePesi = new Map(pesiSalvati.map((p) => [p.data, p]));
  for (const [coll, nuovi, base, chiave] of [["notti", notti, baseNotti, "sonno"], ["peso", pesi, basePesi, "peso"]]) {
    for (const [d, v] of Object.entries(nuovi)) {
      const x = unisci(base.get(d), v, letti);
      if (x) cambi[coll][d] = x;
    }
    // Voci importate che Health Connect non ha più (per esempio calcolate male prima): si tolgono, se non hanno note.
    if (permessi?.[chiave]) for (const n of base.values()) {
      if (n.data >= dalGiorno && n.fonte === FONTE_SALUTE && !nuovi[n.data] && !n.nota) { cambi[coll][n.data] = null; tolte++; }
    }
  }
  return { cambi, tolte };
}

// Legge gli ultimi 31 giorni e salva le novità. → { notti, pesi, tolte, lette } (salvate, tolte, lette dal plugin).
export async function importaDaSalute() {
  const permessi = await salute.stato();
  const a = Date.now(), da = a - GIORNI * 864e5;
  // Health Connect fa leggere fino a 30 giorni prima del primo permesso: prima di lì le notti sono monche.
  if (!ricorda.leggi("salute-dal")) ricorda.scrivi("salute-dal", a);
  const limite = Math.max(da, Number(ricorda.leggi("salute-dal")) - 30 * 864e5);
  // La prima mattina utile è quella dopo il limite (la notte prima comincia prima).
  const dalGiorno = dataLocale(new Date(limite + 36 * 3600e3));
  const r = await salute.leggi(da, a);
  const letti = Object.entries(CAMPI).filter(([k]) => permessi?.[k]).flatMap(([, c]) => c);
  const notti = nottiDaSessioni(r?.sessioni, r?.battito, r?.ossigeno, { dalGiorno });
  const pesi = pesiDaMisure(r?.pesi, { dalGiorno });
  const { cambi, tolte } = cambiDaImport({ notti, pesi, nottiSalvate: stato.notti, pesiSalvati: stato.peso, letti, permessi, dalGiorno,
    migra: ricorda.leggi("salute-versione") !== VERSIONE, sessioni: r?.sessioni });
  await salvaGiorni("notti", cambi.notti);
  await salvaGiorni("peso", cambi.peso);
  ricorda.scrivi("salute-ultimo", new Date().toISOString());
  ricorda.scrivi("salute-versione", VERSIONE);
  ricorda.scrivi("salute-letto", { conti: r?.conti ?? {}, sessioni: r?.sessioni?.length ?? 0, battito: r?.battito?.length ?? 0, ossigeno: r?.ossigeno?.length ?? 0, notti: Object.keys(notti).length });
  const conta = (o) => Object.values(o).filter(Boolean).length;
  return { notti: conta(cambi.notti), pesi: conta(cambi.peso), tolte, lette: { notti: r?.sessioni?.length ?? 0, pesi: r?.pesi?.length ?? 0 } };
}

export function testoImport(r) {
  const parti = [r.notti ? `${r.notti} nott${r.notti === 1 ? "e" : "i"}` : null, r.pesi ? `${r.pesi} pes${r.pesi === 1 ? "o" : "i"}` : null].filter(Boolean);
  const tolte = r.tolte ? (r.tolte === 1 ? " Tolta 1 voce importata che non risulta più." : ` Tolte ${r.tolte} voci importate che non risultano più.`) : "";
  if (parti.length) return `Aggiornat${r.notti + r.pesi === 1 ? (r.notti ? "a" : "o") : "i"} ${parti.join(" e ")}.${tolte}`;
  if (tolte) return tolte.trim();
  return r.lette.notti || r.lette.pesi ? "Niente di nuovo: è già tutto nell'app."
    : "Health Connect non ha sonno né peso degli ultimi 30 giorni: controlla che l'app dell'orologio o della bilancia ci scriva.";
}

// Nomi leggibili delle app più comuni che scrivono in Health Connect.
const NOMI_APP = {
  "com.mi.health": "Mi Fitness", "com.xiaomi.wearable": "Mi Fitness", "com.xiaomi.hm.health": "Zepp Life", "com.huami.watch.hmwatchmanager": "Zepp",
  "com.sec.android.app.shealth": "Samsung Health", "com.google.android.apps.fitness": "Google Fit", "com.fitbit.FitbitMobile": "Fitbit",
  "com.garmin.android.apps.connectmobile": "Garmin Connect", "com.google.android.apps.wellbeing": "Benessere digitale", "com.ouraring.oura": "Oura",
  "com.withings.wiscale2": "Withings", "com.huawei.health": "Huawei Salute", "com.android.healthconnect.controller": "Health Connect",
};
export const nomeApp = (pkg) => NOMI_APP[pkg] ?? pkg;

// Riassunto dell'ultima lettura, per le Impostazioni: che cosa ha scritto ogni app negli ultimi 30 giorni.
export function riassuntoLettura() {
  const l = ricorda.leggi("salute-letto");
  if (!l) return null;
  const n = (q, uno, tanti) => `${q} ${q === 1 ? uno : tanti}`;
  const righe = Object.entries(l.conti ?? {}).map(([pkg, c]) =>
    `${nomeApp(pkg)}: ${[c.sonno ? n(c.sonno, "sessione di sonno", "sessioni di sonno") : null, c.battito ? n(c.battito, "misura di battito", "misure di battito") : null,
      c.ossigeno ? n(c.ossigeno, "misura di ossigeno", "misure di ossigeno") : null, c.peso ? n(c.peso, "peso", "pesi") : null].filter(Boolean).join(", ") || "niente"}.`);
  return { righe, nelSonno: `Nel sonno: ${n(l.battito, "misura", "misure")} di battito e ${l.ossigeno} di ossigeno; ${n(l.notti, "notte ricostruita", "notti ricostruite")} da ${n(l.sessioni, "sessione", "sessioni")}.` };
}

// All'apertura dell'app, se l'importazione è accesa e l'ultima ha più di 3 ore (o è cambiato il calcolo). Restituisce
// il testo da mostrare se è arrivato qualcosa di nuovo, altrimenti null.
export async function importaSeServe() {
  if (!saluteAttiva()) return null;
  const ultimo = Date.parse(ricorda.leggi("salute-ultimo") ?? "") || 0;
  if (Date.now() - ultimo < 3 * 3600e3 && ricorda.leggi("salute-versione") === VERSIONE) return null;
  const r = await importaDaSalute();
  return r.notti || r.pesi || r.tolte ? "Da Health Connect: " + testoImport(r).replace(/^Aggiornat\w /, "").replace(/\.$/, "") : null;
}
