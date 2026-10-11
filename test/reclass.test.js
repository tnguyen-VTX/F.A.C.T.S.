import { describe, it, expect } from 'vitest';
import { buildReclassJEs, chargeKey, vendorCharges, vendorNames } from '../src/lib/reclass.js';
import { checkJE } from '../src/lib/je.js';
import { gilbertPreset } from '../src/lib/profile.js';

const P = gilbertPreset();
const A = '31400-4000-53414-0000-001707-0000';
const B = '31400-4000-56119-0000-001707-0000';
const row = (name, code, date, actual) => ({ name, code, date, actual, acctDesc: 'Desc' });
const FA = [
  row('Vendor One', A, '2026-09-15', 2332),
  row('Vendor One', A, '2026-08-20', 375),
  row('Vendor One', A, '2026-09-03', 5048),
  row('Vendor One', A, '2026-09-03', 0),
  row('Vendor One', B, '2026-08-06', 775.5),
  row('Vendor Two', B, '2026-08-06', 10),
  row('', B, '2026-08-06', 99),
];

describe('vendors and their charges', () => {
  it('lists names with actuals and filters by text', () => {
    expect(vendorNames(FA).map((v) => v.name)).toEqual(['Vendor One', 'Vendor Two']);
    expect(vendorNames(FA, 'two')).toEqual([{ name: 'Vendor Two', total: 10 }]);
    expect(vendorNames(FA).find((v) => v.name === 'Vendor One').total).toBe(8530.5);
  });
  it('groups by account code then date, oldest first', () => {
    const g = vendorCharges(FA, 'Vendor One');
    expect(g.map((x) => x.code)).toEqual([A, B]);
    expect(g[0].total).toBe(7755);
    expect(g[0].charges.map((c) => [c.date, c.actual])).toEqual([
      ['2026-08-20', 375],
      ['2026-09-03', 5048],
      ['2026-09-15', 2332],
    ]);
  });
  it('subtracts what saved entries already reclassed', () => {
    const g = vendorCharges(FA, 'Vendor One', { [chargeKey(A, '2026-09-03')]: 5000 });
    expect(g[0].charges[1]).toMatchObject({ reclassed: 5000, remaining: 48 });
  });
});

describe('building reclass entries', () => {
  const to = { fund: '11000', func: '2600' };
  it('makes one entry per month and fund pair, dated the last day of the month', () => {
    const { jes, errors } = buildReclassJEs(
      [
        { code: A, date: '2026-09-15', amount: 2332, change: to },
        { code: A, date: '2026-09-03', amount: 5048, change: to },
        { code: A, date: '2026-08-20', amount: 375, change: to },
        { code: B, date: '2026-08-06', amount: 775.5, change: to },
      ],
      { profile: P },
    );
    expect(errors).toEqual([]);
    expect(jes.map((j) => j.date)).toEqual(['2026-08-31', '2026-09-30']);
    expect(jes[0].lines).toHaveLength(6); // 2 moves x 2 + 2 bank lines
    expect(jes[1].lines).toHaveLength(6);
    for (const j of jes) expect(checkJE(j)).toEqual([]);
    expect(jes[1].lines[1].code).toBe('11000-2600-53414-0000-001707-0000');
  });
  it('refuses more than is left, a no-op change and a bad segment', () => {
    const { errors } = buildReclassJEs(
      [
        { code: A, date: '2026-09-03', amount: 100, change: to },
        { code: A, date: '2026-09-03', amount: 10, change: {} },
        { code: A, date: '2026-09-03', amount: 10, change: { obj: '1' } },
      ],
      { profile: P, remaining: { [chargeKey(A, '2026-09-03')]: 48 } },
    );
    expect(errors.join(' | ')).toContain('more than the 48.00 left');
    expect(errors.join(' | ')).toContain('same as the old one');
    expect(errors.join(' | ')).toContain('5 digits');
  });
});
