// Suggestions from the text of an award letter, for an Initial Budget or Increase BAR (pure).
// Letters vary, so every value is a suggestion with the text it came from; anything not found stays null.
// Labels are kept in the tables below so a new letter layout is a one-line addition.
import { parseMoney } from './barReport.js';

const MONEY = /\(?-?\$?\s?\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?\)?|\(?-?\$\s?\d+(?:\.\d{1,2})?\)?|\b\d+\.\d{2}\b/g;
const MONTHS = 'jan feb mar apr may jun jul aug sep oct nov dec'.split(' ');
const DATE =
  /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b|\b(\d{4})-(\d{2})-(\d{2})\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})\b/gi;

// Label words, strongest first. A line holding one of them and a dollar amount is a candidate.
export const AWARD_LABELS = [
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

// text: one string (any line breaks) or an array of lines. Returns suggestions; nothing is guessed.
export function parseAward(text, profile) {
  const lines = (Array.isArray(text) ? text : String(text ?? '').split(/\r?\n/)).map(clean).filter(Boolean);
  const period = findPeriod(lines);
  return {
    fund: findFund(lines, profile),
    award: byLabel(lines, AWARD_LABELS),
    from: period ? { value: period.from, src: period.src } : null,
    to: period ? { value: period.to, src: period.src } : null,
    carryover: byLabel(lines, CARRYOVER_LABELS),
    allocation: byLabel(lines, ALLOCATION_LABELS),
    total: byLabel(lines, TOTAL_LABELS),
    name: findName(lines),
    rows: findRows(lines, profile),
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

const num = (v) => {
  const n = parseFloat(String(v ?? '').replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : NaN;
};

// form: { type 'IB'|'I', fund, award, revObj, loc, from, to, carryover, allocation, total,
//         rows: [{ on, func, obj, prog, job, amount }] }. Returns { bar } or { errors }.
export function buildAwardBar(profile, form, ctx = {}) {
  const errors = [];
  const type = form.type === 'I' ? 'I' : 'IB';
  const fund = String(form.fund || '');
  if (!/^\d{5}$/.test(fund)) errors.push('Choose the fund.');
  const award = num(form.award);
  if (!(award > 0)) errors.push('Enter the award amount.');
  if (!/^4\d{4}$/.test(String(form.revObj || ''))) errors.push('The revenue object is 5 digits starting with 4.');
  if (!String(form.loc || '').trim()) errors.push('Enter the location segment of the account code.');
  const rows = (form.rows || []).filter((r) => r.on && num(r.amount) !== 0);
  if (!rows.length) errors.push('Check at least one expenditure line.');
  if (errors.length) return { errors };
  const bar = newBar(type, fund);
  bar.award = String(award);
  const rev = awardCode(profile, { fund, func: '0000', obj: form.revObj, prog: '0000', loc: form.loc, job: '0000' });
  if (!rev) return { errors: ["The revenue line does not fit this school's account code layout. Check the location segment."] };
  bar.lines.push(barLine(profile, rev, award));
  rows.forEach((r, i) => {
    const code = awardCode(profile, { fund, func: r.func, obj: r.obj, prog: r.prog || '0000', loc: form.loc, job: r.job || '0000' });
    if (!code) errors.push(`Expenditure line ${i + 1} (${r.func || '?'} ${r.obj || '?'}) does not fit the account code layout.`);
    else bar.lines.push(barLine(profile, code, num(r.amount)));
  });
  if (errors.length) return { errors };
  if (profile.funds?.find((f) => f.code === fund)?.flowthrough) {
    bar.flowthrough = {
      scope: 'N',
      from: form.from || '',
      to: form.to || '',
      carryover: form.carryover === '' || form.carryover == null ? '' : String(num(form.carryover)),
      allocation: form.allocation === '' || form.allocation == null ? '' : String(num(form.allocation)),
      total: form.total === '' || form.total == null ? '' : String(num(form.total)),
    };
  }
  bar.justification = suggestJustification(bar, ctx);
  return { bar };
}
