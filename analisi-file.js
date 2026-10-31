// Calcoli sui file di allenamento: FIT (già decodificato con @garmin/fitsdk), GPX e TCX (testo).
// Niente I/O e niente DOM: lo usano l'app nel browser e i test in node, quindi i numeri sono gli stessi.
// Tutti i formati diventano la stessa lista di punti {t, lat, lon, ele, fc, cad, pow, vel, dist}
// e passano dagli stessi calcoli.

const MAX_PASSO_S = 10; // tra due punti più distanti di così c'è una pausa: non conta nel tempo
const SOGLIA_SALITA_M = 3; // isteresi per non sommare il rumore dell'altimetro
const PASSO_CURVA_S = 15;
const MAX_PUNTI_TRACCIA = 800;
const MAX_VEL_GPS = 25; // m/s: salti del GPS oltre questa velocità non contano nella distanza

/* ---------- tipi di attività ---------- */
export const TIPI = ["Forza", "HIIT", "Corsa", "Camminata", "Trekking", "Bici"];
export const SOTTOTIPI_BICI = ["Strada", "Gravel", "MTB"];
// Tipi con file (traccia, battito) e tipi registrati a mano.
export const TIPI_CON_FILE = ["Corsa", "Camminata", "Trekking", "Bici", "HIIT"];

// sport e subSport del FIT → tipo e sottotipo dell'app. Un sottotipo bici sconosciuto resta null: lo sceglie la persona.
export function tipoDaFit(sport, subSport) {
  const sub = subSport && subSport !== "generic" ? subSport : null;
  if (sport === "cycling" || sport === "eBiking") {
    const sottotipo = /gravel|cyclocross/i.test(sub ?? "") ? "Gravel"
      : /mountain|downhill/i.test(sub ?? "") ? "MTB"
      : sub === "road" ? "Strada" : null;
    return { tipo: "Bici", sottotipo, indoor: /indoor|virtual|spin/i.test(sub ?? "") };
  }
  if (sport === "running") return { tipo: "Corsa", sottotipo: sub === "trail" ? "Trail" : null, indoor: sub === "treadmill" };
  if (sport === "hiking") return { tipo: "Trekking", sottotipo: null };
  if (sport === "walking") return { tipo: "Camminata", sottotipo: null };
  if (sport === "training" && /strength/i.test(sub ?? "")) return { tipo: "Forza", sottotipo: null };
  if (sport === "training" || sport === "hiit" || sport === "fitnessEquipment") return { tipo: "HIIT", sottotipo: null };
  return { tipo: null, sottotipo: null }; // la persona lo sceglie nell'anteprima
}

// Nome del tipo scritto in un GPX (<type>) o TCX (Sport="…"), in qualunque lingua comune.
export function tipoDaTesto(testo = "") {
  const t = String(testo).toLowerCase();
  if (/gravel|cyclocross/.test(t)) return { tipo: "Bici", sottotipo: "Gravel" };
  if (/mountain|mtb/.test(t)) return { tipo: "Bici", sottotipo: "MTB" };
  if (/road.?bik|road.?cycl/.test(t)) return { tipo: "Bici", sottotipo: "Strada" };
  if (/bik|cycl|ride|bici|cicl/.test(t)) return { tipo: "Bici", sottotipo: null };
  if (/run|corsa/.test(t)) return { tipo: "Corsa", sottotipo: /trail/.test(t) ? "Trail" : null };
  if (/hik|trek|escurs/.test(t)) return { tipo: "Trekking", sottotipo: null };
  if (/walk|cammin/.test(t)) return { tipo: "Camminata", sottotipo: null };
  if (/strength|forza|muscol|weight/.test(t)) return { tipo: "Forza", sottotipo: null };
  if (/hiit|cardio|interval/.test(t)) return { tipo: "HIIT", sottotipo: null };
  return { tipo: null, sottotipo: null };
}

