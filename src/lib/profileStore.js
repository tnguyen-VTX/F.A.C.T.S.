// Saves school profiles in the browser. Takes any object with getItem/setItem
// (localStorage in the app, a fake in tests) so it runs in Node.
import { gilbertPreset, newProfile, validateProfile } from './profile.js';

export const PROFILES_KEY = 'barbuilder.profiles.v1';

function read(storage) {
  try {
    const v = JSON.parse(storage.getItem(PROFILES_KEY));
    if (v && typeof v === 'object' && v.profiles && typeof v.profiles === 'object') return v;
  } catch (e) {}
  return null;
}
function write(storage, state) {
  try {
    storage.setItem(PROFILES_KEY, JSON.stringify(state));
    return true;
  } catch (e) {
    return false;
  }
}

// First run (or unreadable data) starts with the built-in Gilbert preset so v0.1 keeps working.
export function loadProfiles(storage) {
  const s = read(storage);
  if (s) {
    // Fill in fields added in later versions without changing what the user saved.
    for (const id of Object.keys(s.profiles)) s.profiles[id] = newProfile(s.profiles[id]);
    // The built-in Gilbert profile gains the report name it was missing; names the user typed are kept.
    const g = gilbertPreset();
    const saved = s.profiles[g.id];
    if (saved) saved.reportNames = [...new Set([...(saved.reportNames || []), ...g.reportNames])];
    if (!s.profiles[s.active]) s.active = Object.keys(s.profiles)[0] || '';
    if (s.active) return s;
  }
  const g = gilbertPreset();
  return { active: g.id, profiles: { [g.id]: g } };
}

// Returns { ok, errors }. A profile that fails validation is not saved.
export function saveProfile(storage, state, profile) {
  const errors = validateProfile(profile);
  if (errors.length) return { ok: false, errors };
  state.profiles[profile.id] = profile;
  if (!state.active) state.active = profile.id;
  return write(storage, state)
    ? { ok: true, errors: [] }
    : { ok: false, errors: ['The browser could not save this profile.'] };
}

export function deleteProfile(storage, state, id) {
  if (!state.profiles[id]) return { ok: false, errors: ['That school is not saved.'] };
  if (Object.keys(state.profiles).length === 1) return { ok: false, errors: ['Keep at least one school.'] };
  delete state.profiles[id];
  if (state.active === id) state.active = Object.keys(state.profiles)[0];
  return write(storage, state)
    ? { ok: true, errors: [] }
    : { ok: false, errors: ['The browser could not save this change.'] };
}

export function setActive(storage, state, id) {
  if (!state.profiles[id]) return false;
  state.active = id;
  return write(storage, state);
}

export const activeProfile = (state) => state.profiles[state.active];

// A short id from a school name, unique among existing profiles.
export function makeProfileId(name, existing) {
  const base =
    String(name || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'school';
  let id = base,
    n = 2;
  while (existing[id]) id = `${base}-${n++}`;
  return id;
}
