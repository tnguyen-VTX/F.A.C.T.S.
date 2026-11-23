import { describe, it, expect } from 'vitest';
import { newProfile } from '../src/lib/profile.js';
import { defaultSettings, parseSegPaste, schoolLevelCheck, withDefaults } from '../src/lib/schoolLevel.js';

const profile = newProfile({ id: 't', name: 'T', districtCode: '001', locationIds: ['707'] });
const line = (prog, loc, actual, date = '2026-08-15', fund = '11000', obj = '51100') => ({
  fund,
  func: '1000',
  obj,
  prog,
  loc,
  job: '1411',
  actual,
  date,
});
const settings = (over = {}) => ({
  ...defaultSettings(profile),
  seg: [{ loc: '707', total: 1000000, sped: 200000, gifted: 0, atrisk: 40000 }],
  progs: { sped: ['2000'], gifted: ['2100'], atrisk: ['2700'] },
  ...over,
});
const run = (lines, s = settings()) => schoolLevelCheck(lines, { profile, fiscalYear: 2027, settings: s });
const msgs = (r) => r.checks.filter((c) => c.level === 'warn').map((c) => c.msg);

describe('school-level expenditures (PED 3.4)', () => {
  it('uses Q1 operational expenditures only', () => {
    const r = run([
      line('0000', '001707', 100),
      line('0000', '001707', 50, '2026-10-02'), // Q2
      line('0000', '001707', 70, '2026-08-01', '24101'), // another fund
      line('0000', '001707', 30, '2026-08-01', '11000', '41110'), // revenue
    ]);
    expect(r.total).toBe(100);
    expect(r.end).toBe('2026-09-30');
    expect(r.due).toBe('2026-11-30');
  });

  it('flags a charter above the program 0000 limit, and the limit is a setting', () => {
    const lines = [line('0000', '001707', 70), line('2000', '001707', 20), line('2700', '001707', 10)];
    let r = run(lines);
    expect(r.p0000.share).toBeCloseTo(70);
    expect(r.p0000.flag).toBe(true);
    expect(msgs(r).join(' ')).toContain('above the 60% limit');
    r = run(lines, settings({ p0000Max: 75 }));
    expect(r.p0000.flag).toBe(false);
    r = run(lines, settings({ charter: false }));
    expect(r.p0000.flag).toBe(false);
  });

  it('flags spending coded away from school sites and site shares far from the SEG shares', () => {
    const s = settings({
      seg: [
        { loc: '707', total: 500, sped: 0, gifted: 0, atrisk: 0 },
        { loc: '708', total: 500, sped: 0, gifted: 0, atrisk: 0 },
      ],
    });
    const r = run([line('1000', '001707', 80), line('1000', '001708', 20), line('1000', '001000', 25)], s);
    const w = msgs(r).join(' | ');
    expect(w).toContain('coded to location 000, not a school site');
    expect(w).toContain('Site 707 has 80.0% of site spending but 50.0% of the SEG');
    expect(w).toContain('Site 708 has 20.0%');
  });

  it('checks Special Ed, Gifted and At-Risk alignment', () => {
    const r = run([line('0000', '001707', 10), line('2100', '001707', 5)]);
    const w = msgs(r).join(' | ');
    expect(w).toContain(
      'Special Education: the 910B-5 shows $200,000 of SEG, but no spending is coded to program 2000',
    );
    expect(w).toContain('Gifted: $5 is coded to program 2100, but the 910B-5 shows no SEG for it');
    const sped = r.categories.find((c) => c.key === 'sped');
    expect(sped.expected).toBe(50000); // a quarter of the year's SEG by the end of Q1
  });

  it('notes when program codes are not set', () => {
    const r = run([line('0000', '001707', 10)], settings({ progs: {} }));
    expect(r.checks.filter((c) => c.level === 'info' && /no program codes/.test(c.msg))).toHaveLength(3);
  });

  it('reads 910B-5 rows pasted from a spreadsheet', () => {
    const rows = parseSegPaste(
      'Location\tTotal\tSped\tGifted\tAt-Risk\n707\t$1,234,567.00\t200,000\t0\t40,000\n',
    );
    expect(rows).toEqual([{ loc: '707', total: 1234567, sped: 200000, gifted: 0, atrisk: 40000 }]);
  });

  it('fills missing settings with defaults', () => {
    const s = withDefaults({ p0000Max: 50 }, profile);
    expect(s.p0000Max).toBe(50);
    expect(s.funds).toEqual(['11000']);
    expect(s.seg).toEqual([{ loc: '707', total: 0, sped: 0, gifted: 0, atrisk: 0 }]);
  });
});