/* ---------- zone del battito ---------- */
// Limiti superiori di Z1..Z4 in percentuale: 60/70/80/90 della FC max, o della riserva con Karvonen.
// Le stesse percentuali usate dall'app Wahoo, quindi i limiti coincidono con i suoi.
export const PERCENTUALI_ZONE = [0.6, 0.7, 0.8, 0.9];
export const fcMaxDaEta = (eta) => Math.round(208 - 0.7 * eta); // Tanaka, più precisa di 220 − età

// metodo: "eta" (solo FC max), "karvonen" (FC max e riposo), "manuale" (limiti scritti a mano).
export function calcolaZone({ metodo = "eta", eta = null, fcMax = null, fcRiposo = null, manuali = null } = {}) {
  if (metodo === "manuale") {
    if (!validaLimiti(manuali)) throw new Error("Servono 4 limiti in bpm, crescenti");
    return { limiti: manuali.map(Math.round), fcMax: fcMax ?? null };
  }
  const max = fcMax ?? (eta != null ? fcMaxDaEta(eta) : null);
  if (max == null) throw new Error("Serve l'età o la FC massima");
  if (metodo === "karvonen") {
    if (fcRiposo == null) throw new Error("Per Karvonen serve la FC a riposo");
    return { limiti: PERCENTUALI_ZONE.map((p) => Math.round(fcRiposo + p * (max - fcRiposo))), fcMax: max };
  }
  return { limiti: PERCENTUALI_ZONE.map((p) => Math.round(p * max)), fcMax: max };
}
export const validaLimiti = (l) => Array.isArray(l) && l.length === 4 && l.every((x, i) => Number.isFinite(x) && x > 40 && x < 230 && (i === 0 || x > l[i - 1]));

// Zona 1..5 di un battito: il limite è incluso nella zona, come fa l'app Wahoo (130 = Z1).
export function zonaDi(fc, limiti) {
  const z = limiti.findIndex((lim) => fc <= lim);
  return z < 0 ? 5 : z + 1;
}

/* ---------- campi salvati ---------- */
// Leggeri: nel documento dell'allenamento, caricati all'avvio.
export const CAMPI_FILE = ["inizio", "durata_min", "km", "salita_m", "fc_media", "fc_max",
  "z1_min", "z2_min", "z3_min", "z4_min", "z5_min",
  "vel_media", "vel_max", "cadenza_media", "potenza_media", "potenza_max", "potenza_np", "calorie", "temp_media", "rmssd_ms",
  "indoor", "fonte", "file"];
// Pesanti: in dettagli/<id>, caricati solo aprendo l'allenamento.
export const CAMPI_DETTAGLIO = ["curva_fc", "curve", "traccia"];

/* ---------- FIT ---------- */
const semicerchi = (v) => (v == null ? null : (v * 180) / 2 ** 31);

