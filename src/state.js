import * as XLSX from 'xlsx';

import { currentFiscalYear } from './lib/importReport.js';
import { clearRetiredKeys, migrate, moveLegacyKeys } from './lib/migrate.js';
import { activeProfile, loadProfiles, setActive } from './lib/profileStore.js';
import { checkFundAudit, fiscalYearOf } from './lib/reportCheck.js';
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
  sc: null,
  imp: { asr: null, fa: null, wb: null },
  bb: null,
};
export const storage =
  typeof localStorage !== 'undefined' ? localStorage : { getItem: () => null, setItem: () => {} };
// Names start with barbuilder so other tools on the same site cannot clash with them.
// Data saved under the earlier facts.* names is moved over once.
moveLegacyKeys(typeof localStorage !== 'undefined' ? localStorage : null);
clearRetiredKeys(
  typeof localStorage !== 'undefined' ? localStorage : null,
  typeof sessionStorage !== 'undefined' ? sessionStorage : null,
);
export const STORE_KEY = 'barbuilder.v1';
export let STORE = {};
// Data saved by a newer version of FACTS is shown but never overwritten.
export const STORAGE = migrate(storage, STORE_KEY);
try {
  STORE = JSON.parse(storage.getItem(STORE_KEY)) || {};
} catch (e) {
  STORE = {};
}

// School profiles (see lib/profile.js). One is active at a time.
export const PF = loadProfiles(storage);
export const profile = () => activeProfile(PF);
export function switchSchool(id) {
  if (!setActive(storage, PF, id)) return false;
  // Nothing from the previous school may stay behind.
  Object.assign(D, {
    loaded: false,
    school: '',
    cycle: '',
    asr: null,
    fa: null,
    rfr: null,
    cr: null,
    cap: null,
  });
  UI.openFunds.clear();
  UI.bar.fund = '';
  REP.asr = REP.fa = null;
  UI.imp = { asr: null, fa: null, wb: null };
  UI.bb = null;
  return true;
}

// User-entered data is kept per school and fiscal year, so one school's entries never
// appear under another. Data saved by v0.1 (keyed by year alone) belongs to Gilbert.
export function S() {
  // Fiscal year as FY2027 whether the report says "FY26-27" or "FY2027".
  const fy = fiscalYearOf(D.cycle);
  const cyc = fy ? `FY${fy}` : D.cycle || 'default';
  const k = `${PF.active}/${cyc}`;
  if (!STORE[k]) {
    const old = [
      `${PF.active}/${D.cycle}`,
      ...(PF.active === 'gilbert-l-sena' ? [D.cycle || 'default', cyc] : []),
    ];
    const from = old.find((o) => o !== k && STORE[o]);
    if (from) {
      STORE[k] = STORE[from];
      delete STORE[from];
    }
  }
  STORE[k] ??= {};
  STORE[k].je ??= [];
  STORE[k].bar ??= {};
  return STORE[k];
}
export function saveStore() {
  if (STORAGE.newer || STORAGE.unreadable) return;
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(STORE));
  } catch (e) {}
}

// Fiscal year being worked on (remembered in this browser).
const FY_KEY = 'barbuilder.fy';
export const FY = { value: currentFiscalYear() };
try {
  const v = parseInt(storage.getItem(FY_KEY), 10);
  if (v >= 2020 && v <= 2100) FY.value = v;
} catch (e) {}
export function setFiscalYear(y) {
  FY.value = y;
  try {
    storage.setItem(FY_KEY, String(y));
  } catch (e) {}
}

// Reports dropped one at a time. REP holds what was accepted: file name, when, parameters, checks.
export const REP = { asr: null, fa: null };
const emptyASR = () => ({
  funds: new Map(),
  funcNames: {},
  meta: '',
  school: '',
  grand: null,
  headerOk: true,
});

// Accept a read report (from lib/importReport.js) and rebuild D for the screens.
export function acceptReport(result, at = Date.now()) {
  const fy = FY.value;
  REP[result.kind] = {
    name: result.name,
    at,
    params: result.params || null,
    checks: result.checks,
    fy,
  };
  if (result.kind === 'asr') {
    D.asr = result.asr;
    // A Fund Audit loaded earlier is checked again against this Account Summary.
    if (REP.fa && D.fa?.length)
      REP.fa.checks = checkFundAudit(D.fa, { profile: profile(), fiscalYear: fy, asr: D.asr });
  } else D.fa = result.fa;
  D.asr ??= emptyASR();
  D.fa ??= [];
  const p = REP.asr?.params;
  Object.assign(D, {
    rfr: D.rfr ?? [],
    cr: D.cr ?? [],
    cap: D.cap ?? [],
    missing: ['RfR Summary Report', 'Cash Receipts Journal Report', 'Capital Outlay Projects'],
    fileName: [REP.asr?.name, REP.fa?.name].filter(Boolean).join(' + '),
    school: D.asr.school || profile().name,
    cycle: p?.cycle || `FY${fy}`,
    asOf: p?.createdOn || '',
    begin: p?.begin || '',
    profileId: profile().id,
    loaded: true,
  });
  D.fundNames = {};
  for (const f of D.asr.funds.values()) if (f.name) D.fundNames[f.code] = f.name;
  UI.bar.fund = '';
  UI.openFunds.clear();
}

export function loadBuffer(buf, name) {
  const data = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let wb = XLSX.read(data, { type: 'array', sheets: SHEETS });
  if (!sheetKey(wb, 'Account Summary Report') && !sheetKey(wb, 'Fund Audit Report'))
    wb = XLSX.read(data, { type: 'array' });
  const asrRows = rowsOf(wb, 'Account Summary Report');
  const pf = profile();
  const asr = parseASR(asrRows, pf),
    fa = parseFA(rowsOf(wb, 'Fund Audit Report'), pf);
  if (!asr.funds.size && !fa.length)
    throw new Error(
      'This file has neither an "Account Summary Report" nor a "Fund Audit Report" sheet with the expected columns. Check that it is the FACTS workbook.',
    );
  Object.assign(D, {
    asr,
    fa,
    rfr: parseRfR(rowsOf(wb, 'RfR Summary Report')),
    cr: parseCR(rowsOf(wb, 'Cash Receipts Journal Report'), pf),
    profileId: pf.id,
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
export const fundLabel = (c) => {
  const n = D.fundNames?.[c] || profile().funds?.find((f) => f.code === c)?.name;
  return `${c}${n ? ' ' + n : ''}`;
};
export const funcLabel = (c) => `${c}${D.asr?.funcNames?.[c] ? ' ' + D.asr.funcNames[c] : ''}`;
