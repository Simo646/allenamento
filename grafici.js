// Grafici SVG. Ogni grafico parte da pianoGrafico() e usa gli stessi pezzi:
// tacche(), asseY(), etichetteDate(), sensibile() per il riquadro informativo, legenda().
import { el, sv, ms, fmtData, fmtNum } from "./util.js";
import { zonaDi, mondo, metriPerPixel } from "./analisi-file.js";

export const ZONE = ["Z1", "Z2", "Z3", "Z4", "Z5"];
export const COLORE_ZONA = ZONE.map((_, i) => `var(--z${i + 1})`);

export function tacche(min, max, { n = 4, minuti = false } = {}) {
  let passo;
  if (minuti) passo = [30, 60, 120, 180, 240, 300, 600, 900].find((p) => (max - min) / p <= n) ?? 1200;
  else {
    const grezzo = Math.max(max - min, 1e-9) / n;
    const pot = 10 ** Math.floor(Math.log10(grezzo));
    passo = [1, 2, 2.5, 5, 10].map((k) => k * pot).find((p) => p >= grezzo);
  }
  const t = [];
  for (let v = Math.floor(min / passo) * passo; v < max + passo - 1e-9; v += passo) t.push(Math.round(v * 100) / 100);
  return t;
}

// Altezza di un grafico: in proporzione alla larghezza, tra un minimo e un massimo, e mai oltre il 60% dello schermo
// (con il telefono in orizzontale lo schermo è basso).
const altezza = (W, rapporto, min, max) => Math.round(Math.min(Math.max(W * rapporto, min), max, Math.max(min * 0.8, innerHeight * 0.6)));

export function pianoGrafico(contenitore, { H = 180, m = { t: 14, r: 12, b: 26, l: 38 } } = {}) {
  contenitore.replaceChildren();
  const box = el("div", { class: "grafico" });
  contenitore.append(box);
  const W = Math.max(box.clientWidth || contenitore.clientWidth || 320, 260);
  if (typeof H === "function") H = H(W);
  const svg = sv("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", role: "img" });
  box.append(svg);
  return { box, svg, W, H, m, iw: W - m.l - m.r, ih: H - m.t - m.b, add: (...n) => svg.append(...n) };
}

export function asseY(g, ticks, y, fmt, { griglia = true } = {}) {
  ticks.forEach((t, i) => {
    if (griglia) g.add(sv("line", { x1: g.m.l, x2: g.W - g.m.r, y1: y(t), y2: y(t), class: i === 0 ? "base" : "griglia" }));
    g.add(sv("text", { x: g.m.l - 6, y: y(t) + 4, "text-anchor": "end" }, fmt(t)));
  });
}

function scalaDate(g, date, margine = 0) {
  const xs = date.map(ms);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  return (d) => g.m.l + (x1 === x0 ? g.iw / 2 : margine + ((ms(d) - x0) / (x1 - x0)) * (g.iw - 2 * margine));
}

function etichetteDate(g, date, x) {
  const uniche = [...new Set(date)];
  const n = Math.min(uniche.length, Math.max(2, Math.floor(g.iw / 70)));
  for (let k = 0; k < n; k++) {
    const d = uniche[Math.round((k * (uniche.length - 1)) / Math.max(1, n - 1))];
    const ancora = n > 1 && k === 0 ? "start" : n > 1 && k === n - 1 ? "end" : "middle";
    g.add(sv("text", { x: x(d), y: g.H - 8, "text-anchor": ancora }, fmtData(d, { day: "numeric", month: "short" })));
  }
}

const vicino = (punti, xDi, px) => punti.reduce((a, p) => (Math.abs(xDi(p) - px) < Math.abs(xDi(a) - px) ? p : a));

export function mostraTip(contenitore, x, y, titolo, righe) {
  const t = contenitore.querySelector(".tip") ?? contenitore.appendChild(el("div", { class: "tip", hidden: true }));
  t.replaceChildren(el("b", {}, titolo), ...righe.map(([colore, k, v]) =>
    el("div", {}, el("span", {}, colore ? el("i", { class: "dot", style: `background:${colore}` }) : null, k), el("span", {}, v))));
  t.hidden = false;
  const w = contenitore.clientWidth, tw = t.offsetWidth, th = t.offsetHeight;
  t.style.left = Math.max(0, Math.min(w - tw, x - tw / 2)) + "px";
  t.style.top = Math.max(0, y - th - 10) + "px";
}

function sensibile(g, trova, alUscire) {
  const area = sv("rect", { x: g.m.l, y: g.m.t, width: Math.max(g.iw, 1), height: Math.max(g.ih, 1), fill: "transparent" });
  const muovi = (ev) => {
    const r = g.svg.getBoundingClientRect();
    const p = trova(((ev.clientX - r.left) / r.width) * g.W, ((ev.clientY - r.top) / r.height) * g.H);
    if (p) mostraTip(g.box, (p.x / g.W) * g.box.clientWidth, (p.y / g.H) * g.box.clientHeight, p.titolo, p.righe);
  };
  area.addEventListener("pointermove", muovi);
  area.addEventListener("pointerdown", muovi);
  // Col mouse il segno sparisce uscendo dal grafico; col dito resta dove l'hai lasciato, così lo leggi a dito alzato.
  area.addEventListener("pointerleave", (ev) => {
    if (ev.pointerType !== "mouse") return;
    chiudiTip(g);
    alUscire?.();
  });
  g.add(area);
}
const chiudiTip = (g) => { const t = g.box.querySelector(".tip"); if (t) t.hidden = true; };