export function riassumiFit(messages, { limiti, nomeFile = "" } = {}) {
  const s = messages.sessionMesgs?.[0];
  if (!s) throw new Error("Il file non contiene una sessione di allenamento");
  const punti = (messages.recordMesgs ?? []).filter((r) => r.timestamp).map((r) => ({
    t: r.timestamp.getTime(),
    lat: semicerchi(r.positionLat), lon: semicerchi(r.positionLong),
    ele: r.enhancedAltitude ?? r.altitude ?? null,
    fc: r.heartRate ?? null, cad: r.cadence ?? null, pow: r.power ?? null,
    vel: r.enhancedSpeed ?? r.speed ?? null, dist: r.distance ?? null,
  }));
  const { tipo, sottotipo, indoor } = tipoDaFit(s.sport, s.subSport);
  const produttore = messages.fileIdMesgs?.[0]?.manufacturer;
  const base = riassumiPunti(punti, { limiti, attivi: intervalliTimer(messages.eventMesgs), inizio: s.startTime.getTime() });
  const cadenzaCorsa = tipo === "Corsa" && s.avgCadence != null ? s.avgCadence * 2 : s.avgCadence; // FIT: passi di una gamba
  return {
    ...base,
    data: dataLocale(s.startTime),
    tipo, sottotipo, indoor: !!indoor,
    durata_min: Math.round(s.totalTimerTime / 60),
    // Km dalla traccia: il contatore dell'app Wahoo sbaglia nel trekking. Senza traccia, quelli del dispositivo.
    km: base.km ?? (s.totalDistance ? arrotonda(s.totalDistance / 1000, 2) : null),
    salita_m: s.totalAscent ?? base.salita_m,
    fc_media: s.avgHeartRate ?? base.fc_media,
    fc_max: s.maxHeartRate ?? base.fc_max,
    // Con la traccia, velocità dai km GPS: quella del dispositivo eredita l'errore del contatore.
    vel_media: base.km != null ? base.vel_media : kmh(s.enhancedAvgSpeed ?? s.avgSpeed),
    vel_max: kmh(s.enhancedMaxSpeed ?? s.maxSpeed) ?? base.vel_max,
    cadenza_media: cadenzaCorsa ?? base.cadenza_media,
    potenza_media: s.avgPower ?? base.potenza_media,
    potenza_max: s.maxPower ?? base.potenza_max,
    potenza_np: s.normalizedPower ?? base.potenza_np,
    calorie: s.totalCalories ?? null,
    temp_media: s.avgTemperature ?? null,
    rmssd_ms: rmssd(messages.hrvMesgs),
    fonte: "File FIT" + (produttore ? " · " + nomeProduttore(produttore) : ""),
    file: nomeFile,
  };
}

// Tratti in cui il timer correva: le pause automatiche non contano, come nelle zone calcolate da Wahoo e Garmin.
export function intervalliTimer(eventi = []) {
  const timer = (eventi ?? []).filter((e) => e.event === "timer");
  if (!timer.length) return null;
  const out = [];
  let da = null;
  for (const e of timer) {
    if (e.eventType === "start" && da == null) da = e.timestamp.getTime();
    else if (String(e.eventType).startsWith("stop") && da != null) { out.push([da, e.timestamp.getTime()]); da = null; }
  }
  if (da != null) out.push([da, Infinity]);
  return out;
}

// Variabilità del battito (RMSSD) dagli intervalli R-R, se la fascia li ha registrati.
function rmssd(hrv) {
  const rr = (hrv ?? []).flatMap((m) => m.time ?? []).filter((x) => x > 0.25 && x < 2.5);
  if (rr.length < 30) return null;
  let somma = 0, n = 0;
  for (let i = 1; i < rr.length; i++) {
    const d = (rr[i] - rr[i - 1]) * 1000;
    if (Math.abs(d) < 250) { somma += d * d; n++; } // scarta i battiti persi
  }
  return n ? Math.round(Math.sqrt(somma / n)) : null;
}

const nomeProduttore = (m) => ({ wahooFitness: "Wahoo", garmin: "Garmin", coros: "Coros", polarElectro: "Polar", suunto: "Suunto", zwift: "Zwift", strava: "Strava", hammerhead: "Hammerhead", bryton: "Bryton", magene: "Magene" })[m] ?? String(m);

/* ---------- GPX e TCX ---------- */
const campo = (testo, re) => testo.match(re)?.[1];
const num = (x) => (x == null || x === "" || Number.isNaN(Number(x)) ? null : Number(x));

export function leggiGpx(xml) {
  const punti = [...xml.matchAll(/<trkpt\b([^>]*)>([\s\S]*?)<\/trkpt>/g)].map(([, attr, corpo]) => ({
    t: Date.parse(campo(corpo, /<time>([^<]+)</)),
    lat: num(campo(attr, /lat="([^"]+)"/)), lon: num(campo(attr, /lon="([^"]+)"/)),
    ele: num(campo(corpo, /<ele>([^<]+)</)),
    fc: num(campo(corpo, /<(?:\w+:)?hr>([^<]+)</)),
    cad: num(campo(corpo, /<(?:\w+:)?cad>([^<]+)</)),
    pow: num(campo(corpo, /<(?:\w+:)?(?:power|PowerInWatts)>([^<]+)</)),
    vel: null, dist: null,
  })).filter((p) => !Number.isNaN(p.t));
  const tipoGpx = campo(xml, /<trk>[\s\S]*?<type>([^<]+)</) ?? campo(xml, /<type>([^<]+)</);
  return { punti, testoTipo: tipoGpx ?? "", nome: campo(xml, /<trk>[\s\S]*?<name>([^<]+)</) ?? null };
}

