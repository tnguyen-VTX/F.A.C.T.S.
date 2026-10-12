// Reclassing actuals (pure): a vendor's charges grouped like the pivot (account code, then date), what is
// still left to reclass on each, and the journal entries a set of reclass choices makes.
import { r2 } from './format.js';
import { changeCode, monthOf, reclassJE } from './je.js';

// Names/vendors with expenditure actuals, with their totals. q filters by text.
export function vendorNames(fa, q = '') {
  const ql = q.trim().toLowerCase();
  const m = new Map();
  for (const r of fa) {
    if (!r.name || r.actual === 0) continue;
    m.set(r.name, r2((m.get(r.name) || 0) + r.actual));
  }
  return [...m]
    .filter(([n]) => !ql || n.toLowerCase().includes(ql))
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export const chargeKey = (code, date) => `${code}|${date}`;

// Charges grouped by account code, then date: [{ code, desc, total, charges: [{ date, actual, reclassed, remaining }] }].
// reclassed = { 'code|date': amount already reclassed } (from saved JEs).
function groupCharges(rows, reclassed = {}) {
  const by = new Map();
  for (const r of rows) {
    if (r.actual === 0) continue;
    if (!by.has(r.code)) by.set(r.code, { code: r.code, desc: r.acctDesc, total: 0, dates: new Map() });
    const a = by.get(r.code);
    a.total = r2(a.total + r.actual);
    a.dates.set(r.date, r2((a.dates.get(r.date) || 0) + r.actual));
  }
  return [...by.values()]
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((a) => ({
      code: a.code,
      desc: a.desc,
      total: a.total,
      charges: [...a.dates]
        .sort((x, y) => x[0].localeCompare(y[0]))
        .map(([date, actual]) => {
          const done = r2(reclassed[chargeKey(a.code, date)] || 0);
          return { date, actual, reclassed: done, remaining: r2(actual - done) };
        }),
    }));
}

// One vendor's charges.
export const vendorCharges = (fa, name, reclassed = {}) =>
  groupCharges(
    fa.filter((r) => r.name === name),
    reclassed,
  );

export const FILTER_KEYS = ['fund', 'func', 'obj', 'prog', 'loc', 'job'];
export const hasFilter = (f = {}) =>
  FILTER_KEYS.some((k) => String(f[k] || '').trim()) ||
  !!String(f.text || '').trim() ||
  !!String(f.name || '').trim();

// Fund Audit rows that match a filter: name is an exact name/vendor; each segment is optional and matches by its start (53 matches 53414), and the
// text matches the name, detail or account description. An empty filter matches nothing, never everything.
export function chargeFilter(rows, f = {}) {
  if (!hasFilter(f)) return [];
  const segs = FILTER_KEYS.map((k) => [k, String(f[k] || '').trim()]).filter(([, v]) => v);
  const t = String(f.text || '')
    .trim()
    .toLowerCase();
  return rows.filter(
    (r) =>
      r.actual !== 0 &&
      segs.every(([k, v]) => String(r[k] ?? '').startsWith(v)) &&
      (!f.name || r.name === f.name) &&
      (!t || `${r.name} ${r.detail} ${r.acctDesc}`.toLowerCase().includes(t)),
  );
}

// The charges a filter matches, grouped as above. At most maxCodes account codes are returned; more says how many
// were left out so the screen can ask for a narrower filter.
export function matchingCharges(fa, f, reclassed = {}, { maxCodes = 200 } = {}) {
  const all = groupCharges(chargeFilter(fa, f), reclassed);
  return { groups: all.slice(0, maxCodes), codes: all.length, more: Math.max(0, all.length - maxCodes) };
}

// Reclass choices -> journal entries. choices = [{ code, date, amount, change: { fund, func, ... } }].
// Choices are grouped into one entry per month and fund pair. Returns { jes, errors } and never exceeds what
// is left on a charge (remaining = { 'code|date': amount }).
export function buildReclassJEs(choices, { profile, desc = () => '', remaining = {} }) {
  const errors = [];
  const groups = new Map();
  for (const c of choices) {
    if (!(c.amount > 0)) continue;
    const left = remaining[chargeKey(c.code, c.date)];
    if (left != null && r2(c.amount) > r2(left))
      errors.push(
        `${c.code} on ${c.date}: ${c.amount.toFixed(2)} is more than the ${left.toFixed(2)} left to reclass.`,
      );
    const to = changeCode(profile, c.code, c.change);
    if (to.error) {
      errors.push(`${c.code}: ${to.error}`);
      continue;
    }
    if (to.code === c.code) {
      errors.push(`${c.code}: the new account code is the same as the old one.`);
      continue;
    }
    const key = `${monthOf(c.date)}|${c.code.split('-')[0]}>${to.code.split('-')[0]}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ from: c.code, to: to.code, amount: r2(c.amount), date: c.date });
  }
  const jes = [...groups.keys()].sort().map((k) => reclassJE(groups.get(k), { desc }, profile));
  return { jes, errors };
}

// ---- Summary of actuals, grouped like the pivot ----
export const DIMS = [
  ['code', 'Account code'],
  ['date', 'Date'],
  ['month', 'Month'],
  ['fund', 'Fund'],
  ['func', 'Function'],
  ['obj', 'Object'],
  ['prog', 'Program'],
  ['loc', 'Location'],
  ['job', 'Job class'],
  ['detail', 'Detail'],
  ['name', 'Name / vendor'],
];
const dimValue = (r, d) =>
  d === 'month' ? String(r.date || '').slice(0, 7) : String(r[d] ?? '') || '(none)';

// Sum the actuals of the given expenditures (rows), grouped by a first and an optional second dimension.
// sort: 'key' (ascending), 'high' (largest total first) or 'low' (smallest first), at both levels.
// names = { func: {code: name}, fund: {code: name} } adds titles to labels. Returns
// { groups: [{ key, label, total, count, children: [{ key, label, total, count }] }], total, count }.
export function summarize(rows, { first = 'code', second = '', sort = 'key', names = {} } = {}) {
  const label = (d, v) => {
    const n = names[d]?.[v];
    return n ? `${v} ${n}` : v;
  };
  const order = (a, b) =>
    sort === 'high'
      ? b.total - a.total || a.key.localeCompare(b.key)
      : sort === 'low'
        ? a.total - b.total || a.key.localeCompare(b.key)
        : a.key.localeCompare(b.key);
  const top = new Map();
  let total = 0,
    count = 0;
  for (const r of rows) {
    if (!r.actual) continue;
    const k1 = dimValue(r, first);
    if (!top.has(k1)) top.set(k1, { key: k1, label: label(first, k1), total: 0, count: 0, kids: new Map() });
    const g = top.get(k1);
    g.total += r.actual;
    g.count++;
    total += r.actual;
    count++;
    if (second) {
      const k2 = dimValue(r, second);
      if (!g.kids.has(k2)) g.kids.set(k2, { key: k2, label: label(second, k2), total: 0, count: 0 });
      const c = g.kids.get(k2);
      c.total += r.actual;
      c.count++;
    }
  }
  const groups = [...top.values()].map((g) => ({
    key: g.key,
    label: g.label,
    total: r2(g.total),
    count: g.count,
    children: [...g.kids.values()].map((c) => ({ ...c, total: r2(c.total) })).sort(order),
  }));
  groups.sort(order);
  return { groups, total: r2(total), count };
}
