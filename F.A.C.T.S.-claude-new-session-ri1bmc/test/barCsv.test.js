import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { barLine, newBar } from '../src/lib/bar.js';
import { barCsv, barFileName, fmtAmount, fmtFte, makeBarFile } from '../src/lib/barCsv.js';
import { newProfile } from '../src/lib/profile.js';

const seg = (key, len) => ({ key, len });
const school = (over = {}) =>
  newProfile({
    id: 'example-school',
    name: 'Example School',
    districtCode: '1',
    segments: [seg('fund', 5), seg('func', 4), seg('obj', 5), seg('prog', 4), seg('loc', 3), seg('job', 4)],
    locationRule: { type: 'full' },
    ...over,
  });
const mk = (P, type, fund, lines, contact = {}, just = '') => {
  const b = newBar(type, fund);
  b.lines = lines.map(([c, a, f]) => barLine(P, c, a, f));
  b.contact = { first: '', middle: '', last: '', ...contact };
  b.justification = just;
  return b;
};

// The accepted Maintenance BAR, with a made-up contact. Lines are the 9-field form the spec defines.
const MAINT = [
  ['11000-1000-51100-4010-028-1416', -8075],
  ['11000-1000-56118-2000-028-0000', 14],
  ['11000-1000-53711-2000-028-0000', 44],
  ['11000-1000-56118-1020-028-0000', 156],
  ['11000-1000-54311-1010-028-0000', 243],
  ['11000-1000-55817-1010-028-0000', 248],
  ['11000-1000-51100-0000-028-1611', 7370],
];
const EXPECT_MAINT =
  [
    'UBH,1,2019,11000,M,Sample,,Person,,,,,,,Maintenance',
    'UBL,11000,1000,51100,4010,028,1416,-8075,0',
    'UBL,11000,1000,56118,2000,028,0000,14,0',
    'UBL,11000,1000,53711,2000,028,0000,44,0',
    'UBL,11000,1000,56118,1020,028,0000,156,0',
    'UBL,11000,1000,54311,1010,028,0000,243,0',
    'UBL,11000,1000,55817,1010,028,0000,248,0',
    'UBL,11000,1000,51100,0000,028,1611,7370,0',
  ].join('\r\n') + '\r\n';

