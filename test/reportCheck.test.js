import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { parseASR, parseFACSV, rowsOf } from '../src/lib/parse.js';
import { gilbertPreset, newProfile } from '../src/lib/profile.js';
import {
  checkAccountSummary,
  checkFundAudit,
  fiscalYearOf,
  hasStop,
  reportParams,
  schoolMatches,
  tieOut,
} from '../src/lib/reportCheck.js';

const seg = (key, len) => ({ key, len });
const sevenSeg = [
  seg('fund', 5),
  seg('func', 4),
  seg('obj', 5),
  seg('prog', 4),
  seg('loc', 6),
  seg('job', 4),
  seg('tail', 5),
];
const cesar = newProfile({ id: 'cesar', name: 'Cesar Chavez Community School', segments: sevenSeg });
const A = '11000-1000-51100-1010-512001-1411-00000';
const PARAMS =
  'Cycle: FY26-27; Begin Date: 07/01/2026; End Date: 06/30/2027; Account Type: Expenditure; Account Expression: [All]; Include Unposted Transactions: No; Budget Category: [All]; Created On: 10/9/2026 12:51:18 PM';
const asrRows = (school = 'Cesar Chavez Community School', params = PARAMS) => [
  [school],
  ['Account Summary Report'],
  [params],
  [
    'Account Code',
    'Description',
    'Actual (Date Range)',
    'Budget (YTD)',
    'Actual (YTD)',
    'Encumbrance (YTD)',
    'Available (YTD)',
  ],
  [A, 'Line', 5, 100, 5, 20, 75],
  ['Subtotal of Element: [Fund] 11000 - Operational', '', 5, 100, 5, 20, 75],
  ['Grand Total', '', 5, 100, 5, 20, 75],
];
const faCsv = (actual = 5) =>
  `Fund,Account Code,Acct. Desc.,Transaction Date,Name,Number,Description,Detail,Check,Budget,Actuals,Encumbrance,Available\r\n11000,${A},x,9/8/2026,,Inv: 1,d,,,100.0000,${actual}.0000,20.0000,${75 - (actual - 5)}.0000\r\n`;
const ctx = { profile: cesar, fiscalYear: 2027 };

describe('fiscal year and parameters', () => {
  it('reads both FY26-27 and FY2027 as 2027', () => {
    expect(fiscalYearOf('FY26-27')).toBe(2027);
    expect(fiscalYearOf('FY2027')).toBe(2027);
    expect(fiscalYearOf('')).toBeNull();
  });
  it('reads the report parameters', () => {
    const p = reportParams(PARAMS);
    expect(p).toMatchObject({
      fiscalYear: 2027,
      begin: '2026-07-01',
      end: '2027-06-30',
      expression: '[All]',
      unposted: 'No',
    });
  });
  it('matches school names loosely and uses extra names', () => {
    expect(schoolMatches(cesar, 'Cesar Chavez Community School')).toBe(true);
    expect(schoolMatches(cesar, 'Other School')).toBe(false);
    expect(schoolMatches(cesar, '')).toBeNull();
    expect(schoolMatches(newProfile({ name: 'A', reportNames: ['Other School'] }), 'Other School')).toBe(
      true,
    );
  });
});

describe('Account Summary checks', () => {
  it('passes a matching full-year report', () => {
    expect(checkAccountSummary(parseASR(asrRows(), cesar), ctx).filter((c) => c.level !== 'info')).toEqual(
      [],
    );
  });
  it('stops on a different school, and says how to fix a name mismatch', () => {
    const c = checkAccountSummary(parseASR(asrRows('Another School'), cesar), ctx);
    expect(hasStop(c)).toBe(true);
    expect(c[0].msg).toContain('Names as reports print them');
  });
  it('stops when no account line fits the school layout', () => {
    expect(
      hasStop(
        checkAccountSummary(parseASR(asrRows(), gilbertPreset()), { profile: cesar, fiscalYear: 2027 }),
      ),
    ).toBe(true);
  });
  it('warns, without stopping, on a wrong year, a short date range or a filter', () => {
    const p = PARAMS.replace('FY26-27', 'FY25-26')
      .replace('06/30/2027', '09/30/2026')
      .replace('[All]; Include', 'F11*; Include');
    const c = checkAccountSummary(parseASR(asrRows('Cesar Chavez Community School', p), cesar), ctx);
    expect(hasStop(c)).toBe(false);
    const text = c.map((x) => x.msg).join(' | ');
    for (const part of ['fiscal year 2026', 'not the full fiscal year', 'account expression "F11*"'])
      expect(text).toContain(part);
  });
});

