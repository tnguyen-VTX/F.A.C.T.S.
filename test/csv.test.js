import { describe, it, expect } from 'vitest';
import { parseCSV } from '../src/lib/csv.js';
import { findColumns, findHeaderRow, missingColumnsMessage } from '../src/lib/columns.js';

describe('CSV reader', () => {
  it('reads plain records with CRLF or LF', () => {
    expect(parseCSV('a,b\r\n1,2\r\n3,4\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', '4'],
    ]);
    expect(parseCSV('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
  it('keeps line breaks, commas and doubled quotes inside quoted fields', () => {
    const t = 'Detail,Amt\r\n"J/E: first line\nsecond, with comma ""quoted""",5\r\nplain,6\r\n';
    expect(parseCSV(t)).toEqual([
      ['Detail', 'Amt'],
      ['J/E: first line\nsecond, with comma "quoted"', '5'],
      ['plain', '6'],
    ]);
  });
  it('strips a BOM and keeps empty fields', () => {
    expect(parseCSV('﻿a,b,c\r\n1,,3\r\n')).toEqual([
      ['a', 'b', 'c'],
      ['1', '', '3'],
    ]);
  });
  it('ignores blank lines but not a record that ends without a newline', () => {
    expect(parseCSV('a,b\r\n\r\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
});

describe('column finder', () => {
  const spec = {
    code: { names: ['Account Code'], required: true },
    date: { names: ['Trans. Date', 'Transaction Date'], required: true },
    src: { names: ['Src'], required: false },
  };
  it('finds columns by header, with aliases, ignoring case and punctuation', () => {
    const r = findColumns(['Fund', 'account code', 'Transaction  Date'], spec);
    expect(r.map).toEqual({ code: 1, date: 2 });
    expect(r.missing).toEqual([]);
  });
  it('reports missing required columns and lists what was found', () => {
    const r = findColumns(['Fund', 'Account Code'], spec);
    expect(r.missing).toEqual(['Trans. Date']);
    const m = missingColumnsMessage('Fund Audit', r.missing, r.found);
    expect(m).toContain('Trans. Date');
    expect(m).toContain('Fund, Account Code');
  });
  it('locates the header row below a title block', () => {
    const rows = [['School'], ['Report'], ['Account Code', 'Transaction Date']];
    expect(findHeaderRow(rows, spec)).toBe(2);
    expect(findHeaderRow([['x']], spec)).toBe(-1);
  });
});
