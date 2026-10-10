import { describe, it, expect } from 'vitest';
import { barLine, newBar, validateBar } from '../src/lib/bar.js';
import { dollarsText, plain, suggestJustification } from '../src/lib/justify.js';
import { newProfile } from '../src/lib/profile.js';

const seg = (key, len) => ({ key, len });
const P = newProfile({
  id: 'x',
  name: 'X',
  districtCode: '1',
  segments: [seg('fund', 5), seg('func', 4), seg('obj', 5), seg('prog', 4), seg('loc', 3), seg('job', 4)],
  locationRule: { type: 'full' },
});
const mk = (type, fund, lines) => {
  const b = newBar(type, fund);
  b.lines = lines.map(([c, a]) => barLine(P, c, a));
  return b;
};
const NAMES = {
  1000: 'Instruction',
  2600: 'Operation & Maintenance of Plant',
  2100: 'Support Services, Students',
};

describe('suggested justification', () => {
  it('words a transfer from the functions it moves money between', () => {
    const b = mk('T', '11000', [
      ['11000-2600-51100-0000-001-0000', -256945],
      ['11000-1000-51100-0000-001-0000', 256945],
    ]);
    const t = suggestJustification(b, { funcNames: NAMES });
    expect(t).toBe(
      'Transfer of $256945 from Operation and Maintenance of Plant (2600) to Instruction (1000) to ensure no function is over budget.',
    );
  });
  it('never contains a double quote, pipe or comma, and stays within 255 characters', () => {
    const lines = [['11000-2100-51100-0000-001-0000', -3]];
    for (let f = 3000; f < 3030; f++) lines.push([`11000-${f}-51100-0000-001-0000`, -1]);
    lines.push(['11000-1000-51100-0000-001-0000', 33]);
    const b = mk('T', '11000', lines);
    const t = suggestJustification(b, {
      funcNames: Object.fromEntries(lines.map((l) => [l[0].slice(6, 10), 'A Very, Long "Quoted" | Name'])),
    });
    expect(t.length).toBeLessThanOrEqual(255);
    expect(t).not.toMatch(/["|,]/);
    b.justification = t;
    expect(validateBar(b, { profile: P }).filter((c) => /justification/i.test(c.msg))).toEqual([]);
  });
  it('words a Maintenance, Increase and Decrease BAR', () => {
    const m = mk('M', '11000', [
      ['11000-1000-51100-4010-028-1416', -50],
      ['11000-1000-52100-4010-028-1416', 50],
    ]);
    expect(suggestJustification(m, { funcNames: NAMES })).toBe(
      'Maintenance transfer of $50 within Instruction (1000) to align the budget with actual expenditures.',
    );
    const inc = mk('I', '21000', [
      ['21000-0000-41604-0000-000-0000', 2350],
      ['21000-3100-56116-0000-033-0000', 2350],
    ]);
    expect(suggestJustification(inc, { fundNames: { 21000: 'Title II' } })).toBe(
      'Increase of $2350 in fund 21000 (Title II) to budget the award received.',
    );
    const dec = mk('D', '21000', [
      ['21000-0000-41604-0000-000-0000', -100],
      ['21000-3100-56116-0000-033-0000', -100],
    ]);
    expect(suggestJustification(dec)).toBe(
      'Decrease of $100 in fund 21000 to reduce the budget to the award.',
    );
  });
  it('gives nothing until the BAR has the lines it needs', () => {
    expect(suggestJustification(mk('T', '11000', []))).toBe('');
    expect(suggestJustification(mk('I', '21000', [['21000-3100-56116-0000-033-0000', 5]]))).toBe('');
  });
  it('cleans text and formats dollars without separators', () => {
    expect(plain('A & B, "C" | D')).toBe('A and B C D');
    expect(dollarsText(1234567.5)).toBe('$1234567.50');
    expect(dollarsText(12)).toBe('$12');
  });
});
