// GPS e fascia cardio con la stessa interfaccia in tre ambienti:
// - app Android (Capacitor): posizione con servizio in primo piano e Bluetooth nativo, anche a schermo spento;
// - app dal sito (browser): Geolocation e Web Bluetooth, solo con l'app aperta e lo schermo acceso; su iPhone niente fascia;
// - dentro claude.ai niente: negli artifact posizione e Bluetooth sono bloccati.
// Su 127.0.0.1 la fascia si può sostituire con una finta (window.__fasciaFinta = t => battito) per le prove automatiche.
import { leggiMisuraFc } from "./analisi-file.js";

const SERVIZIO_FC = "0000180d-0000-1000-8000-00805f9b34fb";
const MISURA_FC = "00002a37-0000-1000-8000-00805f9b34fb";
const attesa = (ms) => new Promise((r) => setTimeout(r, ms));

export const nativo = () => !!window.Capacitor?.isNativePlatform?.();
const inClaude = () => !nativo() && !!window.claude;
const finta = () => location.hostname === "127.0.0.1" && !!window.__fasciaFinta;
const plugin = (nome) => window.Capacitor?.registerPlugin?.(nome);

export function disponibile() {
  return {
    gps: nativo() || (!inClaude() && "geolocation" in navigator && window.isSecureContext),
    fascia: nativo() || finta() || (!inClaude() && !!navigator.bluetooth),
    sfondo: nativo(), // registra anche a schermo spento
    inClaude: inClaude(),
  };
}

/* ---------- GPS ---------- */
// onPos({t, lat, lon, ele, vel, precisione, precisioneQuota}); onErrore(testo). Con `sfondo` (solo app Android) la posizione arriva anche
// a schermo spento, con la notifica fissa "Registrazione in corso". Restituisce la funzione che ferma il GPS.
export async function avviaGps(onPos, onErrore, { sfondo = false } = {}) {
  if (nativo()) {
    const bg = plugin("BackgroundGeolocation");
    const opzioni = { requestPermissions: true, stale: false, distanceFilter: 0 };
    if (sfondo) Object.assign(opzioni, { backgroundTitle: "Registrazione in corso", backgroundMessage: "Allenamento sta registrando percorso e battito." });
    const id = await bg.addWatcher(opzioni, (loc, err) => {
      if (err) return onErrore(err.code === "NOT_AUTHORIZED" ? "Permesso della posizione negato: attivalo nelle impostazioni dell'app." : err.message || "GPS non disponibile.");
      if (loc) onPos({ t: loc.time ?? Date.now(), lat: loc.latitude, lon: loc.longitude, ele: loc.altitude ?? null, vel: loc.speed ?? null, precisione: loc.accuracy ?? null, precisioneQuota: loc.altitudeAccuracy ?? null });
    });
    return () => bg.removeWatcher({ id }).catch(() => {});
  }
  const id = navigator.geolocation.watchPosition(
    (p) => onPos({ t: p.timestamp || Date.now(), lat: p.coords.latitude, lon: p.coords.longitude, ele: p.coords.altitude ?? null, vel: p.coords.speed ?? null, precisione: p.coords.accuracy ?? null, precisioneQuota: p.coords.altitudeAccuracy ?? null }),
    (e) => onErrore(e.code === 1 ? "Permesso della posizione negato: attivalo nelle impostazioni del browser." : "Posizione non disponibile, riprovo."),
    { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 });
  return () => navigator.geolocation.clearWatch(id);
}

/* ---------- barometro ---------- */
// Quota dal barometro del telefono (app Android, se il telefono ce l'ha): per il dislivello è molto più affidabile del
// GPS. onQuota({t, metri}) circa una volta al secondo. Restituisce la funzione che lo ferma, o null senza barometro.
// Nelle prove su 127.0.0.1, window.__barometroFinto(t) fa da barometro.
const baroFinto = () => location.hostname === "127.0.0.1" && typeof window.__barometroFinto === "function";
export async function haBarometro() {
  if (baroFinto()) return true;
  if (!nativo()) return false;
  try { return !!(await plugin("Barometro").disponibile()).disponibile; } catch { return false; }
}
export async function avviaBarometro(onQuota) {
  if (baroFinto()) {
    const id = setInterval(() => onQuota({ t: Date.now(), metri: window.__barometroFinto(Date.now()) }), 1000);
    return () => clearInterval(id);
  }
  if (!(await haBarometro())) return null;
  const b = plugin("Barometro");
  try {
    const ascolto = await b.addListener("quota", (d) => onQuota({ t: d.t, metri: d.metri }));
    await b.avvia();
    return () => { ascolto.remove(); b.ferma().catch(() => {}); };
  } catch { return null; }
}

