// Lingua dell'app: italiano o inglese. Si sceglie nelle Impostazioni (o vale quella del telefono) e resta su questo
// dispositivo. I testi restano scritti in italiano nel codice: T() li cerca nel dizionario di inglese.js, e el(), sv(),
// avviso() ed esito() traducono da soli le scritte che ricevono intere. Le frasi con dentro numeri o nomi passano da T()
// con i segnaposto {0}, {1}…; ciò che manca nel dizionario resta in italiano.
const nelBrowser = typeof document !== "undefined";
const scelta = (() => { try { return nelBrowser ? JSON.parse(localStorage.getItem("allenamento.lingua")) : null; } catch { return null; } })();
export const linguaTelefono = () => (nelBrowser && !/^it\b/i.test(navigator.language || "it") ? "en" : "it");
export const LINGUA = scelta === "it" || scelta === "en" ? scelta : linguaTelefono();
export const LINGUA_SCELTA = scelta === "it" || scelta === "en" ? scelta : null;
export const LOCALE = LINGUA === "en" ? "en-GB" : "it-IT";
const DIZ = LINGUA === "en" ? (await import("./inglese.js")).INGLESE : null;

export function traduci(s) {
  if (!DIZ || typeof s !== "string") return s;
  const x = DIZ[s];
  if (x != null) return x;
  const m = /^(\s*)([^]*?)(\s*)$/.exec(s);
  if (m[2] !== s && DIZ[m[2]] != null) return m[1] + DIZ[m[2]] + m[3];
  // Un numero dentro una frase già salvata nei dati, per esempio "Esercizio 2": si cerca "Esercizio {0}".
  const n = /\d+/.exec(s), conNumero = n && DIZ[s.replace(n[0], "{0}")];
  return conNumero ? conNumero.replace("{0}", n[0]) : s;
}
export function T(testo, ...valori) {
  const x = traduci(testo);
  return valori.length ? x.replace(/\{(\d)\}/g, (_, i) => valori[i] ?? "") : x;
}
// Per le prove: il dizionario in uso (null in italiano).
export const dizionario = () => DIZ;
