// BAR logic: finding what is over budget, and (later) spreading and balancing a transfer. Pure.
import { T0, addT, r2 } from './format.js';

// A fund's functions, each with its subtotal. Uses the report's own [Function] subtotals when it has
// them, otherwise adds up the lines.
export function fundFunctions(fund) {
  if (fund.funcs?.length) return fund.funcs;
  const by = new Map();
  for (const l of fund.lines) {
    if (!by.has(l.func)) by.set(l.func, { code: l.func, name: '', tot: T0(), lines: [] });
    const f = by.get(l.func);
    addT(f.tot, l);
    f.lines.push(l);
  }
  return [...by.values()];
}

// Functions whose Available is below zero, in the selected funds (all funds if none are given).
// Each has its deficit and its over-budget lines, each with the line's own deficit.
export function findDeficits(asr, fundCodes) {
  const pick = fundCodes?.length ? new Set(fundCodes) : null;
  const out = [];
  for (const fund of [...asr.funds.values()].sort((a, b) => a.code.localeCompare(b.code))) {
    if (pick && !pick.has(fund.code)) continue;
    for (const fn of fundFunctions(fund).sort((a, b) => a.code.localeCompare(b.code))) {
      if (r2(fn.tot.avail) >= 0) continue;
      out.push({
        fund: fund.code,
        func: fn.code,
        funcName: fn.name || asr.funcNames?.[fn.code] || '',
        budget: fn.tot.budget,
        actual: fn.tot.actual,
        enc: fn.tot.enc,
        avail: fn.tot.avail,
        deficit: r2(-fn.tot.avail),
        lines: fn.lines
          .filter((l) => r2(l.avail) < 0)
          .map((l) => ({ ...l, deficit: r2(-l.avail) }))
          .sort((a, b) => b.deficit - a.deficit || a.code.localeCompare(b.code)),
      });
    }
  }
  return out;
}
