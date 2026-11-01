// Lettore dei file FIT (Garmin FIT JavaScript SDK 21.218.0). La licenza Garmin non permette di distribuirlo, quindi si
// scarica all'uso da jsDelivr. Nell'app installata dal sito e nell'app Android ogni file si verifica con la sua impronta
// SHA-256 prima di eseguirlo: se jsDelivr servisse un file diverso da quello pubblicato da Garmin il lettore non parte,
// così nessun codice estraneo può arrivare ai tuoi dati, al Bluetooth o alla posizione.
// Dentro claude.ai (artifact isolato, che non può mandare dati ad altri siti) si importa direttamente il pacchetto unico.
const VERSIONE = "21.218.0";
const BASE = `https://cdn.jsdelivr.net/npm/@garmin/fitsdk@${VERSIONE}/src/`;
export const IMPRONTE = {
  "accumulator.js": "FJRQxhqaaP836kqS/O3hpdxrYYR1TiOW9ANwRf4x94c=",
  "bit-stream.js": "YnfYmHSRwKYqPU4lwN8CdkTudhKJL++sQUYfiO1DQ7c=",
  "crc-calculator.js": "IVoaQDGwDIEGMdgygZgweqwgX4sHFlao/0oDLJ8OVS0=",
  "decoder.js": "ILCXG0GBMpfNOWvxzcqysUuYCSuj4NHxzzMOFD7Mx4M=",
  "encoder.js": "fTsprvzxC5hA7HtCUn6TMlZ8774623Com+WJ0jj7mec=",
  "fit.js": "V5SMrcazGTMWkhJE0A7iNvxYoTtUZXJZ91mkO6oHJ1M=",
  "index.js": "ca+kzcZb8wljA2jCGinC/gLYslTRFW/PTpUkha5AJyA=",
  "mesg-definition.js": "tDQ2X7iJsny/JXe/7hO5d10SNT0CIrVMyIqjemBafgg=",
  "output-stream.js": "k0t8ox/tzIjf4ykRujK3mXfHYztFSg+r5ut8/RloC3U=",
  "profile.js": "BaAJC5a+mVZ9DmabaEbM+BNHtaeXV9iqbh54ljwMrtI=",
  "stream.js": "z4W+pJH1m89JGcYrCVDV/wMA2VLjO9KLr/tRGyMUvKo=",
  "utils-hr-mesg.js": "6p5K4T8g3E150Bsh2zE2a7wMJ4xkEyhmgwfKBqcdwfc=",
  "utils-internal.js": "PE3JIaT2zjqei5R4i5JefYJFqbf+xQJhNgMZVO4qhao=",
  "utils-memo-glob.js": "/0zQs/6V3trdobAJU1PWY6cVstZLLr6bU+vSY7puKLY=",
  "utils.js": "Pjye8eMwui2m+HoWFPh7yKbRav91ClQaTBRf8eIgYX0=",
};
export const FILE_LETTORE = Object.keys(IMPRONTE).map((f) => BASE + f);

let promessa = null;
export function caricaLettoreFit() {
  promessa ??= (window.claude ? import(`https://cdn.jsdelivr.net/npm/@garmin/fitsdk@${VERSIONE}/+esm`) : caricaVerificato())
    .catch((e) => { promessa = null; throw e; });
  return promessa;
}

async function caricaVerificato() {
  const testi = {};
  await Promise.all(Object.entries(IMPRONTE).map(async ([nome, attesa]) => {
    const risposta = await fetch(BASE + nome, { cache: "force-cache" });
    if (!risposta.ok) throw new Error("non riesco a scaricare il lettore FIT: controlla la connessione");
    const byte = await risposta.arrayBuffer();
    const impronta = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest("SHA-256", byte))));
    if (impronta !== attesa) throw new Error("il lettore FIT scaricato non è quello originale: per sicurezza non lo uso");
    testi[nome] = new TextDecoder().decode(byte);
  }));
  // Ogni file diventa un modulo da blob: con gli import relativi ("./x.js", "../src/x.js") puntati ai blob verificati.
  const indirizzi = {};
  const indirizzo = (nome) => {
    if (indirizzi[nome]) return indirizzi[nome];
    const codice = testi[nome].replace(/from\s*"(?:\.\/|\.\.\/src\/)([a-z0-9-]+\.js)"/g, (_, dip) => {
      if (!(dip in testi)) throw new Error("lettore FIT: file inatteso " + dip);
      return `from "${indirizzo(dip)}"`;
    });
    return (indirizzi[nome] = URL.createObjectURL(new Blob([codice], { type: "text/javascript" })));
  };
  return import(indirizzo("index.js"));
}