// Cursore comune ai grafici di un allenamento: toccando un istante su un grafico (o un punto della traccia) gli altri
// mostrano lo stesso istante. `mostra(sec, da)` avvisa tutti tranne chi l'ha mosso; sec null li nasconde.
export function creaCursore() {
  const grafici = new Set();
  return { unisci: (f) => grafici.add(f), mostra: (sec, da) => grafici.forEach((f) => f !== da && f(sec)) };
}

// Segno di un istante su un grafico nel tempo: linea verticale, punto sulla curva e, sui grafici che seguono quello
// toccato, il valore scritto accanto.
function segnoIstante(g, colore) {
  const linea = sv("line", { y1: g.m.t, y2: g.m.t + g.ih, stroke: "var(--ink)", "stroke-width": 1, "stroke-dasharray": "3 3", visibility: "hidden" });
  const punto = sv("circle", { r: 4, fill: colore, stroke: "var(--surface)", "stroke-width": "2", visibility: "hidden" });
  const testo = sv("text", { y: g.m.t + 13, class: "valore-istante", visibility: "hidden" });
  g.add(linea, punto, testo);
  return {
    mostra(cx, cy, scritta = null) {
      linea.setAttribute("x1", cx); linea.setAttribute("x2", cx); linea.setAttribute("visibility", "visible");
      if (cy == null) punto.setAttribute("visibility", "hidden");
      else { punto.setAttribute("cx", cx); punto.setAttribute("cy", cy); punto.setAttribute("visibility", "visible"); }
      const aDestra = cx < g.m.l + g.iw * 0.6;
      testo.setAttribute("x", aDestra ? cx + 6 : cx - 6);
      testo.setAttribute("text-anchor", aDestra ? "start" : "end");
      testo.textContent = scritta ?? "";
      testo.setAttribute("visibility", scritta ? "visible" : "hidden");
    },
    nascondi() { for (const n of [linea, punto, testo]) n.setAttribute("visibility", "hidden"); },
  };
}

export const legenda = (contenitore, voci) =>
  contenitore.append(el("div", { class: "legenda", style: "margin-top:10px" }, voci.map(([c, n]) => el("span", {}, el("i", { style: `background:${c}` }), n))));

export const vuoto = (contenitore, testo) => contenitore.replaceChildren(el("p", { class: "vuoto" }, testo));

