import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { createPedParser, makePedCheck, splitLine } from '../src/lib/pedListing.js';
import { gilbertPreset } from '../src/lib/profile.js';

const H =
  'ChartOfAccountsName,AccountType,FundCode,FundName,FunctionCode,FunctionName,ObjectCode,ObjectName,ProgramCode,ProgramName,JobClassCode,JobClassName';
const row = (fund, func, obj, prog, job, objName = 'Obj') =>
  `PED Uniform 2026-2027,Expenditure,${fund},Fund ${fund},${func},Func,${obj},${objName},${prog},Prog,${job},Job`;
const CSV = [
  '﻿' + H,
  row('24101', '2100', '52315', '0000', '1214'),
  row('24101', '2100', '52315', '0000', '1211', '"Interest, with a comma"'),
  row('11000', '1000', '51100', '1010', '1411'),
  '',
].join('\r\n');

describe('splitting a CSV line', () => {
  it('handles quotes, commas and doubled quotes', () => {
    expect(splitLine('a,"b,c","d ""e"""')).toEqual(['a', 'b,c', 'd "e"']);
  });
});

describe('reading the listing', () => {
  it('keeps only the asked-for funds, even when chunks split lines', () => {
    const p = createPedParser(new Set(['24101']));
    for (let i = 0; i < CSV.length; i += 37) p.push(CSV.slice(i, i + 37));
    const r = p.finish();
    expect([...r.kept.keys()]).toEqual(['24101']);
    expect([...r.kept.get('24101')].sort()).toEqual(['2100|52315|0000|1211', '2100|52315|0000|1214']);
    expect(r.rows).toBe(3);
    expect(r.funds.sort()).toEqual(['11000', '24101']);
  });
  it('keeps every fund when none are named', () => {
    const p = createPedParser(null);
    p.push(CSV);
    expect(p.finish().kept.size).toBe(2);
  });
  it('says when the file is not a listing', () => {
    expect(() => createPedParser(null).push('a,b,c\n1,2,3\n')).toThrow('code columns');
  });
});

describe('checking a code', () => {
  const P = gilbertPreset();
  const p = createPedParser(new Set(['24101']));
  p.push(CSV);
  const check = makePedCheck(p.finish().kept, P.segments);
  it('is true for an allowed string, ignoring location', () => {
    expect(check('24101-2100-52315-0000-001707-1214')).toBe(true);
    expect(check('24101-2100-52315-0000-999999-1214')).toBe(true);
  });
  it('is false for a string PED does not list and null for a fund that is not loaded', () => {
    expect(check('24101-2100-52315-0000-001707-9999')).toBe(false);
    expect(check('11000-1000-51100-1010-001707-1411')).toBeNull();
  });
});

const REAL = 'fixtures/chart-line-24XXX.csv';
describe.skipIf(!existsSync(REAL))('the real 24XXX listing', () => {
  it('allows 24101 2100/52315/0000/1214 and not job class 9999', () => {
    const p = createPedParser(new Set(['24101']));
    p.push(readFileSync(REAL, 'utf8'));
    const check = makePedCheck(p.finish().kept, gilbertPreset().segments);
    expect(check('24101-2100-52315-0000-001707-1214')).toBe(true);
    expect(check('24101-2100-52315-0000-001707-9999')).toBe(false);
  });
});

import { mergeKept, pedYear } from '../src/lib/pedListing.js';
describe('year and merging', () => {
  it('reads the year from the chart name', () => {
    expect(pedYear('PED Uniform 2026-2027')).toBe(2027);
    expect(pedYear('whatever')).toBeNull();
  });
  it('captures the chart name while parsing', () => {
    const p = createPedParser(null);
    p.push(CSV);
    expect(p.finish().chartName).toBe('PED Uniform 2026-2027');
  });
  it('merges funds read at different times, replacing one read again', () => {
    const a = new Map([['24101', new Set(['x'])]]);
    const b = new Map([
      ['11000', new Set(['y'])],
      ['24101', new Set(['z'])],
    ]);
    expect(mergeKept(mergeKept({}, a), b)).toEqual({ 24101: ['z'], 11000: ['y'] });
  });
});

import { readPedCsv, readPedZip } from '../src/lib/pedZip.js';
import { zipSync, strToU8 } from 'fflate';
const stream = (bytes, size = 50) =>
  new ReadableStream({
    start(c) {
      for (let i = 0; i < bytes.length; i += size) c.enqueue(bytes.slice(i, i + size));
      c.close();
    },
  });
describe('reading from a stream', () => {
  it('reads a CSV in small pieces', async () => {
    const r = await readPedCsv(stream(strToU8(CSV)), new Set(['24101']));
    expect([...r.kept.get('24101')]).toHaveLength(2);
  });
  it('reads every CSV in a zip and skips other files', async () => {
    const zip = zipSync({
      'a - FY27.csv': strToU8(CSV),
      'b.csv': strToU8(CSV.replace(/24101/g, '24102')),
      'readme.txt': strToU8('hi'),
    });
    const names = [];
    const rs = await readPedZip(stream(zip, 200), new Set(['24101', '24102']), (n) => names.push(n));
    expect(rs).toHaveLength(2);
    expect(names).toEqual(['a - FY27.csv', 'b.csv']);
    expect(rs.map((r) => [...r.kept.keys()][0]).sort()).toEqual(['24101', '24102']);
  });
});

const ZIP = 'fixtures/chart-line-listing.zip';
describe.skipIf(!existsSync(ZIP))('the real zip', () => {
  it('finds Gilbert-style funds across files without holding the whole listing', async () => {
    const buf = new Uint8Array(readFileSync(ZIP));
    const rs = await readPedZip(stream(buf, 1 << 20), new Set(['11000', '24101']));
    expect(rs).toHaveLength(9);
    const all = new Map();
    for (const r of rs) for (const [f, s] of r.kept) all.set(f, s);
    expect(all.get('24101').has('2100|52315|0000|1214')).toBe(true);
    expect(all.get('11000').size).toBeGreaterThan(1000);
    expect(rs[0].chartName).toContain('PED Uniform');
  }, 120000);
});
