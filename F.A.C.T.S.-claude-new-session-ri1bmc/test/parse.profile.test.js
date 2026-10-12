// The parsers read account codes through a school profile. Rows are made up (no real data).
import { describe, it, expect } from 'vitest';
import { parseASR, parseCR, parseFA } from '../src/lib/parse.js';
import { newProfile } from '../src/lib/profile.js';
import { splitCode } from '../src/lib/format.js';

const SIX = '11000-1000-51100-1010-001707-1411';
const SEVEN = '11000-2600-57331-0000-512001-0000-00000';
const seven = newProfile({
  id: 'seven',
  name: 'Seven',
  segments: [
    { key: 'fund', len: 5 },
    { key: 'func', len: 4 },
    { key: 'obj', len: 5 },
    { key: 'prog', len: 4 },
    { key: 'loc', len: 6 },
    { key: 'job', len: 4 },
    { key: 'tail', len: 5 },
  ],
});

const asrRows = (code) => [
  ['Test School'],
  ['Cycle: FY2027; Created On: 10/1/2026'],
  ['Account Code', 'Description', '', 'Budget', 'Actual', 'Encumbrance', 'Available'],
  [code, 'A line', '', 1000, 200, 100, 700],
  ['Subtotal of Element: [Function] 2600 - Plant', '', '', 1000, 200, 100, 700],
  ['Subtotal of Element: [Fund] 11000 - Operational', '', '', 1000, 200, 100, 700],
  ['Grand Total', '', '', 1000, 200, 100, 700],
];

describe('parsers with a school profile', () => {
  it('Account Summary: default profile reads 6-segment codes as before', () => {
    const f = parseASR(asrRows(SIX)).funds.get('11000');
    expect(f.lines).toHaveLength(1);
    expect(f.lines[0]).toMatchObject({ code: SIX, ...splitCode(SIX), budget: 1000, avail: 700 });
    expect(f.tot).toEqual({ budget: 1000, actual: 200, enc: 100, avail: 700 });
  });
  it('Account Summary: a 7-segment profile reads 7-segment codes', () => {
    const f = parseASR(asrRows(SEVEN), seven).funds.get('11000');
    expect(f.lines).toHaveLength(1);
    expect(f.lines[0]).toMatchObject({ func: '2600', loc: '512001', extra: ['00000'] });
  });
  it('Account Summary: codes of the wrong shape are skipped, not guessed', () => {
    expect(parseASR(asrRows(SEVEN)).funds.get('11000').lines).toHaveLength(0);
    expect(parseASR(asrRows(SIX), seven).funds.get('11000').lines).toHaveLength(0);
  });
  it('Fund Audit follows the profile', () => {
    const rows = [
      ['Account Code', 'Trans. Date', 'Src', 'Name', 'Budget', 'Actuals', 'Encumbrance', 'Available'],
      [SEVEN, 46204, 'DE', 'Vendor', 0, 50, 0, -50],
    ];
    expect(parseFA(rows, seven)).toHaveLength(1);
    expect(parseFA(rows)).toHaveLength(0);
    expect(parseFA(rows, seven)[0]).toMatchObject({
      fund: '11000',
      obj: '57331',
      actual: 50,
      date: '2026-07-01',
    });
  });
  it('Cash Receipts keeps splitting loosely, as v0.1 did', () => {
    const rows = [
      ['BatchStatus', 'BatchNumber', 'TransactionDate', 'AccountCode', 'CreditAmount'],
      ['Posted', '1', 46204, '24101-0000-41000', 25],
    ];
    expect(parseCR(rows)[0]).toMatchObject({ fund: '24101', obj: '41000', credit: 25 });
  });
});