export const apriImpostazioniPosizione = () => { if (nativo()) plugin("BackgroundGeolocation").openSettings().catch(() => {}); };

/* ---------- fascia cardio ---------- */
// Collega una fascia Bluetooth (servizio standard Heart Rate). onMisura({t, fc, contatto}); onStato("connessa" |
// "persa" | "ricollegata"). Se la fascia si stacca riprova da sola finché non la scolleghi: ogni 5 secondi per i primi
// minuti, poi ogni 30 per non consumare batteria. Restituisce {nome, scollega}.
const pausaTentativo = (i) => attesa(i < 40 ? 5000 : 30000);
export async function collegaFascia(onMisura, onStato) {
  if (finta()) return fasciaFinta(onMisura, onStato);
  if (nativo()) return fasciaNativa(onMisura, onStato);
  return fasciaBrowser(onMisura, onStato);
}

// Valore della notifica nativa: testo esadecimale ("16 4b 03...") → DataView.
function daEsadecimale(testo) {
  const cifre = String(testo ?? "").replace(/[^0-9a-f]/gi, "");
  const byte = new Uint8Array(cifre.length >> 1);
  for (let i = 0; i < byte.length; i++) byte[i] = parseInt(cifre.slice(i * 2, i * 2 + 2), 16);
  return new DataView(byte.buffer);
}

async function fasciaNativa(onMisura, onStato) {
  const ble = plugin("BluetoothLe");
  await ble.initialize({ androidNeverForLocation: true });
  const acceso = await ble.isEnabled().then((r) => r.value).catch(() => true);
  if (!acceso) await ble.requestEnable().catch(() => { throw new Error("Accendi il Bluetooth e riprova."); });
  const dev = await ble.requestDevice({ services: [SERVIZIO_FC] });
  const id = dev.deviceId;
  let attiva = true, ascoltoMisure = null, ascoltoStacco = null, ricollegando = false;
  const ascolta = async () => {
    await ascoltoMisure?.remove?.();
    ascoltoMisure = await ble.addListener(`notification|${id}|${SERVIZIO_FC}|${MISURA_FC}`, (ev) => {
      const dv = daEsadecimale(ev?.value);
      if (dv.byteLength >= 2) onMisura({ t: Date.now(), ...leggiMisuraFc(dv) });
    });
    await ble.startNotifications({ deviceId: id, service: SERVIZIO_FC, characteristic: MISURA_FC });
  };
  // Un solo giro di tentativi alla volta, anche se la fascia si stacca di nuovo mentre si sta ricollegando.
  const ricollega = async () => {
    if (ricollegando) return;
    ricollegando = true;
    for (let i = 0; attiva; i++) {
      try {
        await ble.connect({ deviceId: id, timeout: 10000 });
        if (!attiva) { ble.disconnect({ deviceId: id }).catch(() => {}); break; } // scollegata nel frattempo
        await ascolta();
        onStato("ricollegata");
        break;
      } catch { await pausaTentativo(i); }
    }
    ricollegando = false;
  };
  ascoltoStacco = await ble.addListener(`disconnected|${id}`, () => { if (attiva) { onStato("persa"); ricollega(); } });
  try {
    await ble.connect({ deviceId: id, timeout: 15000 });
    await ascolta();
  } catch (e) { attiva = false; ascoltoStacco?.remove?.(); throw e; }
  onStato("connessa");
  return {
    nome: dev.name || "Fascia cardio",
    async scollega() {
      attiva = false;
      try { await ble.stopNotifications({ deviceId: id, service: SERVIZIO_FC, characteristic: MISURA_FC }); } catch { /* già staccata */ }
      try { await ble.disconnect({ deviceId: id }); } catch { /* già staccata */ }
      try { await ascoltoMisure?.remove?.(); await ascoltoStacco?.remove?.(); } catch { /* già tolti */ }
    },
  };
}

async function fasciaBrowser(onMisura, onStato) {
  if (!navigator.bluetooth) throw new Error("Su questo telefono il browser non può collegarsi a una fascia: registro solo il percorso.");
  const dev = await navigator.bluetooth.requestDevice({ filters: [{ services: ["heart_rate"] }] });
  let attiva = true;
  const avvia = async () => {
    const server = await dev.gatt.connect();
    const car = await (await server.getPrimaryService("heart_rate")).getCharacteristic("heart_rate_measurement");
    car.addEventListener("characteristicvaluechanged", (e) => onMisura({ t: Date.now(), ...leggiMisuraFc(e.target.value) }));
    await car.startNotifications();
  };
  let ricollegando = false;
  dev.addEventListener("gattserverdisconnected", async () => {
    if (!attiva) return;
    onStato("persa");
    if (ricollegando) return;
    ricollegando = true;
    for (let i = 0; attiva; i++) {
      try { await avvia(); onStato("ricollegata"); break; } catch { await pausaTentativo(i); }
    }
    ricollegando = false;
  });
  await avvia();
  onStato("connessa");
  return { nome: dev.name || "Fascia cardio", async scollega() { attiva = false; try { dev.gatt.disconnect(); } catch { /* già staccata */ } } };
}