describe('Fund Audit checks and tie-out', () => {
  const asr = parseASR(asrRows(), cesar);
  it('ties when the Fund Audit matches the Account Summary', () => {
    const fa = parseFACSV(faCsv(), cesar);
    expect(tieOut(asr, fa).ok).toBe(true);
    expect(checkFundAudit(fa, { ...ctx, asr }).some((c) => c.level === 'warn')).toBe(false);
  });
  it('warns, naming the fund and column, when a total differs', () => {
    const fa = parseFACSV(faCsv(9), cesar);
    const c = checkFundAudit(fa, { ...ctx, asr });
    expect(c.find((x) => x.level === 'warn').msg).toContain('11000 (actual, avail)');
  });
  it('ignores a fund that has no activity in either report', () => {
    const fa = parseFACSV(faCsv(), cesar);
    fa.push({ ...fa[0], fund: '27901', budget: 0, actual: 0, enc: 0, avail: 0 });
    expect(tieOut(asr, fa).ok).toBe(true);
  });
  it('compares only actuals and encumbrances when the Fund Audit has no budget amounts', () => {
    const fa = parseFACSV(faCsv(), cesar);
    fa.forEach((r) => {
      r.budget = 0;
      r.avail = -(r.actual + r.enc);
    });
    const t = tieOut(asr, fa);
    expect(t.ok).toBe(true);
    expect(t.noBudget).toBe(true);
    const c = checkFundAudit(fa, { ...ctx, asr });
    expect(c.some((x) => x.level === 'warn')).toBe(false);
    expect(c.find((x) => x.level === 'info').msg).toContain('no budget amounts');
  });
  it('still warns about actuals when a budget-less Fund Audit differs, without naming budget', () => {
    const fa = parseFACSV(faCsv(9), cesar);
    fa.forEach((r) => {
      r.budget = 0;
      r.avail = -(r.actual + r.enc);
    });
    const w = checkFundAudit(fa, { ...ctx, asr }).find((x) => x.level === 'warn').msg;
    expect(w).toContain('11000 (actual)');
    expect(w).not.toContain('budget');
  });
  it('stops when no line fits the school layout', () => {
    expect(hasStop(checkFundAudit([], ctx))).toBe(true);
  });
  it('warns about lines dated outside the fiscal year and funds not on the school list', () => {
    const fa = parseFACSV(faCsv().replace('9/8/2026', '9/8/2025'), cesar);
    const prof = newProfile({ ...cesar, funds: [{ code: '24101' }] });
    const text = checkFundAudit(fa, { profile: prof, fiscalYear: 2027 })
      .map((c) => c.msg)
      .join(' | ');
    expect(text).toContain('outside fiscal year 2027');
    expect(text).toContain('Funds not in this school');
  });
});

// Real exports from the school, kept in git-ignored fixtures/. Skipped when they are absent.
const XL = new URL('../fixtures/cesar-account-summary.xlsx', import.meta.url);
const CS = new URL('../fixtures/cesar-fund-audit.csv', import.meta.url);
describe.skipIf(!existsSync(XL) || !existsSync(CS))('real Cesar Chavez exports', () => {
  const wb = XLSX.read(readFileSync(XL), { type: 'buffer' });
  const asr = parseASR(rowsOf(wb, 'Account Summary Report'), cesar);
  const fa = parseFACSV(readFileSync(CS, 'utf8'), cesar);
  it('reads the Account Summary header and every account line', () => {
    expect(reportParams(asr.meta).fiscalYear).toBe(2027);
    expect(asr.headerOk).toBe(true);
    expect([...asr.funds.values()].reduce((n, f) => n + f.lines.length, 0)).toBeGreaterThan(400);
    expect(checkAccountSummary(asr, ctx).filter((c) => c.level !== 'info')).toEqual([]);
  });
  it('reads every Fund Audit line and ties to the Account Summary, fund by fund', () => {
    expect(fa.length).toBeGreaterThan(9000);
    expect(tieOut(asr, fa).diffs).toEqual([]);
  });
  it("ties the Fund Audit sum to the report's own Grand Total", () => {
    const sum = (k) => Math.round(fa.reduce((s, r) => s + r[k], 0) * 100);
    for (const k of ['budget', 'actual', 'enc', 'avail']) expect(sum(k)).toBe(Math.round(asr.grand[k] * 100));
  });
  it('would stop if loaded as the wrong school', () => {
    expect(
      hasStop(
        checkFundAudit(parseFACSV(readFileSync(CS, 'utf8'), gilbertPreset()), {
          profile: gilbertPreset(),
          fiscalYear: 2027,
        }),
      ),
    ).toBe(true);
  });
});
