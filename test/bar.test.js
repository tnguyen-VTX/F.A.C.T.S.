import { describe, it, expect } from 'vitest';
import { barLine, barTotals, canDownload, newBar, validateBar } from '../src/lib/bar.js';
import { newProfile } from '../src/lib/profile.js';
import { makeAsr } from './helpers/makeAsr.js';

const seg = (key, len) => ({ key, len });
// A school whose account codes carry a 3-digit location (like the Maintenance and Increase examples).
const school = (over = {}) =>
  newProfile({
    id: 'ex',
    name: 'Example School',
    districtCode: '1',
    segments: [seg('fund', 5), seg('func', 4), seg('obj', 5), seg('prog', 4), seg('loc', 3), seg('job', 4)],
    locationRule: { type: 'full' },
    ...over,
  });
const P = school();
const bar = (type, fund, lines, extra = {}) => {
  const b = newBar(type, fund);
  b.lines = lines.map(([code, amt, fte]) => barLine(P, code, amt, fte));
  b.justification = 'Aligning budget with actual expenditures';
  return Object.assign(b, extra);
};
const msgs = (c, level) =>
  c
    .filter((x) => !level || x.level === level)
    .map((x) => x.msg)
    .join(' | ');
const A = '11000-1000-51100-4010-028-1416';
const B = '11000-1000-56118-2000-028-0000';

describe('BARs built from the examples', () => {
  it('the accepted Maintenance BAR (made-up contact) has no stops', () => {
    const b = bar('M', '11000', [
      ['11000-1000-51100-4010-028-1416', -8075],
      ['11000-1000-56118-2000-028-0000', 14],
      ['11000-1000-53711-2000-028-0000', 44],
      ['11000-1000-56118-1020-028-0000', 156],
      ['11000-1000-54311-1010-028-0000', 243],
      ['11000-1000-55817-1010-028-0000', 248],
      ['11000-1000-51100-0000-028-1611', 7370],
    ]);
    b.contact = { first: 'Sample', middle: '', last: 'Person' };
    expect(barTotals(b).net).toBe(0);
    expect(canDownload(validateBar(b, { profile: P }))).toBe(true);
  });
  it('the spec Increase BAR balances: revenue 2350 = expenditure 800 + 900 + 650', () => {
    const b = bar('I', '21000', [
      ['21000-0000-41604-0000-000-0000', 2350],
      ['21000-3100-56116-0000-033-0000', 800],
      ['21000-3100-56116-0000-034-0000', 900],
      ['21000-3100-56116-0000-036-0000', 650],
    ]);
    const c = validateBar(b, { profile: P });
    expect(canDownload(c)).toBe(true);
    expect(barTotals(b)).toMatchObject({ revenue: 2350, expenditure: 2350 });
  });
});

describe('every line', () => {
  it('stops on a code that does not fit the school, a line in another fund, and a missing amount', () => {
    const b = bar('T', '11000', [
      [A, -5],
      [B, 5],
      ['24101-1000-51100-4010-028-1416', 0],
      ['11000-1000-51100-4010-0280-1416', 1],
    ]);
    b.lines[3].amount = NaN;
    const t = msgs(validateBar(b, { profile: P }), 'stop');
    for (const part of ['does not match the account code layout', 'is in fund 24101', 'has no amount'])
      expect(t).toContain(part);
  });
  it('stops on more than 2 decimals, warns on zero amounts and duplicates', () => {
    const c = validateBar(
      bar('T', '11000', [
        [A, -1.005],
        [B, 1.005],
        [B, 0],
      ]),
      { profile: P },
    );
    expect(msgs(c, 'stop')).toContain('at most 2 decimals');
    expect(msgs(c, 'warn')).toContain('zero amount');
    expect(msgs(c, 'warn')).toContain('more than once');
  });
  it('stops when the location rule cannot give 3 digits', () => {
    const c = validateBar(
      bar('T', '11000', [
        [A, -1],
        [B, 1],
      ]),
      {
        profile: school({
          locationRule: { type: 'lastN', n: 3 },
          segments: [
            seg('fund', 5),
            seg('func', 4),
            seg('obj', 5),
            seg('prog', 4),
            seg('loc', 3),
            seg('job', 4),
          ],
        }),
      },
    );
    expect(canDownload(c)).toBe(true); // 028 -> 028 still works with last 3
    const p2 = school({ locationRule: { type: 'lastN', n: 2 } });
    expect(
      msgs(
        validateBar(
          bar('T', '11000', [
            [A, -1],
            [B, 1],
          ]),
          { profile: p2 },
        ),
        'stop',
      ),
    ).toContain('3-digit upload location');
  });
});

