import * as XLSX from 'xlsx';
import { T0, addT, num, serialToISO } from './format.js';
import { findColumns, findHeaderRow, missingColumnsMessage } from './columns.js';
import { parseCSV } from './csv.js';
import { gilbertPreset, looseSplit, splitWith } from './profile.js';

// Account codes are read through a school profile. Callers that pass none get the
// v0.1 default (Gilbert L. Sena, 6 segments), so existing behavior is unchanged.
const DEFAULT_PROFILE = gilbertPreset();

export const SHEETS = [
  'Account Summary Report',
  'Fund Audit Report',
  'RfR Summary Report',
  'Cash Receipts Journal Report',
  'Capital Outlay Projects',
];
export function sheetKey(wb, name) {
  return wb.SheetNames.find((n) => n.trim().toLowerCase() === name.toLowerCase());
}
export function rowsOf(wb, name) {
  const k = sheetKey(wb, name);
  if (!k || !wb.Sheets[k]) return null;
  return XLSX.utils.sheet_to_json(wb.Sheets[k], { header: 1, raw: true, defval: null, blankrows: false });
}
export function objectsFrom(rows, headerCell) {
  const hi = rows.findIndex((r) => r && r.some((v) => typeof v === 'string' && v.trim() === headerCell));
  if (hi < 0) return [];
  const h = rows[hi].map((v) => (v == null ? '' : String(v).trim()));
  return rows.slice(hi + 1).map((r) => {
    const o = {};
    h.forEach((k, i) => {
      if (k) o[k] = r ? r[i] : null;
    });
    return o;
  });
}
export const metaField = (meta, k) => {
  const m = String(meta).match(new RegExp(k + ':\\s*([^;]+)'));
  return m ? m[1].trim() : '';
};

