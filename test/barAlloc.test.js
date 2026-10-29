import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import {
  allocateDonors,
  allocateReceiving,
  buildTransfer,
  findDeficits,
  fundFunctions,
  spreadByWeight,
  spreadCapped,
} from '../src/lib/barLogic.js';
import { parseASR, rowsOf } from '../src/lib/parse.js';
import { makeAsr } from './helpers/makeAsr.js';
import { barLine, canDownload, newBar, validateBar } from '../src/lib/bar.js';
import { newProfile } from '../src/lib/profile.js';

const sum = (a) => a.reduce((s, x) => s + x, 0);

describe('spreading whole dollars', () => {
  it('puts the rounding difference on the largest weight', () => {
    expect(spreadByWeight(10, [1, 1, 1])).toEqual([4, 3, 3]);
    expect(spreadByWeight(0, [1, 2])).toEqual([0, 0]);
    expect(spreadByWeight(5, [0, 0])).toEqual([0, 0]);
    expect(sum(spreadByWeight(1001, [3, 5, 7, 11]))).toBe(1001);
  });
  it('never exceeds a cap and still adds up', () => {
    const p = spreadCapped(10, [3, 3, 10]);
    expect(sum(p)).toBe(10);
    p.forEach((x, i) => expect(x).toBeLessThanOrEqual([3, 3, 10][i]));
    expect(spreadCapped(6, [3, 3])).toEqual([3, 3]);
  });
});

describe('receiving lines', () => {
  const asr = makeAsr({
    2600: [
      ['51100', 1000, 1000, 500], // -500
      ['51300', 200, 100, 200], // -100
      ['52100', 400, 100, 0], // +300
    ],
  });
  const d = findDeficits(asr)[0]; // function avail = -300
  it('shares an amount below the line deficits pro rata, over-budget lines only', () => {
    const r = allocateReceiving(d, 300);
    expect(r.map((l) => [l.obj, l.amount])).toEqual([
      ['51100', 250],
      ['51300', 50],
    ]);
  });
  it('fills each over-budget line, then spreads the rest by budget', () => {
    const r = allocateReceiving(d, 700); // needs 600; 100 left over 1000/200/400 budget
    const by = Object.fromEntries(r.map((l) => [l.obj, l.amount]));
    expect(sum(Object.values(by))).toBe(700);
    expect(by['51100']).toBeGreaterThanOrEqual(500);
    expect(by['51300']).toBeGreaterThanOrEqual(100);
    expect(by['52100']).toBeGreaterThan(0);
  });
});

describe('donors', () => {
  const asr = makeAsr({
    2600: [
      ['51100', 1000, 1000, 500],
      ['52100', 400, 300, 0],
    ], // deficit function
    1000: [
      ['51100', 5000, 1000, 0],
      ['52100', 1000, 0, 0],
    ],
    2100: [
      ['51100', 2000, 500, 0],
      ['52100', 300, 0, 0],
    ],
    3000: [
      ['51100', 1000, 0, 0],
      ['51300', 0, 900, 0],
    ], // function Available is only 100
  });
  const need = 400;
  it('takes from the profile order first', () => {
    const r = allocateDonors(asr, {
      fund: '11000',
      excludeFunc: '2600',
      need,
      mode: 'rank',
      priority: ['2100', '1000'],
    });
    expect(r.shortfall).toBe(0);
    expect(new Set(r.lines.map((l) => l.func))).toEqual(new Set(['2100']));
    expect(sum(r.lines.map((l) => l.amount))).toBe(-400);
  });
  it('shares the need across every eligible function in spread mode', () => {
    const r = allocateDonors(asr, { fund: '11000', excludeFunc: '2600', need, mode: 'spread' });
    expect(sum(r.lines.map((l) => l.amount))).toBe(-400);
    expect(new Set(r.lines.map((l) => l.func)).size).toBeGreaterThan(1);
  });
  it('never takes more from a function than its subtotal Available', () => {
    const r = allocateDonors(asr, {
      fund: '11000',
      excludeFunc: '2600',
      need: 6000,
      mode: 'rank',
      priority: ['3000'],
    });
    const from3000 = sum(r.lines.filter((l) => l.func === '3000').map((l) => -l.amount));
    expect(from3000).toBeLessThanOrEqual(100);
  });
  it('reports a shortfall instead of over-drawing, and skips the deficit function', () => {
    const r = allocateDonors(asr, {
      fund: '11000',
      excludeFunc: '2600',
      need: 100000,
      mode: 'spread',
    });
    expect(r.shortfall).toBeGreaterThan(0);
    expect(r.lines.some((l) => l.func === '2600')).toBe(false);
    expect(r.lines.every((l) => l.amount < 0)).toBe(true);
  });
  it('has no object rule: a benefit need can be met from salary lines', () => {
    const r = allocateDonors(asr, {
      fund: '11000',
      excludeFunc: '2600',
      need: 500,
      mode: 'rank',
      priority: ['1000'],
    });
    expect(r.shortfall).toBe(0);
    expect(sum(r.lines.map((l) => l.amount))).toBe(-500);
    expect(r.lines.some((l) => l.obj.startsWith('51'))).toBe(true);
  });
});

