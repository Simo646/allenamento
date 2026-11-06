// Regole e modelli dell'app generale, senza DOM: profilo, settimana, schede, recupero, backup.
// Le viste li usano, i test in node li provano.

export const GIORNI = ["lun", "mar", "mer", "gio", "ven", "sab", "dom"];
export const CARDIO = ["Corsa", "Camminata", "Trekking", "Bici"]; // attività con GPS, distanza e passo o velocità
export const NOMI_GIORNI = { lun: "Lunedì", mar: "Martedì", mer: "Mercoledì", gio: "Giovedì", ven: "Venerdì", sab: "Sabato", dom: "Domenica" };
export const VERSIONE_BACKUP = 1;

/* ---------- profilo ---------- */
export const PROFILO_PREDEFINITO = {
  nome: "",
  anno_nascita: null,
  fc_riposo: null,
  fc_max_misurata: null,
  metodo_zone: "eta", // eta | karvonen | manuale
  zone: null, // [4 limiti]; null finché il primo avvio non è finito
  attivita: ["Forza", "HIIT", "Corsa", "Camminata", "Trekking", "Bici"],
  sottotipi_bici: ["Strada", "Gravel", "MTB"],
  moduli: { sonno: false, ossigeno: false, peso: false },
  recupero: { scarto_bpm: 3, notti: 14 },
  avvio_completato: false,
};
export const etaDa = (annoNascita, oggi = new Date()) => (annoNascita ? oggi.getFullYear() - annoNascita : null);
export const profiloCompleto = (p) => ({ ...PROFILO_PREDEFINITO, ...p, moduli: { ...PROFILO_PREDEFINITO.moduli, ...p?.moduli }, recupero: { ...PROFILO_PREDEFINITO.recupero, ...p?.recupero } });

/* ---------- esercizi ---------- */
// Elenco di partenza per la scelta rapida; si può sempre scrivere un nome libero.
export const ESERCIZI = {
  Gambe: ["Squat con bilanciere", "Squat goblet", "Stacco da terra", "Stacco rumeno", "Affondi con manubri", "Affondi bulgari", "Leg press", "Hip thrust", "Step-up", "Calf raise"],
  Spinta: ["Panca piana", "Panca inclinata manubri", "Military press", "Spinte manubri da seduto", "Piegamenti", "Dip alle parallele"],
  Tirata: ["Trazioni alla sbarra", "Lat machine", "Rematore con bilanciere", "Rematore con manubrio", "Rematore TRX", "Face pull"],
  Braccia: ["Curl con manubri", "Curl con bilanciere", "French press", "Push-down al cavo"],
  Core: ["Plank", "Side plank", "Dead bug", "Pallof press", "Ab rollout", "Hanging leg raise", "Farmer carry"],
  HIIT: ["Burpee", "Swing con kettlebell", "Thruster", "Mountain climber", "Salto con la corda", "Squat jump", "Jumping jack", "Corsa sul posto con ginocchia alte"],
};

/* ---------- schede ---------- */
// Forza: esercizi[{nome, recupero_s, unita?, serie:[{kg, rip}], nota}]; con unita "sec" le serie sono a tempo: {kg, sec}
// HIIT: esercizi[{nome}] (quanti sono = esercizi per giro), lavoro_s, pausa_s, giri, recupero_giri_s
// Cardio: tipo, sottotipo, durata_min | km, zona (1..5)
export function nuovaScheda(tipo) {
  const base = { titolo: "", tipo, nota: "" };
  if (tipo === "Forza") return { ...base, titolo: "Forza", esercizi: [] };
  if (tipo === "HIIT") return { ...base, titolo: "HIIT", esercizi: [{ nome: "" }, { nome: "" }, { nome: "" }, { nome: "" }], lavoro_s: 40, pausa_s: 20, giri: 3, recupero_giri_s: 90 };
  return { ...base, titolo: tipo, sottotipo: null, durata_min: 45, km: null, zona: 2 };
}
// Serie in breve: "4 × 10 · 60 kg" se sono tutte uguali, altrimenti "60×10 · 62,5×8 · 65×6"; a tempo "3 × 45"".
const kgTesto = (kg) => String(kg).replace(".", ",");
const quanto = (s, unita) => (unita === "sec" ? `${s.sec ?? "—"}"` : `${s.rip ?? "—"}`);
export const tutteUguali = (serie = []) => serie.length > 0 && serie.every((s) => ["kg", "rip", "sec"].every((k) => (s[k] ?? null) === (serie[0][k] ?? null)));
export function riassuntoSerie(serie = [], unita) {
  if (!serie.length) return "";
  if (tutteUguali(serie)) return `${serie.length} × ${quanto(serie[0], unita)}` + (serie[0].kg ? ` · ${kgTesto(serie[0].kg)} kg` : "");
  return serie.map((s) => (s.kg ? `${kgTesto(s.kg)}×${quanto(s, unita)}` : quanto(s, unita))).join(" · ");
}
// Una serie da sola, negli elenchi delle sessioni: "60×10", "10 rip", "45"", "10×45"".
export const testoSerie = (s, unita) => (s.kg ? `${kgTesto(s.kg)}×${quanto(s, unita)}` : unita === "sec" ? quanto(s, unita) : `${quanto(s, unita)} rip`);
// Durata stimata di una scheda di forza: circa 40" per serie (o i secondi della serie a tempo) più il recupero
// (90" se non indicato).
export const durataForza = (s) => Math.round((s.esercizi ?? []).reduce((a, e) =>
  a + (e.serie ?? []).reduce((b, x) => b + (e.unita === "sec" ? x.sec ?? 40 : 40) + (e.recupero_s ?? 90), 0), 0) / 60);

