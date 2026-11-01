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
// onPos({t, lat, lon, ele, vel, precisione}); onErrore(testo). Con `sfondo` (solo app Android) la posizione arriva anche
// a schermo spento, con la notifica fissa "Registrazione in corso". Restituisce la funzione che ferma il GPS.
export async function avviaGps(onPos, onErrore, { sfondo = false } = {}) {
  if (nativo()) {
    const bg = plugin("BackgroundGeolocation");
    const opzioni = { requestPermissions: true, stale: false, distanceFilter: 0 };
    if (sfondo) Object.assign(opzioni, { backgroundTitle: "Registrazione in corso", backgroundMessage: "Allenamento sta registrando percorso e battito." });
    const id = await bg.addWatcher(opzioni, (loc, err) => {
      if (err) return onErrore(err.code === "NOT_AUTHORIZED" ? "Permesso della posizione negato: attivalo nelle impostazioni dell'app." : err.message || "GPS non disponibile.");
      if (loc) onPos({ t: loc.time ?? Date.now(), lat: loc.latitude, lon: loc.longitude, ele: loc.altitude ?? null, vel: loc.speed ?? null, precisione: loc.accuracy ?? null });
    });
    return () => bg.removeWatcher({ id }).catch(() => {});
  }
  const id = navigator.geolocation.watchPosition(
    (p) => onPos({ t: p.timestamp || Date.now(), lat: p.coords.latitude, lon: p.coords.longitude, ele: p.coords.altitude ?? null, vel: p.coords.speed ?? null, precisione: p.coords.accuracy ?? null }),
    (e) => onErrore(e.code === 1 ? "Permesso della posizione negato: attivalo nelle impostazioni del browser." : "Posizione non disponibile, riprovo."),
    { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 });
  return () => navigator.geolocation.clearWatch(id);
}

export const apriImpostazioniPosizione = () => { if (nativo()) plugin("BackgroundGeolocation").openSettings().catch(() => {}); };

/* ---------- fascia cardio ---------- */
// Collega una fascia Bluetooth (servizio standard Heart Rate). onMisura({t, fc, rr, contatto}); onStato("connessa" |
// "persa" | "ricollegata"). Se la fascia si stacca riprova da sola per qualche minuto. Restituisce {nome, scollega}.
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
  let attiva = true, ascoltoMisure = null;
  const ascolta = async () => {
    await ascoltoMisure?.remove?.();
    ascoltoMisure = await ble.addListener(`notification|${id}|${SERVIZIO_FC}|${MISURA_FC}`, (ev) => {
      const dv = daEsadecimale(ev?.value);
      if (dv.byteLength >= 2) onMisura({ t: Date.now(), ...leggiMisuraFc(dv) });
    });
    await ble.startNotifications({ deviceId: id, service: SERVIZIO_FC, characteristic: MISURA_FC });
  };
  const ricollega = async () => {
    for (let i = 0; attiva && i < 40; i++) {
      try { await ble.connect({ deviceId: id, timeout: 10000 }); await ascolta(); onStato("ricollegata"); return; }
      catch { await attesa(5000); }
    }
  };
  await ble.addListener(`disconnected|${id}`, () => { if (attiva) { onStato("persa"); ricollega(); } });
  await ble.connect({ deviceId: id, timeout: 15000 });
  await ascolta();
  onStato("connessa");
  return {
    nome: dev.name || "Fascia cardio",
    async scollega() {
      attiva = false;
      try { await ble.stopNotifications({ deviceId: id, service: SERVIZIO_FC, characteristic: MISURA_FC }); } catch { /* già staccata */ }
      try { await ble.disconnect({ deviceId: id }); } catch { /* già staccata */ }
      await ascoltoMisure?.remove?.();
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
  dev.addEventListener("gattserverdisconnected", async () => {
    if (!attiva) return;
    onStato("persa");
    for (let i = 0; attiva && i < 40; i++) {
      try { await avvia(); onStato("ricollegata"); return; } catch { await attesa(5000); }
    }
  });
  await avvia();
  onStato("connessa");
  return { nome: dev.name || "Fascia cardio", async scollega() { attiva = false; try { dev.gatt.disconnect(); } catch { /* già staccata */ } } };
}

function fasciaFinta(onMisura, onStato) {
  const f = window.__fasciaFinta;
  const id = setInterval(() => { const fc = typeof f === "function" ? f(Date.now()) : 130; onMisura({ t: Date.now(), fc, rr: [60 / fc], contatto: true }); }, 1000);
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

// Android 13+: senza questo permesso la notifica "Registrazione in corso" non si vede (la registrazione va lo stesso).
export async function permessoNotifiche() {
  if (!nativo()) return;
  try { await plugin("LocalNotifications").requestPermissions(); } catch { /* facoltativo */ }
}

/* ---------- file: backup con il pannello Condividi di Android ---------- */
export async function condividiFile(nome, testo) {
  const { uri } = await plugin("Filesystem").writeFile({ path: nome, data: testo, directory: "CACHE", encoding: "utf8" });
  await plugin("Share").share({ title: nome, files: [uri], dialogTitle: "Salva il backup" });
}