export function leggiTcx(xml) {
  const punti = [...xml.matchAll(/<Trackpoint>([\s\S]*?)<\/Trackpoint>/g)].map(([, tp]) => ({
    t: Date.parse(campo(tp, /<Time>([^<]+)</)),
    lat: num(campo(tp, /<LatitudeDegrees>([^<]+)</)), lon: num(campo(tp, /<LongitudeDegrees>([^<]+)</)),
    ele: num(campo(tp, /<AltitudeMeters>([^<]+)</)),
    fc: num(campo(tp, /<HeartRateBpm>\s*<Value>([^<]+)</)),
    cad: num(campo(tp, /<Cadence>([^<]+)</)),
    pow: num(campo(tp, /<(?:\w+:)?Watts>([^<]+)</)),
    vel: num(campo(tp, /<(?:\w+:)?Speed>([^<]+)</)), dist: num(campo(tp, /<DistanceMeters>([^<]+)</)),
  })).filter((p) => !Number.isNaN(p.t));
  // Solo la testa di ogni giro, prima dei punti: lì stanno i totali.
  const giri = [...xml.matchAll(/<Lap\b[\s\S]*?<\/Lap>/g)].map(([g]) => g.split("<Track>")[0]);
  const sommaGiri = (re) => { const v = giri.map((g) => num(campo(g, re))).filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) : null; };
  // Battito medio dei giri pesato sul tempo; Mi Fitness lo scrive come <HeartRateBpm>109</HeartRateBpm>.
  const fcGiri = giri.map((g) => [num(campo(g, /<AverageHeartRateBpm>\s*<Value>([^<]+)</) ?? campo(g, /<HeartRateBpm>(\d+)</)), num(campo(g, /<TotalTimeSeconds>([^<]+)</)) ?? 1]).filter(([fc]) => fc != null);
  const pesoFc = fcGiri.reduce((a, [, s]) => a + s, 0);
  return {
    punti,
    testoTipo: campo(xml, /<Activity Sport="([^"]+)"/) ?? "",
    inizio: Date.parse(campo(xml, /<Id>([^<]+)<\/Id>/)),
    durataS: sommaGiri(/<TotalTimeSeconds>([^<]+)</),
    metri: sommaGiri(/<DistanceMeters>([^<]+)</), // il primo DistanceMeters di ogni giro è il totale del giro
    calorie: sommaGiri(/<Calories>([^<]+)</),
    fcMediaGiri: pesoFc ? Math.round(fcGiri.reduce((a, [fc, s]) => a + fc * s, 0) / pesoFc) : null,
    fcMaxGiri: giri.length ? Math.max(...giri.map((g) => num(campo(g, /<MaximumHeartRateBpm>\s*<Value>([^<]+)</)) ?? 0)) || null : null,
  };
}