// Durata dell'HIIT: in ogni giro lavoro per ogni esercizio e pausa tra uno e l'altro; tra i giri il recupero, che
// sostituisce la pausa dopo l'ultimo esercizio.
export const durataHiit = (s) => {
  const n = s.esercizi?.length ?? 0, giri = s.giri ?? 0;
  return n && giri ? Math.round((giri * (n * (s.lavoro_s ?? 0) + (n - 1) * (s.pausa_s ?? 0)) + (giri - 1) * (s.recupero_giri_s ?? 0)) / 60) : 0;
};

// Schede di esempio per chi parte da un modello: si possono cambiare o cancellare.
export const SCHEDE_ESEMPIO = {
  "forza-a": { titolo: "Forza A · Corpo intero", tipo: "Forza", nota: "", esercizi: [
    { nome: "Squat con bilanciere", recupero_s: 120, serie: serieUguali(3, 8) },
    { nome: "Panca piana", recupero_s: 120, serie: serieUguali(3, 8) },
    { nome: "Rematore con bilanciere", recupero_s: 90, serie: serieUguali(3, 10) },
    { nome: "Plank", recupero_s: 60, unita: "sec", serie: Array.from({ length: 3 }, () => ({ kg: null, sec: 40 })) },
  ] },
  "forza-b": { titolo: "Forza B · Corpo intero", tipo: "Forza", nota: "", esercizi: [
    { nome: "Stacco rumeno", recupero_s: 120, serie: serieUguali(3, 8) },
    { nome: "Military press", recupero_s: 90, serie: serieUguali(3, 8) },
    { nome: "Trazioni alla sbarra", recupero_s: 120, serie: serieUguali(3, 5) },
    { nome: "Affondi con manubri", recupero_s: 90, serie: serieUguali(3, 10) },
  ] },
  hiit: { titolo: "HIIT 25'", tipo: "HIIT", nota: "Se le gambe sono stanche, sostituisci i salti con esercizi che tengono alto il battito senza impatto.",
    esercizi: ["Swing con kettlebell", "Burpee", "Mountain climber", "Squat jump", "Salto con la corda", "Thruster"].map((nome) => ({ nome })),
    lavoro_s: 40, pausa_s: 20, giri: 3, recupero_giri_s: 120 },
  "fondo-lento": { titolo: "Fondo lento", tipo: "Corsa", sottotipo: null, durata_min: 40, km: null, zona: 2, nota: "Devi riuscire a parlare con frasi complete." },
  "uscita-lunga": { titolo: "Uscita lunga in bici", tipo: "Bici", sottotipo: null, durata_min: 120, km: null, zona: 2, nota: "" },
};
function serieUguali(n, rip) { return Array.from({ length: n }, () => ({ kg: null, rip })); }