function pathColonna(x, y, w, h, r) {
  r = Math.min(r, w / 2, h);
  return h <= 0 ? "" : `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

// Colonne impilate: categorie in x, un segmento per serie. Una serie con `tratteggio` si riempie a righe.
export function graficoColonne(contenitore, { categorie, serie, valore, etichettaX, formato, titoloTip, extraTip, conLegenda = true }) {
  const g = pianoGrafico(contenitore, { H: 190, m: { t: 14, r: 4, b: 26, l: 38 } });
  const totali = categorie.map((c) => serie.reduce((a, s) => a + (valore(c, s) ?? 0), 0));
  const ticks = tacche(0, Math.max(...totali, formato.minimo ?? 1), { minuti: formato.minuti });
  const top = ticks[ticks.length - 1];
  const y = (v) => g.m.t + g.ih - (v / top) * g.ih;
  const banda = g.iw / categorie.length;
  const bw = Math.min(24, banda * 0.62);
  const idTratteggio = "tratteggio-" + Math.random().toString(36).slice(2, 8);
  if (serie.some((s) => s.tratteggio)) {
    const motivo = sv("pattern", { id: idTratteggio, width: 5, height: 5, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" });
    motivo.append(sv("rect", { width: 5, height: 5, fill: "var(--surface-2)" }), sv("line", { x1: 0, y1: 0, x2: 0, y2: 5, stroke: "var(--faint)", "stroke-width": "1.6" }));
    const defs = sv("defs");
    defs.append(motivo);
    g.add(defs);
  }
  const riempi = (s) => (s.tratteggio ? `url(#${idTratteggio})` : s.colore);
  asseY(g, ticks, y, formato.asse);
  const ogniN = Math.ceil(categorie.length / Math.max(1, Math.floor(g.iw / 46)));
  const xDi = (i) => g.m.l + banda * i + (banda - bw) / 2;
  categorie.forEach((c, i) => {
    const x = xDi(i);
    const visibili = serie.filter((s) => (valore(c, s) ?? 0) > 0);
    let acc = 0;
    visibili.forEach((s, j) => {
      const v = valore(c, s);
      const y1 = y(acc + v);
      const h = Math.max(0, y(acc) - y1 - (j > 0 ? 2 : 0));
      g.add(j === visibili.length - 1
        ? sv("path", { d: pathColonna(x, y1, bw, h, 4), fill: riempi(s) })
        : sv("rect", { x, y: y1, width: bw, height: h, fill: riempi(s) }));
      acc += v;
    });
    if (i % ogniN === 0 || i === categorie.length - 1)
      g.add(sv("text", { x: x + bw / 2, y: g.H - 8, "text-anchor": "middle" }, etichettaX(c)));
  });
  sensibile(g, (px) => {
    const i = Math.max(0, Math.min(categorie.length - 1, Math.floor((px - g.m.l) / banda)));
    const c = categorie[i];
    return {
      x: xDi(i) + bw / 2, y: y(totali[i]), titolo: titoloTip(c),
      righe: [...serie.filter((s) => (valore(c, s) ?? 0) > 0).reverse().map((s) => [s.colore, s.nome, formato.tip(valore(c, s))]),
        ...(serie.length > 1 ? [[null, "Totale", formato.tip(totali[i])]] : []), ...(extraTip ? extraTip(c) : [])],
    };
  });
  if (conLegenda) legenda(contenitore, serie.map((s) => [s.colore, s.nome]));
}

// Linea su date, con soglia opzionale: i punti sopra la soglia diventano rossi.
export function graficoLinea(contenitore, { punti, formato, soglia, etichettaSoglia, titoloTip, colore = "var(--serie)" }) {
  if (punti.length < 2)
    return vuoto(contenitore, punti.length ? "Serve almeno un altro valore per disegnare l'andamento." : "Nessun dato ancora.");
  const g = pianoGrafico(contenitore);
  const ord = [...punti].sort((a, b) => a.data.localeCompare(b.data));
  const x = scalaDate(g, ord.map((p) => p.data));
  const vals = ord.map((p) => p.v).concat(soglia != null ? [soglia] : []);
  const marg = Math.max((Math.max(...vals) - Math.min(...vals)) * 0.15, formato.margine ?? 1);
  const ticks = tacche(Math.min(...vals) - marg, Math.max(...vals) + marg);
  const lo = ticks[0], hi = ticks[ticks.length - 1];
  const y = (v) => g.m.t + g.ih - ((v - lo) / (hi - lo)) * g.ih;
  asseY(g, ticks, y, formato.asse);
  etichetteDate(g, ord.map((p) => p.data), x);
  if (soglia != null) g.add(
    sv("line", { x1: g.m.l, x2: g.W - g.m.r, y1: y(soglia), y2: y(soglia), stroke: "var(--crit)", "stroke-width": "1.5", "stroke-dasharray": "5 4" }),
    sv("text", { x: g.m.l + 4, y: y(soglia) - 5, "text-anchor": "start", style: "fill:var(--crit-text);font-weight:700" }, etichettaSoglia));
  g.add(sv("path", { d: ord.map((p, i) => `${i ? "L" : "M"}${x(p.data)},${y(p.v)}`).join(""), fill: "none", stroke: colore, "stroke-width": "2", "stroke-linejoin": "round", "stroke-linecap": "round" }));
  const ultimo = ord[ord.length - 1];
  for (const p of ord)
    g.add(sv("circle", { cx: x(p.data), cy: y(p.v), r: p === ultimo ? 5 : 3.5, fill: soglia != null && p.v >= soglia ? "var(--crit)" : colore, stroke: "var(--surface)", "stroke-width": "2" }));
  g.add(sv("text", { x: x(ultimo.data) - 8, y: y(ultimo.v) - 10, "text-anchor": "end", style: "fill:var(--ink);font-weight:700" }, formato.tip(ultimo.v)));
  const croce = sv("line", { y1: g.m.t, y2: g.m.t + g.ih, stroke: "var(--faint)", "stroke-width": "1", visibility: "hidden" });
  g.add(croce);
  sensibile(g, (px) => {
    const p = vicino(ord, (q) => x(q.data), px);
    croce.setAttribute("x1", x(p.data));
    croce.setAttribute("x2", x(p.data));
    croce.setAttribute("visibility", "visible");
    return { x: x(p.data), y: y(p.v), titolo: titoloTip(p), righe: [[null, formato.nome, formato.tip(p.v)], ...(p.extra ?? [])] };
  }, () => croce.setAttribute("visibility", "hidden"));
}

// Forma di fondo e fatica giorno per giorno: stessa unità (punti di carico), quindi un solo asse; bilancio e carico
// del giorno nel riquadro informativo. Valori scritti sull'ultimo giorno, legenda sotto.
const conSegno = (v) => { const n = Math.round(v); return (n > 0 ? "+" : "") + fmtNum(n); };
export function graficoForma(contenitore, { giorni, titoloTip }) {
  if (giorni.length < 2) return vuoto(contenitore, "Serve qualche giorno di allenamenti per disegnare l'andamento.");
  const g = pianoGrafico(contenitore, { m: { t: 14, r: 34, b: 26, l: 34 } });
  const date = giorni.map((p) => p.data);
  const x = scalaDate(g, date);
  const ticks = tacche(0, Math.max(10, ...giorni.flatMap((p) => [p.forma, p.fatica])));
  const top = ticks[ticks.length - 1];
  const y = (v) => g.m.t + g.ih - (v / top) * g.ih;
  asseY(g, ticks, y, (v) => fmtNum(v));
  etichetteDate(g, date, x);
  const SERIE = [["fatica", "var(--fatica)"], ["forma", "var(--forma)"]];
  for (const [k, colore] of SERIE)
    g.add(sv("path", { d: giorni.map((p, i) => `${i ? "L" : "M"}${x(p.data).toFixed(1)},${y(p[k]).toFixed(1)}`).join(""), fill: "none", stroke: colore, "stroke-width": "2", "stroke-linejoin": "round", "stroke-linecap": "round" }));
  // Ultimo giorno: punto e valore; se le linee sono vicine le due scritte si allontanano.
  const u = giorni[giorni.length - 1];
  const yF = y(u.forma), yA = y(u.fatica), stacco = Math.max(0, (14 - Math.abs(yF - yA)) / 2);
  for (const [k, colore] of SERIE) {
    const yy = k === "forma" ? yF : yA;
    const sopra = k === "forma" ? yF <= yA : yA < yF;
    g.add(sv("circle", { cx: x(u.data), cy: yy, r: 4, fill: colore, stroke: "var(--surface)", "stroke-width": "2" }),
      sv("text", { x: x(u.data) + 7, y: yy + 4 + (sopra ? -stacco : stacco), "text-anchor": "start", style: "fill:var(--ink);font-weight:700" }, fmtNum(u[k])));
  }
  const croce = sv("line", { y1: g.m.t, y2: g.m.t + g.ih, stroke: "var(--faint)", "stroke-width": "1", visibility: "hidden" });
  g.add(croce);
  sensibile(g, (px) => {
    const p = vicino(giorni, (q) => x(q.data), px);
    croce.setAttribute("x1", x(p.data));
    croce.setAttribute("x2", x(p.data));
    croce.setAttribute("visibility", "visible");
    return { x: x(p.data), y: y(Math.max(p.forma, p.fatica)), titolo: titoloTip(p), righe: [
      ["var(--forma)", "Forma di fondo", fmtNum(p.forma)], ["var(--fatica)", "Fatica", fmtNum(p.fatica)],
      [null, "Bilancio", conSegno(p.bilancio)], [null, "Carico del giorno", p.carico ? fmtNum(p.carico) : "riposo"]] };
  }, () => croce.setAttribute("visibility", "hidden"));
  legenda(contenitore, [["var(--forma)", "Forma di fondo"], ["var(--fatica)", "Fatica"]]);
}

// Per ogni notte: barra dalla minima alla massima, tacca sulla minima, punto sulla media.
export function graficoIntervalli(contenitore, { punti, titoloTip }) {
  if (!punti.length) return vuoto(contenitore, "Nessuna notte con l'ossigeno inserito.");
  const g = pianoGrafico(contenitore);
  const ord = [...punti].sort((a, b) => a.data.localeCompare(b.data));
  const x = scalaDate(g, ord.map((p) => p.data), 8);
  const ticks = tacche(Math.min(...ord.map((p) => p.lo)) - 1, 100).filter((t) => t <= 100);
  const lo = ticks[0];
  const y = (v) => g.m.t + g.ih - ((v - lo) / (100 - lo)) * g.ih;
  asseY(g, ticks, y, (t) => `${t}%`);
  etichetteDate(g, ord.map((p) => p.data), x);
  for (const p of ord) {
    const cx = x(p.data);
    if (p.hi > p.lo) g.add(sv("rect", { x: cx - 2, y: y(p.hi), width: 4, height: y(p.lo) - y(p.hi), rx: 2, fill: "var(--o2-max)" }));
    g.add(sv("line", { x1: cx - 7, x2: cx + 7, y1: y(p.lo), y2: y(p.lo), stroke: "var(--o2-min)", "stroke-width": "3", "stroke-linecap": "round" }),
      sv("circle", { cx, cy: y(p.mid), r: 5, fill: "var(--o2-media)", stroke: "var(--surface)", "stroke-width": "2.5" }));
  }
  sensibile(g, (px) => {
    const p = vicino(ord, (q) => x(q.data), px);
    return { x: x(p.data), y: y(p.hi), titolo: titoloTip(p),
      righe: [["var(--o2-min)", "Minima", `${p.lo}%`], ["var(--o2-media)", "Media", `${p.mid}%`], ["var(--o2-max)", "Massima", `${p.hi}%`]] };
  });
  legenda(contenitore, [["var(--o2-min)", "Minima"], ["var(--o2-media)", "Media"], ["var(--o2-max)", "Dalla minima alla massima"]]);
}

// Traccia GPS colorata con la zona del battito di ogni tratto, sopra la mappa topografica quando c'è (mappe.js:
// {url, z, x0, y0, w, h}, stessa proiezione Web Mercator, quindi allineata). Senza mappa, su fondo neutro.
export function graficoTraccia(contenitore, traccia, curva, lim, mappa = null, cursore = null) {
  const { t, lat, lon } = traccia;
  // In orizzontale la mappa (4:3) si restringe quanto basta per stare intera nello schermo.
  contenitore.style.maxWidth = innerWidth > innerHeight ? `${Math.round(innerHeight * 0.75 * (4 / 3))}px` : "";
  contenitore.style.marginInline = "auto";
  const g = pianoGrafico(contenitore, { H: (W) => Math.round(mappa ? W * (mappa.h / mappa.w) : Math.min(W * 0.75, 420)), m: { t: 0, r: 0, b: 0, l: 0 } });
  const z = mappa?.z ?? 18;
  const P = lat.map((la, i) => mondo(la, lon[i], z));
  let k, x0, y0;
  if (mappa) {
    k = g.W / mappa.w;
    x0 = mappa.x0;
    y0 = mappa.y0;
  } else {
    const xs = P.map((p) => p.x), ys = P.map((p) => p.y), bordo = 24;
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    k = Math.min((g.W - 2 * bordo) / Math.max(maxX - minX, 1), (g.H - 2 * bordo) / Math.max(maxY - minY, 1));
    x0 = (minX + maxX) / 2 - g.W / 2 / k;
    y0 = (minY + maxY) / 2 - g.H / 2 / k;
  }
  const px = (i) => (P[i].x - x0) * k, py = (i) => (P[i].y - y0) * k;
  const fcA = (i) => (curva?.fc?.length ? curva.fc[Math.min(curva.fc.length - 1, Math.floor(t[i] / curva.passo_s))] ?? null : null);
  const zonaA = (i) => { const v = fcA(i); return v == null ? -1 : zonaDi(v, lim) - 1; };
  const punti = (da, a) => Array.from({ length: a - da + 1 }, (_, j) => `${px(da + j).toFixed(1)},${py(da + j).toFixed(1)}`).join(" ");

  // Zoom fino a 4× (la mappa, salvata al doppio del dettaglio, resta nitida fino a 2×). Mappa e traccia stanno in un
  // gruppo che si ingrandisce; partenza, arrivo, nord, scala e pulsanti restano fermi. Due dita o doppio tocco per
  // ingrandire, un dito per spostarsi quando è ingrandita; a grandezza intera un dito fa scorrere la pagina e il tocco
  // mostra tempo e battito, come prima.
  const idClip = "bordo-" + Math.random().toString(36).slice(2, 8);
  const defs = sv("defs"), clip = sv("clipPath", { id: idClip });
  clip.append(sv("rect", { width: g.W, height: g.H, rx: 12 }));
  defs.append(clip);
  const scena = sv("g", { "clip-path": `url(#${idClip})` }), contenuto = sv("g");
  scena.append(contenuto);
  g.add(defs, sv("rect", { width: g.W, height: g.H, rx: 12, fill: "var(--surface-2)" }), scena);
  if (mappa) contenuto.append(sv("image", { href: mappa.url, x: 0, y: 0, width: g.W, height: g.H, preserveAspectRatio: "none" }));
  const linea = { fill: "none", "stroke-linecap": "round", "stroke-linejoin": "round", "vector-effect": "non-scaling-stroke" };
  contenuto.append(sv("polyline", { points: punti(0, t.length - 1), stroke: "var(--surface)", "stroke-width": "8", ...linea }));
  for (let da = 0, i = 1; i <= t.length; i++) {
    if (i < t.length && zonaA(i) === zonaA(da)) continue;
    const zz = zonaA(da);
    contenuto.append(sv("polyline", { points: punti(da, Math.min(i, t.length - 1)), stroke: zz < 0 ? "var(--ink)" : COLORE_ZONA[zz], "stroke-width": "4", ...linea }));
    da = i;
  }
  const vista = { s: 1, tx: 0, ty: 0 };
  const sx = (x) => x * vista.s + vista.tx, sy = (y) => y * vista.s + vista.ty; // dalla traccia allo schermo
  const fine = t.length - 1;
  const arrivo = sv("rect", { width: 12, height: 12, rx: 2, fill: "var(--ink)", stroke: "var(--surface)", "stroke-width": "2" });
  const partenza = sv("circle", { r: 7, fill: "var(--surface)", stroke: "var(--ink)", "stroke-width": "3" });
  scena.append(arrivo, partenza); // dentro il ritaglio: con la mappa ingrandita possono finire fuori vista
  g.add(sv("rect", { x: g.W - 36, y: 8, width: 28, height: 40, rx: 4, fill: "var(--surface)", "fill-opacity": "0.9" }),
    sv("path", { d: `M${g.W - 28},${30}l6,-16l6,16l-6,-4z`, fill: "var(--ink)" }),
    sv("text", { x: g.W - 22, y: 43, "text-anchor": "middle", style: "fill:var(--ink);font-weight:800" }, "N"));
  const pxPerMetro = k / metriPerPixel(lat[Math.floor(lat.length / 2)], z);
  const fondoScala = sv("rect", { x: 8, y: g.H - 30, height: 22, rx: 4, fill: "var(--surface)", "fill-opacity": "0.9" });
  const segnoScala = sv("path", { fill: "none", stroke: "var(--ink)", "stroke-width": "2" });
  const testoScala = sv("text", { y: g.H - 14, style: "fill:var(--ink);font-weight:700" });
  g.add(fondoScala, segnoScala, testoScala);
  const punto = sv("circle", { r: 6, fill: "var(--ink)", stroke: "var(--surface)", "stroke-width": "2", visibility: "hidden" });
  scena.append(punto);
  let iPunto = null;

  const piu = el("button", { type: "button", "aria-label": "Ingrandisci la mappa" }, "+");
  const meno = el("button", { type: "button", "aria-label": "Rimpicciolisci la mappa" }, "−");
  const intera = el("button", { type: "button", "aria-label": "Mappa intera", hidden: true }, "⤢");
  g.box.append(el("div", { class: "zoom-mappa" }, piu, meno, intera));

  function applica() {
    vista.s = Math.min(4, Math.max(1, vista.s));
    vista.tx = Math.min(0, Math.max(g.W * (1 - vista.s), vista.tx));
    vista.ty = Math.min(0, Math.max(g.H * (1 - vista.s), vista.ty));
    contenuto.setAttribute("transform", `translate(${vista.tx} ${vista.ty}) scale(${vista.s})`);
    arrivo.setAttribute("x", sx(px(fine)) - 6); arrivo.setAttribute("y", sy(py(fine)) - 6);
    partenza.setAttribute("cx", sx(px(0))); partenza.setAttribute("cy", sy(py(0)));
    if (iPunto != null) { punto.setAttribute("cx", sx(px(iPunto))); punto.setAttribute("cy", sy(py(iPunto))); }
    const perM = pxPerMetro * vista.s;
    const metri = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000].find((d) => d * perM >= 50) ?? 50000;
    const lx = metri * perM;
    fondoScala.setAttribute("width", lx + 64);
    segnoScala.setAttribute("d", `M16,${g.H - 20}v5h${lx}v-5`);
    testoScala.setAttribute("x", 22 + lx);
    testoScala.textContent = metri >= 1000 ? `${metri / 1000} km` : `${metri} m`;
    intera.hidden = vista.s < 1.01;
    meno.disabled = vista.s < 1.01;
    piu.disabled = vista.s > 3.99;
  }
  // Ingrandimento tenendo fermo il punto (cx, cy) dello schermo.
  const zoomA = (s, cx, cy) => {
    const bx = (cx - vista.tx) / vista.s, by = (cy - vista.ty) / vista.s;
    vista.s = Math.min(4, Math.max(1, s));
    vista.tx = cx - bx * vista.s;
    vista.ty = cy - by * vista.s;
    applica();
  };
  const tutta = () => { vista.s = 1; vista.tx = vista.ty = 0; applica(); };
  piu.onclick = () => zoomA(vista.s * 1.6, g.W / 2, g.H / 2);
  meno.onclick = () => zoomA(vista.s / 1.6, g.W / 2, g.H / 2);
  intera.onclick = tutta;
  applica();

  let gesto = null, ultimoTocco = null;
  const nascondiTip = () => { const tip = g.box.querySelector(".tip"); if (tip) tip.hidden = true; iPunto = null; punto.setAttribute("visibility", "hidden"); };
  // Un istante toccato su un grafico: il punto della traccia a quell'ora.
  const segui = (sec) => {
    if (sec == null) { iPunto = null; punto.setAttribute("visibility", "hidden"); return; }
    let a = 0, b = t.length - 1;
    while (b - a > 1) { const m = (a + b) >> 1; if (t[m] <= sec) a = m; else b = m; }
    iPunto = Math.abs(t[b] - sec) < Math.abs(t[a] - sec) ? b : a;
    chiudiTip(g);
    punto.setAttribute("cx", sx(px(iPunto)));
    punto.setAttribute("cy", sy(py(iPunto)));
    punto.setAttribute("visibility", "visible");
  };
  cursore?.unisci(segui);
  sensibile(g, (mx, my) => {
    if (gesto) return null;
    const bx = (mx - vista.tx) / vista.s, by = (my - vista.ty) / vista.s;
    let migliore = 0, dMin = Infinity;
    for (let i = 0; i < t.length; i++) {
      const d = (px(i) - bx) ** 2 + (py(i) - by) ** 2;
      if (d < dMin) { dMin = d; migliore = i; }
    }
    iPunto = migliore;
    cursore?.mostra(t[migliore], segui);
    punto.setAttribute("cx", sx(px(migliore)));
    punto.setAttribute("cy", sy(py(migliore)));
    punto.setAttribute("visibility", "visible");
    const s = t[migliore], v = fcA(migliore), zz = zonaA(migliore);
    return { x: sx(px(migliore)), y: sy(py(migliore)), titolo: `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")} dalla partenza`,
      righe: v == null ? [[null, "Battito", "—"]] : [[COLORE_ZONA[zz], "Battito", `${v} bpm`], [null, "Zona", ZONE[zz]]] };
  }, () => { iPunto = null; punto.setAttribute("visibility", "hidden"); cursore?.mostra(null, segui); });

  // Gesti con le dita: due dita ingrandiscono (attorno al punto in mezzo), un dito sposta la mappa ingrandita.
  const qui = (tc) => { const r = g.svg.getBoundingClientRect(); return { x: ((tc.clientX - r.left) / r.width) * g.W, y: ((tc.clientY - r.top) / r.height) * g.H }; };
  const unDito = (q, mosso = false) => ({ tipo: "uno", x: q.x, y: q.y, tx: vista.tx, ty: vista.ty, mosso });
  g.svg.addEventListener("touchstart", (e) => {
    const tocchi = [...e.touches].map(qui);
    if (tocchi.length >= 2) {
      e.preventDefault();
      nascondiTip();
      const [a, b] = tocchi;
      gesto = { tipo: "due", d: Math.hypot(a.x - b.x, a.y - b.y) || 1, s: vista.s, bx: ((a.x + b.x) / 2 - vista.tx) / vista.s, by: ((a.y + b.y) / 2 - vista.ty) / vista.s };
    } else if (vista.s > 1) {
      e.preventDefault();
      gesto = unDito(tocchi[0]);
    }
  }, { passive: false });
  g.svg.addEventListener("touchmove", (e) => {
    if (!gesto) return;
    e.preventDefault();
    const tocchi = [...e.touches].map(qui);
    if (gesto.tipo === "due" && tocchi.length >= 2) {
      const [a, b] = tocchi;
      vista.s = Math.min(4, Math.max(1, (gesto.s * Math.hypot(a.x - b.x, a.y - b.y)) / gesto.d));
      vista.tx = (a.x + b.x) / 2 - gesto.bx * vista.s;
      vista.ty = (a.y + b.y) / 2 - gesto.by * vista.s;
      applica();
    } else if (gesto.tipo === "uno" && tocchi.length) {
      const dx = tocchi[0].x - gesto.x, dy = tocchi[0].y - gesto.y;
      if (Math.hypot(dx, dy) > 4) { if (!gesto.mosso) nascondiTip(); gesto.mosso = true; }
      vista.tx = gesto.tx + dx;
      vista.ty = gesto.ty + dy;
      applica();
    }
  }, { passive: false });
  g.svg.addEventListener("touchend", (e) => {
    const era = gesto;
    if (e.touches.length === 1 && vista.s > 1) { gesto = unDito(qui(e.touches[0]), true); return; }
    if (e.touches.length) return;
    gesto = null;
    // Doppio tocco: ingrandisce 2× lì, oppure torna alla mappa intera.
    const p = e.changedTouches[0] ? qui(e.changedTouches[0]) : null;
    if (!p || era?.tipo === "due" || era?.mosso) { ultimoTocco = null; return; }
    const ora = Date.now();
    if (ultimoTocco && ora - ultimoTocco.t < 320 && Math.hypot(p.x - ultimoTocco.x, p.y - ultimoTocco.y) < 30) {
      e.preventDefault();
      nascondiTip();
      if (vista.s > 1.5) tutta(); else zoomA(vista.s * 2, p.x, p.y);
      ultimoTocco = null;
    } else ultimoTocco = { t: ora, x: p.x, y: p.y };
  });

  const zonePresenti = [...new Set(t.map((_, i) => zonaA(i)))].sort();
  legenda(contenitore, [...zonePresenti.map((zz) => (zz < 0 ? ["var(--ink)", "Senza battito"] : [COLORE_ZONA[zz], ZONE[zz]])),
    ["var(--surface);border:3px solid var(--ink);border-radius:50%", "Partenza"], ["var(--ink)", "Arrivo"]]);
  // Attribuzione chiesta dalla licenza della mappa.
  if (mappa) contenitore.append(el("p", { class: "attribuzione" }, "Mappa: © ",
    el("a", { href: "https://www.openstreetmap.org/copyright", target: "_blank", rel: "noopener" }, "OpenStreetMap"),
    " contributors, SRTM · stile © ", el("a", { href: "https://opentopomap.org", target: "_blank", rel: "noopener" }, "OpenTopoMap"), " (CC-BY-SA)"));
}

