// Timer HIIT, senza DOM: dalle impostazioni (durata dell'esercizio, esercizi per giro, pausa tra gli esercizi, giri,
// pausa tra i giri) la sequenza delle fasi in secondi dall'avvio, la fase in corso a un certo istante e gli istanti
// dei segnali sonori. Lo usa dal-vivo.js; i test lo provano in node.

export const HIIT_PREDEFINITO = { lavoro_s: 40, n: 4, pausa_s: 20, giri: 3, recupero_giri_s: 90, preparazione_s: 10 };

// Impostazioni del timer da una scheda HIIT (o quelle di base senza scheda).
export const impostazioniDa = (scheda) => scheda ? {
  lavoro_s: scheda.lavoro_s ?? HIIT_PREDEFINITO.lavoro_s, n: scheda.esercizi?.length || HIIT_PREDEFINITO.n, pausa_s: scheda.pausa_s ?? HIIT_PREDEFINITO.pausa_s,
  giri: scheda.giri ?? HIIT_PREDEFINITO.giri, recupero_giri_s: scheda.recupero_giri_s ?? HIIT_PREDEFINITO.recupero_giri_s, preparazione_s: HIIT_PREDEFINITO.preparazione_s,
} : { ...HIIT_PREDEFINITO };

// Gli esercizi del giro: i nomi della scheda, allungati o accorciati al numero scelto.
export const eserciziDelGiro = (nomi = [], n) => Array.from({ length: Math.max(1, n || 1) }, (_, i) => nomi[i]?.trim() || `Esercizio ${i + 1}`);

// Fasi: [{tipo: "preparazione" | "lavoro" | "pausa" | "recupero", da, a, giro, n, esercizio}]. Il recupero tra i giri
// sostituisce la pausa dopo l'ultimo esercizio del giro; dopo l'ultimo esercizio dell'ultimo giro si finisce.
export function fasiHiit({ lavoro_s, pausa_s, giri, recupero_giri_s, preparazione_s = 0 }, esercizi) {
  const fasi = [];
  let t = 0;
  const aggiungi = (tipo, durata, giro, n, esercizio = null) => { if (durata > 0) { fasi.push({ tipo, da: t, a: t + durata, giro, n, esercizio }); t += durata; } };
  aggiungi("preparazione", preparazione_s, 1, 1);
  for (let g = 1; g <= giri; g++) esercizi.forEach((nome, i) => {
    aggiungi("lavoro", lavoro_s, g, i + 1, nome);
    const fineGiro = i === esercizi.length - 1;
    if (fineGiro && g < giri) aggiungi("recupero", recupero_giri_s, g + 1, 1);
    else if (!fineGiro) aggiungi("pausa", pausa_s, g, i + 2);
  });
  return fasi;
}

export const durataFasi = (fasi) => fasi.at(-1)?.a ?? 0;

// La situazione all'istante t (secondi dall'avvio): fase in corso e secondi che restano, l'esercizio in corso (o in
// arrivo, durante pause e recuperi) e quello che viene dopo.
export function statoTimer(fasi, t) {
  const totale = durataFasi(fasi);
  if (t >= totale) return { finito: true, totale, restaTotale: 0, ora: null, poi: null };
  const fase = fasi.find((f) => t < f.a);
  const lavori = fasi.filter((f) => f.tipo === "lavoro");
  const i = fase.tipo === "lavoro" ? lavori.indexOf(fase) : lavori.findIndex((f) => f.da >= fase.a);
  return { finito: false, fase, resta: fase.a - t, totale, restaTotale: totale - t, ora: lavori[i] ?? null, poi: lavori[i + 1] ?? null };
}

// Dove inizia la fase dopo quella in corso (per "Salta").
export const inizioFaseDopo = (fasi, t) => fasi.find((f) => t < f.a)?.a ?? durataFasi(fasi);

// Segnali: a ogni inizio di esercizio ("via"), a ogni fine ("stop") e alla fine dell'allenamento ("fine"). Ognuno ha
// il suo conto alla rovescia a 3-2-1 secondi.
export function segnaliHiit(fasi) {
  const lavori = fasi.filter((f) => f.tipo === "lavoro");
  return lavori.flatMap((f, i) => [
    ...(f.da > 0 ? [{ t: f.da, tono: "via" }] : []),
    { t: f.a, tono: i === lavori.length - 1 ? "fine" : "stop" },
  ]);
}
