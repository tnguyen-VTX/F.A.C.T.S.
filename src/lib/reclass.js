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
  FILTER_KEYS.some((k) => String(f[k] || '').trim()) || !!String(f.text || '').trim();

// Fund Audit rows that match a filter: each segment is optional and matches by its start (53 matches 53414), and the
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
