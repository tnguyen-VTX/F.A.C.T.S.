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