describe('balance by type', () => {
  it('Transfer and Maintenance must net to zero and carry no revenue', () => {
    expect(
      msgs(
        validateBar(
          bar('T', '11000', [
            [A, -10],
            [B, 9],
          ]),
          { profile: P },
        ),
        'stop',
      ),
    ).toContain('does not balance');
    expect(
      msgs(
        validateBar(
          bar('T', '11000', [
            [A, -10],
            [B, 10],
            ['11000-0000-41000-0000-000-0000', 5],
          ]),
          { profile: P },
        ),
        'stop',
      ),
    ).toContain('expenditure budget only');
  });
  it('Maintenance may span functions of one series but warns across series', () => {
    const ok = validateBar(
      bar('M', '11000', [
        [A, -10],
        ['11000-1100-51100-4010-028-1416', 10],
      ]),
      { profile: P },
    );
    expect(msgs(ok, 'stop')).not.toContain('Maintenance');
    expect(msgs(ok, 'warn')).not.toContain('Maintenance BAR moves money between');
    const x = validateBar(
      bar('M', '11000', [
        [A, -10],
        ['11000-2100-51100-4010-028-1416', 10],
      ]),
      { profile: P },
    );
    expect(msgs(x, 'warn')).toContain('between function series');
  });
  it('Increase needs revenue equal to expenditure, with the right sign', () => {
    const rev = '21000-0000-41604-0000-000-0000',
      ex = '21000-3100-56116-0000-033-0000';
    expect(
      msgs(
        validateBar(
          bar('I', '21000', [
            [rev, 100],
            [ex, 90],
          ]),
          { profile: P },
        ),
        'stop',
      ),
    ).toContain('must equal');
    expect(msgs(validateBar(bar('I', '21000', [[ex, 100]]), { profile: P }), 'stop')).toContain(
      'need the revenue line',
    );
    expect(
      msgs(
        validateBar(
          bar('D', '21000', [
            [rev, 100],
            [ex, 100],
          ]),
          { profile: P },
        ),
        'warn',
      ),
    ).toContain('negative amounts');
    expect(
      canDownload(
        validateBar(
          bar('D', '21000', [
            [rev, -100],
            [ex, -100],
          ]),
          { profile: P },
        ),
      ),
    ).toBe(true);
  });
  it('warns when a revenue line is not function, program and job class 0000', () => {
    const c = validateBar(
      bar('I', '21000', [
        ['21000-3100-41604-0000-000-0000', 5],
        ['21000-3100-56116-0000-033-0000', 5],
      ]),
      { profile: P },
    );
    expect(msgs(c, 'warn')).toContain('function 0000');
  });
});

describe('never over budget', () => {
  const asr = makeAsr({
    1000: [
      ['51100', 1000, 600, 0],
      ['52100', 500, 400, 0],
    ], // 400 and 100 available
    2100: [['51100', 300, 0, 0]], // 300 available
    3000: [
      ['51100', 1000, 600, 0],
      ['52100', 100, 400, 0],
    ], // 400 and -300 available: the function has only 100
  });
  const code = (fn, obj) => `11000-${fn}-${obj}-0000-001707-1411`;
  const P6 = newProfile({ id: 'six', name: 'Six', districtCode: '1', locationRule: { type: 'lastN', n: 3 } });
  const mk = (lines) => {
    const b = newBar('T', '11000');
    b.lines = lines.map(([c, a]) => barLine(P6, c, a));
    b.justification = 'x';
    return b;
  };
  it('stops when a line would go below zero available', () => {
    const c = validateBar(
      mk([
        [code('1000', '52100'), -150],
        [code('2100', '51100'), 150],
      ]),
      { profile: P6, asr },
    );
    expect(msgs(c, 'stop')).toContain('over budget');
  });
  it('stops when a function would end below zero, even if the line itself has room', () => {
    const c = validateBar(
      mk([
        [code('3000', '51100'), -300],
        [code('2100', '51100'), 300],
      ]),
      { profile: P6, asr },
    );
    expect(msgs(c, 'stop')).toContain('Function 3000 would end');
    expect(msgs(c, 'stop')).not.toContain(`${code('3000', '51100')}: taking`);
  });
  it('allows taking exactly what is available', () => {
    const c = validateBar(
      mk([
        [code('1000', '51100'), -400],
        [code('2100', '51100'), 400],
      ]),
      { profile: P6, asr },
    );
    expect(canDownload(c)).toBe(true);
  });
  it('warns, and does not guess, when a line is not in the Account Summary', () => {
    const c = validateBar(
      mk([
        [code('1000', '59999'), -1],
        [code('2100', '51100'), 1],
      ]),
      { profile: P6, asr },
    );
    expect(msgs(c, 'warn')).toContain('could not be checked');
  });
});

