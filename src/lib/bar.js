// A BAR (budget adjustment request): its shape and the checks run before it can be downloaded. Pure.
import { isSalaryObject } from './fte.js';
import { splitWith, uploadLocation } from './profile.js';

export const BAR_TYPES = {
  T: 'Transfer',
  M: 'Maintenance',
  I: 'Increase',
  IB: 'Initial budget',
  D: 'Decrease',
};
export const isRevenueObject = (obj) => String(obj).startsWith('4');
const r2 = (n) => Math.round(n * 100) / 100;
const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);

export function newBar(type, fund) {
  return {
    type,
    fund,
    contact: { first: '', middle: '', last: '' },
    flowthrough: { scope: '', from: '', to: '', carryover: '', allocation: '', total: '' },
    justification: '',
    lines: [],
  };
}
// A BAR line from an account code and a signed amount (and an optional FTE change).
export function barLine(profile, code, amount, fte = 0) {
  const s = splitWith(profile, code);
  return s ? { code, ...s, amount, fte } : { code, amount, fte, fund: String(code).split('-')[0] };
}

export function barTotals(bar) {
  const rev = bar.lines.filter((l) => isRevenueObject(l.obj)),
    exp = bar.lines.filter((l) => !isRevenueObject(l.obj));
  return {
    revenue: r2(sum(rev, (l) => l.amount)),
    expenditure: r2(sum(exp, (l) => l.amount)),
    net: r2(sum(bar.lines, (l) => l.amount)),
    fte: Math.round(sum(bar.lines, (l) => l.fte || 0) * 10000) / 10000,
  };
}

const decimals = (n) => (String(n).split('.')[1] || '').length;
const MDY = /^(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])\/\d{4}$/;
export const JUSTIFICATION_MAX = 255;

