import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { findDeficits, fundFunctions } from '../src/lib/barLogic.js';
import { parseASR, rowsOf } from '../src/lib/parse.js';
import { newProfile } from '../src/lib/profile.js';

// Made-up Account Summary (6 segments). Function 1000 is over budget overall, 2100 is over on one line only.
const L = (fn, obj, b, act, enc) => [
  `11000-${fn}-${obj}-0000-001707-1411`,
  'x',
  0,
  b,
  act,
  enc,
  b - act - enc,
];
const rows = [
  ['Test School'],
  ['Cycle: FY26-27; Created On: 10/9/2026'],
  [
    'Account Code',
    'Description',
    'Actual (Date Range)',
    'Budget (YTD)',
    'Actual (YTD)',
    'Encumbrance (YTD)',
    'Available (YTD)',
  ],
  L('1000', '51100', 1000, 600, 500), // -100
  L('1000', '51300', 500, 100, 0), // +400
  L('1000', '52100', 300, 400, 0), // -100
  ['Subtotal of Element: [Function] 1000 - Instruction', '', 0, 1800, 1100, 500, 200],
  L('2100', '51100', 900, 500, 600), // -200
  L('2100', '51300', 1000, 100, 0), // +900
  ['Subtotal of Element: [Function] 2100 - Support', '', 0, 1900, 600, 600, 700],
  L('2600', '51100', 100, 100, 150), // -150
  ['Subtotal of Element: [Function] 2600 - Plant', '', 0, 100, 100, 150, -150],
  ['Subtotal of Element: [Fund] 11000 - Operational', '', 0, 3800, 1800, 1250, 750],
  ['Grand Total', '', 0, 3800, 1800, 1250, 750],
];
// the two subtotals above are made up to be exact sums where it matters; recompute them
const exact = (name, lines) => {
  const t = [3, 4, 5, 6].map((i) => lines.reduce((s, l) => s + l[i], 0));
  return [name, '', 0, ...t];
};
rows[6] = exact('Subtotal of Element: [Function] 1000 - Instruction', rows.slice(3, 6));
rows[9] = exact('Subtotal of Element: [Function] 2100 - Support', rows.slice(7, 9));
rows[11] = exact('Subtotal of Element: [Function] 2600 - Plant', rows.slice(10, 11));

describe('deficit finder', () => {
  const asr = parseASR(rows);
  it('keeps each function subtotal with its fund and its lines', () => {
    const fns = asr.funds.get('11000').funcs;
    expect(fns.map((f) => f.code)).toEqual(['1000', '2100', '2600']);
    expect(fns[0].lines).toHaveLength(3);
    expect(fns[0].tot.avail).toBe(200);
    expect(fns[0].name).toBe('Instruction');
  });
  it('finds only functions whose Available is below zero', () => {
    const d = findDeficits(asr);
    expect(d.map((x) => `${x.fund}/${x.func}`)).toEqual(['11000/2600']);
    expect(d[0]).toMatchObject({ deficit: 150, funcName: 'Plant' });
    expect(d[0].lines.map((l) => l.deficit)).toEqual([150]);
  });
  it('does not flag an over-budget line inside a function that nets positive', () => {
    expect(findDeficits(asr).some((x) => x.func === '1000' || x.func === '2100')).toBe(false);
  });
  it('lists over-budget lines largest first, with their own deficits', () => {
    const l = [
      L('2100', '51300', 100, 150, 0),
      L('2100', '51100', 100, 300, 0),
      L('2100', '52100', 200, 100, 0),
    ];
    const r = [rows[0], rows[1], rows[2], ...l, exact('Subtotal of Element: [Function] 2100 - Support', l)];
    const d = findDeficits(parseASR(r));
    expect(d).toHaveLength(1);
    expect(d[0].deficit).toBe(150); // -50 + -200 + 100
    expect(d[0].lines.map((x) => [x.obj, x.deficit])).toEqual([
      ['51100', 200],
      ['51300', 50],
    ]);
  });
  it('limits the search to the selected funds', () => {
    expect(findDeficits(asr, ['24101'])).toEqual([]);
    expect(findDeficits(asr, ['11000'])).toHaveLength(1);
  });
  it('adds up the lines when the report has no function subtotals', () => {
    const noSub = rows.filter((r) => !/\[Function\]/.test(String(r[0])));
    const fns = fundFunctions(parseASR(noSub).funds.get('11000'));
    expect(fns.map((f) => [f.code, f.tot.avail])).toEqual([
      ['1000', 200],
      ['2100', 700],
      ['2600', -150],
    ]);
  });
});

const XL = new URL('../fixtures/cesar-account-summary.xlsx', import.meta.url);
describe.skipIf(!existsSync(XL))('real Cesar Chavez Account Summary', () => {
  const seg = (key, len) => ({ key, len });
  const cesar = newProfile({
    id: 'c',
    name: 'C',
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
  const asr = parseASR(
    rowsOf(XLSX.read(readFileSync(XL), { type: 'buffer' }), 'Account Summary Report'),
    cesar,
  );
  it('every function subtotal equals the sum of its own lines', () => {
    let n = 0;
    for (const f of asr.funds.values())
      for (const fn of f.funcs) {
        n++;
        for (const k of ['budget', 'actual', 'enc', 'avail']) {
          const sum = Math.round(fn.lines.reduce((s, l) => s + l[k], 0) * 100);
          expect(sum).toBe(Math.round(fn.tot[k] * 100));
        }
      }
    expect(n).toBeGreaterThan(20);
  });
  it('finds the over-budget functions, and each deficit equals minus its Available', () => {
    const d = findDeficits(asr);
    expect(d.length).toBeGreaterThan(0);
    for (const x of d) expect(Math.round(x.deficit * 100)).toBe(Math.round(-x.avail * 100));
  });
});
