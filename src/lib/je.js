// AptaFund journal entries (pure): reclass of actuals (Type Actual) and approved BARs (Type Budget).
// A line carries a debit or a credit. Rules and examples: context/journal-entries.md.
import { r2 } from './format.js';
import { splitWith } from './profile.js';

const pad = (n) => String(n).padStart(2, '0');
// Last day of the month of an ISO date (YYYY-MM-DD), leap years included.
export function lastDayOfMonth(iso) {
  const [y, m] = String(iso).slice(0, 10).split('-').map(Number);
  if (!y || !m) return '';
  return `${y}-${pad(m)}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`;
}
export const monthOf = (iso) => String(iso).slice(0, 7);

// A new account code: the old one with only the named segments changed. changes = { fund, func, obj, prog, loc, job }
// (any combination); segments not named are copied. Returns { code } or { error }.
export function changeCode(profile, code, changes = {}) {
  const parts = String(code).split('-');
  if (!splitWith(profile, code)) return { error: `${code} does not fit this school's account code layout.` };
  const segs = profile.segments;
  for (const [key, val] of Object.entries(changes)) {
    if (val == null || val === '') continue;
    const i = segs.findIndex((s) => s.key === key);
    if (i < 0) return { error: `This school's account code has no ${key} segment.` };
    if (!new RegExp(`^\\d{${segs[i].len}}$`).test(String(val)))
      return { error: `${key} must be ${segs[i].len} digits.` };
    parts[i] = String(val);
  }
  return { code: parts.join('-') };
}

// A fund's bank account code: the profile's per-fund override, else its pattern ({fund} is replaced), else
// the fund, function 0000, object 11011 and zeros everywhere else.
export function bankCode(profile, fund) {
  const b = profile.bankAccount || {};
  if (b.byFund?.[fund]) return b.byFund[fund];
  if (b.pattern) return b.pattern.replace('{fund}', fund);
  return profile.segments
    .map((s) => (s.key === 'fund' ? fund : s.key === 'obj' ? '11011' : '0'.repeat(s.len)))
    .join('-');
}

const fundOf = (code) => String(code).split('-')[0];
const line = (code, desc, comment, debit, credit) => ({
  code,
  desc: desc || '',
  comment,
  debit: r2(debit),
  credit: r2(credit),
});

// A reclass JE. moves = [{ from, to, amount, date }] (amount > 0). The JE date is the last day of the month the
// charges were in; all moves must be in one month. Expense lines first (credit old, debit new), then each fund's
// bank line for moves that cross funds.
export function reclassJE(moves, { desc = () => '' } = {}, profile) {
  const months = new Set(moves.map((m) => monthOf(m.date)));
  const out = {
    type: 'Actual',
    date: months.size === 1 ? lastDayOfMonth(moves[0].date) : '',
    lines: [],
    errors: [],
  };
  if (months.size !== 1) out.errors.push('A reclass entry must hold charges from one month only.');
  const first = moves[0] || {};
  const ff = fundOf(first.from || ''),
    tf = fundOf(first.to || '');
  out.comment = moves.every((m) => fundOf(m.from) === fundOf(m.to))
    ? `To reclass expenditures within ${ff}`
    : `To reclass expenditures from ${ff} to ${tf}`;
  const cross = new Map();
  for (const m of moves) {
    if (!(m.amount > 0)) {
      out.errors.push(`${m.from}: the amount to reclass must be above zero.`);
      continue;
    }
    out.lines.push(line(m.from, desc(m.from), out.comment, 0, m.amount));
    out.lines.push(line(m.to, desc(m.to), out.comment, m.amount, 0));
    if (fundOf(m.from) !== fundOf(m.to)) {
      const k = `${fundOf(m.from)}>${fundOf(m.to)}`;
      cross.set(k, (cross.get(k) || 0) + m.amount);
    }
  }
  for (const [k, amt] of cross) {
    const [a, b] = k.split('>');
    out.lines.push(line(bankCode(profile, a), 'Bank Accounts', out.comment, amt, 0));
    out.lines.push(line(bankCode(profile, b), 'Bank Accounts', out.comment, 0, amt));
  }
  out.lines.forEach((l, i) => (l.seq = i + 1));
  return out;
}

// A Budget JE for an approved BAR. lines = [{ code, desc, amount }] in the BAR's order: an increase is a debit,
// a decrease a credit. date is the PED approval date.
export function barJE({ docId, fund, typeName, date, lines }) {
  const comment = `BAR ${docId} Fund ${fund} ${typeName}`;
  return {
    type: 'Budget',
    date,
    comment,
    errors: [],
    lines: lines.map((l, i) => ({
      seq: i + 1,
      ...line(l.code, l.desc, comment, l.amount > 0 ? l.amount : 0, l.amount < 0 ? -l.amount : 0),
    })),
  };
}

// Totals and the checks every JE must pass: debits equal credits and, for a reclass, each fund nets to zero.
export function jeTotals(je) {
  const debit = r2(je.lines.reduce((s, l) => s + l.debit, 0)),
    credit = r2(je.lines.reduce((s, l) => s + l.credit, 0));
  const byFund = new Map();
  for (const l of je.lines) {
    const f = fundOf(l.code),
      t = byFund.get(f) || { debit: 0, credit: 0 };
    t.debit = r2(t.debit + l.debit);
    t.credit = r2(t.credit + l.credit);
    byFund.set(f, t);
  }
  return { debit, credit, byFund };
}
export function checkJE(je) {
  const out = je.errors.map((msg) => ({ level: 'stop', msg }));
  const t = jeTotals(je);
  if (!je.lines.length) out.push({ level: 'stop', msg: 'The entry has no lines.' });
  if (t.debit !== t.credit)
    out.push({
      level: 'stop',
      msg: `Debits ${t.debit.toFixed(2)} do not equal credits ${t.credit.toFixed(2)}.`,
    });
  if (je.type === 'Actual')
    for (const [f, v] of t.byFund)
      if (v.debit !== v.credit)
        out.push({
          level: 'stop',
          msg: `Fund ${f} does not net to zero (debits ${v.debit.toFixed(2)}, credits ${v.credit.toFixed(2)}).`,
        });
  if (!je.date) out.push({ level: 'stop', msg: 'The entry needs a transaction date.' });
  return out;
}
