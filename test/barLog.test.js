import { describe, it, expect } from 'vitest';
import {
  addStatus,
  checkBackup,
  exportBackup,
  isFrozen,
  isLocked,
  planRestore,
  saveBar,
  STATUSES,
} from '../src/lib/barLog.js';

const bar = (j = 'x') => ({ type: 'T', fund: '11000', justification: j, lines: [] });
const T0 = Date.UTC(2026, 9, 9);

describe('saved BARs', () => {
  it('adds a new BAR as Built with a log entry', () => {
    const { list, entry } = saveBar([], bar(), { asrFile: 'a.xlsx' }, T0);
    expect(list).toHaveLength(1);
    expect(entry.status).toBe('Built');
    expect(entry.log).toEqual([{ status: 'Built', date: '2026-10-09', note: '' }]);
    expect(entry.bar.savedId).toBe(entry.id);
  });
  it('saving again updates the same entry', () => {
    const a = saveBar([], bar('one'), null, T0);
    const b = saveBar(a.list, a.entry.bar, null, T0 + 1000);
    expect(b.list).toHaveLength(1);
    const c = saveBar(a.list, { ...a.entry.bar, justification: 'two' }, null, T0 + 2000);
    expect(c.list[0].bar.justification).toBe('two');
  });
  it('freezes from Uploaded on and refuses to change the lines', () => {
    const a = saveBar([], bar(), null, T0);
    const up = addStatus(a.entry, 'Uploaded', '2026-10-10', 'OBMS', T0);
    expect(isFrozen(up)).toBe(true);
    const r = saveBar([up], { ...up.bar, justification: 'new' }, null, T0);
    expect(r.error).toContain('frozen');
    expect(r.list[0].bar.justification).toBe('x');
    expect(isFrozen(addStatus(up, 'Rejected', '2026-10-11'))).toBe(false);
  });
  it('rejects an unknown status', () => {
    expect(() => addStatus(saveBar([], bar(), null, T0).entry, 'Done')).toThrow();
  });
  it('locks a prior year after 10/31', () => {
    expect(isLocked(2026, '2026-10-31')).toBe(false);
    expect(isLocked(2026, '2026-11-01')).toBe(true);
    expect(isLocked(2027, '2026-10-09')).toBe(false);
  });
});

describe('backup', () => {
  const store = {
    'a/FY2027': { bars: [{ id: 'b1' }], bbDraft: null, bb: { type: 'T' }, je: [{ secret: 1 }] },
    'b/FY2027': { je: [], bar: {} },
  };
  it('keeps only BARs, drafts and settings', () => {
    const b = exportBackup({ profiles: [{ id: 'a' }], store, now: T0 });
    expect(Object.keys(b.schools)).toEqual(['a/FY2027']);
    expect(b.schools['a/FY2027'].je).toBeUndefined();
    expect(checkBackup(b)).toBe('');
  });
  it('keeps saved journal entries and lists a school that has only those', () => {
    const b = exportBackup({
      profiles: [],
      store: { 'c/FY2027': { jes: [{ id: 'j1' }], je: [{ secret: 1 }] } },
      now: T0,
    });
    expect(b.schools['c/FY2027'].jes).toEqual([{ id: 'j1' }]);
    expect(b.schools['c/FY2027'].je).toBeUndefined();
  });
  it('refuses other files', () => {
    expect(checkBackup({ hello: 1 })).toContain('not a FACTS backup');
    expect(checkBackup({ app: 'FACTS', version: 9, schools: {} })).toContain('newer');
  });
  it('sorts incoming BARs into added, same and conflicting', () => {
    const cur = [
      { id: 'a', n: 1 },
      { id: 'b', n: 1 },
    ];
    const inc = [
      { id: 'a', n: 1 },
      { id: 'b', n: 2 },
      { id: 'c', n: 1 },
    ];
    const p = planRestore(cur, inc);
    expect(p.same.map((e) => e.id)).toEqual(['a']);
    expect(p.conflicts.map((c) => c.id)).toEqual(['b']);
    expect(p.added.map((e) => e.id)).toEqual(['c']);
  });
});

describe('backup content is checked', () => {
  it('refuses schools: null', () => {
    expect(checkBackup({ app: 'FACTS', version: 1, schools: null })).toContain('not a FACTS backup');
  });
  it('accepts only well-formed saved BARs', async () => {
    const { validEntry } = await import('../src/lib/barLog.js');
    const good = { id: 'a', bar: { lines: [] }, log: [], status: 'Built' };
    expect(validEntry(good)).toBe(true);
    expect(validEntry({ ...good, log: undefined })).toBe(false);
    expect(validEntry({ id: 'a' })).toBe(false);
    expect(validEntry(null)).toBe(false);
  });
});

describe('OBMS status names', () => {
  it('freezes after every OBMS step, not after Built, Rejected or Cancelled, and keeps old names frozen', () => {
    const base = { status: 'Built' };
    for (const s of STATUSES)
      expect(isFrozen({ ...base, status: s })).toBe(!['Built', 'Rejected', 'Cancelled'].includes(s));
    for (const s of ['Uploaded', 'Submitted', 'Approved']) expect(isFrozen({ status: s })).toBe(true);
  });
});