describe('flowthrough fields, justification and contact', () => {
  const ftSchool = school({
    funds: [
      { code: '24101', name: 'Title I', flowthrough: true },
      { code: '11000', name: 'Op', flowthrough: false },
    ],
  });
  const t = (extra) =>
    bar(
      'T',
      '24101',
      [
        ['24101-1000-51100-4010-028-1416', -5],
        ['24101-1000-52100-4010-028-0000', 5],
      ],
      extra,
    );
  it('a flowthrough fund needs scope, dates and amounts, none negative', () => {
    const c = validateBar(t(), { profile: ftSchool });
    for (const part of ['change scope', 'from date', 'to date', 'carryover amount'])
      expect(msgs(c, 'stop')).toContain(part);
    const ok = t({
      flowthrough: {
        scope: 'N',
        from: '07/01/2026',
        to: '06/30/2027',
        carryover: '100',
        allocation: '$1,000',
        total: '1100',
      },
    });
    expect(canDownload(validateBar(ok, { profile: ftSchool }))).toBe(true);
    ok.flowthrough.allocation = '-5';
    expect(msgs(validateBar(ok, { profile: ftSchool }), 'stop')).toContain('cannot be negative');
    ok.flowthrough.allocation = '900';
    expect(msgs(validateBar(ok, { profile: ftSchool }), 'warn')).toContain('does not equal');
  });
  it('warns when flowthrough fields are filled for a fund that is not flowthrough', () => {
    const b = bar(
      'T',
      '11000',
      [
        [A, -5],
        [B, 5],
      ],
      { flowthrough: { scope: 'Y', from: '', to: '', carryover: '', allocation: '', total: '' } },
    );
    expect(msgs(validateBar(b, { profile: ftSchool }), 'warn')).toContain('not marked flowthrough');
  });
  it('checks the justification against what the file allows', () => {
    const b = bar('T', '11000', [
      [A, -5],
      [B, 5],
    ]);
    b.justification = 'a'.repeat(256);
    expect(msgs(validateBar(b, { profile: P }), 'warn')).toContain('256 characters');
    b.justification = 'He said "yes" | then, no';
    const c = validateBar(b, { profile: P });
    for (const part of ['a double quote', 'a pipe', 'a comma']) expect(msgs(c, 'stop')).toContain(part);
    expect(canDownload(c)).toBe(false);
    b.justification = '';
    expect(msgs(validateBar(b, { profile: P }), 'warn')).toContain('No justification');
  });
  it('checks contact names and the district code', () => {
    const b = bar('T', '11000', [
      [A, -5],
      [B, 5],
    ]);
    b.contact = { first: 'X'.repeat(21), middle: '', last: 'R2D2' };
    const w = msgs(validateBar(b, { profile: P }), 'warn');
    expect(w).toContain('longer than 20');
    expect(w).toContain('letters only');
    expect(msgs(validateBar(b, { profile: school({ districtCode: '' }) }), 'stop')).toContain(
      'district/parent code',
    );
  });
});

