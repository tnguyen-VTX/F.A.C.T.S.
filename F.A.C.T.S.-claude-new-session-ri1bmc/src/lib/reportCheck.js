// Checks run when a report is loaded for a school and fiscal year. Pure.
// Each check returns { level: 'stop' | 'warn' | 'info', msg }. A 'stop' means do not load.
import { metaField } from './parse.js';

// "FY26-27" and "FY2027" both mean fiscal year 2027 (7/1/2026 to 6/30/2027).
export function fiscalYearOf(cycle) {
  const s = String(cycle || '');
  let m = s.match(/FY\s*(\d{2})\s*-\s*(\d{2})\b/i);
  if (m) return 2000 + +m[2];
  m = s.match(/FY\s*(\d{4})\b/i);
  if (m) return +m[1];
  return null;
}
export const fyRange = (fy) => ({ begin: `${fy - 1}-07-01`, end: `${fy}-06-30` });
const mdyToISO = (s) => {
  const m = String(s || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : '';
};
const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

// Parameters AptaFund prints in the Account Summary header.
export function reportParams(meta) {
  const g = (k) => metaField(meta, k);
  return {
    cycle: g('Cycle'),
    fiscalYear: fiscalYearOf(g('Cycle')),
    begin: mdyToISO(g('Begin Date')),
    end: mdyToISO(g('End Date')),
    accountType: g('Account Type'),
    expression: g('Account Expression'),
    unposted: g('Include Unposted Transactions'),
    category: g('Budget Category'),
    createdOn: g('Created On'),
  };
}

// Does the school name on a report match the school? Compared with the profile's name, its OBMS
// entity name, and any extra names the user listed (profile.reportNames).
export function schoolMatches(profile, reportSchool) {
  const r = norm(reportSchool);
  if (!r) return null; // report prints no school name
  const names = [profile.name, profile.entityName, ...(profile.reportNames || [])].map(norm).filter(Boolean);
  return names.some((n) => n === r || n.includes(r) || r.includes(n));
}

export function checkAccountSummary(asr, { profile, fiscalYear }) {
  const out = [];
  const p = reportParams(asr.meta);
  if (!asr.funds.size || ![...asr.funds.values()].some((f) => f.lines.length))
    out.push({
      level: 'stop',
      msg: `No account lines matched the account code layout of ${profile.name}. This report is probably from another school, or the school's account code settings need fixing.`,
    });
  const m = schoolMatches(profile, asr.school);
  if (m === false)
    out.push({
      level: 'stop',
      msg: `This report is for "${asr.school}", but the selected school is ${profile.name}. If it is the same school, add "${asr.school}" under "Names as reports print them" on the Schools screen.`,
    });
  if (p.fiscalYear && fiscalYear && p.fiscalYear !== fiscalYear)
    out.push({ level: 'warn', msg: `This report is for fiscal year ${p.fiscalYear}, not ${fiscalYear}.` });
  if (!p.fiscalYear) out.push({ level: 'warn', msg: 'The report does not say which fiscal year it covers.' });
  const fy = p.fiscalYear || fiscalYear;
  if (fy && (p.begin !== fyRange(fy).begin || p.end !== fyRange(fy).end))
    out.push({
      level: 'warn',
      msg: `The report covers ${p.begin || '?'} to ${p.end || '?'}, not the full fiscal year, so balances may be partial.`,
    });
  if (p.expression && p.expression !== '[All]')
    out.push({
      level: 'warn',
      msg: `The report was filtered by account expression "${p.expression}", so some accounts may be missing.`,
    });
  if (p.category && p.category !== '[All]')
    out.push({ level: 'warn', msg: `The report was filtered to budget category "${p.category}".` });
  if (/yes/i.test(p.unposted)) out.push({ level: 'info', msg: 'The report includes unposted transactions.' });
  if (!asr.headerOk)
    out.push({
      level: 'warn',
      msg: 'The amount columns have unexpected headings. Check that Budget, Actual, Encumbrance and Available are columns D to G.',
    });
  return out;
}

const r2 = (n) => Math.round(n * 100) / 100;
const KEYS = ['budget', 'actual', 'enc', 'avail'];
const ZERO = () => ({ budget: 0, actual: 0, enc: 0, avail: 0 });
export function totalsByFund(fa) {
  const t = new Map();
  for (const r of fa) {
    const x = t.get(r.fund) || ZERO();
    for (const k of KEYS) x[k] += r[k];
    t.set(r.fund, x);
  }
  return t;
}
const allZero = (x) => KEYS.every((k) => r2(x[k]) === 0);

// Compare the Fund Audit with the Account Summary, fund by fund. They should be equal when both
// were run for the same school and period. A fund with no activity on either side is ignored.
export function tieOut(asr, fa) {
  const fx = totalsByFund(fa);
  const diffs = [];
  const funds = new Set([...asr.funds.keys(), ...fx.keys()]);
  for (const f of [...funds].sort()) {
    const a = asr.funds.get(f)?.tot,
      b = fx.get(f);
    if ((!a || allZero(a)) && (!b || allZero(b))) continue;
    const x = a || ZERO(),
      y = b || ZERO();
    const off = KEYS.filter((k) => Math.abs(r2(x[k]) - r2(y[k])) > 0.005);
    if (off.length) diffs.push({ fund: f, columns: off, summary: a ? x : null, audit: b ? y : null });
  }
  return { ok: diffs.length === 0, diffs };
}

export function checkFundAudit(fa, { profile, fiscalYear, asr }) {
  const out = [];
  if (!fa.length)
    return [
      {
        level: 'stop',
        msg: `No lines matched the account code layout of ${profile.name}. This report is probably from another school, or the school's account code settings need fixing.`,
      },
    ];
  if (fiscalYear) {
    const { begin, end } = fyRange(fiscalYear);
    const outside = fa.filter((r) => r.date && (r.date < begin || r.date > end)).length;
    if (outside)
      out.push({
        level: 'warn',
        msg: `${outside.toLocaleString()} lines are dated outside fiscal year ${fiscalYear} (${begin} to ${end}).`,
      });
  }
  const known = new Set((profile.funds || []).map((f) => f.code));
  if (known.size) {
    const unknown = [...new Set(fa.map((r) => r.fund))].filter((f) => !known.has(f));
    if (unknown.length)
      out.push({ level: 'warn', msg: `Funds not in this school's fund list: ${unknown.sort().join(', ')}.` });
  }
  if (asr && asr.funds.size) {
    const t = tieOut(asr, fa);
    if (!t.ok) {
      const list = t.diffs
        .slice(0, 6)
        .map((d) => `${d.fund} (${d.columns.join(', ')})`)
        .join('; ');
      out.push({
        level: 'warn',
        msg: `The Fund Audit does not match the Account Summary for ${t.diffs.length} fund${t.diffs.length === 1 ? '' : 's'}: ${list}${t.diffs.length > 6 ? '; …' : ''}. They may cover different periods, or come from different schools.`,
      });
    } else out.push({ level: 'info', msg: 'The Fund Audit ties to the Account Summary for every fund.' });
  }
  return out;
}
export const hasStop = (checks) => checks.some((c) => c.level === 'stop');
