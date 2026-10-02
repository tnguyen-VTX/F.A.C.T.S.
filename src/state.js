import * as XLSX from 'xlsx';

import {
  SHEETS,
  metaField,
  parseASR,
  parseCR,
  parseCap,
  parseFA,
  parseRfR,
  rowsOf,
  sheetKey,
} from './lib/parse.js';

export const D = { loaded: false };
export const UI = {
  view: 'budget',
  openFunds: new Set(),
  overOnly: false,
  tx: { f: {}, group: 'name', sort: 'enc', dir: -1, open: new Set() },
  je: { job: '', q: '' },
  bar: { fund: '', amount: 0, basis: 'enc', mode: 'Increase', obj: '', absorb: true, skipZero: true },
  cr: { open: new Set(), q: '' },
};
export const STORE_KEY = 'facts.v1';
export let STORE = {};
try {
  STORE = JSON.parse(localStorage.getItem(STORE_KEY)) || {};
} catch (e) {
  STORE = {};
}
export function S() {
  const k = D.cycle || 'default';
  STORE[k] ??= {};
  STORE[k].je ??= [];
  STORE[k].bar ??= {};
  return STORE[k];
}
export function saveStore() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(STORE));
  } catch (e) {}
}

export function loadBuffer(buf, name) {
  const data = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let wb = XLSX.read(data, { type: 'array', sheets: SHEETS });
  if (!sheetKey(wb, 'Account Summary Report') && !sheetKey(wb, 'Fund Audit Report'))
    wb = XLSX.read(data, { type: 'array' });
  const asrRows = rowsOf(wb, 'Account Summary Report');
  const asr = parseASR(asrRows),
    fa = parseFA(rowsOf(wb, 'Fund Audit Report'));
  if (!asr.funds.size && !fa.length)
    throw new Error(
      'This file has neither an "Account Summary Report" nor a "Fund Audit Report" sheet with the expected columns. Check that it is the FACTS workbook.',
    );
  Object.assign(D, {
    asr,
    fa,
    rfr: parseRfR(rowsOf(wb, 'RfR Summary Report')),
    cr: parseCR(rowsOf(wb, 'Cash Receipts Journal Report')),
    cap: parseCap(rowsOf(wb, 'Capital Outlay Projects')),
    missing: SHEETS.filter((s) => !sheetKey(wb, s)),
    fileName: name || 'workbook.xlsx',
    school: asr.school,
    cycle: metaField(asr.meta, 'Cycle') || 'FY',
    asOf: metaField(asr.meta, 'Created On'),
    begin: metaField(asr.meta, 'Begin Date'),
    loaded: true,
  });
  D.fundNames = {};
  for (const f of asr.funds.values()) if (f.name) D.fundNames[f.code] = f.name;
  for (const r of D.rfr) if (!D.fundNames[r.fund] && r.fundName) D.fundNames[r.fund] = r.fundName;
  UI.bar.fund = '';
  UI.openFunds.clear();
}
export const fundLabel = (c) => `${c}${D.fundNames[c] ? ' ' + D.fundNames[c] : ''}`;
export const funcLabel = (c) => `${c}${D.asr.funcNames[c] ? ' ' + D.asr.funcNames[c] : ''}`;
