// Fund Audit from the AptaFund CSV export. All data below is made up.
import { describe, it, expect } from 'vitest';
import { deriveSource, parseFA, parseFACSV } from '../src/lib/parse.js';
import { newProfile } from '../src/lib/profile.js';

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
const A = '11000-1000-51100-1010-512001-1411-00000';
const B = '11000-2600-57331-0000-512001-0000-00000';
const head =
  'Fund,Account Code,Acct. Desc.,Transaction Date,Name,Number,Description,Detail,Check,Budget,Actuals,Encumbrance,Available';
const csv = [
  head,
  `11000,${A},Salaries,10/1/2026,Sample Person,Reg: PR27-03,Payroll,,,0.0000,100.5000,50.0000,-150.5000`,
  `11000,${A},Salaries,9/8/2026,Sample Vendor,Inv: 111-22,Supplies,,5312,0.0000,25.0000,-25.0000,0.0000`,
  `11000,${B},Plant,10/2/2026,Sample Customer,Rec: 0002,Fee,,,0.0000,3.0000,0.0000,-3.0000`,
  `11000,${B},Plant,7/1/2026,,,Adopt,"J/E: Adopt budget,\nsecond line",,500.0000,0.0000,0.0000,500.0000`,
  `11000,${B},Plant,7/2/2026,Sample Vendor,,Order,,,0.0000,0.0000,40.0000,-40.0000`,
].join('\r\n');

describe('Fund Audit CSV', () => {
  const fa = parseFACSV(csv, seven);
  it('reads every record, including a quoted line break', () => {
    expect(fa).toHaveLength(5);
    expect(fa[3].detail).toBe('J/E: Adopt budget,\nsecond line');
  });
  it('finds the Transaction Date and parses M/D/YYYY text and plain decimals', () => {
    expect(fa[0]).toMatchObject({
      date: '2026-10-01',
      actual: 100.5,
      enc: 50,
      avail: -150.5,
      fund: '11000',
      obj: '51100',
    });
    expect(fa[3].budget).toBe(500);
    expect(fa[0].extra).toEqual(['00000']);
  });
  it('derives Source because the export has no Src column', () => {
    expect(fa.map((r) => r.src)).toEqual(['PR', 'IN', 'RF', 'JE', 'EN']);
    expect(deriveSource('Reg: PR27-03', '')).toBe('PR');
    expect(deriveSource('', 'J/E: To correct')).toBe('JE');
  });
  it('keeps going without Trans. No. or Trans. Desc.', () => {
    expect(fa[0].tno).toBe('');
    expect(fa[0].tdesc).toBe('');
  });
  it('stops and names a missing column instead of guessing', () => {
    const bad = csv.replace('Encumbrance', 'Encumbered');
    expect(() => parseFACSV(bad, seven)).toThrow(/missing this column: Encumbrance/);
  });
  it('skips codes that do not fit the school profile', () => {
    expect(parseFACSV(csv)).toHaveLength(0);
  });
});

describe('Fund Audit workbook table (v0.1 headers)', () => {
  it('still reads Src, Trans. Date and Trans. No.', () => {
    const rows = [
      [
        'Account Code',
        'Acct. Desc.',
        'Trans. Date',
        'Trans. No.',
        'Trans. Desc.',
        'Src',
        'Budget',
        'Actuals',
        'Encumbrance',
        'Available',
      ],
      ['11000-1000-51100-1010-001707-1411', 'Salaries', 46204, 77, 'Payroll', 'DE', 0, 50, 0, -50],
    ];
    expect(parseFA(rows)[0]).toMatchObject({
      src: 'DE',
      date: '2026-07-01',
      tno: 77,
      tdesc: 'Payroll',
      actual: 50,
    });
  });
});
