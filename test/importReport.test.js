import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { currentFiscalYear, readAccountSummary, readFundAudit } from '../src/lib/importReport.js';
import { hasStop } from '../src/lib/reportCheck.js';
import { newProfile } from '../src/lib/profile.js';

const seg = (key, len) => ({ key, len });
const cesar = newProfile({
  id: 'cesar',
  name: 'Cesar Chavez Community School',
  segments: [
    seg('fund', 5),
    seg('func', 4),
    seg('obj', 5),
    seg('prog', 4),
    seg('loc', 6),
    seg('job', 4),
    seg('tail', 5),
  ],
});
const A = '11000-1000-51100-1010-512001-1411-00000';
const asrXlsx = () => {
  const rows = [
    ['Cesar Chavez Community School'],
    ['Account Summary Report'],
    ['Cycle: FY26-27; Begin Date: 07/01/2026; End Date: 06/30/2027; Account Expression: [All]'],
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
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Sheet1');
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
};
const faCsv = new TextEncoder().encode(
  `Fund,Account Code,Acct. Desc.,Transaction Date,Name,Number,Description,Detail,Check,Budget,Actuals,Encumbrance,Available\r\n11000,${A},x,9/8/2026,,Inv: 1,d,,,100.0000,5.0000,20.0000,75.0000\r\n`,
);
const ctx = { profile: cesar, fiscalYear: 2027 };

describe('reading dropped reports', () => {
  it('reads an Account Summary workbook even when the sheet has another name', () => {
    const r = readAccountSummary('summary.xlsx', asrXlsx(), ctx);
    expect(r.params.fiscalYear).toBe(2027);
    expect(r.asr.funds.get('11000').lines).toHaveLength(1);
    expect(hasStop(r.checks)).toBe(false);
  });
  it('reads a Fund Audit CSV and ties it to the loaded Account Summary', () => {
    const asr = readAccountSummary('summary.xlsx', asrXlsx(), ctx).asr;
    const r = readFundAudit('audit.csv', faCsv, { ...ctx, asr });
    expect(r.fa).toHaveLength(1);
    expect(r.checks.map((c) => c.msg).join()).toContain('ties to the Account Summary');
  });
  it('stops when the Fund Audit is read for a school with a different code layout', () => {
    const other = newProfile({ id: 'six', name: 'Six', segments: cesar.segments.slice(0, 6) });
    expect(hasStop(readFundAudit('audit.csv', faCsv, { profile: other, fiscalYear: 2027 }).checks)).toBe(
      true,
    );
  });
  it('names the fiscal year in progress, which starts July 1', () => {
    expect(currentFiscalYear(new Date(2026, 9, 9))).toBe(2027);
    expect(currentFiscalYear(new Date(2026, 5, 30))).toBe(2026);
    expect(currentFiscalYear(new Date(2026, 6, 1))).toBe(2027);
  });
});

const XL = new URL('../fixtures/cesar-account-summary.xlsx', import.meta.url);
const CS = new URL('../fixtures/cesar-fund-audit.csv', import.meta.url);
describe.skipIf(!existsSync(XL) || !existsSync(CS))('real Cesar Chavez exports, through the reader', () => {
  it('loads both with no stop and no warning, and ties out', () => {
    const a = readAccountSummary('a.xlsx', readFileSync(XL), ctx);
    const f = readFundAudit('f.csv', readFileSync(CS), { ...ctx, asr: a.asr });
    expect(a.checks.filter((c) => c.level !== 'info')).toEqual([]);
    expect(f.checks.filter((c) => c.level !== 'info')).toEqual([]);
    expect(f.checks.some((c) => /ties to the Account Summary/.test(c.msg))).toBe(true);
  });
});