// Un GPX o TCX già letto → allenamento, con gli stessi campi del FIT.
export function riassumiXml(testo, { limiti, nomeFile = "" } = {}) {
  const tcx = /<TrainingCenterDatabase/i.test(testo);
  if (!tcx && !/<gpx/i.test(testo)) throw new Error("non è un file GPX o TCX");
  const l = tcx ? leggiTcx(testo) : leggiGpx(testo);
  const inizio = l.inizio || l.punti[0]?.t;
  if (!inizio) throw new Error("il file non ha orari");
  const base = riassumiPunti(l.punti, { limiti, inizio });
  // Il nome del file o della traccia è più preciso dello sport del TCX, che ammette solo Running/Biking/Other
  // (Mi Fitness ci scrive "Corsa brucia grassi" anche per un'escursione).
  const daNome = tipoDaTesto(`${nomeFile} ${l.nome ?? ""}`);
  const { tipo, sottotipo } = daNome.tipo ? daNome : tipoDaTesto(l.testoTipo);
  return {
    ...base,
    data: dataLocale(new Date(inizio)),
    tipo, sottotipo, indoor: !base.traccia && tipo === "Bici",
    durata_min: l.durataS != null ? Math.round(l.durataS / 60) : base.durata_min,
    km: base.km ?? (l.metri ? arrotonda(l.metri / 1000, 2) : null),
    fc_media: base.fc_media ?? l.fcMediaGiri ?? null,
    fc_max: base.fc_max ?? l.fcMaxGiri ?? null,
    calorie: l.calorie ?? null, temp_media: null, rmssd_ms: null,
    nome_file: l.nome ?? null,
    fonte: tcx ? "File TCX" : "File GPX",
    file: nomeFile,
  };
}

/* ---------- calcoli comuni sui punti ---------- */
export function riassumiPunti(punti, { limiti, attivi = null, inizio = punti[0]?.t } = {}) {
  const attivo = (t) => !attivi || attivi.some(([a, b]) => t >= a && t < b);
  let secAttivi = 0;
  for (let i = 0; i < punti.length - 1; i++) {
    const dt = (punti[i + 1].t - punti[i].t) / 1000;
    if (dt > 0 && dt <= MAX_PASSO_S && attivo(punti[i].t)) secAttivi += dt;
  }
  const fc = punti.map((p) => p.fc).filter((x) => x != null && x > 30);
  const km = distanzaGps(punti);
  const velMedia = km != null && secAttivi > 0 ? arrotonda((km / secAttivi) * 3600, 1) : null;
  const vel = punti.map((p) => p.vel).filter((x) => x != null);
  const pow = punti.map((p) => p.pow).filter((x) => x != null);
  const cad = punti.map((p) => p.cad).filter((x) => x != null && x > 0);
  return {
    durata_min: Math.round(secAttivi / 60),
    km,
    salita_m: salitaDaQuote(punti),
    fc_media: fc.length ? Math.round(media(fc)) : null,
    fc_max: fc.length ? Math.max(...fc) : null,
    ...(limiti ? tempoInZona(punti, limiti, attivi) : { z1_min: null, z2_min: null, z3_min: null, z4_min: null, z5_min: null }),
    vel_media: velMedia,
    vel_max: vel.length ? kmh(Math.max(...vel)) : null,
    cadenza_media: cad.length ? Math.round(media(cad)) : null,
    potenza_media: pow.length ? Math.round(media(pow)) : null,
    potenza_max: pow.length ? Math.max(...pow) : null,
    potenza_np: potenzaNormalizzata(punti),
    inizio: new Date(inizio).toISOString(),
    curva_fc: curva(punti, inizio, "fc"),
    curve: curveExtra(punti, inizio),
    traccia: tracciaGps(punti, inizio),
  };
}

export function distanzaGps(punti) {
  let m = 0, prec = null;
  for (const p of punti) {
    if (p.lat == null || p.lon == null) continue;
    if (prec) {
      const d = haversine(prec, p), dt = (p.t - prec.t) / 1000;
      if (dt > 0 && d / dt < MAX_VEL_GPS) m += d;
    }
    prec = p;
  }
  return m > 0 ? arrotonda(m / 1000, 2) : null;
}

export function salitaDaQuote(punti) {
  const quote = punti.map((p) => p.ele).filter((q) => q != null);
  if (quote.length < 2) return null;
  let salita = 0, rif = quote[0];
  for (const q of quote) {
    if (q - rif >= SOGLIA_SALITA_M) { salita += q - rif; rif = q; }
    else if (rif - q >= SOGLIA_SALITA_M) rif = q;
  }
  return Math.round(salita);
}

