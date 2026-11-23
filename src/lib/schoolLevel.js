// PED accreditation component 3.4, School-Level Expenditures (pure).
// For a quarter, compares operational spending coded to school sites against the school-level SEG shares on the
// 910B-5, checks that Special Education, Gifted and At-Risk spending lines up with the SEG those programs generate,
// and flags a charter whose operational spending sits mostly in program 0000.
// The exact PED comparison rules come from the School Budget Bureau training (10/21/2026); the tolerances and
// program codes here are settings, with defaults to be confirmed (see context/business-rules.md).
import { uploadLocation } from './profile.js';
import { fyRange } from './reportCheck.js';
import { num } from './format.js';

export const CATEGORIES = [
  ['sped', 'Special Education'],
  ['gifted', 'Gifted'],
  ['atrisk', 'At-Risk'],
];
// Quarters of the fiscal year. Each check covers the year to date through the quarter's end.
export const QUARTERS = [
  { q: 1, label: 'Q1 (7/1 to 9/30)', end: (fy) => `${fy - 1}-09-30`, due: (fy) => `${fy - 1}-11-30` },
  { q: 2, label: 'Q2 (10/1 to 12/31)', end: (fy) => `${fy - 1}-12-31`, due: null },
  { q: 3, label: 'Q3 (1/1 to 3/31)', end: (fy) => `${fy}-03-31`, due: null },
  { q: 4, label: 'Q4 (4/1 to 6/30)', end: (fy) => `${fy}-06-30`, due: null },
];

export function defaultSettings(profile = {}) {
  return {
    quarter: 1,
    funds: ['11000'], // operational fund(s) the SEG pays into
    charter: true,
    p0000Max: 60, // percent of operational spending allowed in program 0000 before a charter is flagged
    siteTolerance: 10, // percentage points a site's share of spending may differ from its share of the SEG
    progs: { sped: [], gifted: [], atrisk: [] }, // program codes that count as each category
    // 910B-5 school-level SEG, one row per school site: 3-digit location and the year's amounts.
    seg: (profile.locationIds || []).map((loc) => ({ loc, total: 0, sped: 0, gifted: 0, atrisk: 0 })),
  };
}

// Settings saved earlier, completed with the defaults for anything missing.
export function withDefaults(saved, profile) {
  const d = defaultSettings(profile);
  const s = { ...d, ...(saved || {}) };
  s.progs = { ...d.progs, ...(saved?.progs || {}) };
  s.seg = Array.isArray(saved?.seg) ? saved.seg : d.seg;
  return s;
}

// Rows pasted from a spreadsheet: location, total SEG, Special Ed, Gifted, At-Risk (tab or semicolon separated).
// A header row or a row without a 3-digit location is skipped.
export function parseSegPaste(text) {
  const out = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    const f = line.includes('\t') ? line.split('\t') : line.split(/;|\s{2,}/);
    const loc = String(f[0] || '').trim();
    if (!/^\d{3}$/.test(loc)) continue;
    out.push({ loc, total: num(f[1]), sped: num(f[2]), gifted: num(f[3]), atrisk: num(f[4]) });
  }
  return out;
}

const pct = (a, b) => (b ? (a / b) * 100 : 0);
const p1 = (n) => `${n.toFixed(1)}%`;
const usd = (n) => '$' + Math.round(n).toLocaleString('en-US');
const isExpense = (obj) => String(obj || '').startsWith('5');

