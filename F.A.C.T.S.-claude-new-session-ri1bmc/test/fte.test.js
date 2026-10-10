import { describe, it, expect } from 'vitest';
import { fteChange, fteText, isSalaryObject, suggestFte } from '../src/lib/fte.js';
import { newProfile, validateProfile } from '../src/lib/profile.js';

describe('FTE change', () => {
  it('moves in proportion to the dollars: 2,073 of a 51,825 salary is 0.0400 of a position', () => {
    expect(fteChange(2073, 51825, 1)).toBe(0.04);
    expect(fteText(fteChange(2073, 51825, 1))).toBe('0.0400');
  });
  it('scales with the line FTE and follows the sign of the dollars', () => {
    expect(fteChange(2073, 51825, 0.5)).toBe(0.02);
    expect(fteChange(-2073, 51825, 1)).toBe(-0.04);
  });
  it('rounds half away from zero at 4 decimals', () => {
    expect(fteChange(1, 20000, 1)).toBe(0.0001); // 0.00005
    expect(fteChange(-1, 20000, 1)).toBe(-0.0001);
  });
  it('gives 0 when there is nothing to base it on', () => {
    expect(fteChange(100, 0, 1)).toBe(0);
    expect(fteChange(100, 5000, 0)).toBe(0);
    expect(fteChange(NaN, 5000, 1)).toBe(0);
    expect(fteText(NaN)).toBe('0.0000');
  });
});

describe('salary lines', () => {
  it('uses salary objects (511 by default, or what the profile lists)', () => {
    expect(isSalaryObject('51100')).toBe(true);
    expect(isSalaryObject('52100')).toBe(false);
    expect(isSalaryObject('52100', ['511', '521'])).toBe(true);
  });
  it('fills FTE for salary lines only and leaves hand-entered values alone', () => {
    const lines = [
      { code: 'a', obj: '51100', amount: 2073 },
      { code: 'b', obj: '52100', amount: 500 },
      { code: 'c', obj: '51100', amount: 1000, fte: 0.5, fteManual: true },
      { code: 'd', obj: '51100', amount: 10 },
    ];
    const out = suggestFte(lines, (code) => (code === 'd' ? null : { salary: 51825, fte: 1 }));
    expect(out.map((l) => l.fte)).toEqual([0.04, undefined, 0.5, undefined]);
  });
  it('the school profile lists FTE objects and validates them', () => {
    expect(newProfile({}).fteObjects).toEqual(['511']);
    expect(validateProfile(newProfile({ id: 'x', name: 'X', fteObjects: ['5x'] })).join()).toContain(
      'FTE objects',
    );
  });
});