// Asse del tempo in minuti, comune alle curve di una sessione.
function asseTempo(g, durS, x) {
  const passoMin = durS / 60 > 150 ? 60 : durS / 60 > 90 ? 30 : durS / 60 > 40 ? 15 : 5;
  for (let mm = 0; mm * 60 <= durS; mm += passoMin)
    g.add(sv("text", { x: x(mm * 60), y: g.H - 6, "text-anchor": mm === 0 ? "start" : "middle" }, mm === 0 ? "0" : `${mm}'`));
  g.add(sv("line", { x1: g.m.l, x2: g.m.l + g.iw, y1: g.m.t + g.ih, y2: g.m.t + g.ih, class: "base" }));
}

// Soste e tratti senza battito: banda chiara a tutta altezza con l'etichetta, se c'è spazio. Nei tratti di sosta il
// dispositivo era in pausa e non registrava niente, quindi lì non ci sono dati da disegnare.
const durataVuoto = (v) => { const s = v.a - v.da; return s >= 90 ? `${Math.round(s / 60)} min` : `${s} s`; };
const nomeVuoto = (v) => (v.tipo === "sosta" ? "Sosta" : "Senza battito");
function disegnaVuoti(g, vuoti, x) {
  for (const v of vuoti) {
    const x0 = x(v.da), w = Math.max(x(v.a) - x0, 1.5);
    g.add(sv("rect", { x: x0, y: g.m.t, width: w, height: g.ih, fill: "var(--surface-2)" }),
      sv("line", { x1: x0, x2: x0, y1: g.m.t, y2: g.m.t + g.ih, stroke: "var(--line)", "stroke-width": 1 }),
      sv("line", { x1: x0 + w, x2: x0 + w, y1: g.m.t, y2: g.m.t + g.ih, stroke: "var(--line)", "stroke-width": 1 }));
    const cx = x0 + w / 2, stile = "font-size:10px;font-weight:700;letter-spacing:.06em";
    if (w >= 34) g.add(sv("text", { x: cx, y: g.m.t + 12, "text-anchor": "middle", style: stile }, v.tipo === "sosta" ? "SOSTA" : "NO FC"));
    if (w >= 20) g.add(sv("text", { x: cx, y: g.m.t + (w >= 34 ? 24 : 12), "text-anchor": "middle", style: stile }, durataVuoto(v).replace(" min", "'").replace(" s", '"')));
  }
}
const tipVuoto = (vuoti, sec, xPx, g) => {
  const v = vuoti.find((q) => sec >= q.da && sec < q.a);
  return v ? { x: xPx, y: g.m.t + 30, titolo: `Dal ${Math.floor(v.da / 60)}' al ${Math.floor(v.a / 60)}'`, righe: [[null, nomeVuoto(v), durataVuoto(v)]] } : null;
};

