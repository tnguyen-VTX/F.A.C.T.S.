import { describe, it, expect } from 'vitest';
import { JE_STATUSES, addJEStatus, isJEFrozen, reclassedMap, removeJE, saveJE } from '../src/lib/jeLog.js';

const T0 = Date.UTC(2026, 9, 11);
const re = (moves) => ({ kind: 'reclass', je: { lines: [] }, moves, vendor: 'Vendor One' });
const mv = (amount, date = '2026-09-03') => ({ from: 'A', to: 'B', amount, date });

describe('saved journal entries', () => {
  it('starts Prepared with a log entry', () => {
    const { entry } = saveJE([], re([mv(5)]), T0);
    expect(entry.status).toBe('Prepared');
    expect(entry.log).toEqual([{ status: 'Prepared', date: '2026-10-11', note: '' }]);
    expect(isJEFrozen(entry)).toBe(false);
  });
  it('refuses the same BAR twice unless the first was cancelled', () => {
    const src = { kind: 'bar', je: { lines: [] }, docId: '001-707-2627-0006-T' };
    const a = saveJE([], src, T0);
    expect(saveJE(a.list, src, T0).error).toContain('already saved');
    const cancelled = { ...a.entry, status: 'Cancelled' };
    expect(saveJE([cancelled], src, T0).error).toBeUndefined();
  });
  it('records the AptaFund number and freezes once entered', () => {
    const { entry } = saveJE([], re([mv(5)]), T0);
    const e = addJEStatus(entry, 'Entered in AptaFund', '2026-10-12', 'keyed', 'T0048612', T0);
    expect(e.number).toBe('T0048612');
    expect(isJEFrozen(e)).toBe(true);
    expect(addJEStatus(e, 'Posted', '2026-10-13', '', '00047858', T0).number).toBe('00047858');
    expect(() => addJEStatus(e, 'Nope', '', '', '', T0)).toThrow('Unknown status');
    expect(JE_STATUSES).toContain('Posted');
  });
  it('deletes only entries that are not frozen', () => {
    const { list, entry } = saveJE([], re([mv(5)]), T0);
    expect(removeJE(list, entry.id).list).toEqual([]);
    const frozen = [addJEStatus(entry, 'Posted', '2026-10-13', '', '', T0)];
    expect(removeJE(frozen, entry.id).error).toContain('cannot be deleted');
  });
});

describe('what is already reclassed', () => {
  it('adds up saved reclass entries and skips cancelled ones and BAR entries', () => {
    let list = saveJE([], re([mv(5), mv(7, '2026-09-04')]), T0).list;
    list = saveJE(list, re([mv(3)]), T0).list;
    const c = saveJE(list, re([mv(100)]), T0);
    list = c.list.map((e) => (e.id === c.entry.id ? { ...e, status: 'Cancelled' } : e));
    list = saveJE(list, { kind: 'bar', je: { lines: [] }, docId: 'x' }, T0).list;
    expect(reclassedMap(list)).toEqual({ 'A|2026-09-03': 8, 'A|2026-09-04': 7 });
  });
});
