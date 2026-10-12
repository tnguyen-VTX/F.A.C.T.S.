import { describe, it, expect } from 'vitest';
import {
  expiredKeys,
  latestKeys,
  makeRecord,
  recordUsable,
  parseReportKey,
  reportKey,
  resultFromRecord,
} from '../src/lib/reportStore.js';

const DAY = 86400000;
const now = Date.UTC(2026, 9, 9);

describe('saved report keys', () => {
  it('round-trips a key', () => {
    const k = reportKey('cesar-chavez', 2027, 'fa', 123);
    expect(parseReportKey(k)).toEqual({ school: 'cesar-chavez', fy: 2027, kind: 'fa', at: 123 });
    expect(parseReportKey('workbook:cesar')).toBeNull();
  });
  it('picks the newest of each kind for one school and year only', () => {
    const keys = [
      reportKey('a', 2027, 'asr', 1),
      reportKey('a', 2027, 'asr', 5),
      reportKey('a', 2027, 'fa', 2),
      reportKey('b', 2027, 'asr', 9),
      reportKey('a', 2026, 'asr', 9),
      'workbook:a',
    ];
    expect(latestKeys(keys, 'a', 2027)).toEqual({
      asr: reportKey('a', 2027, 'asr', 5),
      fa: reportKey('a', 2027, 'fa', 2),
    });
    expect(latestKeys(keys, 'c', 2027)).toEqual({});
  });
  it('drops loads older than 30 days but always keeps the newest of each kind', () => {
    const old = (d) => now - d * DAY;
    const keys = [
      reportKey('a', 2027, 'asr', old(40)),
      reportKey('a', 2027, 'asr', old(35)),
      reportKey('a', 2027, 'asr', old(2)),
      reportKey('a', 2027, 'fa', old(60)),
      reportKey('b', 2027, 'asr', old(31)),
    ];
    expect(expiredKeys(keys, now).sort()).toEqual(
      [reportKey('a', 2027, 'asr', old(40)), reportKey('a', 2027, 'asr', old(35))].sort(),
    );
  });
});

describe('saved report records', () => {
  it('stores and restores an Account Summary, including its fund map', () => {
    const asr = {
      funds: new Map([['11000', { code: '11000', lines: [], tot: { budget: 1 } }]]),
      funcNames: {},
      meta: 'm',
      school: 'S',
      grand: null,
      headerOk: true,
    };
    const rec = JSON.parse(
      JSON.stringify(
        makeRecord(
          { kind: 'asr', name: 'a.xlsx', asr, params: { cycle: 'FY26-27' }, checks: [] },
          { school: 'a', fy: 2027, at: 1 },
        ),
      ),
    );
    const back = resultFromRecord(rec);
    expect(back.asr.funds.get('11000').tot.budget).toBe(1);
    expect(back.params.cycle).toBe('FY26-27');
  });
  it('stores and restores Fund Audit rows without the original file', () => {
    const rec = makeRecord(
      { kind: 'fa', name: 'f.csv', fa: [{ code: 'x', actual: 5 }], checks: [{ level: 'info', msg: 'ok' }] },
      { school: 'a', fy: 2027, at: 1 },
    );
    expect(Object.keys(rec)).not.toContain('bytes');
    expect(resultFromRecord(rec).fa[0].actual).toBe(5);
  });
  it('versions records and skips ones from a newer version', () => {
    const rec = makeRecord(
      { kind: 'fa', name: 'f.csv', fa: [], checks: [] },
      { school: 'a', fy: 2027, at: 1 },
    );
    expect(rec.v).toBe(1);
    expect(recordUsable(rec)).toBe(true);
    expect(recordUsable({ ...rec, v: undefined })).toBe(true);
    expect(recordUsable({ ...rec, v: 99 })).toBe(false);
    expect(recordUsable(null)).toBe(false);
  });
});

describe('earlier loads', () => {
  it('lists one school and year, newest first', async () => {
    const { earlierLoads } = await import('../src/lib/reportStore.js');
    const keys = [
      reportKey('a', 2027, 'asr', 1),
      reportKey('a', 2027, 'fa', 3),
      reportKey('a', 2027, 'asr', 2),
      reportKey('b', 2027, 'asr', 9),
      reportKey('a', 2026, 'asr', 8),
    ];
    expect(earlierLoads(keys, 'a', 2027).map((x) => x.at)).toEqual([3, 2, 1]);
  });
});
