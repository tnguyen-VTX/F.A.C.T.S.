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
