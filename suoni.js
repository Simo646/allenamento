// Segnali sonori di timer HIIT e recupero della forza: bip brevi a 3, 2 e 1 secondo e un bip lungo allo scatto, più
// acuto quando si parte e più grave quando ci si ferma. Si programmano in anticipo sul tempo dell'audio (Web Audio):
// così suonano puntuali anche se il telefono rallenta i timer della pagina. Volume: quello dei contenuti multimediali.
import { ricorda } from "./util.js";

let ctx = null;
export const suoniAttivi = () => ricorda.leggi("suoni") !== false;
export const impostaSuoni = (si) => ricorda.scrivi("suoni", si ? null : false);

// Da chiamare dentro un tocco (Avvia, spunta di una serie): i browser accendono l'audio solo dopo un gesto.
export function sbloccaAudio() {
  try {
    ctx ??= new (window.AudioContext ?? window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
  } catch { ctx = null; }
  return ctx;
}

const TONI = { via: [880, 1320, 0.5], stop: [660, 440, 0.5], fine: [660, 880, 1.2] }; // conto, scatto (Hz), durata scatto (s)

function bip(frequenza, durata, quando) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = "square";
  o.frequency.value = frequenza;
  g.gain.setValueAtTime(0, quando);
  g.gain.linearRampToValueAtTime(0.16, quando + 0.01);
  g.gain.setValueAtTime(0.16, quando + durata - 0.03);
  g.gain.linearRampToValueAtTime(0, quando + durata);
  o.connect(g).connect(ctx.destination);
  o.start(quando);
  o.stop(quando + durata + 0.02);
  return g;
}

// Programma i conti alla rovescia: [{tra_s, tono}], con tra_s i secondi da adesso allo scatto. Restituisce la funzione
// che li annulla tutti (pausa, salto, audio spento).
export function programmaSegnali(segnali) {
  if (!suoniAttivi() || !sbloccaAudio()) return () => {};
  const t0 = ctx.currentTime + 0.05;
  const nodi = [];
  for (const { tra_s, tono } of segnali) {
    const [conto, scatto, durata] = TONI[tono] ?? TONI.via;
    for (const k of [3, 2, 1]) if (tra_s - k > 0) nodi.push(bip(conto, 0.12, t0 + tra_s - k));
    if (tra_s > 0) nodi.push(bip(scatto, durata, t0 + tra_s));
  }
  return () => { for (const g of nodi) try { g.disconnect(); } catch { /* già finito */ } };
}

// Avviso di zona: due bip acuti se il battito è sopra la zona (rallenta), due gravi se è sotto (aumenta).
export function segnaleZona(sopra) {
  if (!suoniAttivi() || !sbloccaAudio()) return;
  const t0 = ctx.currentTime + 0.05, f = sopra ? 1320 : 440;
  bip(f, 0.15, t0);
  bip(f, 0.15, t0 + 0.25);
}
