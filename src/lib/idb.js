export const IDB = {
  open() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('facts', 1);
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
};
