// Suggestions from the text of an award letter, for an Initial Budget or Increase BAR (pure).
// Letters vary, so every value is a suggestion with the text it came from; anything not found stays null.
// Labels are kept in the tables below so a new letter layout is a one-line addition.
import { parseMoney } from './barReport.js';
import { spreadByWeight } from './barLogic.js';

const MONEY = /\(?-?\$?\s?\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?\)?|\(?-?\$\s?\d+(?:\.\d{1,2})?\)?|\b\d+\.\d{2}\b/g;
const MONTHS = 'jan feb mar apr may jun jul aug sep oct nov dec'.split(' ');
const DATE =
  /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b|\b(\d{4})-(\d{2})-(\d{2})\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})\b/gi;

// Label words, strongest first. A line holding one of them and a dollar amount is a candidate.
export const AWARD_LABELS = [
  /not\s+to\s+exceed/i,
  /total\s+(?:grant\s+)?award/i,
  /award(?:ed)?\s+amount|amount\s+awarded/i,
  /total\s+(?:approved\s+)?(?:funding|allocation|amount)/i,
  /\baward\b/i,
  /approved\s+amount|\ballocation\b/i,
];
export const CARRYOVER_LABELS = [/carry[\s-]?over/i];
export const ALLOCATION_LABELS = [/current[\s-]year\s+allocation/i, /new\s+allocation/i];
export const TOTAL_LABELS = [/total\s+approved\s+budget/i, /total\s+approved/i];
const FROM_LABELS = /(?:begin(?:ning)?|start(?:ing)?|effective|from|period\s+begins?)/i;
const TO_LABELS = /(?:end(?:ing)?|through|thru|expir\w*|to|period\s+ends?)/i;

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const signedMoney = (line) => (line.match(MONEY) || []).map((m) => parseMoney(m));
const money = (line) => (line.match(MONEY) || []).map((m) => ({ text: m, value: Math.abs(parseMoney(m)) }));

