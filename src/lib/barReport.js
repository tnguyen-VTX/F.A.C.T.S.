// Reads PED's approved "Budget Adjustment Request Report" (.xlsx rows) into BAR lines for a journal entry (pure).
import { r2, serialToISO } from './format.js';
import { splitWith } from './profile.js';
import { fiscalYearOf, schoolMatches } from './reportCheck.js';

const TYPE_NAMES = { T: 'Transfer', M: 'Maintenance', I: 'Increase', IB: 'Initial Budget', D: 'Decrease' };
const txt = (v) => String(v ?? '').trim();

// "$(17,800.00)" -> -17800, "$700.00" -> 700, "" -> 0.
export function parseMoney(v) {
  if (typeof v === 'number') return r2(v);
  const s = txt(v);
  if (!s) return 0;
  const neg = /^\(.*\)$/.test(s.replace(/[$\s]/g, '')) || /-/.test(s);
  const n = parseFloat(s.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? r2(neg ? -n : n) : 0;
}

// The first non-empty cell after the cell whose text starts with label, on the same row.
function after(rows, label) {
  for (const r of rows) {
    const i = r.findIndex((c) => txt(c).toLowerCase().startsWith(label.toLowerCase()));
    if (i < 0) continue;
    const v = r.slice(i + 1).find((c) => txt(c) !== '');
    if (v !== undefined) return v;
  }
  return '';
}
const code = (cell) => txt(cell).split(/\s+/)[0];
const label = (cell) => txt(cell).replace(/^\S+\s*/, '');

// rows: the sheet as arrays (header: 1, defval ''). Returns the report's header facts, the lines and the signatures.
export function parseBarReport(rows, profile) {
  const out = { errors: [], lines: [], signatures: [] };
  out.docId = txt(after(rows, 'Doc. ID'));
  out.entity = txt(after(rows, 'Entity Name'));
  out.fundType = txt(after(rows, 'Fund Type'));
  out.fiscalYearText = txt(after(rows, 'Fiscal Year'));
  out.fiscalYear = fiscalYearOf(out.fiscalYearText.replace(/(\d{4})\s*-\s*(\d{4})/, 'FY$2'));
  const suffix = out.docId.split('-').pop();
  out.typeCode = suffix;
  out.typeName = TYPE_NAMES[suffix] || '';
  const hi = rows.findIndex((r) => r.some((c) => txt(c) === 'Fund') && r.some((c) => txt(c) === 'Object'));
  if (hi < 0) {
    out.errors.push(
      'This does not look like a PED Budget Adjustment Request Report: the line table was not found.',
    );
    return out;
  }
  const col = {};
  rows[hi].forEach((c, i) => {
    const t = txt(c);
    if (t && !(t in col)) col[t] = i;
  });
  const need = ['Fund', 'Function', 'Object', 'Program', 'Location', 'Job Class', 'Adj Amt Exp'];
  const miss = need.filter((n) => !(n in col));
  if (miss.length) {
    out.errors.push(`The line table is missing the column(s): ${miss.join(', ')}.`);
    return out;
  }
  const ftec = Object.keys(col).find((k) => /FTE/i.test(k));
  const segKeys = profile.segments.map((s) => s.key);
  for (let i = hi + 1; i < rows.length; i++) {
    const r = rows[i];
    if (r.some((c) => /^(Sub Total|DOC\. TOTAL)/i.test(txt(c)))) break;
    if (!txt(r[col.Fund])) continue;
    const parts = {
      fund: code(r[col.Fund]),
      func: code(r[col.Function]),
      obj: code(r[col.Object]),
      prog: code(r[col.Program]),
      loc: code(r[col.Location]),
      job: code(r[col['Job Class']]),
    };
    const acct = profile.segments.map((s) => parts[s.key] ?? '0'.repeat(s.len)).join('-');
    if (!splitWith(profile, acct)) {
      out.errors.push(`Row ${i + 1}: ${acct} does not fit this school's account code layout.`);
      continue;
    }
    out.lines.push({
      code: acct,
      desc: label(r[col.Object]),
      funcTitle: label(r[col.Function]),
      present: parseMoney(r[col['Present Budget']]),
      amount: parseMoney(r[col['Adj Amt Exp']]),
      adjBudget: parseMoney(r[col['Adj Budget']]),
      fte: ftec ? parseMoney(r[col[ftec]]) : 0,
    });
  }
  void segKeys;
  const tot = rows.find((r) => r.some((c) => /^DOC\. TOTAL/i.test(txt(c))));
  if (tot) {
    const i = tot.findIndex((c) => /^DOC\. TOTAL/i.test(txt(c)));
    const v = tot.slice(i + 1).find((c) => txt(c) !== '');
    out.docTotal = v === undefined ? null : parseMoney(v);
  }
  out.boardDate = serialToISO(after(rows, 'A. The requested budget'));
  const si = rows.findIndex((r) => r.some((c) => /^Approvals by Digital Signature/i.test(txt(c))));
  if (si >= 0)
    for (const r of rows.slice(si + 2)) {
      const cells = r.map(txt).filter(Boolean);
      if (cells.length < 3) {
        if (cells.length === 0) continue;
        break;
      }
      const dateCell = r.find((c) => typeof c === 'number') ?? cells[2];
      out.signatures.push({ name: cells[0], role: cells[1], date: serialToISO(Math.floor(dateCell)) });
    }
  out.approvalDate =
    out.signatures
      .map((s) => s.date)
      .filter(Boolean)
      .sort()
      .at(-1) || '';
  return out;
}

// Checks for a parsed report against the selected school and fiscal year.
export function checkBarReport(rep, { profile, fiscalYear }) {
  const out = rep.errors.map((msg) => ({ level: 'stop', msg }));
  if (out.length) return out;
  if (!rep.lines.length) out.push({ level: 'stop', msg: 'The report has no BAR lines.' });
  if (!rep.docId) out.push({ level: 'stop', msg: 'The report has no Doc. ID.' });
  if (!rep.typeName)
    out.push({
      level: 'warn',
      msg: `The Doc. ID ends in "${rep.typeCode}", which is not a known BAR type; type the BAR type yourself.`,
    });
  if (schoolMatches(profile, rep.entity) === false)
    out.push({
      level: 'stop',
      msg: `This BAR is for "${rep.entity}", but the selected school is ${profile.name}.`,
    });
  if (fiscalYear && rep.fiscalYear && rep.fiscalYear !== +fiscalYear)
    out.push({
      level: 'stop',
      msg: `This BAR is for fiscal year ${rep.fiscalYearText}, not FY${fiscalYear}.`,
    });
  const net = r2(rep.lines.reduce((s, l) => s + l.amount, 0));
  if (rep.docTotal != null && Math.abs(net - rep.docTotal) > 0.005)
    out.push({
      level: 'stop',
      msg: `The lines add up to ${net.toFixed(2)} but the report's DOC. TOTAL is ${rep.docTotal.toFixed(2)}.`,
    });
  if (['T', 'M'].includes(rep.typeCode) && Math.abs(net) > 0.005)
    out.push({
      level: 'stop',
      msg: `A ${rep.typeName} BAR must net to zero; these lines net to ${net.toFixed(2)}.`,
    });
  if (!rep.approvalDate)
    out.push({ level: 'warn', msg: 'No signature dates were found; type the approval date yourself.' });
  return out;
}
