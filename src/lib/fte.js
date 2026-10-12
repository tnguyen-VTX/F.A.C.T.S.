// FTE change for a salary line of a BAR. Pure.
// Assumption (to confirm against an accepted BAR): the FTE moves in proportion to the dollars moved,
//   FTE change = dollars moved / budgeted salary of the line x the line's FTE, to 4 decimals.
import { roundAway } from './format.js';

export const DEFAULT_FTE_OBJECTS = ['511']; // salary objects; the profile can change this

export const isSalaryObject = (obj, prefixes = DEFAULT_FTE_OBJECTS) =>
  prefixes.some((p) => String(obj).startsWith(p));

export function fteChange(dollars, budgetedSalary, lineFte) {
  if (!Number.isFinite(dollars) || !(budgetedSalary > 0) || !(lineFte > 0)) return 0;
  return roundAway((dollars / budgetedSalary) * lineFte * 10000) / 10000;
}
// How the file shows it: 4 decimals.
export const fteText = (n) => (Number.isFinite(n) ? n.toFixed(4) : '0.0000');

// Fill in the FTE of salary lines from a lookup of what the account's line is based on:
// lookup(code, line) -> { salary, fte, basis } or null, where salary is the base to divide by (the line's budget,
// or its actuals + encumbrances when it has no budget) and basis says which ('budget' or 'spent').
// Lines the user set by hand (fteManual) are left alone, and a line with no base or no FTE to go on keeps whatever
// FTE it has. fteBasis records what the FTE adj was worked from (null when it could not be).
export function suggestFte(lines, lookup, prefixes = DEFAULT_FTE_OBJECTS) {
  return lines.map((l) => {
    if (l.fteManual || !isSalaryObject(l.obj, prefixes)) return l;
    const b = lookup(l.code, l);
    if (!b || !(b.fte > 0)) return { ...l, fteBasis: null };
    return b.salary > 0
      ? { ...l, fte: fteChange(l.amount, b.salary, b.fte), fteBasis: b.basis || 'budget' }
      : { ...l, fteBasis: null };
  });
}
