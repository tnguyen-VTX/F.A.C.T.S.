import { describe, it, expect } from 'vitest';
import { buildTransfer, donorUnits, findDeficits, splitPackage } from '../src/lib/barLogic.js';
import { makeAsr } from './helpers/makeAsr.js';

const sum = (a, f = (x) => x) => a.reduce((s, x) => s + f(x), 0);
const BEN = {
  51100: [
    { obj: '52111', pct: 0.1815 },
    { obj: '52112', pct: 0.02 },
    { obj: '52210', pct: 0.062 },
    { obj: '52220', pct: 0.0145 },
  ],
};
const benefits = BEN;
const objOf = (l) => l.obj;

describe('a salary package adds up to the amount', () => {
  it('splits a whole-dollar total into salary plus benefits, rounding on the salary', () => {
    const p = splitPackage(1000, BEN[51100]);
    // 1000 / 1.278 = 782.47: ERA 142, RHC 16, FICA 49, Medicare 11, salary the rest
    expect(p.bens).toEqual([142, 16, 49, 11]);
    expect(p.salary).toBe(782);
    expect(p.salary + sum(p.bens)).toBe(1000);
  });
  it('always adds up (many totals)', () => {
    for (let t = 1; t <= 3000; t += 7) {
      const p = splitPackage(t, BEN[51100]);
      expect(p.salary + sum(p.bens)).toBe(t);
    }
  });
});

describe('donor units', () => {
  const asr = makeAsr({
    // a salary line with room, its four benefit lines with room, and a supplies line
    2100: [
      ['51100', 100000, 50000, 0],
      ['52111', 18150, 9000, 0],
      ['52112', 2000, 1000, 0],
      ['52210', 6200, 3000, 0],
      ['52220', 1450, 700, 0],
      ['56100', 5000, 0, 0],
    ],
  });
  const lines = asr.funds.get('11000').funcs[0].lines;
  it('without benefit rates every line stands alone', () => {
    expect(donorUnits(lines, {}).every((u) => !u.package)).toBe(true);
  });
  it('with rates the salary and its benefits become one package that fits every line', () => {
    const units = donorUnits(lines, benefits);
    const pkg = units.find((u) => u.package);
    expect(pkg).toBeTruthy();
    for (const t of [1, 17, 1000, pkg.cap]) {
      const parts = pkg.split(t);
      expect(sum(parts, (x) => x.amount)).toBe(t);
      for (const x of parts) expect(x.amount).toBeLessThanOrEqual(Math.floor(x.l.avail));
    }
    // the package lines are not also offered as separate donors
    const standalone = units.filter((u) => !u.package).flatMap((u) => u.split(1).map((x) => x.l.obj));
    expect(standalone).toEqual(['56100']);
  });
  it('shrinks to the line with the least room', () => {
    const tight = makeAsr({
      2100: [
        ['51100', 100000, 50000, 0],
        ['52111', 18150, 18000, 0], // 150 of room: allows a salary of about 826
        ['52112', 2000, 0, 0],
      ],
    });
    const u = donorUnits(tight.funds.get('11000').funcs[0].lines, benefits).find((x) => x.package);
    const parts = u.split(u.cap);
    const era = parts.find((x) => x.l.obj === '52111');
    expect(era.amount).toBeLessThanOrEqual(150);
    expect(parts.find((x) => x.l.obj === '51100').amount).toBeGreaterThan(700);
  });
  it('leaves out a benefit line with no room, and the package still adds up', () => {
    const noRoom = makeAsr({
      2100: [
        ['51100', 100000, 50000, 0],
        ['52111', 18150, 18150, 0], // none
        ['52112', 2000, 0, 0],
      ],
    });
    const u = donorUnits(noRoom.funds.get('11000').funcs[0].lines, benefits).find((x) => x.package);
    const parts = u.split(500);
    expect(parts.map((x) => x.l.obj).sort()).toEqual(['51100', '52112']);
    expect(sum(parts, (x) => x.amount)).toBe(500);
  });
});