// Minuti per zona. Il tempo di un punto finisce al punto dopo, a 10 s, o allo stop del timer se viene prima.
export function tempoInZona(punti, limiti, attivi = null) {
  const sec = [0, 0, 0, 0, 0];
  let conFc = 0;
  for (let i = 0; i < punti.length - 1; i++) {
    const fc = punti[i].fc;
    if (fc == null) continue;
    const t = punti[i].t;
    const tratto = attivi?.find(([a, b]) => t >= a && t < b);
    if (attivi && !tratto) continue;
    const dt = Math.min(punti[i + 1].t - t, MAX_PASSO_S * 1000, tratto ? tratto[1] - t : Infinity) / 1000;
    if (dt <= 0) continue;
    sec[zonaDi(fc, limiti) - 1] += dt;
    conFc += dt;
  }
  if (!conFc) return { z1_min: null, z2_min: null, z3_min: null, z4_min: null, z5_min: null };
  const [z1, z2, z3, z4, z5] = sec.map((s) => arrotonda(s / 60, 1));
  return { z1_min: z1, z2_min: z2, z3_min: z3, z4_min: z4, z5_min: z5 };
}

// Zone ricalcolate da una curva salvata (dopo un cambio dei limiti): ogni valore vale passo_s secondi.
export function zoneDaCurva(curvaFc, limiti) {
  if (!curvaFc?.fc?.length) return null;
  const sec = [0, 0, 0, 0, 0];
  for (const fc of curvaFc.fc) if (fc != null) sec[zonaDi(fc, limiti) - 1] += curvaFc.passo_s;
  const [z1, z2, z3, z4, z5] = sec.map((s) => arrotonda(s / 60, 1));
  return { z1_min: z1, z2_min: z2, z3_min: z3, z4_min: z4, z5_min: z5 };
}

// Tratti senza battito di almeno `minimo_s` secondi, con il motivo. Se nello stesso tratto non c'è nessun altro dato
// (traccia GPS, velocità, quota) il dispositivo era in pausa: "sosta". Se gli altri dati ci sono, mancava solo la
// fascia: "fascia". Senza traccia né altre curve non si può sapere: "vuoto".
export function trovaVuoti(curva, { traccia = null, curve = null, minimo_s = 30 } = {}) {
  const fc = curva?.fc ?? [], passo = curva?.passo_s ?? PASSO_CURVA_S;
  const altri = curve ? Object.entries(curve).filter(([k, v]) => k !== "passo_s" && Array.isArray(v)).map(([, v]) => v) : [];
  const conAltri = (traccia?.t?.length ?? 0) > 1 || altri.length > 0;
  const out = [];
  let da = -1;
  for (let i = 0; i <= fc.length; i++) {
    const vuoto = i < fc.length && fc[i] == null;
    if (vuoto && da < 0) da = i;
    if (vuoto || da < 0) continue;
    const s0 = da * passo, s1 = i * passo;
    if (s1 - s0 >= minimo_s) {
      const registrava = (traccia?.t ?? []).some((t) => t > s0 + passo && t < s1 - passo) || altri.some((v) => v.slice(da, i).some((x) => x != null));
      out.push({ da: s0, a: s1, tipo: !conAltri ? "vuoto" : registrava ? "fascia" : "sosta" });
    }
    da = -1;
  }
  return out;
}