describe('award cap on Increase BARs', () => {
  const inc = (award) =>
    bar(
      'I',
      '21000',
      [
        ['21000-0000-41604-0000-000-0000', 2350],
        ['21000-3100-56116-0000-033-0000', 2350],
      ],
      { award },
    );
  it('is optional: nothing is said when no award is typed', () => {
    expect(msgs(validateBar(inc(''), { profile: P }))).not.toContain('award');
  });
  it('is quiet when the lines match the award', () => {
    expect(msgs(validateBar(inc('$2,350'), { profile: P }))).not.toContain('award');
  });
  it('stops when the expenditure lines are more than the award', () => {
    const c = validateBar(inc('2000'), { profile: P });
    expect(msgs(c, 'stop')).toContain('more than the award');
    expect(canDownload(c)).toBe(false);
  });
  it('warns, and says how much is left, when less is assigned', () => {
    const c = validateBar(inc('3000'), { profile: P });
    expect(msgs(c, 'warn')).toContain('650.00 is left');
    expect(canDownload(c)).toBe(true);
  });
});

describe('file-breaking input', () => {
  const t = (over = {}) =>
    Object.assign(
      bar('T', '11000', [
        [A, -5],
        [B, 5],
      ]),
      over,
    );
  it('stops a contact name with a comma', () => {
    const b = t({ contact: { first: 'Smith, Jr.', middle: '', last: 'X' } });
    expect(msgs(validateBar(b, { profile: P }), 'stop')).toContain('breaks the BAR file');
  });
  it('stops a BAR whose lines are all zero', () => {
    const b = t();
    b.lines.forEach((l) => (l.amount = 0));
    expect(msgs(validateBar(b, { profile: P }), 'stop')).toContain('zero amount');
  });
  it('stops an award that is not a number', () => {
    const b = bar(
      'I',
      '21000',
      [
        ['21000-0000-41604-0000-000-0000', 100],
        ['21000-3100-56116-0000-033-0000', 100],
      ],
      { award: '5k' },
    );
    expect(msgs(validateBar(b, { profile: P }), 'stop')).toContain('not a number');
  });
  it('checks a repeated code on its net change', () => {
    const asr = makeAsr({
      1000: [
        ['51100', 1000, 0, 0],
        ['56118', 1000, 0, 0],
      ],
    });
    const six = newProfile({
      id: 'six',
      name: 'Six',
      districtCode: '1',
      locationRule: { type: 'lastN', n: 3 },
    });
    const a = '11000-1000-51100-0000-001707-1411',
      o = '11000-1000-56118-0000-001707-1411';
    const b = newBar('T', '11000');
    b.lines = [
      [a, -800],
      [a, -800],
      [o, 1600],
    ].map(([c, x]) => barLine(six, c, x));
    b.justification = 'x';
    expect(msgs(validateBar(b, { profile: six, asr }), 'stop')).toContain('over budget');
  });
});

describe('PED location IDs', () => {
  const sch = school({ locationIds: ['028'] });
  const mk = (p) => {
    const b = newBar('T', '11000');
    b.lines = [
      ['11000-1000-51100-4010-028-1416', -5],
      ['11000-1000-56118-2000-029-0000', 5],
    ].map(([c, a]) => barLine(p, c, a));
    b.justification = 'x';
    return b;
  };
  it('warns about a line at another location, never stops', () => {
    const c = validateBar(mk(sch), { profile: sch });
    expect(msgs(c, 'warn')).toContain('location 029 is not one of');
    expect(msgs(c, 'stop')).not.toContain('location 029');
  });
  it('says nothing when the school lists no location IDs', () => {
    expect(msgs(validateBar(mk(P), { profile: P }))).not.toContain('PED location');
  });
});