/* ---------- settimana ---------- */
// settimana = { lun: [voce...], ... }; voce = {id, tipo, sottotipo?, scheda?, durata_min?, zona?, nota?}
export const settimanaVuota = () => Object.fromEntries(GIORNI.map((g) => [g, []]));
export const MODELLI_SETTIMANA = {
  vuota: { nome: "Vuota", descrizione: "La riempi tu, giorno per giorno.", schede: [], giorni: {} },
  equilibrio: { nome: "Forza e resistenza", descrizione: "2 forza, 1 HIIT, 2 cardio facili, un'uscita lunga.", schede: ["forza-a", "forza-b", "hiit", "fondo-lento", "uscita-lunga"],
    giorni: { lun: [["Forza", "forza-a"]], mar: [["Corsa", "fondo-lento"]], gio: [["Forza", "forza-b"]], ven: [["HIIT", "hiit"]], sab: [["Bici", "uscita-lunga"]], dom: [["Camminata", null, 45, 1]] } },
  resistenza: { nome: "Resistenza", descrizione: "Cardio quasi ogni giorno, forza una volta.", schede: ["forza-a", "fondo-lento", "uscita-lunga"],
    giorni: { lun: [["Corsa", "fondo-lento"]], mer: [["Forza", "forza-a"]], gio: [["Corsa", "fondo-lento"]], sab: [["Bici", "uscita-lunga"]], dom: [["Trekking", null, 150, 2]] } },
};
export function settimanaDaModello(chiave, nuovoId = idCasuale) {
  const m = MODELLI_SETTIMANA[chiave] ?? MODELLI_SETTIMANA.vuota;
  const s = settimanaVuota();
  for (const [g, voci] of Object.entries(m.giorni))
    s[g] = voci.map(([tipo, scheda, durata_min, zona]) => ({ id: nuovoId(), tipo, scheda: scheda ?? null, durata_min: durata_min ?? null, zona: zona ?? null }));
  return { settimana: s, schede: Object.fromEntries(m.schede.map((k) => [k, structuredClone(SCHEDE_ESEMPIO[k])])) };
}

export const giornoDi = (data) => GIORNI[(new Date(data + "T12:00:00").getDay() + 6) % 7];
export const vociDelGiorno = (settimana, data) => settimana?.[giornoDi(data)] ?? [];

// Sposta una voce in un altro giorno (o in un'altra posizione dello stesso). Restituisce una settimana nuova.
export function spostaVoce(settimana, id, versoGiorno, posizione = Infinity) {
  const s = Object.fromEntries(GIORNI.map((g) => [g, [...(settimana[g] ?? [])]]));
  let voce = null;
  for (const g of GIORNI) { const i = s[g].findIndex((v) => v.id === id); if (i >= 0) [voce] = s[g].splice(i, 1); }
  if (!voce) return settimana;
  s[versoGiorno].splice(Math.min(posizione, s[versoGiorno].length), 0, voce);
  return s;
}

// Una voce è fatta se quel giorno c'è un allenamento dello stesso tipo non già usato da un'altra voce.
export function statoVoci(voci, sessioniDelGiorno) {
  const libere = [...sessioniDelGiorno];
  return voci.map((v) => {
    const i = libere.findIndex((s) => s.tipo === v.tipo && (!v.sottotipo || !s.sottotipo || s.sottotipo === v.sottotipo));
    return { ...v, fatta: i >= 0 ? libere.splice(i, 1)[0] : null };
  });
}

/* ---------- forza: precompilazione ---------- */
// Le serie dell'ultima volta per quell'esercizio, prima di una data; altrimenti quelle della scheda.
export function ultimaVolta(sessioni, nome, primaDi) {
  const prec = sessioni.filter((s) => s.tipo === "Forza" && s.data < primaDi && s.esercizi?.some((e) => e.nome === nome))
    .sort((a, b) => b.data.localeCompare(a.data))[0];
  if (!prec) return null;
  const e = prec.esercizi.find((x) => x.nome === nome);
  return { data: prec.data, serie: e.serie ?? [], unita: e.unita ?? null };
}
// Unità della scheda (o dell'ultima volta, per un esercizio aggiunto al momento); le serie dell'ultima volta valgono
// solo se erano nella stessa unità.
export function precompilaEsercizio(esScheda, sessioni, data) {
  const u = ultimaVolta(sessioni, esScheda.nome, data);
  const unita = esScheda.unita ?? u?.unita ?? null;
  const base = u?.serie?.length && u.unita === unita ? u.serie : esScheda.serie ?? [];
  return { nome: esScheda.nome, recupero_s: esScheda.recupero_s ?? null, nota: esScheda.nota ?? "", unita, ultima: u,
    serie: base.map((s) => ({ kg: s.kg ?? null, ...(unita === "sec" ? { sec: s.sec ?? null } : { rip: s.rip ?? null }), fatta: false })) };
}

