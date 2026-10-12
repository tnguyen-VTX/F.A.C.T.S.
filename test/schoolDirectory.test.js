import { describe, it, expect } from 'vitest';
import { addLocationId, entryToProfileFields, findSchools } from '../src/lib/schoolDirectory.js';

const dir = [
  { dn: 'TESTVILLE', dc: '001', dt: 'State District', ln: 'MADE UP HIGH', li: '707', st: 'OPEN' },
  { dn: 'EXAMPLE CHARTER', dc: '512', dt: 'State Charter', ln: 'EXAMPLE  CHARTER', li: '001', st: 'OPEN' },
  {
    dn: 'OLD TOWN',
    dc: '042',
    dt: 'State District',
    ln: 'MADE UP ELEMENTARY',
    li: '006',
    st: 'CHANGED AGENCY',
  },
  { dn: 'OTHER', dc: '017', dt: 'State District', ln: 'MADE UP ELEMENTARY', li: '019', st: 'OPEN' },
];
describe('school directory', () => {
  it('needs every typed word and ignores case and spacing', () => {
    expect(findSchools(dir, 'made up').map((e) => e.li)).toEqual(['019', '707', '006']);
    expect(findSchools(dir, 'example charter')).toHaveLength(1);
    expect(findSchools(dir, 'zzz')).toEqual([]);
    expect(findSchools(dir, '   ')).toEqual([]);
  });
  it('lists open locations before closed ones', () => {
    const r = findSchools(dir, 'elementary');
    expect(r.map((e) => e.st)).toEqual(['OPEN', 'CHANGED AGENCY']);
  });
  it('turns a row into profile fields', () => {
    expect(entryToProfileFields(dir[1])).toMatchObject({ districtCode: '512', locationId: '001' });
  });
  it('adds location IDs once, sorted', () => {
    expect(addLocationId(['707'], '001')).toEqual(['001', '707']);
    expect(addLocationId(['001'], '001')).toEqual(['001']);
  });
});
