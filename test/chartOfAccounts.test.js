import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { chartDesc, checkAccounts, checkChartReport, parseChart } from '../src/lib/chartOfAccounts.js';
import { gilbertPreset } from '../src/lib/profile.js';

const P = gilbertPreset();
const H = [
  'Account Code',
  'Description',
  'Account Type Name',
  'Enabled',
  'Active',
  'Account Group Type',
  'Cycle Name',
];
const rows = (school = 'Gilbert L. Sena High School') => [
  [school, '', '', '', '', '', ''],
  ['Chart Of Accounts Report', '', '', '', '', '', ''],
  ['[Cycle Name]: "FY2027"; Created On: 10/11/2026', '', '', '', '', '', ''],
  [],
  H,
  ['11000-2100-52315-0000-001707-1214', 'Disability', 'Expenditure', 'Yes', 'Yes', 'Expenditure', 'FY2027'],
  ['11000-2100-52315-0000-001707-1214', 'Disability', 'Expenditure', 'Yes', 'No', 'Expenditure', 'FY2026'],
  ['11000-2100-52316-0000-001707-1214', 'Old', 'Expenditure', 'No', 'No', 'Expenditure', 'FY2027'],
  ['10000-0000-11011-0000-000000-0000', 'Bank Accounts', 'Asset', 'Yes', 'No', 'Balance Sheet', 'FY2027'],
  ['not a code', 'x', 'x', 'Yes', 'Yes', 'x', 'FY2027'],
];

describe('reading a school chart', () => {
  const chart = parseChart(rows(), P, 2027);
  it('keeps only the selected year and codes that fit the layout', () => {
    expect([...chart.codes.keys()]).toEqual([
      '11000-2100-52315-0000-001707-1214',
      '11000-2100-52316-0000-001707-1214',
      '10000-0000-11011-0000-000000-0000',
    ]);
    expect(chartDesc(chart, '11000-2100-52315-0000-001707-1214')).toBe('Disability');
    expect(chart.codes.get('11000-2100-52316-0000-001707-1214').enabled).toBe(false);
  });
  it('passes for the right school and stops another school or year', () => {
    expect(checkChartReport(chart, { profile: P, fiscalYear: 2027 })).toEqual([]);
    expect(
      checkChartReport(parseChart(rows('Other School'), P, 2027), { profile: P, fiscalYear: 2027 })[0].msg,
    ).toContain('Other School');
    expect(checkChartReport(parseChart(rows(), P, 2030), { profile: P, fiscalYear: 2030 })[0].msg).toContain(
      'FY2030',
    );
  });
  it('says when the file is not a chart report', () => {
    expect(parseChart([['x']], P, 2027).errors[0]).toContain('Chart Of Accounts');
  });
});

describe('checking account codes', () => {
  const chart = parseChart(rows(), P, 2027);
  it('lists codes to add or enable in AptaFund and codes PED does not allow', () => {
    const r = checkAccounts(
      [
        '11000-2100-52315-0000-001707-1214',
        '11000-2100-52316-0000-001707-1214',
        '11000-2600-52315-0000-001707-1214',
      ],
      { chart, ped: (c) => !c.includes('-2600-') },
    );
    expect(r.stops).toEqual(['11000-2600-52315-0000-001707-1214']);
    expect(r.adds.map((a) => a.why)).toEqual([
      'is in the chart but not enabled',
      'is not in the school chart',
    ]);
    expect(r.notes).toEqual([]);
  });
  it('notes what was not checked when a list is missing', () => {
    expect(checkAccounts(['x']).notes).toHaveLength(2);
  });
});

const REAL = 'fixtures/chart-of-accounts.xlsx';
describe.skipIf(!existsSync(REAL))('the real Gilbert chart', () => {
  it('has FY2027 codes including the bank account', () => {
    const wb = XLSX.readFile(REAL);
    const r = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
    const chart = parseChart(r, P, 2027);
    expect(checkChartReport(chart, { profile: P, fiscalYear: 2027 })).toEqual([]);
    expect(chart.codes.has('11000-0000-11011-0000-000000-0000')).toBe(true);
  });
});

describe('the PED part of the account check', () => {
  const ped = (c) => (c.startsWith('11000') ? true : c.startsWith('24101') ? false : null);
  it('stops disallowed codes, notes funds not loaded, and skips bank lines', () => {
    const bank = '11000-0000-11011-0000-000000-0000';
    const r = checkAccounts(
      [
        '11000-1000-51100-0000-001707-1411',
        '24101-2100-52315-0000-001707-9999',
        '31400-4000-53414-0000-001707-0000',
        bank,
      ],
      {
        ped: (c) => (c === bank ? false : ped(c)),
        skip: new Set([bank]),
      },
    );
    expect(r.stops).toEqual(['24101-2100-52315-0000-001707-9999']);
    expect(r.notes.join(' ')).toContain('fund 31400 is not loaded');
  });
});