/* ---------- recupero ---------- */
// Battito di stanotte rispetto alla media personale dei giorni precedenti: soglia = media + scarto.
// Due giorni di fila sopra la soglia → riduci il carico. Servono almeno 5 valori per avere una media.
// Due misure, mai mischiate: il battito nel sonno e, quando manca, il battito a riposo (per esempio da Health
// Connect, se l'orologio non esporta il battito della notte). Ogni valore si confronta con la media della sua misura.
export const MISURE_RECUPERO = {
  fc_sonno: { nome: "battito nel sonno", titolo: "Battito nel sonno", giorni: "notti", stanotte: "stanotte", due: "Due notti col battito alto" },
  fc_riposo: { nome: "battito a riposo", titolo: "Battito a riposo", giorni: "giorni", stanotte: "oggi", due: "Due giorni col battito a riposo alto" },
};
export function recupero(notti, data, { scarto_bpm = 3, notti: quante = 14 } = {}) {
  const misure = Object.keys(MISURE_RECUPERO).map((k) => {
    const ord = notti.filter((n) => n[k] != null).sort((a, b) => b.data.localeCompare(a.data));
    return { k, ord, stanotte: ord.find((n) => n.data === data), prima: ord.filter((n) => n.data < data).slice(0, quante) };
  });
  const pronta = (m) => m.prima.length >= 5;
  // Prima la misura di oggi con una media; poi quella di oggi; poi quella con il dato più recente.
  const recente = (m) => m.prima[0]?.data ?? "";
  const m = misure.find((x) => x.stanotte && pronta(x)) ?? misure.find((x) => x.stanotte)
    ?? [...misure].sort((a, b) => Number(pronta(b)) - Number(pronta(a)) || recente(b).localeCompare(recente(a)))[0];
  const { k, ord, stanotte, prima } = m;
  const M = MISURE_RECUPERO[k];
  const base = { misura: k, stanotte: stanotte ?? null, valore: stanotte?.[k] ?? null };
  if (!pronta(m)) return { ...base, stato: "dati", testo: `Servono almeno 5 ${M.giorni} col ${M.nome} per la tua media (ne hai ${prima.length}).`, media: null, soglia: null };
  const media = prima.reduce((a, n) => a + n[k], 0) / prima.length;
  const soglia = Math.round(media + scarto_bpm);
  // Notte registrata ma senza battito (per esempio importata con la sola durata): manca solo il battito.
  if (!stanotte) return notti.some((n) => n.data === data)
    ? { ...base, stato: "senzaFc", testo: `Manca il ${M.nome} di ${M.stanotte}: serve per il controllo del recupero.`, media, soglia }
    : { ...base, stato: "manca", testo: "Manca la notte di oggi.", media, soglia };
  const ieri = ord.find((n) => n.data === giornoPrima(data));
  const alta = (n) => n && n[k] >= soglia;
  if (alta(stanotte) && alta(ieri)) return { ...base, stato: "riduci", testo: `${M.due}: riduci il carico oggi e domani.`, media, soglia };
  if (alta(stanotte)) return { ...base, stato: "attenzione", testo: `${M.nome[0].toUpperCase() + M.nome.slice(1)} più alto del solito ${M.stanotte}.`, media, soglia };
  return { ...base, stato: "ok", testo: "Via libera.", media, soglia };
}
const giornoPrima = (d) => { const x = new Date(d + "T12:00:00"); x.setDate(x.getDate() - 1); return x.toISOString().slice(0, 10); };

/* ---------- backup ---------- */
export const COLLEZIONI = ["sessioni", "dettagli", "schede", "notti", "peso"];
export function creaBackup({ profilo, settimana, ...collezioni }) {
  return { app: "allenamento", versione: VERSIONE_BACKUP, creato: new Date().toISOString(), profilo, settimana,
    ...Object.fromEntries(COLLEZIONI.map((c) => [c, collezioni[c] ?? []])) };
}
// Controlla un backup prima di importarlo: forma, id sicuri, date valide. Restituisce i documenti da scrivere.
export function validaBackup(json) {
  const b = typeof json === "string" ? JSON.parse(json) : json;
  if (b?.app !== "allenamento") throw new Error("Non è un backup di questa app");
  if (b.versione > VERSIONE_BACKUP) throw new Error("Backup di una versione più nuova dell'app");
  const idValido = (id) => typeof id === "string" && /^[\w.-]{1,80}$/.test(id);
  const out = { profilo: b.profilo && typeof b.profilo === "object" ? b.profilo : null, settimana: b.settimana ?? null };
  for (const c of COLLEZIONI) {
    const docs = Array.isArray(b[c]) ? b[c] : [];
    const cattivi = docs.filter((d) => !idValido(d?.id));
    if (cattivi.length) throw new Error(`${cattivi.length} documenti in «${c}» hanno un id non valido`);
    out[c] = docs;
  }
  return out;
}

export function idCasuale() { return Math.random().toString(36).slice(2, 10); }
