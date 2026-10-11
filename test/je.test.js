import { describe, it, expect } from 'vitest';
import { barJE, bankCode, changeCode, checkJE, jeTotals, lastDayOfMonth, reclassJE } from '../src/lib/je.js';
import { gilbertPreset } from '../src/lib/profile.js';

const P = gilbertPreset();
const OLD = '27901-1000-52315-0000-001707-1214';

describe('month-end dates', () => {
  it('finds the last day, including leap years and year end', () => {
    expect(lastDayOfMonth('2026-08-03')).toBe('2026-08-31');
    expect(lastDayOfMonth('2026-09-15')).toBe('2026-09-30');
    expect(lastDayOfMonth('2028-02-10')).toBe('2028-02-29');
    expect(lastDayOfMonth('2027-02-01')).toBe('2027-02-28');
    expect(lastDayOfMonth('2026-12-31')).toBe('2026-12-31');
  });
});

describe('changing parts of an account code', () => {
  it('changes only what is named', () => {
    expect(changeCode(P, OLD, { fund: '11000', func: '2100' }).code).toBe(
      '11000-2100-52315-0000-001707-1214',
    );
    expect(changeCode(P, OLD, { obj: '52316' }).code).toBe('27901-1000-52316-0000-001707-1214');
    expect(changeCode(P, OLD, { prog: '1010', job: '1411' }).code).toBe('27901-1000-52315-1010-001707-1411');
    expect(changeCode(P, OLD, {}).code).toBe(OLD);
  });
  it('refuses a bad segment or a code that does not fit', () => {
    expect(changeCode(P, OLD, { obj: '523' }).error).toContain('5 digits');
    expect(changeCode(P, '123', { obj: '52316' }).error).toContain('layout');
  });
});

describe('bank account code', () => {
  it('is built from the layout, or from the profile pattern or a per-fund override', () => {
    expect(bankCode(P, '11000')).toBe('11000-0000-11011-0000-000000-0000');
    expect(bankCode({ ...P, bankAccount: { pattern: '{fund}-0000-11012-0000-000000-0000' } }, '24101')).toBe(
      '24101-0000-11012-0000-000000-0000',
    );
    expect(bankCode({ ...P, bankAccount: { byFund: { 27901: 'X' } } }, '27901')).toBe('X');
  });
});

describe('a reclass between funds (the AptaFund example, 27901 to 11000)', () => {
  const je = reclassJE(
    [{ from: OLD, to: '11000-2100-52315-0000-001707-1214', amount: 3.55, date: '2026-08-03' }],
    { desc: (c) => (c.includes('11011') ? 'Bank Accounts' : 'Disability') },
    P,
  );
  it('has the four lines in AptaFund order', () => {
    expect(je.type).toBe('Actual');
    expect(je.date).toBe('2026-08-31');
    expect(je.comment).toBe('To reclass expenditures from 27901 to 11000');
    expect(je.lines.map((l) => [l.seq, l.code, l.debit, l.credit])).toEqual([
      [1, OLD, 0, 3.55],
      [2, '11000-2100-52315-0000-001707-1214', 3.55, 0],
      [3, '27901-0000-11011-0000-000000-0000', 3.55, 0],
      [4, '11000-0000-11011-0000-000000-0000', 0, 3.55],
    ]);
  });
  it('balances overall and in each fund', () => {
    const t = jeTotals(je);
    expect([t.debit, t.credit]).toEqual([7.1, 7.1]);
    expect(t.byFund.get('27901')).toEqual({ debit: 3.55, credit: 3.55 });
    expect(checkJE(je)).toEqual([]);
  });
});

describe('a reclass inside one fund', () => {
  it('needs no bank lines', () => {
    const je = reclassJE(
      [
        {
          from: '11000-1000-52315-0000-001707-1214',
          to: '11000-2600-52315-0000-001707-1214',
          amount: 100,
          date: '2026-09-15',
        },
      ],
      {},
      P,
    );
    expect(je.lines).toHaveLength(2);
    expect(je.comment).toBe('To reclass expenditures within 11000');
    expect(checkJE(je)).toEqual([]);
  });
});

describe('reclass checks', () => {
  it('stops charges from two months, and amounts that are not above zero', () => {
    const je = reclassJE(
      [
        { from: OLD, to: '11000-2100-52315-0000-001707-1214', amount: 5, date: '2026-08-03' },
        { from: OLD, to: '11000-2100-52315-0000-001707-1214', amount: 0, date: '2026-09-03' },
      ],
      {},
      P,
    );
    const msgs = checkJE(je)
      .map((c) => c.msg)
      .join(' | ');
    expect(msgs).toContain('one month only');
    expect(msgs).toContain('above zero');
  });
});

describe('the Budget JE for an approved BAR', () => {
  const lines = [
    ['24101-2100-51300-0000-001707-1214', -17800, 'Additional Compensation'],
    ['24101-2100-52111-0000-001707-1214', -3232, 'Educational Retirement'],
    ['24101-1000-51100-1010-001707-1411', 2073, 'Salaries Expense'],
    ['24101-1000-51300-1010-001707-1411', 18959, 'Additional Compensation'],
  ].map(([code, amount, desc]) => ({ code, amount, desc }));
  const je = barJE({
    docId: '001-707-2627-0006-T',
    fund: '24101',
    typeName: 'Transfer',
    date: '2026-10-07',
    lines,
  });
  it('makes decreases credits and increases debits, in order', () => {
    expect(je.type).toBe('Budget');
    expect(je.comment).toBe('BAR 001-707-2627-0006-T Fund 24101 Transfer');
    expect(je.lines.map((l) => [l.seq, l.debit, l.credit])).toEqual([
      [1, 0, 17800],
      [2, 0, 3232],
      [3, 2073, 0],
      [4, 18959, 0],
    ]);
    expect(jeTotals(je)).toMatchObject({ debit: 21032, credit: 21032 });
    expect(checkJE(je)).toEqual([]);
  });
  it('stops an unbalanced BAR', () => {
    const bad = barJE({
      docId: 'x',
      fund: '24101',
      typeName: 'Transfer',
      date: '2026-10-07',
      lines: lines.slice(0, 3),
    });
    expect(checkJE(bad)[0].msg).toContain('do not equal');
  });
});

import { newProfile, validateProfile } from '../src/lib/profile.js';
describe('the bank account setting on a profile', () => {
  const base = { ...newProfile({ id: 'x', name: 'X', districtCode: '1' }) };
  it('starts empty and passes', () => {
    expect(base.bankAccount).toEqual({ pattern: '', byFund: {} });
    expect(validateProfile(base)).toEqual([]);
  });
  it('wants {fund} and a code that fits the layout', () => {
    expect(
      validateProfile({
        ...base,
        bankAccount: { pattern: '11000-0000-11011-0000-000000-0000', byFund: {} },
      }).join(),
    ).toContain('{fund}');
    expect(
      validateProfile({ ...base, bankAccount: { pattern: '{fund}-0000', byFund: {} } }).join(),
    ).toContain('does not fit');
    expect(
      validateProfile({
        ...base,
        bankAccount: {
          pattern: '{fund}-0000-11011-0000-000000-0000',
          byFund: { 27901: '27901-0000-11011-0000-000000-0000' },
        },
      }),
    ).toEqual([]);
    expect(
      validateProfile({ ...base, bankAccount: { pattern: '', byFund: { 27901: 'nope' } } }).join(),
    ).toContain('fund 27901');
  });
});
