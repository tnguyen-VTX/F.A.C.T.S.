import { describe, it, expect } from 'vitest';
import { gilbertPreset, newProfile } from '../src/lib/profile.js';
import {
  PROFILES_KEY,
  activeProfile,
  deleteProfile,
  loadProfiles,
  makeProfileId,
  saveProfile,
  setActive,
} from '../src/lib/profileStore.js';

const fake = (init) => {
  const m = new Map(init ? [[PROFILES_KEY, init]] : []);
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), m };
};
const school = (id, name) => newProfile({ id, name });

describe('profile storage', () => {
  it('starts with the Gilbert preset on first run', () => {
    const s = loadProfiles(fake());
    expect(activeProfile(s).id).toBe('gilbert-l-sena');
  });
  it('recovers from unreadable saved data', () => {
    expect(activeProfile(loadProfiles(fake('{nope'))).id).toBe('gilbert-l-sena');
  });
  it('saves a valid profile and loads it back', () => {
    const st = fake();
    const s = loadProfiles(st);
    expect(saveProfile(st, s, school('cesar', 'Cesar Chavez Community School')).ok).toBe(true);
    const again = loadProfiles(st);
    expect(Object.keys(again.profiles).sort()).toEqual(['cesar', 'gilbert-l-sena']);
  });
  it('refuses to save an invalid profile and says why', () => {
    const st = fake();
    const s = loadProfiles(st);
    const r = saveProfile(st, s, school('Bad Id', ''));
    expect(r.ok).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
    expect(st.m.size).toBe(0);
    expect(s.profiles['Bad Id']).toBeUndefined();
  });
  it('switches the active school and remembers it', () => {
    const st = fake();
    const s = loadProfiles(st);
    saveProfile(st, s, school('cesar', 'Cesar Chavez Community School'));
    expect(setActive(st, s, 'cesar')).toBe(true);
    expect(activeProfile(loadProfiles(st)).id).toBe('cesar');
    expect(setActive(st, s, 'missing')).toBe(false);
  });
  it('deletes a school but never the last one, and moves the active school', () => {
    const st = fake();
    const s = loadProfiles(st);
    saveProfile(st, s, school('cesar', 'Cesar Chavez Community School'));
    setActive(st, s, 'cesar');
    expect(deleteProfile(st, s, 'cesar').ok).toBe(true);
    expect(s.active).toBe('gilbert-l-sena');
    expect(deleteProfile(st, s, 'gilbert-l-sena').ok).toBe(false);
  });
  it('makes unique ids from names', () => {
    expect(makeProfileId('Cesar Chavez Community School', {})).toBe('cesar-chavez-community-school');
    expect(makeProfileId('Cesar Chavez', { 'cesar-chavez': 1 })).toBe('cesar-chavez-2');
    expect(makeProfileId('!!!', {})).toBe('school');
  });
});

describe("Gilbert's own report name", () => {
  it('matches the name its AptaFund report prints', async () => {
    const { gilbertPreset } = await import('../src/lib/profile.js');
    const { schoolMatches } = await import('../src/lib/reportCheck.js');
    expect(schoolMatches(gilbertPreset(), 'Gilbert L. Sena High School')).toBe(true);
    expect(schoolMatches(gilbertPreset(), 'Cesar Chavez Community School')).toBe(false);
  });
  it('is added to a Gilbert profile saved before, keeping names the user typed', () => {
    const old = { ...gilbertPreset(), reportNames: ['My own spelling'] };
    const st = fake(JSON.stringify({ active: old.id, profiles: { [old.id]: old } }));
    const loaded = loadProfiles(st).profiles[old.id];
    expect(loaded.reportNames).toEqual(['My own spelling', 'Gilbert L. Sena High School']);
    expect(loadProfiles(st).profiles[old.id].reportNames).toHaveLength(2);
  });
  it('is not forced onto other schools', () => {
    const st = fake(JSON.stringify({ active: 'cesar', profiles: { cesar: school('cesar', 'Cesar') } }));
    expect(loadProfiles(st).profiles.cesar.reportNames).toEqual([]);
  });
});
