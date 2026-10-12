// Reads one dropped report (.xlsx or .csv) for a school and fiscal year and runs the checks.
// Pure: returns what was read and what the checks found; it changes no app state.
import * as XLSX from 'xlsx';
import { parseCSV } from './csv.js';
import { parseASR, parseFA, sheetKey } from './parse.js';
import { checkAccountSummary, checkFundAudit, reportParams } from './reportCheck.js';

export const isExcel = (name) => /\.xlsx?m?$/i.test(String(name || ''));

// Rows of the report: the named sheet (or the first) of a workbook, or the records of a CSV.
export function rowsFromFile(name, bytes, sheetName) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (isExcel(name)) {
    const wb = XLSX.read(data, { type: 'array' });
    const k = (sheetName && sheetKey(wb, sheetName)) || wb.SheetNames[0];
    if (!k) return [];
    return XLSX.utils.sheet_to_json(wb.Sheets[k], { header: 1, raw: true, defval: null, blankrows: false });
  }
  return parseCSV(new TextDecoder('utf-8').decode(data));
}

export function readAccountSummary(name, bytes, { profile, fiscalYear }) {
  const asr = parseASR(rowsFromFile(name, bytes, 'Account Summary Report'), profile);
  return {
    kind: 'asr',
    name,
    asr,
    params: reportParams(asr.meta),
    checks: checkAccountSummary(asr, { profile, fiscalYear }),
  };
}

// asr: the Account Summary already loaded for this school, if any (used for the tie-out).
export function readFundAudit(name, bytes, { profile, fiscalYear, asr }) {
  const fa = parseFA(rowsFromFile(name, bytes, 'Fund Audit Report'), profile);
  return { kind: 'fa', name, fa, checks: checkFundAudit(fa, { profile, fiscalYear, asr }) };
}

// Fiscal year in progress on a date: July 1 starts the next year's cycle (7/1/2026 is FY2027).
export const currentFiscalYear = (d = new Date()) => d.getFullYear() + (d.getMonth() >= 6 ? 1 : 0);
