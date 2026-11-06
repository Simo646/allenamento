// Record personali di sempre. Cardio, per attività (la bici divisa per tipo): distanza più lunga, durata più lunga,
// salita maggiore, velocità media (bici) o passo medio (corsa e camminata). Forza: massimale stimato per esercizio.
// A parità il record resta a chi l'ha fatto per primo. Velocità e passo solo da una distanza minima, così un giro
// breve non batte un'uscita vera; distanza, salita e velocità non contano le sessioni al chiuso.
import { massimale, epley } from "./analisi-file.js";
import { CARDIO } from "./dati.js";

const MIN_KM = { Bici: 15, Corsa: 3, Camminata: 3 };
const velocita = (s) => s.vel_media ?? (s.km / s.durata_min) * 60;
const VOCI = [
  { voce: "distanza", nome: "Distanza più lunga", breve: "Distanza", valore: (s) => (!s.indoor && s.km > 0 ? s.km : null) },
  { voce: "durata", nome: "Durata più lunga", breve: "Durata", valore: (s) => (s.durata_min > 0 ? s.durata_min : null) },
  { voce: "salita", nome: "Salita maggiore", breve: "Salita", valore: (s) => (!s.indoor && s.salita_m > 0 ? s.salita_m : null) },
  { voce: "velocita", nome: "Velocità media più alta", breve: "Velocità media", solo: ["Bici"], valore: (s) => (!s.indoor && s.km >= MIN_KM.Bici && s.durata_min > 0 ? velocita(s) : null) },
  // Passo in secondi al km: più basso è meglio, quindi lo confronto col segno meno.
  { voce: "passo", nome: "Passo medio migliore", breve: "Passo medio", solo: ["Corsa", "Camminata"], minore: true,
    valore: (s) => (!s.indoor && s.km >= MIN_KM[s.tipo] && s.durata_min > 0 ? (s.durata_min * 60) / s.km : null) },
];

const inOrdine = (sessioni) => [...sessioni].sort((a, b) => (a.data + (a.inizio ?? "")).localeCompare(b.data + (b.inizio ?? "")));

// → { cardio: [{ tipo, sottotipo, voci: [{ voce, nome, breve, valore, id, data }] }], forza: [{ esercizio, valore, serie, id, data }] }
export function recordPersonali(sessioni = []) {
  const gruppi = new Map();
  const forza = new Map();
  for (const s of inOrdine(sessioni)) {
    if (CARDIO.includes(s.tipo)) {
      const chiave = s.tipo + "|" + (s.tipo === "Bici" ? s.sottotipo ?? "" : "");
      if (!gruppi.has(chiave)) gruppi.set(chiave, { tipo: s.tipo, sottotipo: s.tipo === "Bici" ? s.sottotipo ?? null : null, voci: new Map() });
      const g = gruppi.get(chiave);
      for (const v of VOCI) {
        if (v.solo && !v.solo.includes(s.tipo)) continue;
        const x = v.valore(s);
        if (x == null || !Number.isFinite(x)) continue;
        const r = g.voci.get(v.voce);
        if (!r || (v.minore ? x < r.valore : x > r.valore)) g.voci.set(v.voce, { voce: v.voce, nome: v.nome, breve: v.breve, valore: x, id: s.id, data: s.data });
      }
    }
    for (const e of s.esercizi ?? []) {
      const m = massimale(e.serie);
      if (!m) continue;
      const r = forza.get(e.nome);
      if (!r || m > r.valore) {
        const migliore = e.serie.reduce((a, x) => (epley(x.kg, x.rip) > (a ? epley(a.kg, a.rip) : 0) ? x : a), null);
        forza.set(e.nome, { esercizio: e.nome, valore: m, serie: migliore ? { kg: migliore.kg, rip: migliore.rip } : null, id: s.id, data: s.data });
      }
    }
  }
  const ordineTipi = (g) => CARDIO.indexOf(g.tipo) * 10 + (g.sottotipo ? 1 : 0);
  return {
    cardio: [...gruppi.values()].filter((g) => g.voci.size).sort((a, b) => ordineTipi(a) - ordineTipi(b) || (a.sottotipo ?? "").localeCompare(b.sottotipo ?? ""))
      .map((g) => ({ ...g, voci: VOCI.map((v) => g.voci.get(v.voce)).filter(Boolean) })),
    forza: [...forza.values()].sort((a, b) => a.esercizio.localeCompare(b.esercizio, "it")),
  };
}

// I record che appartengono a una sessione, per il riquadro nel dettaglio: ["Distanza più lunga", "Massimale: Squat"].
export function recordDi(sessioni, id, rec = recordPersonali(sessioni)) {
  return [
    ...rec.cardio.flatMap((g) => g.voci.filter((v) => v.id === id).map((v) => v.nome)),
    ...rec.forza.filter((f) => f.id === id).map((f) => `Massimale: ${f.esercizio}`),
  ];
}