export function parseASR(rows, profile = DEFAULT_PROFILE) {
  const out = { funds: new Map(), funcNames: {}, meta: '', school: '' };
  if (!rows) return out;
  out.school = (rows[0] || []).find((v) => typeof v === 'string') || '';
  const hi = rows.findIndex((r) => r && r[0] === 'Account Code');
  if (hi < 0) return out;
  out.meta =
    rows
      .slice(0, hi)
      .map((r) => r && r[0])
      .find((v) => typeof v === 'string' && /Cycle:/.test(v)) || '';
  const getFund = (code, name) => {
    if (!out.funds.has(code)) out.funds.set(code, { code, name: name || '', lines: [], sub: null });
    const f = out.funds.get(code);
    if (name && !f.name) f.name = name;
    return f;
  };
  for (let i = hi + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const a = String(r[0] ?? '').trim();
    if (!a) continue;
    if (/^Grand Total/i.test(a)) break;
    const v = { budget: num(r[3]), actual: num(r[4]), enc: num(r[5]), avail: num(r[6]) };
    let m;
    const s = splitWith(profile, a);
    if (s) {
      getFund(s.fund).lines.push({ code: a, desc: String(r[1] ?? '').trim(), ...s, ...v });
    } else if ((m = a.match(/\[Fund\]\s*(\d+)\s*-\s*(.*)$/))) {
      getFund(m[1], m[2].trim()).sub = v;
    } else if ((m = a.match(/\[Function\]\s*(\d+)\s*-\s*(.*)$/))) {
      out.funcNames[m[1]] = m[2].trim();
    }
  }
  for (const f of out.funds.values()) {
    f.tot = f.sub || f.lines.reduce(addT, T0());
  }
  return out;
}
// Fund Audit columns, found by header name. The workbook table and the AptaFund CSV export
// spell some headers differently and the CSV has no Src, Trans. No. or Trans. Desc.
export const FA_SPEC = {
  code: { names: ['Account Code'], required: true },
  date: { names: ['Trans. Date', 'Transaction Date'], required: true },
  budget: { names: ['Budget'], required: true },
  actual: { names: ['Actuals', 'Actual'], required: true },
  enc: { names: ['Encumbrance'], required: true },
  avail: { names: ['Available'], required: true },
  acctDesc: { names: ['Acct. Desc.'] },
  tno: { names: ['Trans. No.'] },
  tdesc: { names: ['Trans. Desc.'] },
  src: { names: ['Src'] },
  name: { names: ['Name'] },
  number: { names: ['Number'] },
  desc: { names: ['Description'] },
  detail: { names: ['Detail'] },
  check: { names: ['Check'] },
};
// Source for exports with no Src column, from the Number prefix and Detail text:
// Reg = payroll register, Inv = invoice, Rec = a fee inside a cash receipt (the report lists
// expenditures only), J/E = journal entry. Rows with none of these are encumbrance-only lines
// (purchase orders, jobs and payroll encumbrances cannot be told apart).
export function deriveSource(number, detail) {
  const n = String(number ?? '').trim();
  if (/^Reg:/i.test(n)) return 'PR';
  if (/^Inv:/i.test(n)) return 'IN';
  if (/^Rec:/i.test(n)) return 'RF';
  if (/^J\/E/i.test(String(detail ?? '').trim())) return 'JE';
  return 'EN';
}
export function parseFA(rows, profile = DEFAULT_PROFILE) {
  if (!rows) return [];
  const hi = findHeaderRow(rows, { code: FA_SPEC.code });
  if (hi < 0) return [];
  const { map, missing, found } = findColumns(rows[hi], FA_SPEC);
  if (missing.length) throw new Error(missingColumnsMessage('The Fund Audit Report', missing, found));
  const get = (r, k) => (map[k] == null ? undefined : r[map[k]]);
  const out = [];
  for (const r of rows.slice(hi + 1)) {
    if (!r) continue;
    const code = String(get(r, 'code') ?? '').trim();
    const s = splitWith(profile, code);
    if (!s) continue;
    const number = get(r, 'number') ?? '',
      detail = String(get(r, 'detail') ?? '').trim();
    out.push({
      code,
      ...s,
      acctDesc: String(get(r, 'acctDesc') ?? '').trim(),
      date: serialToISO(get(r, 'date')),
      tno: get(r, 'tno') ?? '',
      tdesc: String(get(r, 'tdesc') ?? ''),
      src: map.src == null ? deriveSource(number, detail) : String(get(r, 'src') ?? ''),
      name: String(get(r, 'name') ?? '').trim(),
      number,
      desc: String(get(r, 'desc') ?? ''),
      detail,
      check: get(r, 'check') ?? '',
      budget: num(get(r, 'budget')),
      actual: num(get(r, 'actual')),
      enc: num(get(r, 'enc')),
      avail: num(get(r, 'avail')),
    });
  }
  return out;
}
export const parseFACSV = (text, profile) => parseFA(parseCSV(text), profile);
export function parseRfR(rows) {
  if (!rows) return [];
  return objectsFrom(rows, 'ReimbursementName')
    .filter((o) => o.ReimbursementName)
    .map((o) => ({
      id: String(o.ReimbursementName),
      fund: String(o.FundCode ?? '').trim(),
      fundName: String(o.FundName ?? ''),
      from: serialToISO(o.PeriodDateFrom_1),
      to: serialToISO(o.PeriodDateTo),
      submitted: serialToISO(o.SubmitDate),
      status: String(o.Status ?? ''),
      requested: num(o.TotalReimbursementRequest),
      approved: num(o.TotalApprovedReimbursementRequest),
      warrant: num(o['Warrant Amt']),
      paidDate: serialToISO(o.WarrantPaidDate),
      warrantNo: o.WarrantNumber ?? '',
    }));
}
export function rfrState(s) {
  s = s.toLowerCase();
  if (s.includes('disapproved')) return 'disapproved';
  if (s.includes('paid')) return 'paid';
  if (s.includes('approved')) return 'approved';
  return 'review';
}
export function parseCR(rows, profile = DEFAULT_PROFILE) {
  if (!rows) return [];
  return objectsFrom(rows, 'BatchStatus')
    .filter((o) => o.AccountCode)
    .map((o) => {
      const code = String(o.AccountCode).trim();
      const s = looseSplit(profile, code);
      return {
        status: String(o.BatchStatus ?? ''),
        batch: String(o.BatchNumber ?? ''),
        date: serialToISO(o.TransactionDate),
        bdesc: String(o.BatchDescription ?? ''),
        code,
        fund: s.fund,
        obj: s.obj,
        adesc: String(o.AccountDescription ?? ''),
        customer: String(o.Customer ?? ''),
        method: String(o.PaymentMethod ?? ''),
        debit: num(o.DebitAmount),
        credit: num(o.CreditAmount),
      };
    });
}
export function parseCap(rows) {
  if (!rows) return [];
  const projects = [];
  let cur = null;
  for (const o of objectsFrom(rows, 'Project')) {
    const vendor = String(o.Vendor ?? '')
      .replace(/\s*\n\s*/g, ' / ')
      .trim();
    if (o.Project) {
      cur = { project: String(o.Project), allocation: num(o.Allocation), items: [] };
      projects.push(cur);
    }
    if (!cur || !vendor || /^total$/i.test(vendor)) continue;
    cur.items.push({
      nob: o.NOB ?? '',
      vendor,
      obligated: num(o['Amount Obligated']),
      paid: num(o['RfR Paid']),
    });
  }
  return projects;
}
