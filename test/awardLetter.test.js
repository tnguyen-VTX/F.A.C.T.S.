import { describe, it, expect } from 'vitest';
import { parseAward, toMDY } from '../src/lib/awardLetter.js';
import { newProfile } from '../src/lib/profile.js';

const profile = newProfile({ funds: [{ code: '24101', name: 'Title I', flowthrough: true }, { code: '25184', name: 'IDEA B' }] });

describe('award letter suggestions', () => {
  it('reads a simple label layout', () => {
    const r = parseAward(
      [
        'Notice of Grant Award',
        'Grant Name: Title I Part A',
        'Fund: 24101',
        'Award Period: 07/01/2026 through 06/30/2027',
        'Total Award: $125,000.00',
        'Carryover: $5,000.00',
        'Current Year Allocation: $120,000.00',
        'Total Approved Budget: $125,000.00',
      ],
      profile,
    );
    expect(r.fund.value).toBe('24101');
    expect(r.award.value).toBe(125000);
    expect(r.from.value).toBe('07/01/2026');
    expect(r.to.value).toBe('06/30/2027');
    expect(r.carryover.value).toBe(5000);
    expect(r.allocation.value).toBe(120000);
    expect(r.total.value).toBe(125000);
    expect(r.name.value).toBe('Title I Part A');
    expect(r.award.src).toContain('Total Award');
  });
  it('reads written dates and separate begin/end lines', () => {
    const r = parseAward('IDEA-B Award\nProject beginning date July 1, 2026\nProject ending date: June 30, 2027\nAmount Awarded $2,350.00\nFund 25184', profile);
    expect([r.from.value, r.to.value, r.award.value, r.fund.value]).toEqual(['07/01/2026', '06/30/2027', 2350, '25184']);
  });
  it('finds budget rows by function and object, or full account code', () => {
    const r = parseAward(
      ['Budget summary', '1000 51100 Salaries $800.00', '2100 - 52311 Benefits 900.00', '24101-2300-53414-0000-001707-0000 $650.00', 'Revenue 44000 $2,350.00'],
      profile,
    );
    expect(r.rows.map((x) => [x.func, x.obj, x.amount])).toEqual([
      ['1000', '51100', 800],
      ['2100', '52311', 900],
      ['2300', '53414', 650],
    ]);
  });
  it('leaves blanks instead of guessing', () => {
    const r = parseAward('Dear Principal, thank you for applying.', profile);
    expect(r.fund).toBeNull();
    expect(r.award).toBeNull();
    expect(r.from).toBeNull();
    expect(r.rows).toEqual([]);
  });
  it('does not read a year or phone number as the award', () => {
    const r = parseAward('Award letter 2026\nCall 505 555 1212 about your award', profile);
    expect(r.award).toBeNull();
  });
  it('converts date forms', () => {
    expect(toMDY('7/1/2026'.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/))).toBe('07/01/2026');
  });
});

import { buildAwardBar, awardCode, defaultLocationSegment } from '../src/lib/awardLetter.js';
import { validateBar } from '../src/lib/bar.js';
import { makeBarFile } from '../src/lib/barCsv.js';

const gil = newProfile({
  id: 't', name: 'Test School', districtCode: '001', locationIds: ['707'],
  funds: [{ code: '24101', name: 'Title I', flowthrough: false }, { code: '25184', name: 'IDEA B', flowthrough: true }],
});
describe('building the BAR from the confirmed form', () => {
  const form = (o = {}) => ({
    type: 'IB', fund: '24101', award: '2350', revObj: '44000', loc: '001707',
    rows: [
      { on: true, func: '1000', obj: '51100', amount: '800' },
      { on: true, func: '2100', obj: '52311', amount: '900' },
      { on: true, func: '2300', obj: '53414', amount: '650' },
      { on: false, func: '2400', obj: '53414', amount: '999' },
    ],
    ...o,
  });
  it('derives the location segment from district and PED location', () => {
    expect(defaultLocationSegment(gil)).toBe('001707');
    expect(awardCode(gil, { fund: '24101', func: '1000', obj: '51100', loc: '001707' })).toBe('24101-1000-51100-0000-001707-0000');
  });
  it('builds a balanced IB BAR with the revenue line first', () => {
    const { bar, errors } = buildAwardBar(gil, form());
    expect(errors).toBeUndefined();
    expect(bar.type).toBe('IB');
    expect(bar.lines.map((l) => [l.func, l.obj, l.amount])).toEqual([
      ['0000', '44000', 2350], ['1000', '51100', 800], ['2100', '52311', 900], ['2300', '53414', 650],
    ]);
    const checks = validateBar(bar, { profile: gil });
    expect(checks.filter((c) => c.level === 'stop' && /balance|equal|revenue/i.test(c.msg))).toEqual([]);
    expect(bar.justification).toMatch(/^Initial budget of/);
  });
  it('fills flowthrough fields only for flowthrough funds', () => {
    const f = buildAwardBar(gil, form({ fund: '25184', from: '07/01/2026', to: '06/30/2027', carryover: '0', allocation: '2350', total: '2350' }));
    expect(f.bar.flowthrough).toMatchObject({ scope: 'N', from: '07/01/2026', total: '2350' });
    expect(buildAwardBar(gil, form()).bar.flowthrough.from).toBe('');
  });
  it('asks for what is missing', () => {
    const { errors } = buildAwardBar(gil, form({ award: '', revObj: '51100', rows: [] }));
    expect(errors.join(' ')).toMatch(/award amount/);
    expect(errors.join(' ')).toMatch(/revenue object/);
    expect(errors.join(' ')).toMatch(/Check at least one/);
  });
  it('writes the IB upload file when the lines balance', () => {
    const { bar } = buildAwardBar(gil, form());
    bar.contact = { first: 'A', middle: '', last: 'B' };
    const f = makeBarFile(bar, { profile: gil, fiscalYear: 2027 });
    expect(f.ok).toBe(true);
    expect(f.csv).toMatch(/^UBH,001,2027,24101,IB,/);
    expect(f.csv.split('\r\n')[1]).toBe('UBL,24101,0000,44000,0000,707,0000,2350,0');
  });
});
