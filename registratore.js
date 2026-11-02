// Registrazione dal vivo, senza DOM né dispositivi: riceve posizioni e misure della fascia, gestisce pause manuali e
// automatiche, tiene i numeri da mostrare durante l'allenamento e alla fine produce lo stesso riassunto dei file
// importati (riassumiPunti di analisi-file.js). Lo usano dal-vivo.js e la forza in registra.js; i test lo provano in node.
import { riassumiPunti, rmssdDaRr, zonaDi, dataLocale } from "./analisi-file.js";

const PRECISIONE_MAX_M = 30; // posizioni meno precise si scartano
const MAX_VEL_GPS = 25; // m/s: oltre è un salto del GPS
// Salita: soglia di isteresi per fonte della quota. Il barometro è stabile; il GPS in verticale sbaglia di parecchi
// metri, quindi la sua quota si liscia (circa 30 s dal vivo, 60 s nel riassunto) e conta solo oltre i 10 m.
export const SOGLIA_SALITA = { barometro: 2, gps: 10 };
const PRECISIONE_QUOTA_MAX_M = 15; // quote GPS meno precise si scartano
const BARO_VALIDO_MS = 5000;
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
    this.fonteQuota = null; // "barometro" | "gps": la quota con cui si conta la salita dal vivo
    this.quotaLiscia = null;
    this.tQuota = null;
    this.ultimaBaro = null;
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

  // Una lettura del barometro {t, metri}: vale per le posizioni dei 5 s successivi.
  quota({ t, metri }) { if (Number.isFinite(metri)) this.ultimaBaro = { t, m: metri }; }

  // Una posizione {t, lat, lon, ele, vel, precisione, precisioneQuota}. Restituisce false se scartata per poca precisione.
  posizione({ t, lat, lon, ele = null, vel = null, precisione = null, precisioneQuota = null }) {
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
    const baro = this.ultimaBaro && Math.abs(t - this.ultimaBaro.t) <= BARO_VALIDO_MS ? this.ultimaBaro.m : null;
    this.punti.push({ t, lat, lon, ele, baro, pq: precisioneQuota, vel: v, fc, cad: null, pow: null, dist: null });
    if (!this.inPausa) {
      this.km += metri / 1000;
      this.#salita(t, baro, precisioneQuota != null && precisioneQuota > PRECISIONE_QUOTA_MAX_M ? null : ele);
    }
    return true;
  }

  // Salita dal vivo: col barometro la sua quota; senza, la quota GPS lisciata su circa 30 s.
  #salita(t, baro, gps) {
    let q, fonte;
    if (baro != null) { q = baro; fonte = "barometro"; }
    else if (gps != null) {
      const dt = this.tQuota != null ? Math.max(0, (t - this.tQuota) / 1000) : 0;
      this.quotaLiscia = this.quotaLiscia == null || this.fonteQuota !== "gps" ? gps : this.quotaLiscia + (1 - Math.exp(-dt / 30)) * (gps - this.quotaLiscia);
      this.tQuota = t;
      q = this.quotaLiscia; fonte = "gps";
    } else return;
    if (fonte !== this.fonteQuota || this.rifQuota == null) { this.fonteQuota = fonte; this.rifQuota = q; return; }
    const soglia = SOGLIA_SALITA[fonte];
    if (q - this.rifQuota >= soglia) { this.salita += q - this.rifQuota; this.rifQuota = q; }
    else if (this.rifQuota - q >= soglia) this.rifQuota = q;
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
    const { punti, fonte, soglia } = quoteMigliori([...this.punti].sort((x, y) => x.t - y.t));
    const base = riassumiPunti(punti, { limiti, attivi, inizio: this.inizio, sogliaSalita: soglia });
    const durS = attivi.reduce((s, [a, b]) => s + (b - a), 0) / 1000;
    return {
      ...base,
      data: dataLocale(this.inizio),
      tipo: this.tipo, sottotipo: this.sottotipo, indoor: false,
      durata_min: Math.round(durS / 60),
      vel_media: base.km && durS ? Math.round((base.km / durS) * 36000) / 10 : null,
      calorie: null, temp_media: null,
      rmssd_ms: rmssdDaRr(this.rr),
      salita_da: base.salita_m != null ? fonte : null,
      fonte: "Registrata con l'app", file: null,
    };
  }

  // Per riprendere dopo una chiusura dell'app.
  serializza() {
    const { tipo, sottotipo, scheda, conGps, autoPausa, inizio, punti, attivi, rr, pausaManuale, pausaAuto, km, salita, rifQuota, fonteQuota, quotaLiscia, tQuota, ultimaPos } = this;
    return { tipo, sottotipo, scheda, conGps, autoPausa, inizio, punti, attivi, rr, pausaManuale, pausaAuto, km, salita, rifQuota, fonteQuota, quotaLiscia, tQuota, ultimaPos };
  }
  static da(dati) {
    const r = new Registratore(dati);
    for (const k of ["inizio", "punti", "attivi", "rr", "pausaManuale", "pausaAuto", "km", "salita", "rifQuota", "fonteQuota", "quotaLiscia", "tQuota", "ultimaPos"]) if (k in dati) r[k] = dati[k];
    return r;
  }
}

// Quote per il riassunto. Col barometro (se c'era per quasi tutta l'uscita) la sua quota relativa, portata al livello
// medio del GPS; altrimenti la quota GPS lisciata su 60 s, senza le letture poco precise.
const mediana = (v) => { const o = [...v].sort((a, b) => a - b); return o.length ? (o[(o.length - 1) >> 1] + o[o.length >> 1]) / 2 : NaN; };
export function quoteMigliori(punti) {
  const conPos = punti.filter((p) => p.lat != null), conBaro = conPos.filter((p) => p.baro != null);
  if (conBaro.length >= 10 && conBaro.length >= 0.7 * conPos.length) {
    const scarto = mediana(conBaro.map((p) => p.ele).filter((q) => q != null)) - mediana(conBaro.map((p) => p.baro));
    const s = Number.isFinite(scarto) ? scarto : 0;
    return { fonte: "barometro", soglia: SOGLIA_SALITA.barometro, punti: punti.map((p) => ({ ...p, ele: p.baro != null ? p.baro + s : null })) };
  }
  const buone = punti.filter((p) => p.ele != null && !(p.pq > PRECISIONE_QUOTA_MAX_M));
  const lisce = new Map();
  for (let i = 0, a = 0, b = 0, somma = 0; i < buone.length; i++) {
    const t = buone[i].t;
    while (b < buone.length && buone[b].t <= t + 30000) somma += buone[b++].ele;
    while (buone[a].t < t - 30000) somma -= buone[a++].ele;
    lisce.set(buone[i], somma / (b - a));
  }
  return { fonte: "gps", soglia: SOGLIA_SALITA.gps, punti: punti.map((p) => ({ ...p, ele: lisce.get(p) ?? null })) };
}