describe('a whole transfer', () => {
  const asr = makeAsr({
    2600: [
      ['51100', 1000, 1000, 500],
      ['52100', 400, 100, 0],
    ], // avail -100... deficit 100 + 300
    1000: [
      ['51100', 5000, 1000, 0],
      ['52100', 1000, 0, 0],
    ],
  });
  it('nets to zero when the donors have room', () => {
    const d = findDeficits(asr)[0];
    for (const mode of ['rank', 'spread']) {
      const t = buildTransfer(asr, d, { mode, priority: ['1000'] });
      expect(t.shortfall).toBe(0);
      expect(t.net).toBe(0);
      expect(t.amount).toBe(Math.ceil(d.deficit));
    }
  });
  it('adds the cushion and rounds up to whole dollars', () => {
    const d = findDeficits(asr)[0];
    expect(buildTransfer(asr, d, { cushion: 50 }).amount).toBe(Math.ceil(d.deficit) + 50);
  });
});

// Invariants on every real deficit (git-ignored fixture; skipped when absent). No numbers are written down.
const XL = new URL('../fixtures/cesar-account-summary.xlsx', import.meta.url);
describe.skipIf(!existsSync(XL))('real Cesar Chavez deficits', () => {
  // The suite body runs even when skipped, so do not read the missing fixture files.
  if (!existsSync(XL)) return;
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
  const deficits = findDeficits(asr);
  for (const mode of ['rank', 'spread']) {
    it(`${mode}: balances or reports a shortfall, never over-draws a line or a function`, () => {
      expect(deficits.length).toBeGreaterThan(0);
      for (const d of deficits) {
        const t = buildTransfer(asr, d, { mode });
        expect(t.net).toBe(t.shortfall);
        expect(t.lines.every((l) => Number.isInteger(l.amount) && l.fund === d.fund)).toBe(true);
        expect(t.receiving.reduce((s, l) => s + l.amount, 0)).toBe(t.amount);
        const fns = new Map(fundFunctions(asr.funds.get(d.fund)).map((f) => [f.code, f]));
        const taken = new Map();
        for (const l of t.donors) {
          expect(l.func).not.toBe(d.func);
          expect(-l.amount).toBeLessThanOrEqual(Math.floor(l.avail + 1e-9));
          taken.set(l.func, (taken.get(l.func) || 0) - l.amount);
        }
        for (const [f, n] of taken)
          expect(n).toBeLessThanOrEqual(Math.max(0, Math.floor(fns.get(f).tot.avail + 1e-9)));
        const seen = new Set(t.lines.map((l) => l.code));
        expect(seen.size).toBe(t.lines.length);
      }
    });
  }

  it('the validator agrees with the allocator: covered transfers pass, short ones are stopped', () => {
    const prof = newProfile({ ...cesar, districtCode: '512', locationRule: { type: 'lastN', n: 3 } });
    let passed = 0,
      stopped = 0;
    for (const d of deficits) {
      const t = buildTransfer(asr, d, { mode: 'rank', kind: 'T' });
      const b = newBar('T', d.fund);
      b.justification = 'Aligning budget with actual expenditures';
      b.lines = t.lines.map((l) => barLine(prof, l.code, l.amount));
      const checks = validateBar(b, { profile: prof, asr });
      if (t.shortfall === 0) {
        expect(checks.filter((c) => c.level === 'stop')).toEqual([]);
        passed++;
      } else {
        expect(canDownload(checks)).toBe(false);
        stopped++;
      }
    }
    expect(passed + stopped).toBe(deficits.length);
  });
});