// lines: Fund Audit rows (with dates) or Account Summary lines (no dates; then the report's own period is used).
// Each needs fund, obj, prog, loc and actual. fiscalYear: the year being checked.
export function schoolLevelCheck(lines, { profile, fiscalYear, settings, dated = true }) {
  const s = withDefaults(settings, profile);
  const Q = QUARTERS.find((x) => x.q === +s.quarter) || QUARTERS[0];
  const begin = fyRange(fiscalYear).begin,
    end = Q.end(fiscalYear);
  const funds = new Set(s.funds);
  const use = (lines || []).filter(
    (l) => funds.has(l.fund) && isExpense(l.obj) && (!dated || (l.date && l.date >= begin && l.date <= end)),
  );
  const total = use.reduce((t, l) => t + l.actual, 0);
  const checks = [];
  const fraction = Q.q / 4;

  // Spending by site (3-digit location).
  const siteIds = new Set((profile.locationIds || []).map(String));
  const byLoc = new Map();
  for (const l of use) {
    const loc = uploadLocation(profile, l.loc) || String(l.loc || '');
    byLoc.set(loc, (byLoc.get(loc) || 0) + l.actual);
  }
  const segRows = (s.seg || []).filter((r) => r.loc);
  const segTotal = segRows.reduce((t, r) => t + num(r.total), 0);
  const isSite = (loc) =>
    (siteIds.size ? siteIds.has(loc) : loc !== '000') || segRows.some((r) => r.loc === loc);
  const siteSpend = [...byLoc].filter(([loc]) => isSite(loc)).reduce((t, [, v]) => t + v, 0);
  const locs = [...new Set([...byLoc.keys(), ...segRows.map((r) => r.loc)])].sort();
  const sites = locs.map((loc) => {
    const spend = byLoc.get(loc) || 0;
    const seg = num(segRows.find((r) => r.loc === loc)?.total);
    return {
      loc,
      site: isSite(loc),
      spend,
      spendShare: isSite(loc) ? pct(spend, siteSpend) : null,
      seg,
      segShare: segTotal ? pct(seg, segTotal) : null,
      ofExpected: seg ? pct(spend, seg * fraction) : null,
    };
  });

  if (!use.length) {
    checks.push({
      level: 'warn',
      msg: `No ${[...funds].join(', ')} expenditures were found ${dated ? `dated ${begin} to ${end}` : 'in the report'}.`,
    });
  }
  if (!segRows.length || !segTotal)
    checks.push({
      level: 'warn',
      msg: 'Enter the school-level SEG amounts from the 910B-5 to compare spending by site.',
    });
  const off = sites.filter((x) => !x.site && Math.abs(x.spend) >= 0.005);
  if (off.length) {
    const amt = off.reduce((t, x) => t + x.spend, 0);
    checks.push({
      level: 'warn',
      msg: `${usd(amt)} (${p1(pct(amt, total))}) of operational spending is coded to location${off.length === 1 ? '' : 's'} ${off.map((x) => x.loc).join(', ')}, not a school site.`,
    });
  }
  if (segTotal) {
    for (const x of sites.filter((x) => x.site)) {
      if (!x.seg && x.spend)
        checks.push({
          level: 'warn',
          msg: `Site ${x.loc} has ${usd(x.spend)} of spending but no SEG share on the 910B-5.`,
        });
      else if (x.seg && !x.spend)
        checks.push({
          level: 'warn',
          msg: `Site ${x.loc} has a SEG share of ${usd(x.seg)} but no spending coded to it.`,
        });
      else if (x.seg && Math.abs(x.spendShare - x.segShare) > s.siteTolerance)
        checks.push({
          level: 'warn',
          msg: `Site ${x.loc} has ${p1(x.spendShare)} of site spending but ${p1(x.segShare)} of the SEG (more than ${s.siteTolerance} points apart).`,
        });
    }
  }

  // Programs.
  const byProg = new Map();
  for (const l of use) byProg.set(l.prog, (byProg.get(l.prog) || 0) + l.actual);
  const catOf = (prog) => CATEGORIES.find(([k]) => (s.progs[k] || []).includes(prog))?.[0] || '';
  const programs = [...byProg]
    .map(([prog, spend]) => ({ prog, spend, share: pct(spend, total), cat: catOf(prog) }))
    .sort((a, b) => b.spend - a.spend);
  const categories = CATEGORIES.map(([k, label]) => {
    const codes = s.progs[k] || [];
    const spend = programs.filter((p) => codes.includes(p.prog)).reduce((t, p) => t + p.spend, 0);
    const seg = segRows.reduce((t, r) => t + num(r[k]), 0);
    return {
      key: k,
      label,
      codes,
      spend,
      seg,
      expected: seg * fraction,
      ofExpected: seg ? pct(spend, seg * fraction) : null,
    };
  });
  for (const c of categories) {
    if (!c.codes.length) {
      checks.push({
        level: 'info',
        msg: `${c.label}: no program codes are set, so its alignment was not checked.`,
      });
      continue;
    }
    if (c.seg && !c.spend)
      checks.push({
        level: 'warn',
        msg: `${c.label}: the 910B-5 shows ${usd(c.seg)} of SEG, but no spending is coded to program ${c.codes.join(', ')}.`,
      });
    else if (!c.seg && c.spend)
      checks.push({
        level: 'warn',
        msg: `${c.label}: ${usd(c.spend)} is coded to program ${c.codes.join(', ')}, but the 910B-5 shows no SEG for it.`,
      });
    else if (c.seg)
      checks.push({
        level: 'info',
        msg: `${c.label}: ${usd(c.spend)} spent to date, ${p1(c.ofExpected)} of the ${usd(c.expected)} expected by the end of Q${Q.q} (${usd(c.seg)} for the year).`,
      });
  }

  // Charter test: share of operational spending in program 0000.
  const p0000 = byProg.get('0000') || 0;
  const p0000Share = pct(p0000, total);
  const p0000Flag = !!s.charter && total > 0 && p0000Share > s.p0000Max;
  if (s.charter && total > 0)
    checks.push({
      level: p0000Flag ? 'warn' : 'info',
      msg: p0000Flag
        ? `${p1(p0000Share)} of operational spending (${usd(p0000)}) is in program 0000, above the ${s.p0000Max}% limit for charters. Recode spending to the programs it serves.`
        : `${p1(p0000Share)} of operational spending is in program 0000, within the ${s.p0000Max}% limit for charters.`,
    });

  return {
    quarter: Q.q,
    begin,
    end,
    due: Q.due ? Q.due(fiscalYear) : null,
    dated,
    total,
    siteSpend,
    segTotal,
    sites,
    programs,
    categories,
    p0000: { amount: p0000, share: p0000Share, flag: p0000Flag, max: s.p0000Max },
    checks,
    ok: !checks.some((c) => c.level !== 'info'),
  };
}