// Checks for a BAR. level 'stop' = cannot be downloaded; 'warn' = the user is told; 'info' = a note.
// ctx: { profile, asr (the loaded Account Summary, for budget checks) }.
export function validateBar(bar, { profile, asr } = {}) {
  const out = [];
  const add = (level, msg) => out.push({ level, msg });
  const t = bar.type;
  if (!BAR_TYPES[t]) add('stop', 'Choose a BAR type.');
  if (!/^\d{5}$/.test(String(bar.fund || ''))) add('stop', 'Choose the fund this BAR is for.');
  if (!bar.lines.length) add('stop', 'The BAR has no lines.');
  else if (bar.lines.every((l) => !(Math.abs(l.amount) >= 0.005)))
    add('stop', 'Every line has a zero amount, so the file would have no lines.');

  // Every line: fits the school's account code layout, is in the BAR's fund, has a clean amount.
  const seen = new Set();
  for (const l of bar.lines) {
    if (profile && !splitWith(profile, l.code))
      add('stop', `${l.code} does not match the account code layout of ${profile.name}.`);
    if (l.fund !== bar.fund)
      add('stop', `${l.code} is in fund ${l.fund}, not fund ${bar.fund}. A BAR has one fund.`);
    if (!Number.isFinite(l.amount)) add('stop', `${l.code} has no amount.`);
    else {
      if (decimals(l.amount) > 2) add('stop', `${l.code}: amounts can have at most 2 decimals.`);
      if (r2(l.amount) === 0) add('warn', `${l.code} has a zero amount; it will be left out of the file.`);
    }
    if (seen.has(l.code)) add('warn', `${l.code} appears more than once.`);
    seen.add(l.code);
    if (profile?.locationIds?.length && l.loc != null) {
      const up = uploadLocation(profile, l.loc);
      if (up && !profile.locationIds.includes(up))
        add(
          'warn',
          `${l.code}: location ${up} is not one of this school's PED location IDs (${profile.locationIds.join(', ')}).`,
        );
    }
    if (profile && l.loc != null && !uploadLocation(profile, l.loc))
      add(
        'stop',
        `${l.code}: the school's location rule does not give a 3-digit upload location for "${l.loc}".`,
      );
  }

  // Balance, by type.
  const tot = barTotals(bar);
  const hasRev = bar.lines.some((l) => isRevenueObject(l.obj));
  if (t === 'T' || t === 'M') {
    if (hasRev) add('stop', `${BAR_TYPES[t]} BARs move expenditure budget only; remove the revenue lines.`);
    if (Math.abs(tot.net) > 0.005)
      add('stop', `The BAR does not balance: lines net to ${tot.net.toFixed(2)}, not 0.00.`);
  }
  // OBMS refused a Transfer between two functions of the same series ("Same Func Xfer"; 2500 to 2100), and
  // its BAR Entry screen lists no 2000-series destination for a 2000-series source. A warning until the
  // rule is confirmed for other series.
  if (t === 'T') {
    const nets = new Map();
    for (const l of bar.lines) {
      if (isRevenueObject(l.obj) || !l.func || !Number.isFinite(l.amount)) continue;
      nets.set(l.func, (nets.get(l.func) || 0) + l.amount);
    }
    const give = [...nets].filter(([, v]) => Math.round(v) < 0).map(([f]) => f);
    const get = [...nets].filter(([, v]) => Math.round(v) > 0).map(([f]) => f);
    const pairs = give.flatMap((g) => get.filter((r) => r[0] === g[0]).map((r) => `${g} to ${r}`));
    if (pairs.length)
      add(
        'warn',
        `OBMS rejected a Transfer between functions of the same series ("Same Func Xfer"): ${pairs.slice(0, 3).join(', ')}${pairs.length > 3 ? ', ...' : ''}. In OBMS's own BAR Entry the destination list leaves out 2000-series functions when the source is 2500. Try a Maintenance BAR for these, or move from a function in another series.`,
      );
  }
  if (t === 'I' || t === 'IB' || t === 'D') {
    if (!hasRev) add('stop', `${BAR_TYPES[t]} BARs need the revenue line for the award.`);
    if (Math.abs(r2(tot.revenue - tot.expenditure)) > 0.005)
      add(
        'stop',
        `Revenue (${tot.revenue.toFixed(2)}) must equal expenditure (${tot.expenditure.toFixed(2)}).`,
      );
    // The award (typed by the user) caps what the expenditure lines may add up to.
    const award = Math.abs(Number(String(bar.award ?? '').replace(/[$,\s]/g, '')));
    if (String(bar.award ?? '').trim() !== '' && Number.isFinite(award)) {
      const spent = Math.abs(tot.expenditure),
        left = r2(award - spent);
      if (left < -0.005)
        add('stop', `Expenditure lines (${spent.toFixed(2)}) are more than the award (${award.toFixed(2)}).`);
      else if (left > 0.005)
        add(
          'warn',
          `${spent.toFixed(2)} of the ${award.toFixed(2)} award is assigned; ${left.toFixed(2)} is left.`,
        );
      if (hasRev && Math.abs(Math.abs(tot.revenue) - award) > 0.005)
        add(
          'warn',
          `The revenue lines (${Math.abs(tot.revenue).toFixed(2)}) differ from the award (${award.toFixed(2)}).`,
        );
    } else if (String(bar.award ?? '').trim() !== '')
      add('stop', 'The award amount is not a number. Type digits only, like 12000.');
    const wrongSign = bar.lines.some((l) => (t === 'D' ? l.amount > 0 : l.amount < 0));
    if (wrongSign)
      add(
        'warn',
        t === 'D'
          ? 'A Decrease BAR should have negative amounts.'
          : `${BAR_TYPES[t]} BARs should have positive amounts.`,
      );
    for (const l of bar.lines.filter((x) => isRevenueObject(x.obj)))
      if (l.func !== '0000' || l.prog !== '0000' || l.job !== '0000')
        add('warn', `${l.code}: revenue lines normally use function 0000, program 0000 and job class 0000.`);
  }
  if (t === 'M') {
    const funcs = new Set(bar.lines.map((l) => l.func));
    if (funcs.size > 1)
      add('stop', 'A Maintenance BAR moves money within one function; these lines are in more than one.');
  }

  // Never take a line or a function below zero (Transfer, Maintenance, Decrease).
  if (asr && (t === 'T' || t === 'M' || t === 'D')) {
    const lineIndex = new Map();
    const f = asr.funds.get(bar.fund);
    if (f) for (const l of f.lines) lineIndex.set(l.code, l);
    const byFunc = new Map();
    // A code listed twice is checked on its net change, so two small takes cannot hide a large one.
    const byCode = new Map();
    for (const l of bar.lines) {
      if (isRevenueObject(l.obj)) continue;
      byCode.set(l.code, (byCode.get(l.code) || 0) + (Number.isFinite(l.amount) ? l.amount : 0));
    }
    for (const [code, net] of byCode) {
      if (!(net < 0)) continue;
      const base = lineIndex.get(code);
      if (!base) {
        add('warn', `${code} is not in the loaded Account Summary, so its budget could not be checked.`);
        continue;
      }
      if (r2(base.avail + net) < 0)
        add(
          'stop',
          `${code}: taking ${(-net).toFixed(2)} leaves it ${r2(base.avail + net).toFixed(2)} available (over budget).`,
        );
    }
    for (const l of bar.lines) byFunc.set(l.func, (byFunc.get(l.func) || 0) + l.amount);
    const fns = f?.funcs?.length ? f.funcs : [];
    for (const [fn, delta] of byFunc) {
      if (!(delta < 0)) continue;
      const base = fns.find((x) => x.code === fn);
      if (base && r2(base.tot.avail + delta) < 0)
        add(
          'stop',
          `Function ${fn} would end ${r2(base.tot.avail + delta).toFixed(2)} available (over budget).`,
        );
    }
  }

  // Flowthrough funds carry extra header fields; other funds must not.
  const ft = (profile?.funds || []).find((x) => x.code === bar.fund)?.flowthrough;
  const fl = bar.flowthrough || {};
  const money = ['carryover', 'allocation', 'total'];
  const filled = [fl.scope, fl.from, fl.to, ...money.map((k) => fl[k])].some((v) => String(v ?? '') !== '');
  if (ft) {
    if (!['Y', 'N'].includes(fl.scope))
      add('stop', 'Flowthrough fund: say whether the change scope is Y or N.');
    for (const k of ['from', 'to'])
      if (!MDY.test(fl[k] || ''))
        add('stop', `Flowthrough fund: the budget ${k === 'from' ? 'from' : 'to'} date must be mm/dd/yyyy.`);
    for (const k of money) {
      const v = Number(String(fl[k] ?? '').replace(/[$,]/g, ''));
      if (fl[k] === '' || fl[k] == null || !Number.isFinite(v))
        add('stop', `Flowthrough fund: enter the ${k} amount.`);
      else if (v < 0) add('stop', `Flowthrough fund: the ${k} amount cannot be negative.`);
    }
    const n = (k) => Number(String(fl[k] ?? '').replace(/[$,]/g, '')) || 0;
    if (Math.abs(r2(n('carryover') + n('allocation') - n('total'))) > 0.005)
      add(
        'warn',
        'Flowthrough fund: carryover plus current-year allocation does not equal the total approved budget.',
      );
  } else if (filled)
    add(
      'warn',
      'The flowthrough fields are filled in, but this fund is not marked flowthrough; they will be left out of the file.',
    );

  // OBMS rejected salary (51100) lines with no FTE on a first real upload ("Missing projected FTE").
  // A warning, not a stop: it did not flag every 51100 line, so not every line needs one.
  const noFte = bar.lines.filter(
    (l) =>
      !isRevenueObject(l.obj) &&
      isSalaryObject(l.obj, profile?.fteObjects) &&
      Number.isFinite(l.amount) &&
      Math.round(l.amount) !== 0 &&
      !(Math.abs(Number(l.fte)) > 0),
  );
  if (noFte.length)
    add(
      'warn',
      `${noFte.length} salary line${noFte.length === 1 ? ' has' : 's have'} no FTE (${noFte
        .slice(0, 4)
        .map((l) => l.code)
        .join(
          ', ',
        )}${noFte.length > 4 ? `, and ${noFte.length - 4} more` : ''}). OBMS has rejected salary lines with no FTE ("Missing projected FTE"). Enter the FTE change in each line's FTE box.`,
    );

  // Header fields.
  if (profile && !String(profile.districtCode || '').trim())
    add('stop', 'The school profile needs its district/parent code (it goes in the BAR file).');
  const j = bar.justification || '';
  if (!j.trim()) add('warn', 'No justification.');
  if (j.length > JUSTIFICATION_MAX)
    add('warn', `The justification is ${j.length} characters; the limit is ${JUSTIFICATION_MAX}.`);
  for (const [ch, name] of [
    ['"', 'a double quote'],
    ['|', 'a pipe'],
    [',', 'a comma'],
  ])
    if (j.includes(ch))
      add(
        'stop',
        `The justification contains ${name}, which breaks the BAR file. Edit the justification to remove it.`,
      );
  for (const [k, label] of [
    ['first', 'first'],
    ['middle', 'middle'],
    ['last', 'last'],
  ]) {
    const v = bar.contact?.[k] || '';
    if (v.length > 20) add('warn', `The contact ${label} name is longer than 20 characters.`);
    if (/[",|]/.test(v))
      add('stop', `The contact ${label} name contains a comma, quote or pipe, which breaks the BAR file.`);
    else if (v && !/^[A-Za-z .'-]+$/.test(v))
      add('warn', `The contact ${label} name should be letters only.`);
  }
  return out;
}
export const canDownload = (checks) => !checks.some((c) => c.level === 'stop');
