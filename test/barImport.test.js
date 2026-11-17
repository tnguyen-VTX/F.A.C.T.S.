import { describe, it, expect } from 'vitest';
import { parseBarCsv, locationSegment } from '../src/lib/barImport.js';
import { barCsv } from '../src/lib/barCsv.js';
import { newProfile } from '../src/lib/profile.js';

const school = newProfile({
  id: 't', name: 'Test School', districtCode: '001', locationIds: ['707'],
  funds: [{ code: '24101', name: 'Title I' }, { code: '25184', name: 'IDEA B', flowthrough: true }],
});
const FILE = [
  'UBH,001,2027,24101,IB,Ann,,Lee,,,,,,,Initial budget of $2350 in fund 24101 to budget the award received.',
  'UBL,24101,0000,44000,0000,707,0000,2350,0',
  'UBL,24101,1000,51100,1010,707,1411,1400,1.5000',
  'UBL,24101,2100,52311,1010,707,1411,950,0',
  '',
].join('\r\n');

describe('opening an OBMS BAR upload file', () => {
  it('rebuilds the account codes and reproduces the file exactly', () => {
    const r = parseBarCsv(FILE, school, 2027);
    expect(r.errors).toEqual([]);
    expect(r.bar.type).toBe('IB');
    expect(r.bar.contact).toEqual({ first: 'Ann', middle: '', last: 'Lee' });
    expect(r.bar.lines.map((l) => l.code)).toEqual([
      '24101-0000-44000-0000-001707-0000',
      '24101-1000-51100-1010-001707-1411',
      '24101-2100-52311-1010-001707-1411',
    ]);
    expect(r.bar.lines[1].fte).toBe(1.5);
    expect(r.bar.lines[1].fteManual).toBe(true);
    expect(barCsv(r.bar, { profile: school, fiscalYear: 2027 })).toBe(FILE);
  });
  it('keeps what the user changes when it is built again', () => {
    const r = parseBarCsv(FILE, school, 2027);
    r.bar.lines[1].amount = 1500;
    r.bar.lines[2].amount = 850;
    const out = barCsv(r.bar, { profile: school, fiscalYear: 2027 });
    expect(out).toContain('UBL,24101,1000,51100,1010,707,1411,1500,1.5000');
    expect(out).toContain('UBL,24101,2100,52311,1010,707,1411,850,0');
  });
  it('keeps the flowthrough fields of a flowthrough fund', () => {
    const text = 'UBH,001,2027,25184,IB,Ann,,Lee,07/01/2026,06/30/2027,N,0,2350,2350,Award.\r\nUBL,25184,0000,44000,0000,707,0000,2350,0\r\nUBL,25184,1000,51100,1010,707,1411,2350,1.0000\r\n';
    const r = parseBarCsv(text, school, 2027);
    expect(r.bar.flowthrough).toEqual({ scope: 'N', from: '07/01/2026', to: '06/30/2027', carryover: '0', allocation: '2350', total: '2350' });
    expect(barCsv(r.bar, { profile: school, fiscalYear: 2027 })).toBe(text);
  });
  it('accepts lines padded to 15 fields (an Excel save) and a warning for another year', () => {
    const padded = FILE.replace(/(UBL,[^\r\n]*)/g, '$1,,,,,,');
    const r = parseBarCsv(padded, school, 2028);
    expect(r.errors).toEqual([]);
    expect(r.bar.lines.length).toBe(3);
    expect(r.warnings.join(' ')).toContain('2027');
  });
  it('refuses a file for another district, a non-OBMS file and a line that does not fit', () => {
    expect(parseBarCsv(FILE.replace('UBH,001', 'UBH,512'), school, 2027).errors.join(' ')).toContain('district 512');
    expect(parseBarCsv('a,b,c\n1,2,3', school, 2027).errors[0]).toContain('no UBH header');
    expect(parseBarCsv(FILE.replace('51100', '5110'), school, 2027).errors.join(' ')).toContain('does not fit');
  });
  it('builds a 6-digit location segment from district and location', () => {
    expect(locationSegment(school, '707')).toBe('001707');
    expect(locationSegment(school, '70')).toBe('');
  });
});
