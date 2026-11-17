// BAR logic: finding what is over budget, and (later) spreading and balancing a transfer. Pure.
import { T0, addT, r2, roundAway, sumBy } from './format.js';

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
        allLines: fn.lines,
        lines: fn.lines
          .filter((l) => r2(l.avail) < 0)
          .map((l) => ({ ...l, deficit: r2(-l.avail) }))
          .sort((a, b) => b.deficit - a.deficit || a.code.localeCompare(b.code)),
      });
    }
  }
  return out;
}

// ---- Allocation (whole dollars) -------------------------------------------------------------
const up = (n) => Math.ceil(r2(n) - 1e-9);
const down = (n) => Math.floor(r2(n) + 1e-9);

// Split a whole-dollar total across weights, rounding like Excel ROUND (half away from zero)
// and putting the rounding difference on the line with the largest weight.
export function spreadByWeight(total, weights) {
  const W = sumBy(weights, (w) => w);
  if (!total || !(W > 0)) return weights.map(() => 0);
  const parts = weights.map((w) => roundAway((total * w) / W));
  const diff = total - sumBy(parts, (p) => p);
  if (diff) {
    let big = 0;
    weights.forEach((w, i) => w > weights[big] && (big = i));
    parts[big] += diff;
  }
  return parts;
}
// Same, but no part may exceed its cap. total must not exceed the sum of the caps.
export function spreadCapped(total, caps) {
  const parts = spreadByWeight(total, caps).map((p, i) => Math.max(0, Math.min(p, caps[i])));
  let diff = total - sumBy(parts, (p) => p);
  while (diff !== 0) {
    // put the difference where there is room (or take it from the largest part)
    let best = -1;
    parts.forEach((p, i) => {
      const room = diff > 0 ? caps[i] - p : p;
      if (room > 0 && (best < 0 || room > (diff > 0 ? caps[best] - parts[best] : parts[best]))) best = i;
    });
    if (best < 0) break;
    const room = diff > 0 ? caps[best] - parts[best] : parts[best];
    const step = Math.min(Math.abs(diff), room) * Math.sign(diff);
    parts[best] += step;
    diff -= step;
  }
  return parts;
}

// ---- Salary packages ------------------------------------------------------------------------
// A salary line (profile `benefits`, e.g. 51100 and 51300) moves together with its benefit lines: same fund, function,
// program, location and job class, with the benefit's object. `spec` is [{ obj, pct }] (pct of the salary). A package of
// `t` whole dollars is the salary plus each benefit (pct of the salary, rounded like Excel); the rounding difference goes
// on the salary line, so the lines add up to exactly t.
const swapObject = (l, obj) => l.code.replace(`-${l.obj}-`, `-${obj}-`);
export function splitPackage(t, spec) {
  const P = sumBy(spec, (b) => b.pct);
  const s0 = t / (1 + P);
  const bens = spec.map((b) => roundAway(s0 * b.pct));
  return { salary: t - sumBy(bens, (b) => b), bens };
}
// The most a package can give: every line within its room. Searches down from the estimate until the package fits
// (and keeps fitting for every smaller amount, so any share of the cap is safe).
function packageCap(roomSalary, bens) {
  const P = sumBy(bens, (b) => b.pct);
  const sMax = Math.min(roomSalary, ...bens.map((b) => b.room / b.pct));
  const fits = (t) => {
    const p = splitPackage(t, bens);
    return p.salary >= 0 && p.salary <= roomSalary && p.bens.every((a, i) => a >= 0 && a <= bens[i].room);
  };
  let t = Math.floor(sMax * (1 + P));
  while (t > 0 && !(fits(t) && fits(t - 1) && fits(t - 2))) t--;
  return Math.max(0, t);
}
// A function's donor units: plain lines with room, and salary packages. A benefit line that has room and belongs to a
// package is used only through it. Each unit: { cap, split(t) -> [{ l, amount }] with positive amounts }.
export function donorUnits(lines, benefits = {}) {
  const byCode = new Map(lines.map((l) => [l.code, l]));
  const inPackage = new Set();
  const units = [];
  for (const l of lines) {
    const room = down(l.avail);
    const spec = benefits[l.obj];
    if (!spec || room <= 0) continue;
    const bens = spec
      .map((b) => ({ ...b, line: byCode.get(swapObject(l, b.obj)) }))
      .filter((b) => b.line && down(b.line.avail) > 0)
      .map((b) => ({ ...b, room: down(b.line.avail) }));
    if (!bens.length) continue;
    const cap = packageCap(room, bens);
    if (cap <= 0) continue;
    bens.forEach((b) => inPackage.add(b.line.code));
    inPackage.add(l.code);
    units.push({
      cap,
      package: true,
      split: (t) => {
        const p = splitPackage(t, bens);
        return [{ l, amount: p.salary }, ...bens.map((b, i) => ({ l: b.line, amount: p.bens[i] }))].filter((x) => x.amount);
      },
    });
  }
  for (const l of lines) {
    const room = down(l.avail);
    if (room > 0 && !inPackage.has(l.code)) units.push({ cap: room, split: (t) => [{ l, amount: t }] });
  }
  return units;
}

