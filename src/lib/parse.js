import * as XLSX from 'xlsx';
import { $, ACCT_RE, T0, addT, num, serialToISO, splitCode } from './format.js';

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

export function parseASR(rows) {
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
    if (ACCT_RE.test(a)) {
      const s = splitCode(a);
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
export function parseFA(rows) {
  if (!rows) return [];
  const out = [];
  for (const o of objectsFrom(rows, 'Account Code')) {
    const code = String(o['Account Code'] ?? '').trim();
    if (!ACCT_RE.test(code)) continue;
    out.push({
      code,
      ...splitCode(code),
      acctDesc: String(o['Acct. Desc.'] ?? '').trim(),
      date: serialToISO(o['Trans. Date']),
      tno: o['Trans. No.'] ?? '',
      tdesc: String(o['Trans. Desc.'] ?? ''),
      src: String(o['Src'] ?? ''),
      name: String(o['Name'] ?? '').trim(),
      number: o['Number'] ?? '',
      desc: String(o['Description'] ?? ''),
      detail: String(o['Detail'] ?? '').trim(),
      check: o['Check'] ?? '',
      budget: num(o['Budget']),
      actual: num(o['Actuals']),
      enc: num(o['Encumbrance']),
      avail: num(o['Available']),
    });
  }
  return out;
}
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
export function parseCR(rows) {
  if (!rows) return [];
  return objectsFrom(rows, 'BatchStatus')
    .filter((o) => o.AccountCode)
    .map((o) => {
      const code = String(o.AccountCode).trim();
      const s = splitCode(code);
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