export function toMDY(m) {
  let y, mo, d;
  if (m[1]) [mo, d, y] = [+m[1], +m[2], +m[3]];
  else if (m[4]) [y, mo, d] = [+m[4], +m[5], +m[6]];
  else [mo, d, y] = [MONTHS.indexOf(m[7].toLowerCase()) + 1, +m[8], +m[9]];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${String(mo).padStart(2, '0')}/${String(d).padStart(2, '0')}/${y}`;
}
const datesIn = (line) => [...line.matchAll(DATE)].map((m) => ({ mdy: toMDY(m), index: m.index })).filter((x) => x.mdy);

function byLabel(lines, labels) {
  for (const re of labels)
    for (const line of lines) {
      if (!re.test(line)) continue;
      const m = money(line);
      if (m.length) return { value: m[m.length - 1].value, src: line };
    }
  return null;
}

function findFund(lines, profile) {
  const known = new Set((profile?.funds || []).map((f) => f.code));
  const re = /(?<![\d-])(\d{5})(?![\d])/g;
  let loose = null;
  for (const line of lines)
    for (const m of line.matchAll(re)) {
      if (known.has(m[1])) return { value: m[1], src: line };
      if (!loose && /\bfund\b/i.test(line) && !/^\s*20\d{3}\b/.test(m[1])) loose = { value: m[1], src: line };
    }
  return loose;
}

function findPeriod(lines) {
  // "07/01/2026 through 06/30/2027" or "Begin date: ... End date: ..." (same or next line)
  for (const line of lines) {
    const d = datesIn(line);
    if (d.length >= 2 && /through|thru|to|-|–/i.test(line.slice(d[0].index, d[1].index)))
      return { from: d[0].mdy, to: d[1].mdy, src: line };
  }
  let from = null,
    to = null;
  for (const line of lines) {
    const d = datesIn(line);
    if (!d.length) continue;
    const head = line.slice(0, d[0].index);
    if (!from && FROM_LABELS.test(head) && !TO_LABELS.test(head.replace(FROM_LABELS, ''))) from = { v: d[0].mdy, src: line };
    else if (!to && TO_LABELS.test(head)) to = { v: d[0].mdy, src: line };
  }
  return from && to ? { from: from.v, to: to.v, src: `${from.src} / ${to.src}` } : null;
}

// Budget table rows: a full account code, or a 4-digit function and 5-digit object, then an amount. Revenue (4xxxx) skipped.
function findRows(lines, profile) {
  const rows = [];
  const seen = new Set();
  for (const line of lines) {
    const m = money(line);
    if (!m.length) continue;
    let func, obj, prog = '0000', job = '0000';
    const full = line.match(/\b\d{5}-(\d{4})-(\d{5})(?:-(\d{4}))?(?:-\d{3,6})?(?:-(\d{4}))?/);
    if (full) [, func, obj] = full;
    else {
      const p = line.match(/(?<![\d,.$-])(\d{4})(?![\d,.])\D{1,30}?(?<![\d,.$-])(\d{5})(?![\d,.])/);
      if (!p) continue;
      [, func, obj] = p;
    }
    if (obj.startsWith('4')) continue;
    const amount = m[m.length - 1].value;
    const key = `${func}|${obj}|${amount}`;
    if (!amount || seen.has(key)) continue;
    seen.add(key);
    rows.push({ func, obj, prog, job, amount, src: line });
  }
  return rows;
}

function findName(lines) {
  for (const line of lines) {
    const m = line.match(/(?:grant|award|program|project)\s*(?:name|title)\s*[:\-]\s*(.+)$/i);
    if (m && clean(m[1])) return { value: clean(m[1]).slice(0, 80), src: line };
  }
  return null;
}

// A table whose header names the columns: `Grant Name | UCOA Fund | CFDA# | Revenue Account | Total Award`, or
// `... | Planning Award | Increase BAR | Final Award`. The next row holding an amount is the data row.
function findTable(lines) {
  for (let i = 0; i < lines.length; i++) {
    const h = lines[i];
    const increase = /planning\s+award/i.test(h) && /increase\s+bar/i.test(h);
    const total = /total\s+award/i.test(h) && /ucoa|revenue|grant\s+name/i.test(h);
    if (!increase && !total) continue;
    for (let j = i + 1; j <= i + 2 && j < lines.length; j++) {
      const row = lines[j];
      const m = signedMoney(row);
      if (!m.length) continue;
      const codes = [...row.matchAll(/(?<![\d.,-])(\d{5})(?![\d.,])/g)].map((x) => x[1]);
      const revObj = codes.find((c) => c.startsWith('4')) || null;
      const fund = codes.find((c) => !c.startsWith('4')) || null;
      const name = clean(row.slice(0, row.search(/\d{5}/) > 0 ? row.search(/\d{5}/) : 0)) || null;
      const out = { src: row, fund, revObj, name };
      if (increase && m.length >= 3) Object.assign(out, { planning: m.at(-3), increase: m.at(-2), final: m.at(-1) });
      else out.award = m.at(-1);
      return out;
    }
  }
  return null;
}

// PED's SEG BAR memo table: one row per school; per revenue object the figures are Current, Adjustment, Adjusted.
// Only this school's row is read (by PED no. district-location, or by name).
export function parseSegMemo(lines, profile) {
  const head = lines.find((l) => (l.match(/(?<!\d)\d{5}-\s?[A-Za-z]/g) || []).length >= 1 && /equalization|revenue/i.test(l));
  const objs = head ? [...head.matchAll(/(?<!\d)(\d{5})-\s?[A-Za-z]/g)].map((x) => x[1]) : [];
  if (!objs.length) return null;
  const dist = String(profile?.districtCode || '').padStart(3, '0');
  const pedNos = (profile?.locationIds || []).map((id) => `${dist}-${id}`);
  const norm = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const names = [profile?.name, profile?.entityName, ...(profile?.reportNames || [])].map(norm).filter(Boolean);
  const row = lines.find((l) => pedNos.some((n) => l.includes(n)) || names.some((n) => norm(l).startsWith(n)));
  if (!row) return null;
  const m = signedMoney(row);
  const revenue = [];
  objs.forEach((obj, k) => {
    const adj = m[3 * k + 1];
    if (adj) revenue.push({ obj, amount: adj, current: m[3 * k], adjusted: m[3 * k + 2] });
  });
  const fund = lines.map((l) => l.match(/\bFund\s+(\d{5})\b/i)?.[1]).find(Boolean) || null;
  return { fund, revenue, src: row };
}

function findEnd(lines) {
  for (const line of lines) {
    const m = line.match(/(?:terminate|terminates|expires?|ends?|no\s+later\s+than)\s+(?:on\s+)?(.{0,40})/i);
    if (!m) continue;
    const d = datesIn(m[1]);
    if (d.length) return { value: d[0].mdy, src: line };
  }
  return null;
}

// text: one string (any line breaks) or an array of lines. Returns suggestions; nothing is guessed.
export function parseAward(text, profile) {
  const lines = (Array.isArray(text) ? text : String(text ?? '').split(/\r?\n/)).map(clean).filter(Boolean);
  const period = findPeriod(lines);
  const table = findTable(lines);
  const seg = parseSegMemo(lines, profile);
  const revCode = lines.map((l) => l.match(/revenue\s+(?:code|account|object)\s*:?\s*(4\d{4})/i)?.[1]).find(Boolean) || null;
  const found = byLabel(lines, AWARD_LABELS);
  const end = period ? null : findEnd(lines);
  const initial = lines.some((l) => /initial\s+budget/i.test(l));
  let fund = findFund(lines, profile);
  let award = found;
  let type = initial ? 'IB' : null;
  let planning = null,
    final = null;
  if (table) {
    if (table.fund) fund = { value: table.fund, src: table.src };
    if (table.increase != null && table.increase > 0) {
      award = { value: table.increase, src: table.src };
      planning = { value: table.planning, src: table.src };
      final = { value: table.final, src: table.src };
      type = 'I';
    } else if (table.award != null) award = { value: table.award, src: table.src };
  }
  let revenue = [];
  if (seg) {
    if (seg.fund) fund = { value: seg.fund, src: seg.src };
    revenue = seg.revenue.map((r) => ({ obj: r.obj, amount: r.amount, src: seg.src }));
    if (revenue.length) {
      const sum = revenue.reduce((x, r) => x + r.amount, 0);
      award = { value: Math.abs(sum), src: seg.src };
      type = sum < 0 ? 'D' : 'I';
    }
  }
  const revObj = table?.revObj || revCode || null;
  if (!revenue.length && award && revObj) revenue = [{ obj: revObj, amount: award.value, src: table?.src || '' }];
  return {
    fund,
    award,
    type,
    planning,
    final,
    revenue,
    revObj: revObj ? { value: revObj, src: table?.src || 'revenue code in the letter' } : null,
    from: period ? { value: period.from, src: period.src } : null,
    to: period ? { value: period.to, src: period.src } : seg ? null : end,
    carryover: byLabel(lines, CARRYOVER_LABELS),
    allocation: byLabel(lines, ALLOCATION_LABELS),
    total: byLabel(lines, TOTAL_LABELS),
    name: table?.name ? { value: table.name, src: table.src } : findName(lines),
    rows: seg ? [] : findRows(lines, profile),
    lineCount: lines.length,
  };
}

// ---- From the confirmed form to a BAR ----
import { newBar, barLine } from './bar.js';
import { isAccountCode, parseFundLines } from './profile.js';
import { suggestJustification } from './justify.js';

// The location segment a school's account codes use, from its district code and PED location ID
// (district + location, left padded to the segment length: Gilbert 001 + 707 = 001707). '' when unknown.
export function defaultLocationSegment(profile) {
  const len = profile?.segments?.find((s) => s.key === 'loc')?.len;
  const id = (profile?.locationIds || [])[0];
  if (!len || !id) return '';
  if (len <= 3) return String(id).slice(-len);
  const dist = String(profile.districtCode || '').padStart(len - 3, '0');
  return dist.length + 3 === len ? dist + id : '';
}

// An account code in the profile's segment order; segments that are not standard get zeros.
export function awardCode(profile, { fund, func, obj, prog = '0000', loc, job = '0000' }) {
  const v = { fund, func, obj, prog, loc, job };
  const code = profile.segments.map((s) => v[s.key] ?? '0'.repeat(s.len)).join('-');
  return isAccountCode(profile, code) ? code : null;
}

const r2 = (n) => Math.round(n * 100) / 100;
const num = (v) => {
  const n = parseFloat(String(v ?? '').replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : NaN;
};

// form: { type 'IB'|'I'|'D', fund, revenue: [{ obj, amount }] (or award + revObj for one line), loc, from, to,
//         carryover, allocation, total, rows: [{ on, func, obj, prog, job, amount }] }. Returns { bar } or { errors }.
export function buildAwardBar(profile, form, ctx = {}) {
  const errors = [];
  const type = ['I', 'D'].includes(form.type) ? form.type : 'IB';
  const fund = String(form.fund || '');
  if (!/^\d{5}$/.test(fund)) errors.push('Choose the fund.');
  const revs = (form.revenue?.length ? form.revenue : [{ obj: form.revObj, amount: form.award }]).map((r) => ({
    obj: String(r.obj || ''),
    amount: num(r.amount),
  }));
  if (revs.some((r) => !(r.amount !== 0 && Number.isFinite(r.amount)))) errors.push('Enter the award amount.');
  if (revs.some((r) => !/^4\d{4}$/.test(r.obj))) errors.push('The revenue object is 5 digits starting with 4.');
  if (!String(form.loc || '').trim()) errors.push('Enter the location segment of the account code.');
  const rows = (form.rows || []).filter((r) => r.on && num(r.amount) !== 0);
  if (!rows.length) errors.push('Check at least one expenditure line.');
  if (errors.length) return { errors };
  const bar = newBar(type, fund);
  const total = r2(revs.reduce((x, r) => x + r.amount, 0));
  bar.award = String(Math.abs(total));
  for (const r of revs) {
    const rev = awardCode(profile, { fund, func: '0000', obj: r.obj, prog: '0000', loc: form.loc, job: '0000' });
    if (!rev) return { errors: ["The revenue line does not fit this school's account code layout. Check the location segment."] };
    bar.lines.push(barLine(profile, rev, r.amount));
  }
  rows.forEach((r, i) => {
    const code = awardCode(profile, { fund, func: r.func, obj: r.obj, prog: r.prog || '0000', loc: form.loc, job: r.job || '0000' });
    if (!code) errors.push(`Expenditure line ${i + 1} (${r.func || '?'} ${r.obj || '?'}) does not fit the account code layout.`);
    else bar.lines.push(barLine(profile, code, num(r.amount)));
  });
  if (errors.length) return { errors };
  if (profile.funds?.find((f) => f.code === fund)?.flowthrough) {
    const f = (v) => (v === '' || v == null ? '' : String(num(v)));
    bar.flowthrough = {
      scope: 'N',
      from: form.from || '',
      to: form.to || '',
      carryover: f(form.carryover),
      allocation: f(form.allocation),
      total: f(form.total),
    };
  }
  bar.justification = suggestJustification(bar, ctx);
  return { bar };
}

// Expenditure lines for an award: the amount spread over the fund's existing budget lines by budget share
// (to the cent, remainder on the largest line). `fund` is an Account Summary fund ({ lines: [{ code, func, obj, prog, job, budget }] }).
export function spreadAwardOverFund(fund, amount) {
  const lines = (fund?.lines || []).filter((l) => l.budget > 0 && !String(l.obj).startsWith('4'));
  if (!lines.length || !amount) return [];
  const parts = spreadByWeight(Math.round(amount * 100), lines.map((l) => l.budget));
  return lines
    .map((l, i) => ({ on: true, func: l.func, obj: l.obj, prog: l.prog, job: l.job, amount: parts[i] / 100, src: 'spread over the fund budget' }))
    .filter((r) => r.amount !== 0);
}