// Receiving side of a transfer: spread a whole-dollar amount T over a deficit function's lines.
// Over-budget lines are filled first (up to each line's own deficit, rounded up); if T is short of
// that, T is shared out pro rata; anything above is spread over the function's lines by budget.
export function allocateReceiving(deficit, T, benefits = {}) {
  const over = deficit.lines,
    need = over.map((l) => up(l.deficit)),
    S = sumBy(need, (n) => n);
  const amt = new Map();
  if (T <= S) over.forEach((l, i) => amt.set(l.code, spreadByWeight(T, need)[i]));
  else {
    over.forEach((l, i) => amt.set(l.code, need[i]));
    const pool = deficit.allLines.filter((l) => l.budget > 0);
    const spread = pool.length ? pool : over;
    const extra = spreadByWeight(
      T - S,
      spread.map((l) => (pool.length ? l.budget : up(l.deficit))),
    );
    spread.forEach((l, i) => amt.set(l.code, (amt.get(l.code) || 0) + extra[i]));
  }
  // A salary line that receives money brings its benefit lines with it: its share becomes salary + benefits, adding up
  // to the same amount. (If a benefit line is already receiving on its own, the salary line is left as it is.)
  const byCode = new Map(deficit.allLines.map((l) => [l.code, l]));
  for (const l of deficit.allLines) {
    const a = amt.get(l.code),
      spec = benefits[l.obj];
    if (!a || !spec) continue;
    const bens = spec.map((b) => ({ ...b, line: byCode.get(swapObject(l, b.obj)) })).filter((b) => b.line);
    if (!bens.length || bens.some((b) => amt.get(b.line.code))) continue;
    const p = splitPackage(a, bens);
    amt.set(l.code, p.salary);
    bens.forEach((b, i) => p.bens[i] && amt.set(b.line.code, p.bens[i]));
  }
  return deficit.allLines.filter((l) => amt.get(l.code)).map((l) => ({ ...l, amount: amt.get(l.code) }));
}

// Donor side. Takes `need` whole dollars from other functions of the same fund. Any object may fund any
// other (no object rule for Transfer and Maintenance BARs). A line gives at most its own Available, and a
// function at most its subtotal Available, so no function ends below zero. mode: 'rank' (the profile's
// function order first, then most room) or 'spread' (every function with room gives by share of its room).
// kind 'T' takes only from other function series (OBMS rejects a Transfer within a series, "Same Func Xfer"); 'M' only from the same series.
// Returns the negative lines and the shortfall (dollars the donors could not cover; 0 if none).
const seriesOk = (kind, a, b) => (kind === 'T' ? a[0] !== b[0] : kind === 'M' ? a[0] === b[0] : true);
export function allocateDonors(asr, { fund, excludeFunc, need, mode = 'rank', priority = [], kind, benefits = {} }) {
  const f = asr.funds.get(fund);
  const fns = f
    ? fundFunctions(f).filter((x) => x.code !== excludeFunc && seriesOk(kind, x.code, excludeFunc))
    : [];
  const rank = (code) => {
    const i = priority.indexOf(code);
    return i < 0 ? Infinity : i;
  };
  const cand = fns
    .map((x) => {
      const units = donorUnits(x.lines, benefits);
      return {
        code: x.code,
        units,
        cap: Math.min(
          Math.max(0, down(x.tot.avail)),
          sumBy(units, (u) => u.cap),
        ),
      };
    })
    .filter((c) => c.cap > 0);
  let take;
  if (mode === 'spread')
    take = spreadCapped(
      Math.min(
        need,
        sumBy(cand, (c) => c.cap),
      ),
      cand.map((c) => c.cap),
    );
  else {
    cand.sort((a, b) => rank(a.code) - rank(b.code) || b.cap - a.cap || a.code.localeCompare(b.code));
    let rest = need;
    take = cand.map((c) => {
      const t = Math.min(rest, c.cap);
      rest -= t;
      return t;
    });
  }
  const lines = [];
  let got = 0;
  cand.forEach((c, i) => {
    if (!take[i]) return;
    const parts = spreadCapped(
      take[i],
      c.units.map((u) => u.cap),
    );
    c.units.forEach((u, j) => parts[j] && u.split(parts[j]).forEach((x) => lines.push({ ...x.l, amount: -x.amount })));
    got += take[i];
  });
  return { lines, shortfall: need - got };
}

// A whole transfer for one deficit function. amount defaults to the deficit plus the cushion,
// rounded up to whole dollars. Returns signed lines; net is 0 unless a donor group falls short.
export function buildTransfer(
  asr,
  deficit,
  { amount, cushion = 0, mode = 'rank', priority = [], kind, benefits = {} } = {},
) {
  const T = amount != null ? Math.round(amount) : up(deficit.deficit + cushion);
  const receiving = allocateReceiving(deficit, T, benefits);
  const donors = allocateDonors(asr, {
    fund: deficit.fund,
    excludeFunc: deficit.func,
    kind,
    need: sumBy(receiving, (l) => l.amount),
    mode,
    priority,
    benefits,
  });
  const lines = [...donors.lines, ...receiving];
  return {
    fund: deficit.fund,
    func: deficit.func,
    amount: T,
    lines,
    receiving,
    donors: donors.lines,
    shortfall: donors.shortfall,
    net: sumBy(lines, (l) => l.amount),
  };
}
