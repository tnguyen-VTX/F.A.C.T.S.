// Checks the parsers against the FY27 workbook. Expected values come from the
// workbook's own pivots and the Account Summary "Grand Total" row (run 9/29/2026).
// If you load a newer workbook, update EXPECTED or the numeric tests will fail.
import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import {
  SHEETS,
  rowsOf,
  parseASR,
  parseFA,
  parseRfR,
  parseCR,
  parseCap,
  rfrState,
} from '../src/lib/parse.js';
import { splitCode, serialToISO, fmtM, roundAway } from '../src/lib/format.js';

const FIXTURE = new URL('../fixtures/facts.xlsx', import.meta.url);
const hasFixture = existsSync(FIXTURE);
const EXPECTED = {
  funds: 18,
  faLines: 17090,
  rfr: 3,
  crLines: 86,
  totals: { budget: 4913112.2, actual: 760619.9, enc: 2854609.71, avail: 1297882.59 },
  aces: { actual: 22780.52, enc: 178568.36 },
};
const close = (a, b) => expect(Math.round(a * 100)).toBe(Math.round(b * 100));

describe('helpers', () => {
  it('splits account codes into segments', () => {
    expect(splitCode('11000-1000-51100-1010-001707-1411')).toEqual({
      fund: '11000',
      func: '1000',
      obj: '51100',
      prog: '1010',
      loc: '001707',
      job: '1411',
    });
  });
  it('converts Excel serial dates without timezone drift', () => {
    expect(serialToISO(46204)).toBe('2026-07-01');
  });
  it('formats negatives in accounting style', () => {
    expect(fmtM(-1234.5)).toBe('(1,234.50)');
  });
  it('rounds half away from zero like Excel ROUND', () => {
    expect(roundAway(2.5)).toBe(3);
    expect(roundAway(-2.5)).toBe(-3);
  });
  it('classifies RfR statuses', () => {
    expect(rfrState('DC RfR Submitted')).toBe('review');
    expect(rfrState('RfR Disapproved')).toBe('disapproved');
    expect(rfrState('DC RfR Approved')).toBe('approved');
    expect(rfrState('Paid')).toBe('paid');
  });
});

describe.skipIf(!hasFixture)('FY27 workbook', () => {
  let wb;
  beforeAll(() => {
    wb = XLSX.read(readFileSync(FIXTURE), { sheets: SHEETS });
  });

  it('reads the Account Summary and matches the grand total', () => {
    const asr = parseASR(rowsOf(wb, 'Account Summary Report'));
    expect(asr.funds.size).toBe(EXPECTED.funds);
    const t = { budget: 0, actual: 0, enc: 0, avail: 0 };
    for (const f of asr.funds.values()) for (const k in t) t[k] += f.tot[k];
    for (const k in t) close(t[k], EXPECTED.totals[k]);
  });
  it('reads every Fund Audit line and matches the vendor pivot', () => {
    const fa = parseFA(rowsOf(wb, 'Fund Audit Report'));
    expect(fa.length).toBe(EXPECTED.faLines);
    const aces = fa.filter((r) => r.name === 'ACES');
    close(
      aces.reduce((s, r) => s + r.actual, 0),
      EXPECTED.aces.actual,
    );
    close(
      aces.reduce((s, r) => s + r.enc, 0),
      EXPECTED.aces.enc,
    );
  });
  it('reads RfRs, cash receipts and capital projects', () => {
    expect(parseRfR(rowsOf(wb, 'RfR Summary Report')).length).toBe(EXPECTED.rfr);
    expect(parseCR(rowsOf(wb, 'Cash Receipts Journal Report')).length).toBe(EXPECTED.crLines);
    expect(parseCap(rowsOf(wb, 'Capital Outlay Projects')).length).toBeGreaterThan(0);
  });
});
