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

import { parseSegMemo, spreadAwardOverFund } from '../src/lib/awardLetter.js';

describe('shapes of real award documents (made-up names and figures)', () => {
  const school = newProfile({ id: 's', name: 'Test Charter High School', districtCode: '001', locationIds: ['707'], reportNames: ['Test Charter Hs'], funds: [] });
  it('reads an allocation letter table (fund, revenue code, total award; initial budget)', () => {
    const r = parseAward(
      [
        'This letter confirms your allocation for Title 1 - CSI (24190) for FY 2026-2027.',
        'You will need to incorporate the amounts into your initial budget in OBMS.',
        'Note that all funds managed through APS must use revenue code 41924.',
        'Grant Name UCOA CFDA# Revenue Account Total Award',
        'Title I - CSI 24190 84.010A 41924 $192,224.00',
      ],
      school,
    );
    expect([r.fund.value, r.type, r.award.value, r.revObj.value, r.name.value]).toEqual(['24190', 'IB', 192224, '41924', 'Title I - CSI']);
    expect(r.revenue).toMatchObject([{ obj: '41924', amount: 192224 }]);
  });
  it('reads a revised letter as an Increase for the Increase BAR column, not the final award', () => {
    const r = parseAward(
      ['Grant Name UCOA CFDA# Revenue Planning Award Increase BAR Final Award', 'IDEA B 24106 84.0270 41924 $60,435.00 $1,083.61 $61,518.61'],
      school,
    );
    expect([r.fund.value, r.type, r.award.value, r.planning.value, r.final.value]).toEqual(['24106', 'I', 1083.61, 60435, 61518.61]);
  });
  it('reads only this school\'s row of the SEG memo table', () => {
    const lines = [
      'Please submit a BAR for the applicable object codes in Fund 11000 - Operational, as shown in the enclosed document',
      '43101- State Equalization Guarantee 43120- Charter School Administrative Revenue',
      'Other Academy 001-111 LC $1,000,000.00 $9,999.99 $1,009,999.99 $0.00 $0.00 $0.00',
      'Test Charter Hs 001-707 LC $2,569,755.00 $475,352.53 $3,045,107.53 $0.00 $0.00 $0.00',
    ];
    const seg = parseSegMemo(lines, school);
    expect(seg.fund).toBe('11000');
    expect(seg.revenue.map((x) => [x.obj, x.amount])).toEqual([['43101', 475352.53]]);
    const r = parseAward(lines, school);
    expect([r.type, r.award.value, r.fund.value]).toEqual(['I', 475352.53, '11000']);
    expect(parseAward(lines, newProfile({ name: 'Nobody', districtCode: '009', locationIds: ['999'], funds: [] })).revenue).toEqual([]);
  });
  it('makes a negative SEG adjustment a Decrease', () => {
    const lines = ['43101- State Equalization Guarantee', 'Test Charter Hs 001-707 LC $100.00 ($50.00) $50.00'];
    const r = parseAward(lines, school);
    expect([r.type, r.award.value, r.revenue[0].amount]).toEqual(['D', 50, -50]);
  });
  it('reads a not-to-exceed amount and an end date from an agreement', () => {
    const r = parseAward(
      ['compensation not to exceed forty four thousand dollars and zero cents ($44,000.00),', 'This Agreement shall terminate on June 24, 2027 unless otherwise terminated.'],
      school,
    );
    expect([r.award.value, r.to.value, r.fund]).toEqual([44000, '06/24/2027', null]);
  });
});

describe('spreading an award over a fund and building several revenue lines', () => {
  it('splits to the cent by budget share with the remainder on the largest line', () => {
    const fund = { lines: [
      { func: '1000', obj: '51100', prog: '0000', job: '0000', budget: 600 },
      { func: '2100', obj: '52311', prog: '0000', job: '0000', budget: 300 },
      { func: '2300', obj: '53414', prog: '0000', job: '0000', budget: 0 },
    ] };
    const rows = spreadAwardOverFund(fund, 1083.61);
    expect(rows.map((r) => r.amount)).toEqual([722.41, 361.2]);
    expect(Math.round(rows.reduce((s, r) => s + r.amount, 0) * 100)).toBe(108361);
    expect(spreadAwardOverFund(null, 100)).toEqual([]);
  });
  it('writes one revenue line per row, and a Decrease for negative amounts', () => {
    const rows = [{ on: true, func: '1000', obj: '51100', amount: '100' }];
    const inc = buildAwardBar(gil, { type: 'I', fund: '24101', loc: '001707', revenue: [{ obj: '43101', amount: 70 }, { obj: '43120', amount: 30 }], rows });
    expect(inc.bar.lines.slice(0, 2).map((l) => [l.obj, l.amount])).toEqual([['43101', 70], ['43120', 30]]);
    expect(inc.bar.award).toBe('100');
    const dec = buildAwardBar(gil, { type: 'D', fund: '24101', loc: '001707', revenue: [{ obj: '43101', amount: -100 }], rows: [{ on: true, func: '1000', obj: '51100', amount: '-100' }] });
    expect(dec.bar.type).toBe('D');
    expect(dec.bar.lines[0].amount).toBe(-100);
  });
});
