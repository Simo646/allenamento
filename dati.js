// Regole e modelli dell'app generale, senza DOM: profilo, settimana, schede, recupero, backup.
// Le viste li usano, i test in node li provano.

export const GIORNI = ["lun", "mar", "mer", "gio", "ven", "sab", "dom"];
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
// Forza: esercizi[{nome, recupero_s, serie:[{kg, rip}], nota}]
// HIIT: esercizi[{nome}], lavoro_s, pausa_s, giri, recupero_giri_s
// Cardio: tipo, sottotipo, durata_min | km, zona (1..5)
export function nuovaScheda(tipo) {
  const base = { titolo: "", tipo, nota: "" };
  if (tipo === "Forza") return { ...base, titolo: "Forza", esercizi: [] };
  if (tipo === "HIIT") return { ...base, titolo: "HIIT", esercizi: [], lavoro_s: 40, pausa_s: 20, giri: 3, recupero_giri_s: 90 };
  return { ...base, titolo: tipo, sottotipo: null, durata_min: 45, km: null, zona: 2 };
}
export const durataHiit = (s) => Math.round(((s.lavoro_s + s.pausa_s) * (s.esercizi?.length ?? 0) * s.giri + s.recupero_giri_s * Math.max(0, s.giri - 1)) / 60);

// Schede di esempio per chi parte da un modello: si possono cambiare o cancellare.
export const SCHEDE_ESEMPIO = {
  "forza-a": { titolo: "Forza A · Corpo intero", tipo: "Forza", nota: "", esercizi: [
    { nome: "Squat con bilanciere", recupero_s: 120, serie: serieUguali(3, 8) },
    { nome: "Panca piana", recupero_s: 120, serie: serieUguali(3, 8) },
    { nome: "Rematore con bilanciere", recupero_s: 90, serie: serieUguali(3, 10) },
    { nome: "Plank", recupero_s: 60, serie: serieUguali(3, 1), nota: "30-45 secondi" },
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
  return { data: prec.data, serie: prec.esercizi.find((e) => e.nome === nome).serie ?? [] };
}
export function precompilaEsercizio(esScheda, sessioni, data) {
  const u = ultimaVolta(sessioni, esScheda.nome, data);
  const base = u?.serie?.length ? u.serie : esScheda.serie ?? [];
  return { nome: esScheda.nome, recupero_s: esScheda.recupero_s ?? null, nota: esScheda.nota ?? "", ultima: u,
    serie: base.map((s) => ({ kg: s.kg ?? null, rip: s.rip ?? null, fatta: false })) };
}

/* ---------- recupero ---------- */
// Battito nel sonno rispetto alla media personale delle notti precedenti: soglia = media + scarto.
// Due notti di fila sopra la soglia → riduci il carico. Servono almeno 5 notti per avere una media.
export function recupero(notti, data, { scarto_bpm = 3, notti: quante = 14 } = {}) {
  const ord = notti.filter((n) => n.fc_sonno != null).sort((a, b) => b.data.localeCompare(a.data));
  const stanotte = ord.find((n) => n.data === data);
  const prima = ord.filter((n) => n.data < data).slice(0, quante);
  if (prima.length < 5) return { stato: "dati", testo: `Servono almeno 5 notti per la tua media (ne hai ${prima.length}).`, media: null, soglia: null, stanotte };
  const media = prima.reduce((a, n) => a + n.fc_sonno, 0) / prima.length;
  const soglia = Math.round(media + scarto_bpm);
  if (!stanotte) return { stato: "manca", testo: "Manca la notte di oggi.", media, soglia, stanotte: null };
  const ieri = ord.find((n) => n.data === giornoPrima(data));
  const alta = (n) => n && n.fc_sonno >= soglia;
  if (alta(stanotte) && alta(ieri)) return { stato: "riduci", testo: "Due notti col battito alto: riduci il carico oggi e domani.", media, soglia, stanotte };
  if (alta(stanotte)) return { stato: "attenzione", testo: "Battito più alto del solito stanotte.", media, soglia, stanotte };
  return { stato: "ok", testo: "Via libera.", media, soglia, stanotte };
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
