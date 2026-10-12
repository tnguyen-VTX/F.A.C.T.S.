// Versioned browser storage. The version lives under its own key so the data keys keep their shape.
// A migration never drops data; data from a newer version is left untouched and read-only.
export const DATA_VERSION = 1;
export const VERSION_KEY = 'barbuilder.dataVersion';

// Each step upgrades the user-data store (`barbuilder.v1`) from version n to n+1, in place.
const STEPS = [
  // 0 -> 1: every school/year entry has the arrays and objects the screens expect, including saved BARs.
  (store) => {
    for (const v of Object.values(store)) {
      if (!v || typeof v !== 'object') continue;
      v.je ??= [];
      v.bar ??= {};
      v.bars ??= [];
    }
  },
];

// storage: localStorage-like. storeKey: key of the user-data store. Returns { version, newer, migrated }.
export function migrate(storage, storeKey) {
  let found = 0;
  try {
    found = Math.max(0, parseInt(storage.getItem(VERSION_KEY), 10) || 0);
  } catch (e) {
    return { version: 0, newer: false, migrated: false };
  }
  if (found > DATA_VERSION) return { version: found, newer: true, migrated: false };
  if (found === DATA_VERSION) return { version: found, newer: false, migrated: false };
  let store = {};
  try {
    store = JSON.parse(storage.getItem(storeKey)) || {};
  } catch (e) {
    // Unreadable data is left exactly as it is; nothing is rewritten.
    return { version: found, newer: false, migrated: false, unreadable: true };
  }
  for (let n = found; n < DATA_VERSION; n++) STEPS[n](store);
  try {
    storage.setItem(storeKey, JSON.stringify(store));
    storage.setItem(VERSION_KEY, String(DATA_VERSION));
  } catch (e) {
    return { version: found, newer: false, migrated: false };
  }
  return { version: DATA_VERSION, newer: false, migrated: true };
}

// Earlier builds saved under facts.* names. Move each value to its barbuilder.* name, once, keeping data.
export const LEGACY_KEYS = [
  ['facts.v1', 'barbuilder.v1'],
  ['facts.profiles.v1', 'barbuilder.profiles.v1'],
  ['facts.fy', 'barbuilder.fy'],
  ['facts.dataVersion', 'barbuilder.dataVersion'],
];
export function moveLegacyKeys(storage) {
  if (!storage) return;
  for (const [from, to] of LEGACY_KEYS) {
    try {
      const v = storage.getItem(from);
      if (v == null) continue;
      if (storage.getItem(to) == null) storage.setItem(to, v);
      storage.removeItem(from);
    } catch (e) {}
  }
}
