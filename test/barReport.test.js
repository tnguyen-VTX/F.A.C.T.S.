// The approved-BAR reader, on a made-up sheet shaped like PED's report (and the real one when present).
import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { checkBarReport, parseBarReport, parseMoney } from '../src/lib/barReport.js';
import { gilbertPreset } from '../src/lib/profile.js';

const P = gilbertPreset();
const W = 45;
const row = (cells) => {
  const r = Array(W).fill('');
  for (const [i, v] of Object.entries(cells)) r[i] = v;
  return r;
};
const HEAD = {
  1: 'Fund',
  3: 'Function ',
  8: 'Object',
  14: 'Program',
  21: 'Location',
  23: 'Job Class',
  27: 'Present Budget',
  35: 'Adj Amt Exp',
  38: 'Adj Budget',
  42: "ADD'L FTE",
};
const ln = (func, obj, prog, job, pres, adj, fte = '') =>
  row({
    1: '24101 Title I Part A - ESEA',
    3: `${func} Support`,
    8: `${obj} Some Object`,
    14: `${prog} Program`,
    21: '001707 Gilbert L Sena Charter Hs',
    23: `${job} Job`,
    27: pres,
    35: adj,
    38: '',
    42: fte,
  });
const sheet = (over = {}) => [
  row({}),
  row({ 34: 'Doc. ID:', 37: over.docId || '001-707-2627-0006-T' }),
  row({
    14: 'Fiscal Year:',
    20: '2026-2027',
    28: 'Entity Name:',
    35: over.entity || 'Gilbert L Sena Charter Hs',
  }),
  row(HEAD),
  ln('2100', '51300', '0000', '1214', '$18,500.00', '$(17,800.00)'),
  ln('1000', '51100', '1010', '1411', '$40,093.00', '$2,073.00', '0.04'),
  ln('1000', '51300', '1010', '1411', '', over.last || '$15,727.00'),
  row({ 33: 'Sub Total', 35: '$0.00' }),
  row({ 33: 'DOC. TOTAL', 35: '$0.00' }),
  row({
    1: 'A. The requested budget/changes were authorized at a scheduled Board of Education or Governance Council meeting open to the public on:',
    43: 46289,
  }),
  row({ 1: 'Approvals by Digital Signature' }),
  row({ 1: 'Name', 8: 'Role', 20: 'Date' }),
  row({ 1: 'Pat One', 8: 'Business Manager', 20: 46280.69 }),
  row({ 1: 'Sam Two', 8: 'Fiscal Director', 20: 46302.55 }),
];

describe('money text', () => {
  it('reads parentheses as negative', () => {
    expect(parseMoney('$(17,800.00)')).toBe(-17800);
    expect(parseMoney('$700.00')).toBe(700);
    expect(parseMoney('')).toBe(0);
    expect(parseMoney(12.5)).toBe(12.5);
  });
});

describe('reading an approved BAR report', () => {
  const rep = parseBarReport(sheet(), P);
  it('reads the header facts and the approval date', () => {
    expect(rep.errors).toEqual([]);
    expect(rep.docId).toBe('001-707-2627-0006-T');
    expect(rep.typeName).toBe('Transfer');
    expect(rep.fiscalYear).toBe(2027);
    expect(rep.entity).toBe('Gilbert L Sena Charter Hs');
    expect(rep.approvalDate).toBe('2026-10-07');
    expect(rep.boardDate).toBe('2026-09-24');
    expect(rep.docTotal).toBe(0);
  });
  it('builds the account codes and amounts line by line', () => {
    expect(rep.lines.map((l) => [l.code, l.amount])).toEqual([
      ['24101-2100-51300-0000-001707-1214', -17800],
      ['24101-1000-51100-1010-001707-1411', 2073],
      ['24101-1000-51300-1010-001707-1411', 15727],
    ]);
    expect(rep.lines[0].present).toBe(18500);
    expect(rep.lines[1].fte).toBe(0.04);
    expect(rep.lines[0].desc).toBe('Some Object');
  });
  it('passes the checks for the right school and year', () => {
    expect(checkBarReport(rep, { profile: P, fiscalYear: 2027 })).toEqual([]);
  });
});

describe('checking an approved BAR report', () => {
  const msgs = (rep, fy = 2027, profile = P) =>
    checkBarReport(rep, { profile, fiscalYear: fy })
      .map((c) => `${c.level}:${c.msg}`)
      .join(' | ');
  it('stops another school, another year, and a Transfer that does not net to zero', () => {
    expect(msgs(parseBarReport(sheet({ entity: 'Some Other School' }), P))).toContain('Some Other School');
    expect(msgs(parseBarReport(sheet(), P), 2026)).toContain('not FY2026');
    expect(msgs(parseBarReport(sheet({ last: '$15,000.00' }), P))).toContain('must net to zero');
  });
  it('says when the table is missing', () => {
    expect(parseBarReport([row({})], P).errors[0]).toContain('line table was not found');
  });
});

const REAL =
  '/root/.claude/uploads/eb99f192-0c73-5bb1-b7da-432ff70c8e53/eadf9afa-Budget_Adjustment_Request_Report.xlsx';
describe.skipIf(!existsSync(REAL))('the real approved BAR report', () => {
  it('reads 16 lines that net to zero with the PED approval date', () => {
    const wb = XLSX.readFile(REAL);
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
    const rep = parseBarReport(rows, P);
    expect(rep.lines).toHaveLength(16);
    expect(rep.docId).toBe('001-707-2627-0006-T');
    expect(rep.approvalDate).toBe('2026-10-07');
    expect(checkBarReport(rep, { profile: P, fiscalYear: 2027 })).toEqual([]);
    expect(rep.lines.reduce((s, l) => s + (l.amount > 0 ? l.amount : 0), 0)).toBe(22750);
  });
});