function fasciaFinta(onMisura, onStato) {
  const f = window.__fasciaFinta;
  const id = setInterval(() => { const fc = typeof f === "function" ? f(Date.now()) : 130; onMisura({ t: Date.now(), fc, contatto: true }); }, 1000);
  window.__fasciaFintaStato = onStato; // le prove possono fingere che la fascia si stacchi
  onStato("connessa");
  return { nome: "Fascia di prova", async scollega() { clearInterval(id); } };
}

/* ---------- schermo e notifiche ---------- */
// Nel browser lo schermo resta acceso durante la registrazione (si riprende il blocco quando la pagina torna visibile).
// Nell'app Android il cardio va anche a schermo spento; con `sempre` (timer HIIT, recupero della forza) lo schermo resta
// acceso anche lì, perché a schermo spento Android può fermare timer e segnali.
export async function schermoAcceso(sempre = false) {
  if (nativo()) {
    if (!sempre) return () => {};
    const k = plugin("KeepAwake");
    try { await k.keepAwake(); } catch { return () => {}; }
    return () => { k.allowSleep().catch(() => {}); };
  }
  if (!navigator.wakeLock) return () => {};
  let blocco = null, attivo = true;
  const prendi = async () => { try { blocco = await navigator.wakeLock.request("screen"); } catch { /* il browser può rifiutare */ } };
  const visibile = () => { if (attivo && document.visibilityState === "visible") prendi(); };
  document.addEventListener("visibilitychange", visibile);
  await prendi();
  return () => { attivo = false; document.removeEventListener("visibilitychange", visibile); blocco?.release?.().catch(() => {}); };
}

// Notifica immediata con suono e vibrazione (app Android), anche a schermo spento: per gli avvisi di zona. Sempre lo
// stesso id, così un avviso nuovo sostituisce il precedente.
let canaleZona = null;
export async function notificaZona(titolo, testo) {
  if (!nativo()) return;
  const n = plugin("LocalNotifications");
  try {
    canaleZona ??= n.createChannel({ id: "zona", name: "Avvisi di zona", description: "Battito fuori dalla zona scelta durante la registrazione", importance: 4, vibration: true, visibility: 1 });
    try { await canaleZona; } catch { canaleZona = null; } // la prossima volta si riprova a crearlo
    await n.schedule({ notifications: [{ id: 7001, title: titolo, body: testo, channelId: "zona", smallIcon: "ic_registrazione" }] });
  } catch { /* senza permesso delle notifiche restano i bip */ }
}

// Android 13+: senza questo permesso la notifica "Registrazione in corso" non si vede (la registrazione va lo stesso).
export async function permessoNotifiche() {
  if (!nativo()) return;
  try { await plugin("LocalNotifications").requestPermissions(); } catch { /* facoltativo */ }
}

/* ---------- file: backup e GPX con il pannello Condividi di Android ---------- */
export async function condividiFile(nome, testo, titolo = "Salva il backup") {
  const { uri } = await plugin("Filesystem").writeFile({ path: nome, data: testo, directory: "CACHE", encoding: "utf8" });
  await plugin("Share").share({ title: nome, files: [uri], dialogTitle: titolo });
}
// Un file da mandare ad altre app o salvare: nell'app Android col pannello Condividi; nel browser con la condivisione
// del telefono o, sul computer, come download.
export async function salvaFile(nome, testo, { tipo = "application/octet-stream", titolo = nome } = {}) {
  if (nativo()) return condividiFile(nome, testo, titolo);
  const file = new File([testo], nome, { type: tipo });
  if (matchMedia("(pointer: coarse)").matches && navigator.canShare?.({ files: [file] })) return navigator.share({ files: [file], title: titolo });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(file), download: nome });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

