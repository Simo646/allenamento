// Registrazione dal vivo, senza DOM né dispositivi: riceve posizioni e misure della fascia, gestisce pause manuali e
// automatiche, tiene i numeri da mostrare durante l'allenamento e alla fine produce lo stesso riassunto dei file
// importati (riassumiPunti di analisi-file.js). Lo usano dal-vivo.js e la forza in registra.js; i test lo provano in node.
import { riassumiPunti, rmssdDaRr, zonaDi, dataLocale } from "./analisi-file.js";

const PRECISIONE_MAX_M = 30; // posizioni meno precise si scartano
const MAX_VEL_GPS = 25; // m/s: oltre è un salto del GPS
const SOGLIA_SALITA_M = 3;
// Pausa automatica sotto queste velocità (m/s) per 5 s, ripresa sopra per 2 s. Circa 3 km/h in bici, 2 km/h a piedi.
const SOGLIA_PAUSA = { Bici: 0.85, Corsa: 0.55, Camminata: 0.4, Trekking: 0.4 };
const ATTESA_PAUSA_MS = 5000, ATTESA_RIPRESA_MS = 2000;
const FC_VALIDA_MS = 5000; // il battito vale per le posizioni dei 5 s successivi

const rad = Math.PI / 180;
function metriTra(a, b) {
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

export class Registratore {
  constructor({ tipo, sottotipo = null, scheda = null, conGps = true, autoPausa = false } = {}) {
    Object.assign(this, { tipo, sottotipo, scheda, conGps, autoPausa });
    this.inizio = null;
    this.punti = [];
    this.attivi = []; // [[inizio, fine|null], ...] in ms
    this.rr = [];
    this.pausaManuale = false;
    this.pausaAuto = false;
    this.km = 0;
    this.salita = 0;
    this.rifQuota = null;
    this.vel = null;
    this.ultimaPos = null;
    this.ultimoFc = null;
    this.precisione = null;
    this.lentoDa = null;
    this.veloceDa = null;
  }

  get avviata() { return this.inizio != null; }
  get inPausa() { return this.pausaManuale || this.pausaAuto; }

  avvia(t) {
    this.inizio = t;
    this.attivi = [[t, null]];
  }
  #ferma(t) { const u = this.attivi[this.attivi.length - 1]; if (u && u[1] == null) u[1] = Math.max(t, u[0]); }
  #riparti(t) { const u = this.attivi[this.attivi.length - 1]; if (!u || u[1] != null) this.attivi.push([t, null]); }
  pausa(t) { if (!this.avviata) return; this.pausaManuale = true; this.#ferma(t); }
  riprendi(t) {
    if (!this.avviata) return;
    this.pausaManuale = false;
    this.pausaAuto = false;
    this.lentoDa = this.veloceDa = null;
    this.#riparti(t);
  }

  // Una posizione {t, lat, lon, ele, vel, precisione}. Restituisce false se scartata per poca precisione.
  posizione({ t, lat, lon, ele = null, vel = null, precisione = null }) {
    this.precisione = precisione;
    if (precisione != null && precisione > PRECISIONE_MAX_M) return false;
    const prec = this.ultimaPos;
    let metri = 0, v = vel;
    if (prec) {
      const dt = (t - prec.t) / 1000;
      metri = metriTra(prec, { lat, lon });
      if (v == null && dt > 0) v = metri / dt;
      if (dt <= 0 || metri / dt > MAX_VEL_GPS) metri = 0;
    }
    this.ultimaPos = { t, lat, lon };
    this.vel = v;
    if (!this.avviata) return true; // prima di partire serve solo a mostrare la precisione

    if (this.autoPausa && !this.pausaManuale && v != null) {
      const soglia = SOGLIA_PAUSA[this.tipo] ?? 0.5;
      if (v < soglia) {
        this.veloceDa = null;
        this.lentoDa ??= t;
        if (!this.pausaAuto && t - this.lentoDa >= ATTESA_PAUSA_MS) { this.pausaAuto = true; this.#ferma(this.lentoDa); }
      } else {
        this.lentoDa = null;
        this.veloceDa ??= t;
        if (this.pausaAuto && t - this.veloceDa >= ATTESA_RIPRESA_MS) { this.pausaAuto = false; this.#riparti(this.veloceDa); }
      }
    }
    const fc = this.ultimoFc && t - this.ultimoFc.t <= FC_VALIDA_MS ? this.ultimoFc.fc : null;
    this.punti.push({ t, lat, lon, ele, vel: v, fc, cad: null, pow: null, dist: null });
    if (!this.inPausa) {
      this.km += metri / 1000;
      if (ele != null) {
        if (this.rifQuota == null) this.rifQuota = ele;
        else if (ele - this.rifQuota >= SOGLIA_SALITA_M) { this.salita += ele - this.rifQuota; this.rifQuota = ele; }
        else if (this.rifQuota - ele >= SOGLIA_SALITA_M) this.rifQuota = ele;
      }
    }
    return true;
  }

  // Una misura della fascia {t, fc, rr}. Senza GPS (forza, HIIT), o se il GPS tace, il battito è un punto da solo.
  battito({ t, fc, rr = [] }) {
    if (!(fc > 25 && fc < 240)) return;
    this.ultimoFc = { t, fc };
    if (!this.avviata) return;
    if (!this.inPausa) this.rr.push(...rr);
    if (!this.conGps || !this.ultimaPos || t - this.ultimaPos.t > 2000)
      this.punti.push({ t, lat: null, lon: null, ele: null, vel: null, fc, cad: null, pow: null, dist: null });
  }

  tempoAttivoS(t) { return this.attivi.reduce((s, [a, b]) => s + ((b ?? t) - a), 0) / 1000; }
  fcAttuale(t) { return this.ultimoFc && t - this.ultimoFc.t <= FC_VALIDA_MS ? this.ultimoFc.fc : null; }
  zonaAttuale(t, limiti) { const fc = this.fcAttuale(t); return fc ? zonaDi(fc, limiti) : null; }

  // Riassunto con gli stessi campi di un file importato.
  riassunto(limiti, t) {
    const attivi = this.attivi.map(([a, b]) => [a, b ?? t]);
    const punti = [...this.punti].sort((x, y) => x.t - y.t);
    const base = riassumiPunti(punti, { limiti, attivi, inizio: this.inizio });
    const durS = attivi.reduce((s, [a, b]) => s + (b - a), 0) / 1000;
    return {
      ...base,
      data: dataLocale(this.inizio),
      tipo: this.tipo, sottotipo: this.sottotipo, indoor: false,
      durata_min: Math.round(durS / 60),
      vel_media: base.km && durS ? Math.round((base.km / durS) * 36000) / 10 : null,
      calorie: null, temp_media: null,
      rmssd_ms: rmssdDaRr(this.rr),
      fonte: "Registrata con l'app", file: null,
    };
  }

  // Per riprendere dopo una chiusura dell'app.
  serializza() {
    const { tipo, sottotipo, scheda, conGps, autoPausa, inizio, punti, attivi, rr, pausaManuale, pausaAuto, km, salita, rifQuota, ultimaPos } = this;
    return { tipo, sottotipo, scheda, conGps, autoPausa, inizio, punti, attivi, rr, pausaManuale, pausaAuto, km, salita, rifQuota, ultimaPos };
  }
  static da(dati) {
    const r = new Registratore(dati);
    for (const k of ["inizio", "punti", "attivi", "rr", "pausaManuale", "pausaAuto", "km", "salita", "rifQuota", "ultimaPos"]) if (k in dati) r[k] = dati[k];
    return r;
  }
}