// Curva del battito di una sessione, sulle bande delle zone; `vuoti` da trovaVuoti() di analisi-file.js.
export function graficoCurva(contenitore, curva, lim, vuoti = [], cursore = null) {
  const g = pianoGrafico(contenitore, { H: (W) => altezza(W, 0.72, 250, 360), m: { t: 10, r: 30, b: 24, l: 36 } });
  const fc = curva.fc;
  const validi = fc.filter((v) => v != null);
  const lo = Math.min(Math.floor((Math.min(...validi) - 5) / 10) * 10, lim[0] - 10);
  const hi = Math.max(Math.ceil((Math.max(...validi) + 5) / 10) * 10, lim[3] + 5);
  const durS = fc.length * curva.passo_s;
  const x = (s) => g.m.l + (s / durS) * g.iw;
  const y = (v) => g.m.t + g.ih - ((v - lo) / (hi - lo)) * g.ih;
  const bordi = [lo, ...lim, hi];
  for (let z = 0; z < 5; z++) {
    const a = Math.max(bordi[z], lo), b = Math.min(bordi[z + 1], hi);
    if (b > a) g.add(
      sv("rect", { x: g.m.l, y: y(b), width: g.iw, height: y(a) - y(b), fill: COLORE_ZONA[z], style: "fill-opacity:var(--band-alpha)" }),
      sv("line", { x1: g.m.l, x2: g.m.l + g.iw, y1: y(b), y2: y(b), stroke: COLORE_ZONA[z], "stroke-width": 1, "stroke-opacity": 0.7 }),
      sv("text", { x: g.W - g.m.r + 6, y: (y(a) + y(b)) / 2 + 4, style: `fill:${COLORE_ZONA[z]};font-weight:700` }, ZONE[z]));
  }
  disegnaVuoti(g, vuoti, x);
  asseY(g, tacche(lo, hi).filter((t) => t >= lo && t <= hi), y, String, { griglia: false });
  asseTempo(g, durS, x);
  // Sopra le soste la curva si ricollega con un tratteggio: il battito di prima e di dopo la sosta.
  for (const v of vuoti.filter((q) => q.tipo === "sosta")) {
    const i0 = Math.round(v.da / curva.passo_s) - 1, i1 = Math.round(v.a / curva.passo_s);
    if (fc[i0] != null && fc[i1] != null) g.add(sv("line", { x1: x((i0 + 0.5) * curva.passo_s), y1: y(fc[i0]), x2: x((i1 + 0.5) * curva.passo_s), y2: y(fc[i1]),
      stroke: "var(--faint)", "stroke-width": "1.5", "stroke-dasharray": "3 4" }));
  }
  g.add(sv("path", { d: percorso(fc, curva.passo_s, x, y), fill: "none", stroke: "var(--ink)", "stroke-width": "2.4", "stroke-linejoin": "round", "stroke-linecap": "round" }));
  const segno = segnoIstante(g, "var(--ink)");
  const segui = (sec) => {
    const i = sec == null ? -1 : Math.floor(sec / curva.passo_s);
    if (i < 0 || i >= fc.length) return segno.nascondi();
    chiudiTip(g);
    const v = fc[i];
    segno.mostra(x((i + 0.5) * curva.passo_s), v == null ? null : y(v), v == null ? "—" : `${v} bpm · Z${zonaDi(v, lim)}`);
  };
  cursore?.unisci(segui);
  sensibile(g, (px) => {
    const i = Math.max(0, Math.min(fc.length - 1, Math.round(((px - g.m.l) / g.iw) * fc.length - 0.5)));
    const v = fc[i], sec = i * curva.passo_s, cx = x((i + 0.5) * curva.passo_s);
    cursore?.mostra(sec + curva.passo_s / 2, segui);
    segno.mostra(cx, v == null ? null : y(v));
    if (v == null) return tipVuoto(vuoti, sec, cx, g);
    const zz = zonaDi(v, lim) - 1;
    return { x: cx, y: y(v), titolo: `${Math.floor(sec / 60)}' ${String(sec % 60).padStart(2, "0")}"`, righe: [[COLORE_ZONA[zz], "Battito", `${v} bpm`], [null, "Zona", ZONE[zz]]] };
  }, () => { segno.nascondi(); cursore?.mostra(null, segui); });
}