/* ---------- copia automatica del backup, in Documenti/Allenamento del telefono (app Android) ---------- */
// Un file per giorno; restano le ultime `tieni` copie. Android lascia toccare solo i file creati da questa
// installazione: quelli di un'installazione precedente restano dove sono, e se il nome è già preso se ne usa un altro.
const CARTELLA_COPIE = "Allenamento";
export const DOVE_COPIE = "Documenti › Allenamento";
export async function salvaCopia(giorno, testo, tieni = 5) {
  const fs = plugin("Filesystem");
  const scrivi = (nome) => fs.writeFile({ path: `${CARTELLA_COPIE}/${nome}`, data: testo, directory: "DOCUMENTS", encoding: "utf8", recursive: true });
  try { await scrivi(`allenamento-copia-${giorno}.json`); }
  catch { await scrivi(`allenamento-copia-${giorno}-${Date.now().toString(36)}.json`); }
  try {
    const { files } = await fs.readdir({ path: CARTELLA_COPIE, directory: "DOCUMENTS" });
    const vecchie = files.map((f) => f.name).filter((n) => /^allenamento-copia-\d{4}-\d{2}-\d{2}(-\w+)?\.json$/.test(n)).sort().slice(0, -tieni);
    for (const n of vecchie) await fs.deleteFile({ path: `${CARTELLA_COPIE}/${n}`, directory: "DOCUMENTS" }).catch(() => {});
  } catch { /* senza elenco restano anche le copie vecchie */ }
}

/* ---------- tasto e gesto Indietro di Android ---------- */
// Il plugin nativo Indietro avvisa la pagina; `gestisci()` dice se l'app ha fatto qualcosa (chiuso un foglio, tornata
// alla vista di prima). Se no, l'app va in secondo piano come con il tasto Home: una registrazione in corso continua.
// Su 127.0.0.1 le prove chiamano window.__indietro().
export function tastoIndietro(gestisci) {
  if (location.hostname === "127.0.0.1") window.__indietro = gestisci;
  if (!nativo()) return;
  const p = plugin("Indietro");
  p.addListener("indietro", () => { let fatto = false; try { fatto = gestisci(); } catch { /* si esce */ } if (!fatto) p.esci().catch(() => {}); }).catch(() => {});
}

/* ---------- file aperti o condivisi da altre app (FIT, GPX, TCX) ---------- */
// L'app Android compare in "Apri con" e "Condividi" per questi file: il plugin nativo FileInArrivo li legge e qui
// diventano File come quelli scelti a mano. Se il nome non ha l'estensione giusta (capita con alcune app), il formato si
// riconosce dal contenuto; altrimenti il file arriva così com'è e l'importazione lo scarta.
export function formatoDa(byte) {
  if (byte.length >= 12 && String.fromCharCode(...byte.slice(8, 12)) === ".FIT") return "fit";
  const testo = new TextDecoder().decode(byte.slice(0, 4096));
  return /<gpx[\s>]/.test(testo) ? "gpx" : /<TrainingCenterDatabase[\s>]/.test(testo) ? "tcx" : null;
}
export function fileInArrivo(onFile, onErrore) {
  if (!nativo()) return;
  const p = plugin("FileInArrivo");
  const prendi = async () => {
    try {
      const r = await p.prendi();
      if (!r?.dati) return;
      const byte = Uint8Array.from(atob(r.dati), (c) => c.charCodeAt(0));
      let nome = String(r.nome || "allenamento").split(/[\/]/).pop();
      const formato = formatoDa(byte);
      if (formato && !nome.toLowerCase().endsWith("." + formato)) nome = `${nome.replace(/\.[^.]*$/, "")}.${formato}`;
      onFile(new File([byte], nome, { type: r.tipo || "application/octet-stream" }));
    } catch (e) { onErrore?.(e?.message ?? "file non letto"); }
  };
  p.addListener("file", prendi).catch(() => {});
  prendi();
}

/* ---------- Health Connect (app Android, Android 14 o successivo) ---------- */
// Plugin nativo Salute, solo lettura. stato() e chiediPermessi() → { disponibile, sonno, battito, ossigeno, peso };
// leggi(da, a) in ms → { notti: [{inizio, fine, dormito_min, fc_somma, fc_n, spo2_*, fonte}], pesi: [{t, kg, fonte}] }.
// Su 127.0.0.1 window.__saluteFinta ({ stato, leggi(da, a) }) fa da Health Connect per le prove automatiche.
const saluteFinta = () => location.hostname === "127.0.0.1" && window.__saluteFinta ? window.__saluteFinta : null;
export const saluteNelTelefono = () => nativo() || !!saluteFinta();
export const salute = {
  stato: async () => saluteFinta()?.stato ?? (nativo() ? plugin("Salute").stato() : { disponibile: false }),
  chiediPermessi: async () => saluteFinta()?.stato ?? plugin("Salute").chiediPermessi(),
  apriImpostazioni: async () => (saluteFinta() ? undefined : plugin("Salute").apriImpostazioni()),
  leggi: async (da, a) => saluteFinta()?.leggi(da, a) ?? plugin("Salute").leggi({ da, a }),
};
