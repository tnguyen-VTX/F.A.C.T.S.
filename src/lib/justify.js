// A suggested justification, written by fixed rules from the BAR's lines (the user edits it).
// The upload file allows no double quote, pipe or comma, and at most 255 characters, so the text
// is cleaned and kept short. Pure.
import { BAR_TYPES, JUSTIFICATION_MAX, isRevenueObject } from './bar.js';

export const plain = (s) =>
  String(s ?? '')
    .replace(/&/g, 'and')
    .replace(/["|,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const r2 = (n) => Math.round(n * 100) / 100;
// No thousands separator: a comma would split the field.
export const dollarsText = (n) => `$${Number.isInteger(r2(n)) ? r2(n) : r2(n).toFixed(2)}`;

function names(codes, funcNames, max = 4) {
  const label = (c) => (funcNames?.[c] ? `${plain(funcNames[c])} (${c})` : `function ${c}`);
  const list = [...new Set(codes)].sort();
  if (list.length > max)
    return `${list.slice(0, max).map(label).join(' and ')} and ${list.length - max} other functions`;
  return list.map(label).join(' and ');
}
const fit = (text) => {
  if (text.length <= JUSTIFICATION_MAX) return text;
  const cut = text.slice(0, JUSTIFICATION_MAX - 1);
  return cut.slice(0, cut.lastIndexOf(' ')).trim() + '.';
};

export function suggestJustification(bar, { funcNames = {}, fundNames = {} } = {}) {
  const ex = bar.lines.filter((l) => !isRevenueObject(l.obj) && r2(l.amount) !== 0);
  const give = ex.filter((l) => l.amount < 0),
    get = ex.filter((l) => l.amount > 0);
  const moved = r2(get.reduce((s, l) => s + l.amount, 0));
  const fund = `fund ${bar.fund}${fundNames[bar.fund] ? ` (${plain(fundNames[bar.fund])})` : ''}`;
  const rev = r2(bar.lines.filter((l) => isRevenueObject(l.obj)).reduce((s, l) => s + l.amount, 0));
  let t = '';
  if (bar.type === 'T') {
    if (!get.length || !give.length) return '';
    t = `Transfer of ${dollarsText(moved)} from ${names(
      give.map((l) => l.func),
      funcNames,
    )} to ${names(
      get.map((l) => l.func),
      funcNames,
    )} to ensure no function is over budget.`;
    if (t.length > JUSTIFICATION_MAX)
      t = `Transfer of ${dollarsText(moved)} from ${names(
        give.map((l) => l.func),
        {},
      )} to ${names(
        get.map((l) => l.func),
        {},
      )} to ensure no function is over budget.`;
  } else if (bar.type === 'M') {
    if (!get.length) return '';
    t = `Maintenance transfer of ${dollarsText(moved)} ${new Set(ex.map((l) => l.func)).size > 1 ? 'between' : 'within'} ${names(
      ex.map((l) => l.func),
      funcNames,
    )} to align the budget with actual expenditures.`;
  } else if (bar.type === 'I' || bar.type === 'IB') {
    if (!rev) return '';
    t = `${bar.type === 'IB' ? 'Initial budget' : 'Increase'} of ${dollarsText(rev)} in ${fund} to budget the award received.`;
  } else if (bar.type === 'D') {
    if (!rev) return '';
    t = `Decrease of ${dollarsText(-rev)} in ${fund} to reduce the budget to the award.`;
  } else return '';
  return fit(plain(t).replace(/ \./g, '.'));
}
export const justificationTypes = Object.keys(BAR_TYPES);
