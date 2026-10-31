// Dove stanno i dati. Due modalità con la stessa interfaccia:
// - "account": database dell'artifact su claude.ai, sotto data/users/<id>/allenamento, privato per ogni persona
//   e sincronizzato tra telefono e computer (serve un artifact con le capacità db e user);
// - "browser": IndexedDB di questo browser, per la copia condivisibile con chiunque. Se anche IndexedDB manca
//   (finestra privata) resta in memoria, e l'app lo dice.
//
// Interfaccia: ascolta(collezione, cb(docs), errore) → stop; elenco(collezione); leggi(collezione, id);
// scrivi(collezione, id, dati) sostituisce tutto il documento; elimina(collezione, id).
// Ogni documento consegnato ha il suo `id`; il campo `id` non si salva nel corpo.

const senzaId = ({ id, ...resto }) => JSON.parse(JSON.stringify(resto)); // via undefined e funzioni

export async function apriArchivio() {
  let db = null, uid = null;
  try {
    db = await window.claude?.use?.("db");
    const user = await window.claude?.use?.("user");
    uid = user ? await user.id() : null;
  } catch { db = null; }
  if (db && uid) return archivioAccount(db, uid);
  return archivioBrowser();
}

function archivioAccount(db, uid) {
  const base = db.doc(`data/users/${uid}/allenamento`);
  const col = (c) => base.collection(c);
  return {
    modo: "account",
    ascolta: (c, cb, errore) => col(c).onSnapshot((s) => cb(s.docs.map((d) => ({ ...d.data(), id: d.id }))), errore),
    elenco: async (c) => (await col(c).get()).docs.map((d) => ({ ...d.data(), id: d.id })),
    leggi: async (c, id) => { const s = await col(c).doc(id).get(); return s.exists ? { ...s.data(), id: s.id } : null; },
    scrivi: (c, id, dati) => col(c).doc(id).set(senzaId(dati)),
    elimina: (c, id) => col(c).doc(id).delete(),
  };
}

async function archivioBrowser() {
  const cache = new Map(); // collezione → Map(id → corpo)
  const ascoltatori = new Map();
  let idb = null;
  try {
    idb = await new Promise((ok, ko) => {
      const r = indexedDB.open("allenamento", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("doc");
      r.onsuccess = () => ok(r.result);
      r.onerror = () => ko(r.error);
      setTimeout(() => ko(new Error("IndexedDB non risponde")), 4000);
    });
    const righe = await new Promise((ok, ko) => {
      const out = [];
      const cur = idb.transaction("doc").objectStore("doc").openCursor();
      cur.onsuccess = () => { const c = cur.result; if (!c) return ok(out); out.push([c.key, c.value]); c.continue(); };
      cur.onerror = () => ko(cur.error);
    });
    for (const [k, v] of righe) {
      const i = k.indexOf("/");
      const c = k.slice(0, i), id = k.slice(i + 1);
      if (!cache.has(c)) cache.set(c, new Map());
      cache.get(c).set(id, v);
    }
    try { await navigator.storage?.persist?.(); } catch { /* il browser può rifiutare */ }
  } catch { idb = null; }

  const docs = (c) => [...(cache.get(c)?.entries() ?? [])].map(([id, v]) => ({ ...structuredClone(v), id }));
  const notifica = (c) => { const d = docs(c); for (const cb of ascoltatori.get(c) ?? []) cb(d); };
  const salva = (k, v) => new Promise((ok, ko) => {
    if (!idb) return ok();
    const t = idb.transaction("doc", "readwrite");
    v === undefined ? t.objectStore("doc").delete(k) : t.objectStore("doc").put(v, k);
    t.oncomplete = () => ok();
    t.onerror = () => ko(t.error ?? new Error("Il browser non ha salvato i dati"));
  });
  return {
    modo: idb ? "browser" : "memoria",
    ascolta(c, cb) {
      if (!ascoltatori.has(c)) ascoltatori.set(c, new Set());
      ascoltatori.get(c).add(cb);
      queueMicrotask(() => cb(docs(c)));
      return () => ascoltatori.get(c)?.delete(cb);
    },
    elenco: async (c) => docs(c),
    leggi: async (c, id) => { const v = cache.get(c)?.get(id); return v ? { ...structuredClone(v), id } : null; },
    async scrivi(c, id, dati) {
      const corpo = senzaId(dati);
      if (!cache.has(c)) cache.set(c, new Map());
      cache.get(c).set(id, corpo);
      notifica(c);
      await salva(`${c}/${id}`, corpo);
    },
    async elimina(c, id) {
      cache.get(c)?.delete(id);
      notifica(c);
      await salva(`${c}/${id}`, undefined);
    },
  };
}
