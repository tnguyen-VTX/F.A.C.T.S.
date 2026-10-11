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

// One vendor's charges: [{ code, desc, total, charges: [{ date, actual, reclassed, remaining }] }], by account code
// then date. reclassed = { 'code|date': amount already reclassed } (from saved JEs).
export function vendorCharges(fa, name, reclassed = {}) {
  const by = new Map();
  for (const r of fa) {
    if (r.name !== name || r.actual === 0) continue;
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
