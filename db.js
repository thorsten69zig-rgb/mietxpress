/* Lokaler Speicher (IndexedDB). Alle Daten bleiben auf dem Gerät. */
const DB = (function () {
  const NAME = 'mietxpress';
  const VER = 1;
  const DATA_STORES = ['buchungen', 'artikel', 'sperrliste'];
  let dbp = null;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      const r = indexedDB.open(NAME, VER);
      r.onupgradeneeded = () => {
        const d = r.result;
        DATA_STORES.forEach((s) => d.createObjectStore(s, { keyPath: 'id' }));
        d.createObjectStore('meta', { keyPath: 'key' });
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    return dbp;
  }

  async function run(store, mode, fn) {
    const d = await open();
    return new Promise((resolve, reject) => {
      const t = d.transaction(store, mode);
      const s = t.objectStore(store);
      let req;
      try { req = fn(s); } catch (e) { reject(e); return; }
      t.oncomplete = () => resolve(req && 'result' in req ? req.result : undefined);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }

  return {
    stores: DATA_STORES,
    getAll: (store) => run(store, 'readonly', (s) => s.getAll()),
    put: (store, item) => run(store, 'readwrite', (s) => s.put(item)),
    remove: (store, id) => run(store, 'readwrite', (s) => s.delete(id)),
    async replaceAll(store, items) {
      return run(store, 'readwrite', (s) => {
        s.clear();
        items.forEach((i) => s.put(i));
      });
    },
    async clearAll() {
      for (const s of DATA_STORES) await run(s, 'readwrite', (st) => st.clear());
      await run('meta', 'readwrite', (st) => st.clear());
    },
    async getMeta(key) {
      const r = await run('meta', 'readonly', (s) => s.get(key));
      return r ? r.value : null;
    },
    setMeta: (key, value) => run('meta', 'readwrite', (s) => s.put({ key, value }))
  };
})();