// Media di un campo ogni PASSO_CURVA_S secondi dall'inizio; null dove manca.
function serie(punti, inizio, chiave) {
  const somme = [], conti = [];
  for (const p of punti) {
    const v = p[chiave];
    if (v == null) continue;
    const i = Math.floor((p.t - inizio) / 1000 / PASSO_CURVA_S);
    if (i < 0) continue;
    somme[i] = (somme[i] ?? 0) + v;
    conti[i] = (conti[i] ?? 0) + 1;
  }
  if (!somme.length) return null;
  return Array.from({ length: somme.length }, (_, i) => (conti[i] ? arrotonda(somme[i] / conti[i], chiave === "vel" ? 2 : 0) : null));
}
function curva(punti, inizio, chiave) {
  const v = serie(punti, inizio, chiave);
  return v ? { passo_s: PASSO_CURVA_S, [chiave]: v } : null;
}
// Quota, velocità, potenza e cadenza nel tempo: solo quelle presenti nel file.
function curveExtra(punti, inizio) {
  const out = { passo_s: PASSO_CURVA_S };
  for (const [k, nome] of [["ele", "quota"], ["vel", "velocita"], ["pow", "potenza"], ["cad", "cadenza"]]) {
    const v = serie(punti, inizio, k);
    if (v && v.some((x) => x != null && x !== 0)) out[nome] = v;
  }
  return Object.keys(out).length > 1 ? out : null;
}

// Potenza normalizzata: media mobile su 30 s, alla quarta, media, radice quarta (campioni a 1 s circa).
function potenzaNormalizzata(punti) {
  const pow = punti.filter((p) => p.pow != null);
  if (pow.length < 60) return null;
  const finestra = [], medie = [];
  let somma = 0;
  for (const p of pow) {
    finestra.push(p.pow); somma += p.pow;
    if (finestra.length > 30) somma -= finestra.shift();
    if (finestra.length === 30) medie.push((somma / 30) ** 4);
  }
  return medie.length ? Math.round(media(medie) ** 0.25) : null;
}

export function tracciaGps(punti, inizio) {
  const pos = punti.filter((p) => p.lat != null && p.lon != null);
  if (pos.length < 2) return null;
  const durS = (pos[pos.length - 1].t - pos[0].t) / 1000;
  const passo = Math.max(5, Math.ceil(durS / MAX_PUNTI_TRACCIA));
  const t = [], lat = [], lon = [];
  let ultimo = -Infinity;
  pos.forEach((p, i) => {
    const s = Math.round((p.t - inizio) / 1000);
    if (s - ultimo < passo && i !== pos.length - 1) return;
    ultimo = s;
    t.push(s); lat.push(arrotonda(p.lat, 5)); lon.push(arrotonda(p.lon, 5));
  });
  return { t, lat, lon };
}

/* ---------- forza ---------- */
// Massimale stimato (Epley) e volume di una lista di serie [{kg, rip}].
export const epley = (kg, rip) => (kg > 0 && rip > 0 ? (rip === 1 ? kg : kg * (1 + rip / 30)) : null);
export const volume = (serie = []) => serie.reduce((a, s) => a + (s.kg > 0 && s.rip > 0 ? s.kg * s.rip : 0), 0);
export const massimale = (serie = []) => { const v = serie.map((s) => epley(s.kg, s.rip)).filter(Boolean); return v.length ? arrotonda(Math.max(...v), 1) : null; };

/* ---------- varie ---------- */
// Id: data-tipo, con -2, -3... se quel giorno ce n'è già uno diverso dello stesso tipo.
export function idSessione(data, tipo, occupato) {
  const base = `${data}-${String(tipo ?? "altro").toLowerCase()}`;
  let id = base;
  for (let n = 2; occupato(id); n++) id = `${base}-${n}`;
  return id;
}

// Data del giorno nel fuso orario di chi usa l'app.
export const dataLocale = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
};

// Coordinate Web Mercator in pixel del mondo al livello z (tessere da 256 px).
export function mondo(lat, lon, z) {
  const n = 256 * 2 ** z, s = Math.sin((lat * Math.PI) / 180);
  return { x: ((lon + 180) / 360) * n, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n };
}
export const metriPerPixel = (lat, z) => (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** z;

const kmh = (ms) => (ms == null ? null : arrotonda(ms * 3.6, 1));
const media = (a) => a.reduce((x, y) => x + y, 0) / a.length;
function haversine(a, b) {
  const rad = Math.PI / 180, dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}
function arrotonda(x, cifre) { return Math.round(x * 10 ** cifre) / 10 ** cifre; }