function percorso(valori, passo, x, y) {
  let d = "", su = false;
  valori.forEach((v, i) => {
    if (v == null) { su = false; return; }
    d += `${su ? "L" : "M"}${x((i + 0.5) * passo).toFixed(1)},${y(v).toFixed(1)}`;
    su = true;
  });
  return d;
}

// Una grandezza nel tempo (quota, velocità, potenza, cadenza) con area sotto la linea.
export function graficoTempo(contenitore, { valori, passo_s, colore, formato, formatoAsse = formato, nome, vuoti = [], cursore = null }) {
  const validi = valori.filter((v) => v != null);
  if (validi.length < 2) return vuoto(contenitore, "Dati insufficienti.");
  const ticks = tacche(Math.min(...validi), Math.max(...validi), { n: 3 });
  // Margine sinistro su misura per le etichette dell'asse, che altrimenti uscirebbero dalla scheda.
  const l = Math.max(32, Math.round(Math.max(...ticks.map((t) => formatoAsse(t).length)) * 6.4) + 10);
  const g = pianoGrafico(contenitore, { H: (W) => altezza(W, 0.52, 170, 260), m: { t: 10, r: 10, b: 24, l } });
  const durS = valori.length * passo_s;
  const lo = ticks[0], hi = ticks[ticks.length - 1] > lo ? ticks[ticks.length - 1] : lo + 1;
  const x = (s) => g.m.l + (s / durS) * g.iw;
  const y = (v) => g.m.t + g.ih - ((v - lo) / (hi - lo)) * g.ih;
  const soste = vuoti.filter((q) => q.tipo === "sosta");
  disegnaVuoti(g, soste, x);
  asseY(g, ticks, y, formatoAsse);
  asseTempo(g, durS, x);
  const linea = percorso(valori, passo_s, x, y);
  const base = g.m.t + g.ih;
  const area = linea.split("M").filter(Boolean).map((tratto) => {
    const pts = tratto.split("L");
    const primo = pts[0].split(",")[0], ultimo = pts[pts.length - 1].split(",")[0];
    return `M${primo},${base}L${tratto}L${ultimo},${base}Z`;
  }).join("");
  g.add(sv("path", { d: area, fill: colore, "fill-opacity": "0.14" }),
    sv("path", { d: linea, fill: "none", stroke: colore, "stroke-width": "1.8", "stroke-linejoin": "round" }));
  const segno = segnoIstante(g, colore);
  const segui = (sec) => {
    const i = sec == null ? -1 : Math.floor(sec / passo_s);
    if (i < 0 || i >= valori.length) return segno.nascondi();
    chiudiTip(g);
    const v = valori[i];
    segno.mostra(x((i + 0.5) * passo_s), v == null ? null : y(v), v == null ? "—" : formato(v));
  };
  cursore?.unisci(segui);
  sensibile(g, (px) => {
    const i = Math.max(0, Math.min(valori.length - 1, Math.round(((px - g.m.l) / g.iw) * valori.length - 0.5)));
    const v = valori[i], sec = i * passo_s, cx = x((i + 0.5) * passo_s);
    cursore?.mostra(sec + passo_s / 2, segui);
    segno.mostra(cx, v == null ? null : y(v));
    if (v == null) return tipVuoto(soste, sec, cx, g);
    return { x: cx, y: y(v), titolo: `${Math.floor(sec / 60)}' ${String(sec % 60).padStart(2, "0")}"`, righe: [[colore, nome, formato(v)]] };
  }, () => { segno.nascondi(); cursore?.mostra(null, segui); });
}
