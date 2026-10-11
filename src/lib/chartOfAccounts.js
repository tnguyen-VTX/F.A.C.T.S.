// A school's AptaFund Chart Of Accounts report, and checking account codes against it (pure).
// Columns: Account Code, Description, Account Type Name, Enabled, Active, Account Group Type, Cycle Name.
// One row per code per fiscal year; only the selected year is kept.
import { fiscalYearOf, schoolMatches } from './reportCheck.js';
import { splitWith } from './profile.js';

const txt = (v) => String(v ?? '').trim();
const yes = (v) => /^y/i.test(txt(v));

export function parseChart(rows, profile, fiscalYear) {
  const out = { school: txt(rows[0]?.[0]), fiscalYear, codes: new Map(), errors: [], rowsSeen: 0 };
  const hi = rows.findIndex((r) => txt(r[0]) === 'Account Code');
  if (hi < 0) {
    out.errors.push(
      'This does not look like an AptaFund Chart Of Accounts report: no "Account Code" column.',
    );
    return out;
  }
  const h = rows[hi].map(txt);
  const at = (n) => h.indexOf(n);
  const c = {
    code: 0,
    desc: at('Description'),
    type: at('Account Type Name'),
    enabled: at('Enabled'),
    active: at('Active'),
    cycle: at('Cycle Name'),
  };
  if (c.cycle < 0 || c.enabled < 0) {
    out.errors.push('The chart report needs the Enabled and Cycle Name columns.');
    return out;
  }
  for (const r of rows.slice(hi + 1)) {
    const code = txt(r[0]);
    if (!code) continue;
    out.rowsSeen++;
    if (fiscalYearOf(txt(r[c.cycle])) !== +fiscalYear) continue;
    if (!splitWith(profile, code)) continue;
    out.codes.set(code, {
      desc: txt(r[c.desc]),
      type: txt(r[c.type]),
      enabled: yes(r[c.enabled]),
      active: yes(r[c.active]),
    });
  }
  return out;
}

export function checkChartReport(chart, { profile, fiscalYear }) {
  const out = chart.errors.map((msg) => ({ level: 'stop', msg }));
  if (out.length) return out;
  if (schoolMatches(profile, chart.school) === false)
    out.push({
      level: 'stop',
      msg: `This chart is for "${chart.school}", but the selected school is ${profile.name}.`,
    });
  if (!chart.codes.size)
    out.push({
      level: 'stop',
      msg: `No account codes for FY${fiscalYear} fit the account code layout of ${profile.name}. Check the school and the fiscal year.`,
    });
  return out;
}

// The description AptaFund shows for a code (empty if the chart does not have it).
export const chartDesc = (chart, code) => chart?.codes.get(code)?.desc || '';

// Checks every code. chart = parsed chart or null; ped = (code) => true/false or null when no PED listing is loaded.
// Returns { stops, adds, notes }: stops are codes PED does not allow; adds are codes to add (or enable) in AptaFund.
export function checkAccounts(codes, { chart = null, ped = null } = {}) {
  const uniq = [...new Set(codes)];
  const stops = [],
    adds = [],
    notes = [];
  if (!chart)
    notes.push(
      'No chart of accounts is loaded for this school, so the codes were not checked against AptaFund.',
    );
  if (!ped)
    notes.push(
      'No PED Chart Line Listing is loaded, so the codes were not checked against the allowable UCOA strings.',
    );
  for (const code of uniq) {
    if (ped && ped(code) === false) stops.push(code);
    if (chart) {
      const e = chart.codes.get(code);
      if (!e) adds.push({ code, why: 'is not in the school chart' });
      else if (!e.enabled) adds.push({ code, why: 'is in the chart but not enabled' });
    }
  }
  return { stops, adds, notes };
}
