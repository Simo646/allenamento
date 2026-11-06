// Carico di allenamento e forma: il modello di Banister, lo stesso di forma/fatica/bilancio (CTL/ATL/TSB) di
// TrainingPeaks e del carico di Garmin, in versione semplice. È una tendenza, non una misura precisa.
// - Carico di una sessione: minuti in zona pesati 1-5 (TRIMP di Edwards: Z1×1 … Z5×5), diviso 2 perché un'ora in Z2
//   valga circa 60 punti, come i TSS di Wahoo. Per la forza il battito lo sottostima: conta la fatica percepita
//   (1-10, convertita nel peso di una zona); la stessa fatica vale anche per il cardio senza battito. Senza né battito
//   né fatica, una stima per tipo (marcata "stima").
// - Forma di fondo: media esponenziale del carico di ogni giorno su 42 giorni; fatica: su 7 giorni; bilancio: forma
//   meno fatica. Il giudizio guarda il bilancio rispetto alla forma, quindi non dipende dalla scala dei punti.
export const FATICA = [[1, "molto facile"], [2, "facile"], [3, "moderata"], [4, "abbastanza dura"], [5, "dura"], [6, ""], [7, "molto dura"], [8, ""], [9, ""], [10, "massima"]];
const SCALA = 0.5;
// Peso al minuto (come una zona, 1-5) della fatica percepita: 3 "moderata" = Z2, 5 "dura" = Z3, 7 "molto dura" = Z4.
export const pesoFatica = (f) => Math.min(5, (f + 1) / 2);
// Senza battito né fatica: forza "abbastanza dura", HIIT tra Z3 e Z4, il resto Z2.
const PESO_STIMATO = { Forza: 2.5, HIIT: 3.5 };
const faticaValida = (f) => (Number.isInteger(f) && f >= 1 && f <= 10 ? f : null);

// → { carico (punti, intero), da: "battito" | "fatica" | "stima" | null }
export function caricoSessione(s) {
  const min = Number(s?.durata_min) || 0;
  if (min <= 0) return { carico: 0, da: null };
  const zone = [1, 2, 3, 4, 5].map((i) => Number(s[`z${i}_min`]) || 0);
  const inZona = zone.reduce((a, b) => a + b, 0);
  // Battito valido se copre almeno metà della durata; si riporta alla durata intera.
  const daBattito = inZona >= min * 0.5 ? (zone.reduce((a, m, i) => a + m * (i + 1), 0) * min) / inZona : null;
  const fatica = faticaValida(s.fatica);
  const daFatica = fatica ? min * pesoFatica(fatica) : null;
  const stima = min * (PESO_STIMATO[s.tipo] ?? 2);
  let trimp, da;
  if (s.tipo === "Forza") {
    if (daFatica != null) [trimp, da] = [daFatica, "fatica"];
    else if (daBattito != null && daBattito > stima) [trimp, da] = [daBattito, "battito"];
    else [trimp, da] = [stima, "stima"];
  } else if (daBattito != null) [trimp, da] = [daBattito, "battito"];
  else if (daFatica != null) [trimp, da] = [daFatica, "fatica"];
  else [trimp, da] = [stima, "stima"];
  return { carico: Math.round(trimp * SCALA), da };
}

const piuGiorni = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const K_FORMA = 1 - Math.exp(-1 / 42), K_FATICA = 1 - Math.exp(-1 / 7);

// Giorno per giorno dal primo allenamento a `al` (compreso): [{ data, carico, forma, fatica, bilancio }].
export function andamentoForma(sessioni = [], al) {
  const perGiorno = new Map();
  for (const s of sessioni) {
    if (!s?.data || s.data > al) continue;
    const { carico } = caricoSessione(s);
    if (carico > 0) perGiorno.set(s.data, (perGiorno.get(s.data) ?? 0) + carico);
  }
  if (!perGiorno.size) return [];
  const primo = [...perGiorno.keys()].sort()[0];
  // Partenza: forma e fatica uguali alla media giornaliera delle prime 4 settimane (riposi compresi), così all'inizio
  // la forma non parte da zero e il bilancio non sembra negativo per settimane.
  let giorniInizio = 0, somma = 0;
  for (let d = primo; d <= al && giorniInizio < 28; d = piuGiorni(d, 1), giorniInizio++) somma += perGiorno.get(d) ?? 0;
  let forma = somma / giorniInizio, fatica = forma;
  const out = [];
  for (let d = primo; d <= al; d = piuGiorni(d, 1)) {
    const carico = perGiorno.get(d) ?? 0;
    forma += (carico - forma) * K_FORMA;
    fatica += (carico - fatica) * K_FATICA;
    out.push({ data: d, carico, forma, fatica, bilancio: forma - fatica });
  }
  return out;
}

// Giudizio sul bilancio di un giorno, rispetto alla forma di fondo. Le soglie sono quelle di TrainingPeaks (+25, +5,
// −10, −30 punti) riportate a una forma tipica di 60: +0,4, +0,1, −0,2, −0,5. `giorni` = quanti giorni di storia ci sono.
export function giudizioForma(p, giorni) {
  const poca = giorni < 42 ? " Con meno di 6 settimane di allenamenti il confronto con il solito è ancora approssimativo." : "";
  if (!p || p.forma < 5) return { stato: "Pochi dati", testo: "Il bilancio diventa affidabile dopo qualche settimana di allenamenti." + poca, livello: "" };
  const r = p.bilancio / p.forma;
  if (r > 0.4) return { stato: "Riposato", testo: "Ti sei allenato molto meno del solito: bene prima di una prova o dopo un periodo duro; se dura settimane, la forma di fondo cala." + poca, livello: "" };
  if (r > 0.1) return { stato: "Fresco", testo: "Buon momento per un allenamento impegnativo o una prova." + poca, livello: "ok" };
  if (r >= -0.2) return { stato: "In equilibrio", testo: "Ti stai allenando come al solito." + poca, livello: "ok" };
  if (r >= -0.5) return { stato: "Sotto carico", testo: "Stai caricando più del solito: normale in un periodo in cui costruisci, se ci metti anche giorni di recupero." + poca, livello: "" };
  return { stato: "Molto affaticato", testo: "Carico molto sopra il solito: valuta qualche giorno più leggero, soprattutto se dormi male o il battito notturno è alto." + poca, livello: "warn" };
}
