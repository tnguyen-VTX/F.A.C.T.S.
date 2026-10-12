import { describe, it, expect } from 'vitest';
import {
  codePattern,
  gilbertPreset,
  isAccountCode,
  newProfile,
  splitWith,
  uploadLocation,
  validateProfile,
} from '../src/lib/profile.js';

// Made-up codes; shapes match the real schools' formats.
const SIX = '11000-1000-51100-1010-001707-1411';
const SEVEN = '11000-2600-57331-0000-512001-0000-00000';
const seven = () =>
  newProfile({
    id: 'seven-seg',
    name: 'Seven Segment School',
    districtCode: '512',
    segments: [
      { key: 'fund', len: 5, label: 'Fund' },
      { key: 'func', len: 4, label: 'Function' },
      { key: 'obj', len: 5, label: 'Object' },
      { key: 'prog', len: 4, label: 'Program' },
      { key: 'loc', len: 6, label: 'Location' },
      { key: 'job', len: 4, label: 'Job class' },
      { key: 'tail', len: 5, label: 'Unused' },
    ],
  });

describe('school profile', () => {
  it('the Gilbert preset is valid and reads 6-segment codes', () => {
    const g = gilbertPreset();
    expect(validateProfile(g)).toEqual([]);
    expect(isAccountCode(g, SIX)).toBe(true);
    expect(isAccountCode(g, SEVEN)).toBe(false);
    expect(splitWith(g, SIX)).toEqual({
      extra: [],
      fund: '11000',
      func: '1000',
      obj: '51100',
      prog: '1010',
      loc: '001707',
      job: '1411',
    });
  });
  it('a 7-segment profile reads its own codes and keeps the extra segment aside', () => {
    const p = seven();
    expect(validateProfile(p)).toEqual([]);
    expect(isAccountCode(p, SEVEN)).toBe(true);
    expect(isAccountCode(p, SIX)).toBe(false);
    expect(splitWith(p, SEVEN)).toMatchObject({
      fund: '11000',
      func: '2600',
      loc: '512001',
      extra: ['00000'],
    });
  });
  it('rejects text that is not an account code', () => {
    const g = gilbertPreset();
    for (const bad of ['', 'Grand Total', '11000-1000-51100-1010-001707', '1100-1000-51100-1010-001707-1411'])
      expect(splitWith(g, bad)).toBeNull();
  });
  it('builds a pattern from the segment lengths', () => {
    expect(codePattern(gilbertPreset()).source).toBe('^\\d{5}-\\d{4}-\\d{5}-\\d{4}-\\d{6}-\\d{4}$');
  });
  it('derives the 3-digit upload location from the location rule', () => {
    const g = gilbertPreset();
    expect(uploadLocation(g, '001707')).toBe('707');
    expect(uploadLocation(seven(), '512001')).toBe('001');
    const asIs = newProfile({ ...g, locationRule: { type: 'full' } });
    expect(uploadLocation(asIs, '028')).toBe('028');
    expect(uploadLocation(asIs, '001707')).toBe('');
    expect(uploadLocation(g, '')).toBe('');
  });
  it('explains what is wrong with a profile', () => {
    const bad = newProfile({
      id: 'Bad Id',
      name: ' ',
      districtCode: 'abc',
      funds: [{ code: '11000' }, { code: '11000' }, { code: '12' }],
      donorPriority: ['26'],
      locationRule: { type: 'lastN', n: 5 },
    });
    const errs = validateProfile(bad).join(' | ');
    for (const part of [
      'name',
      'lowercase',
      'district',
      'listed twice',
      '5 digits',
      '4-digit',
      'location rule keeps',
    ])
      expect(errs).toContain(part);
  });
  it('requires the standard segments in order and one location rule', () => {
    const p = newProfile({
      id: 'x',
      name: 'X',
      segments: [
        { key: 'obj', len: 5 },
        { key: 'fund', len: 5 },
      ],
    });
    const errs = validateProfile(p).join(' | ');
    expect(errs).toContain('needs a function segment');
    expect(errs).toContain('order');
    expect(
      validateProfile(newProfile({ id: 'x', name: 'X', locationRule: { type: 'other' } })).join(),
    ).toContain('location rule');
  });
});

describe('PED location IDs on a profile', () => {
  it('must be 3 digits', async () => {
    const { newProfile, validateProfile, gilbertPreset } = await import('../src/lib/profile.js');
    const p = { ...gilbertPreset(), locationIds: ['7'] };
    expect(validateProfile(p).join(' ')).toContain('3 digits');
    expect(validateProfile({ ...p, locationIds: ['707'] })).toEqual([]);
    expect(newProfile().locationIds).toEqual([]);
    expect(gilbertPreset()).toMatchObject({ districtCode: '001', locationIds: ['707'] });
  });
});
