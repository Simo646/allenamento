// Notti e peso da Health Connect (app Android): le sessioni di sonno si raggruppano per mattina e diventano notti come
// quelle inserite a mano (durata, battito medio nel sonno, ossigeno minimo, medio e massimo); i pesi, uno per giorno
// (l'ultimo). Le voci inserite a mano non si toccano: si completano solo i valori che mancano.
import { stato, salvaGiorni } from "./stato.js";
import { ricorda } from "./util.js";
import { dataLocale } from "./analisi-file.js";
import { salute } from "./sorgenti.js";

export const FONTE_SALUTE = "Health Connect";
const MIN_NOTTE = 120; // minuti: i pisolini contano solo se quel giorno non c'è un sonno più lungo
const GIORNI = 30;     // Health Connect fa leggere gli ultimi 30 giorni prima del permesso

export const saluteAttiva = () => ricorda.leggi("salute") === true;
export const impostaSalute = (si) => ricorda.scrivi("salute", si || null);

// Sessioni di sonno dal plugin → { "2026-11-05": { durata_min, fc_sonno, spo2_min, spo2_media, spo2_max } }, per mattina.
export function nottiDaSessioni(sessioni = []) {
  const perData = new Map();
  for (const s of sessioni) {
    if (!(s.fine > s.inizio)) continue;
    const d = dataLocale(new Date(s.fine));
    if (!perData.has(d)) perData.set(d, []);
    perData.get(d).push(s);
  }
  const out = {};
  for (const [d, lista] of perData) {
    const lunghe = lista.filter((s) => s.dormito_min >= MIN_NOTTE);
    const prese = lunghe.length ? lunghe : lista;
    const somma = (k) => prese.reduce((a, s) => a + (Number(s[k]) || 0), 0);
    const estremi = (k) => prese.map((s) => s[k]).filter(Number.isFinite);
    const fcN = somma("fc_n"), spN = somma("spo2_n");
    const minimi = estremi("spo2_min"), massimi = estremi("spo2_max");
    out[d] = {
      durata_min: Math.round(somma("dormito_min")) || null,
      fc_sonno: fcN ? Math.round(somma("fc_somma") / fcN) : null,
      spo2_min: minimi.length ? Math.round(Math.min(...minimi)) : null,
      spo2_media: spN ? Math.round(somma("spo2_somma") / spN) : null,
      spo2_max: massimi.length ? Math.round(Math.max(...massimi)) : null,
    };
  }
  return out;
}

// Pesi dal plugin → { "2026-11-05": { kg } }: l'ultima pesata del giorno, al decimo di chilo.
export function pesiDaMisure(pesi = []) {
  const out = {};
  for (const p of [...pesi].sort((a, b) => a.t - b.t)) {
    if (!(p.kg >= 30 && p.kg <= 250)) continue;
    out[dataLocale(new Date(p.t))] = { kg: Math.round(p.kg * 10) / 10 };
  }
  return out;
}

// La voce da salvare, o null se non cambia niente. Su una voce inserita a mano si riempiono solo i campi vuoti; una
// voce già importata si aggiorna (un valore che ora manca, per esempio senza più permesso, resta quello di prima).
export function unisci(esistente, nuovo) {
  const { data, ...prima } = esistente ?? {};
  const manuale = !!esistente && prima.fonte !== FONTE_SALUTE;
  const dopo = { ...prima };
  for (const [k, v] of Object.entries(nuovo)) if (v != null && (!manuale || dopo[k] == null)) dopo[k] = v;
  if (!manuale) dopo.fonte = FONTE_SALUTE;
  const uguali = Object.keys({ ...prima, ...dopo }).every((k) => prima[k] === dopo[k]);
  return uguali ? null : dopo;
}

// Legge gli ultimi 30 giorni e salva le novità. → { notti, pesi, lette: { notti, pesi } } (salvate e lette).
export async function importaDaSalute() {
  const a = Date.now();
  const r = await salute.leggi(a - GIORNI * 864e5, a);
  const nuove = {}, nuoviPesi = {};
  for (const [d, v] of Object.entries(nottiDaSessioni(r?.notti))) {
    const x = unisci(stato.notti.find((n) => n.data === d), v);
    if (x) nuove[d] = x;
  }
  for (const [d, v] of Object.entries(pesiDaMisure(r?.pesi))) {
    const x = unisci(stato.peso.find((p) => p.data === d), v);
    if (x) nuoviPesi[d] = x;
  }
  await salvaGiorni("notti", nuove);
  await salvaGiorni("peso", nuoviPesi);
  ricorda.scrivi("salute-ultimo", new Date().toISOString());
  return { notti: Object.keys(nuove).length, pesi: Object.keys(nuoviPesi).length, lette: { notti: r?.notti?.length ?? 0, pesi: r?.pesi?.length ?? 0 } };
}

export function testoImport(r) {
  const parti = [r.notti ? `${r.notti} nott${r.notti === 1 ? "e" : "i"}` : null, r.pesi ? `${r.pesi} pes${r.pesi === 1 ? "o" : "i"}` : null].filter(Boolean);
  if (parti.length) return `Importat${r.notti + r.pesi === 1 ? (r.notti ? "a" : "o") : "i"} ${parti.join(" e ")}.`;
  return r.lette.notti || r.lette.pesi ? "Niente di nuovo: è già tutto nell'app."
    : "Health Connect non ha sonno né peso degli ultimi 30 giorni: controlla che l'app dell'orologio o della bilancia ci scriva.";
}

// All'apertura dell'app, se l'importazione è accesa e l'ultima ha più di 3 ore. Restituisce il testo da mostrare se
// è arrivato qualcosa di nuovo, altrimenti null.
export async function importaSeServe() {
  if (!saluteAttiva()) return null;
  const ultimo = Date.parse(ricorda.leggi("salute-ultimo") ?? "") || 0;
  if (Date.now() - ultimo < 3 * 3600e3) return null;
  const r = await importaDaSalute();
  return r.notti || r.pesi ? "Da Health Connect: " + testoImport(r).replace(/^Importat\w /, "").replace(/\.$/, "") : null;
}