describe('salary lines without an FTE (OBMS: "Missing projected FTE")', () => {
  const salary = (fte) => {
    const b = newBar('T', '11000');
    b.lines = [
      ['11000-1000-56113-0000-001-0000', -1000, 0],
      ['11000-2100-51100-0000-001-1211', 600, fte],
      ['11000-2100-51300-0000-001-1214', 400, 0],
    ].map(([c, a, f]) => barLine(P, c, a, f));
    b.justification = 'x';
    return b;
  };
  it('warns about a 51100 line with no FTE, not about 51300 lines', () => {
    const c = validateBar(salary(0), { profile: P });
    expect(msgs(c, 'warn')).toContain('1 salary line has no FTE (11000-2100-51100-0000-001-1211)');
    expect(msgs(c, 'warn')).toContain('Missing projected FTE');
    expect(msgs(c, 'warn')).not.toContain('51300');
    expect(canDownload(c)).toBe(true);
  });
  it('is quiet once the line has an FTE', () => {
    expect(msgs(validateBar(salary(0.0123), { profile: P }), 'warn')).not.toContain('no FTE');
  });
  it("follows the school profile's salary objects", () => {
    const none = school({ fteObjects: [] });
    expect(msgs(validateBar(salary(0), { profile: none }), 'warn')).not.toContain('no FTE');
  });
});

describe('Transfer between functions of the same series (OBMS: "Same Func Xfer")', () => {
  const tr = (lines) => {
    const b = newBar('T', '11000');
    b.lines = lines.map(([c, a]) => barLine(P, c, a));
    b.justification = 'x';
    return b;
  };
  it('stops 2500 to 2100 and names the pair', () => {
    const c = validateBar(
      tr([
        ['11000-2500-57331-0000-001-0000', -1000],
        ['11000-2100-55915-0000-001-0000', 1000],
      ]),
      { profile: P },
    );
    expect(msgs(c, 'stop')).toContain('2500 to 2100');
    expect(canDownload(c)).toBe(false);
  });
  it('stops in another fund too (Title I 24101, 2100 to 2400)', () => {
    const b = newBar('T', '24101');
    b.lines = [
      ['24101-2100-56118-0000-001-0000', -1000],
      ['24101-2400-56118-0000-001-0000', 1000],
    ].map(([c, a]) => barLine(P, c, a));
    b.justification = 'x';
    const c = validateBar(b, { profile: P });
    expect(msgs(c, 'stop')).toContain('2100 to 2400');
    b.type = 'M';
    expect(canDownload(validateBar(b, { profile: P }))).toBe(true);
  });
  it('only warns outside the 2000 series', () => {
    const c = validateBar(
      tr([
        ['11000-3300-57331-0000-001-0000', -1000],
        ['11000-3100-55915-0000-001-0000', 1000],
      ]),
      { profile: P },
    );
    expect(msgs(c, 'warn')).toContain('3300 to 3100');
    expect(canDownload(c)).toBe(true);
  });
  it('accepts the same move as a Maintenance BAR', () => {
    const b = newBar('M', '11000');
    b.lines = [
      ['11000-2500-57331-0000-001-0000', -1000],
      ['11000-2100-55915-0000-001-0000', 1000],
    ].map(([c, a]) => barLine(P, c, a));
    b.justification = 'x';
    expect(canDownload(validateBar(b, { profile: P }))).toBe(true);
  });
  it('is quiet when the functions are in different series', () => {
    const c = validateBar(
      tr([
        ['11000-2500-57331-0000-001-0000', -1000],
        ['11000-1000-56118-0000-001-0000', 1000],
      ]),
      { profile: P },
    );
    expect(msgs(c, 'warn')).not.toContain('Same Func Xfer');
  });
});

describe('an approved OBMS Transfer (Gilbert, FY2025-26, document 001-707-2526-0033-T)', () => {
  const six = newProfile({
    id: 'six',
    name: 'Six',
    districtCode: '001',
    locationRule: { type: 'lastN', n: 3 },
  });
  it('moves money from function 2100 to 3100 and passes every check with no series warning', () => {
    const b = newBar('T', '11000');
    b.lines = [
      ['11000-2100-55915-0000-001707-0000', -6700],
      ['11000-3100-55915-0000-001707-0000', 5900],
      ['11000-3100-56116-0000-001707-0000', 800],
    ].map(([c, a]) => barLine(six, c, a));
    b.justification =
      'The transfer is needed to ensure the function is not over budget by any of its functions';
    b.contact = { first: 'Pat', middle: '', last: 'Example' };
    const c = validateBar(b, { profile: six });
    expect(canDownload(c)).toBe(true);
    expect(msgs(c, 'warn')).not.toContain('Same Func Xfer');
    expect(barTotals(b).net).toBe(0);
  });
});
