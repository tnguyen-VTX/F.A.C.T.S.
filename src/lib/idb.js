export const IDB = {
  open() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('barbuilder', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('files');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  },
  async tx(mode, fn) {
    const db = await this.open();
    return new Promise((res, rej) => {
      const t = db.transaction('files', mode);
      const q = fn(t.objectStore('files'));
      t.oncomplete = () => res(q && q.result);
      t.onerror = () => rej(t.error);
    });
  },
  put(k, v) {
    return this.tx('readwrite', (s) => s.put(v, k));
  },
  get(k) {
    return this.tx('readonly', (s) => s.get(k));
  },
  keys() {
    return this.tx('readonly', (s) => s.getAllKeys());
  },
  del(k) {
    return this.tx('readwrite', (s) => s.delete(k));
  },
  // Earlier builds used a database called facts. Copy what it holds into this one, then remove it.
  async moveLegacy() {
    try {
      if (typeof indexedDB === 'undefined' || localStorage.getItem('barbuilder.idbMoved')) return;
      const old = await new Promise((res, rej) => {
        const r = indexedDB.open('facts', 1);
        let fresh = false;
        r.onupgradeneeded = () => (fresh = true);
        r.onsuccess = () =>
          fresh ? (r.result.close(), indexedDB.deleteDatabase('facts'), res(null)) : res(r.result);
        r.onerror = () => rej(r.error);
      });
      if (old) {
        const [keys, vals] = await new Promise((res, rej) => {
          const st = old.transaction('files', 'readonly').objectStore('files');
          const k = st.getAllKeys(),
            v = st.getAll();
          const t = st.transaction;
          t.oncomplete = () => res([k.result, v.result]);
          t.onerror = () => rej(t.error);
        });
        old.close();
        for (let i = 0; i < keys.length; i++) await this.put(keys[i], vals[i]);
        indexedDB.deleteDatabase('facts');
      }
      localStorage.setItem('barbuilder.idbMoved', '1');
    } catch (e) {}
  },
};