describe('the upload file', () => {
  const P = school();
  it('writes the accepted Maintenance BAR exactly: CRLF, no BOM, 15-field header, 9-field lines', () => {
    const csv = barCsv(mk(P, 'M', '11000', MAINT, { first: 'Sample', last: 'Person' }, 'Maintenance'), {
      profile: P,
      fiscalYear: 2019,
    });
    expect(csv).toBe(EXPECT_MAINT);
    expect(csv.charCodeAt(0)).toBe(0x55); // "U", not a BOM
    const recs = csv.split('\r\n').slice(0, -1);
    expect(recs[0].split(',')).toHaveLength(15);
    recs.slice(1).forEach((r) => expect(r.split(',')).toHaveLength(9));
  });
  it("writes the PED spec's Increase example: revenue first, 3-digit locations, district keeps its zero", () => {
    const P2 = school({ districtCode: '040' });
    const b = mk(
      P2,
      'I',
      '21000',
      [
        ['21000-3100-56116-0000-033-0000', 800],
        ['21000-0000-41604-0000-000-0000', 2350],
        ['21000-3100-56116-0000-034-0000', 900],
        ['21000-3100-56116-0000-036-0000', 650],
      ],
      { first: 'Jamie', last: 'Shepperd' },
      'Test BAR with Locations',
    );
    expect(barCsv(b, { profile: P2, fiscalYear: 2022 })).toBe(
      [
        'UBH,040,2022,21000,I,Jamie,,Shepperd,,,,,,,Test BAR with Locations',
        'UBL,21000,0000,41604,0000,000,0000,2350,0',
        'UBL,21000,3100,56116,0000,033,0000,800,0',
        'UBL,21000,3100,56116,0000,034,0000,900,0',
        'UBL,21000,3100,56116,0000,036,0000,650,0',
      ].join('\r\n') + '\r\n',
    );
  });
  it('leaves out zero lines, formats cents and FTE, and flattens line breaks in the justification', () => {
    const b = mk(
      P,
      'T',
      '11000',
      [
        ['11000-1000-51100-4010-028-1416', -256945.17, -0.04],
        ['11000-1000-52100-4010-028-1416', 256945.17, 0.04],
        ['11000-1000-53100-4010-028-1416', 0],
      ],
      {},
      'Line one\n  line   two',
    );
    const csv = barCsv(b, { profile: P, fiscalYear: 2027 });
    expect(csv).toBe(
      [
        'UBH,1,2027,11000,T,,,,,,,,,,Line one line two',
        'UBL,11000,1000,51100,4010,028,1416,-256945.17,-0.0400',
        'UBL,11000,1000,52100,4010,028,1416,256945.17,0.0400',
      ].join('\r\n') + '\r\n',
    );
    expect([fmtAmount(5), fmtAmount(5.5), fmtAmount(-0.1 - 0.2), fmtFte(0), fmtFte(0.04)]).toEqual([
      '5',
      '5.50',
      '-0.30',
      '0',
      '0.0400',
    ]);
  });
  it('fills the flowthrough header fields only for a flowthrough fund', () => {
    const PF = school({
      funds: [
        { code: '24101', name: 'Title I', flowthrough: true },
        { code: '11000', name: 'Op', flowthrough: false },
      ],
    });
    const lines = (f) => [
      [`${f}-1000-51100-4010-028-1416`, -5],
      [`${f}-1000-52100-4010-028-1416`, 5],
    ];
    const flow = {
      scope: 'N',
      from: '07/01/2026',
      to: '06/30/2027',
      carryover: '$100',
      allocation: '1,000',
      total: '1100',
    };
    const ft = barCsv(mk(PF, 'T', '24101', lines('24101')), { profile: PF, fiscalYear: 2027 });
    expect(ft.split('\r\n')[0]).toBe('UBH,1,2027,24101,T,,,,,,,,,,');
    const withFlow = mk(PF, 'T', '24101', lines('24101'));
    withFlow.flowthrough = flow;
    expect(barCsv(withFlow, { profile: PF, fiscalYear: 2027 }).split('\r\n')[0]).toBe(
      'UBH,1,2027,24101,T,,,,07/01/2026,06/30/2027,N,100,1000,1100,',
    );
    const other = mk(PF, 'T', '11000', lines('11000'));
    other.flowthrough = flow;
    expect(barCsv(other, { profile: PF, fiscalYear: 2027 }).split('\r\n')[0]).toBe(
      'UBH,1,2027,11000,T,,,,,,,,,,',
    );
  });
  it('names the file after the school, fund, type and year', () => {
    expect(barFileName(P, { fund: '11000', type: 'M' }, 2027)).toBe('example-school_11000_M_FY2027.csv');
  });
});

describe('the file is never made while a check says stop', () => {
  const P = school();
  it('refuses an unbalanced BAR and gives the reason', () => {
    const r = makeBarFile(
      mk(P, 'T', '11000', [
        ['11000-1000-51100-4010-028-1416', -10],
        ['11000-1000-52100-4010-028-1416', 9],
      ]),
      { profile: P, fiscalYear: 2027 },
    );
    expect(r.ok).toBe(false);
    expect(r.csv).toBe('');
    expect(r.checks.some((c) => c.msg.includes('does not balance'))).toBe(true);
  });
  it('makes the file for a clean BAR', () => {
    const r = makeBarFile(mk(P, 'M', '11000', MAINT, {}, 'Maintenance'), { profile: P, fiscalYear: 2019 });
    expect(r.ok).toBe(true);
    expect(r.name).toBe('example-school_11000_M_FY2019.csv');
  });
});

// Against the real accepted file (git-ignored fixture; its contact name is real, so only the lines are compared).
const REAL = new URL('../fixtures/accepted-maintenance-example.csv', import.meta.url);
describe.skipIf(!existsSync(REAL))('the real accepted Maintenance file', () => {
  it('has the same lines as ours, apart from its padding commas', () => {
    const real = readFileSync(REAL, 'utf8').split('\r\n').filter(Boolean);
    const P = school();
    const mine = barCsv(mk(P, 'M', '11000', MAINT, { first: 'X', last: 'Y' }, 'Maintenance'), {
      profile: P,
      fiscalYear: 2019,
    })
      .split('\r\n')
      .filter(Boolean);
    expect(mine.slice(1)).toEqual(real.slice(1).map((l) => l.replace(/,+$/, '')));
    const h = real[0].split(',');
    expect([h[0], h[1], h[2], h[3], h[4], ...h.slice(8)]).toEqual([
      'UBH',
      '1',
      '2019',
      '11000',
      'M',
      '',
      '',
      '',
      '',
      '',
      '',
      'Maintenance',
    ]);
  });
});
