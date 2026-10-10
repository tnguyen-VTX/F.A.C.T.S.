import { describe, it, expect } from 'vitest';
import { DATA_VERSION, VERSION_KEY, migrate } from '../src/lib/migrate.js';

const mem = (init = {}) => {
  const m = { ...init };
  return {
    m,
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => (m[k] = String(v)),
    removeItem: (k) => delete m[k],
  };
};

describe('migrate', () => {
  it('upgrades old data without dropping anything', () => {
    const old = { 'gilbert/FY2027': { je: [{ n: 1 }], bar: { note: 'x' }, extra: 5 } };
    const s = mem({ k: JSON.stringify(old) });
    const r = migrate(s, 'k');
    expect(r).toMatchObject({ migrated: true, version: DATA_VERSION });
    const out = JSON.parse(s.m.k)['gilbert/FY2027'];
    expect(out.je).toEqual([{ n: 1 }]);
    expect(out.extra).toBe(5);
    expect(out.bars).toEqual([]);
    expect(s.m[VERSION_KEY]).toBe(String(DATA_VERSION));
  });
  it('starts empty storage at the current version', () => {
    const s = mem();
    expect(migrate(s, 'k').version).toBe(DATA_VERSION);
  });
  it('does nothing when already current', () => {
    const s = mem({ k: '{}', [VERSION_KEY]: String(DATA_VERSION) });
    expect(migrate(s, 'k').migrated).toBe(false);
  });
  it('leaves newer data untouched', () => {
    const s = mem({ k: '{"a":1}', [VERSION_KEY]: '99' });
    const r = migrate(s, 'k');
    expect(r.newer).toBe(true);
    expect(s.m.k).toBe('{"a":1}');
  });
  it('leaves unreadable data alone', () => {
    const s = mem({ k: '{broken' });
    const r = migrate(s, 'k');
    expect(r.unreadable).toBe(true);
    expect(s.m.k).toBe('{broken');
  });
});

describe('migrate with a damaged version key', () => {
  it('treats a negative version as no version', () => {
    const s = mem({ k: '{"a/FY2027":{}}', [VERSION_KEY]: '-1' });
    expect(() => migrate(s, 'k')).not.toThrow();
    expect(s.m[VERSION_KEY]).toBe(String(DATA_VERSION));
  });
});

describe('moving facts.* names to barbuilder.*', () => {
  it('moves each value once and keeps what is already under the new name', async () => {
    const { moveLegacyKeys } = await import('../src/lib/migrate.js');
    const s = mem({ 'facts.v1': '{"a":1}', 'facts.fy': '2027', 'barbuilder.fy': '2028' });
    moveLegacyKeys(s);
    expect(s.m['barbuilder.v1']).toBe('{"a":1}');
    expect(s.m['barbuilder.fy']).toBe('2028');
    expect('facts.v1' in s.m).toBe(false);
    moveLegacyKeys(s);
    expect(s.m['barbuilder.v1']).toBe('{"a":1}');
    expect(() => moveLegacyKeys(null)).not.toThrow();
  });
});