describe('a transfer moves salary and benefits together', () => {
  // function 1000 is over budget by 1000 (a supplies line); function 2100 (another series) has salary and benefits with room
  const asr = makeAsr({
    1000: [['56100', 1000, 2000, 0]],
    2100: [
      ['51100', 100000, 50000, 0],
      ['52111', 18150, 9000, 0],
      ['52112', 2000, 1000, 0],
      ['52210', 6200, 3000, 0],
      ['52220', 1450, 700, 0],
    ],
  });
  const d = findDeficits(asr, ['11000']).find((x) => x.func === '1000');
  it('takes the salary and its benefit lines so the donor lines equal the amount', () => {
    const t = buildTransfer(asr, d, { kind: 'T', benefits });
    expect(t.amount).toBe(1000);
    expect(t.net).toBe(0);
    expect(t.shortfall).toBe(0);
    expect(sum(t.donors, (l) => -l.amount)).toBe(1000);
    expect(t.donors.map(objOf).sort()).toEqual(['51100', '52111', '52112', '52210', '52220']);
    expect(t.donors.find((l) => l.obj === '51100').amount).toBe(-782);
  });
  it('is unchanged when the school has no benefit rates', () => {
    const t = buildTransfer(asr, d, { kind: 'T' });
    expect(t.net).toBe(0);
    expect(t.donors.length).toBeGreaterThan(0);
  });
  it('never takes more than any line has, and still balances when the package runs out', () => {
    const small = makeAsr({
      1000: [['56100', 1000, 9000, 0]], // over by 8000
      2100: [
        ['51100', 5000, 1000, 0], // room 4000
        ['52111', 900, 100, 0], // room 800: caps the package near 4400
        ['52112', 100, 0, 0],
      ],
    });
    const dd = findDeficits(small, ['11000']).find((x) => x.func === '1000');
    const t = buildTransfer(small, dd, { kind: 'T', benefits });
    for (const l of t.donors) expect(-l.amount).toBeLessThanOrEqual(Math.floor(l.avail));
    expect(t.net).toBe(t.shortfall ? t.net : 0);
    expect(sum(t.donors, (l) => -l.amount) + t.shortfall).toBe(t.amount);
  });
  it('a receiving salary line brings its benefit lines with it, adding to the same amount', () => {
    const rec = makeAsr({
      1000: [
        ['51100', 10000, 11000, 0], // over by 1000
        ['52111', 150, 100, 0],
        ['52112', 50, 10, 0],
      ],
      2100: [['56100', 50000, 0, 0]],
    });
    const dd = findDeficits(rec, ['11000']).find((x) => x.func === '1000');
    const t = buildTransfer(rec, dd, { kind: 'T', benefits });
    expect(t.amount).toBe(910); // the function is over by 910 (1000 salary overspend less 90 of benefit room)
    expect(sum(t.receiving, (l) => l.amount)).toBe(910);
    expect(t.receiving.find((l) => l.obj === '51100').amount).toBeLessThan(910);
    expect(t.receiving.map(objOf).sort()).toEqual(['51100', '52111', '52112']);
    expect(t.net).toBe(0);
  });
});

describe('any share of a package cap fits the lines (seeded random rooms)', () => {
  it('never exceeds a line and always adds up', () => {
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (let n = 0; n < 40; n++) {
      const room = (hi) => Math.floor(rnd() * hi) + 1;
      const asr = makeAsr({
        2100: [
          ['51100', room(200000) + 100, 0, 0],
          ['52111', room(40000) + 10, 0, 0],
          ['52112', room(5000) + 10, 0, 0],
          ['52210', room(14000) + 10, 0, 0],
          ['52220', room(3000) + 10, 0, 0],
        ],
      });
      const pkg = donorUnits(asr.funds.get('11000').funcs[0].lines, benefits).find((u) => u.package);
      if (!pkg) continue;
      for (let t = 0; t <= pkg.cap; t += Math.max(1, Math.floor(pkg.cap / 60))) {
        const parts = pkg.split(t);
        expect(sum(parts, (x) => x.amount)).toBe(t);
        for (const x of parts) expect(x.amount).toBeLessThanOrEqual(Math.floor(x.l.avail));
      }
      const top = pkg.split(pkg.cap);
      expect(sum(top, (x) => x.amount)).toBe(pkg.cap);
      for (const x of top) expect(x.amount).toBeLessThanOrEqual(Math.floor(x.l.avail));
    }
  });
});
