// Wording templates for the BAR's longer narrative. Pure: the text is filled from the BAR's own lines.
// The narrative is for the business manager's records and the PED explanation; it never goes in the upload file.
import { BAR_TYPES, isRevenueObject } from './bar.js';
import { fundFunctions } from './barLogic.js';

const usd = (n) => `$${Math.round(Math.abs(n)).toLocaleString('en-US')}`;
const and = (list) =>
  list.length < 3 ? list.join(' and ') : `${list.slice(0, -1).join(', ')}, and ${list[list.length - 1]}`;

// Net change by function (expenditure lines only), whole dollars.
export function functionNets(bar) {
  const m = new Map();
  for (const l of bar.lines) {
    if (isRevenueObject(l.obj) || !Number.isFinite(l.amount)) continue;
    m.set(l.func, (m.get(l.func) || 0) + l.amount);
  }
  return [...m.entries()]
    .map(([func, net]) => ({ func, net: Math.round(net) }))
    .filter((x) => x.net !== 0)
    .sort((a, b) => a.func.localeCompare(b.func));
}
// "Instruction (1000)", or just "1000" when the report gives no title.
export const functionTitle = (code, funcNames = {}) =>
  funcNames[code] ? `${funcNames[code]} (${code})` : String(code);

// Dollars moved by an expenditure side: what the receiving lines add up to.
const moved = (bar) =>
  bar.lines
    .filter((l) => !isRevenueObject(l.obj) && Number.isFinite(l.amount) && l.amount > 0)
    .reduce((s, l) => s + l.amount, 0);
// What the revenue lines add up to (an Increase, Initial Budget or Decrease), in whole dollars.
const revenue = (bar) =>
  Math.round(
    bar.lines
      .filter((l) => isRevenueObject(l.obj) && Number.isFinite(l.amount))
      .reduce((s, l) => s + l.amount, 0),
  );
const fundTitle = (code, fundNames = {}) => (fundNames[code] ? `${fundNames[code]} (${code})` : String(code));
const givers = (nets, funcNames) => and(nets.map((x) => `the ${functionTitle(x.func, funcNames)} function`));
const receivers = (nets, funcNames) => and(nets.map((x) => `${functionTitle(x.func, funcNames)} function`));
const NEED_BOTH =
  'This template needs functions that give money and functions that receive it. Add the BAR lines first.';

export const TEMPLATES = [
  {
    id: 'transfer-negative',
    title: 'Transfer (negative function)',
    types: ['T'],
    build(bar, { school, funcNames }) {
      const nets = functionNets(bar);
      const from = nets.filter((x) => x.net < 0),
        to = nets.filter((x) => x.net > 0);
      if (!from.length || !to.length)
        return {
          error:
            'This template needs functions that give money and functions that receive it. Add the BAR lines first.',
        };
      const fromText = and(
        from.map((x) => `the ${functionTitle(x.func, funcNames)} function in the amount of ${usd(x.net)}`),
      );
      const toText = and(to.map((x) => `${functionTitle(x.func, funcNames)} function`));
      return {
        text: `${school} is requesting a transfer from ${fromText} to ${toText} to align with actual expenditures and encumbrances. The transfer is needed to ensure the function is not over budget by any of its functions.`,
      };
    },
  },
  {
    id: 'transfer-positive',
    title: 'Transfer (positive function)',
    types: ['T'],
    build(bar, { school, funcNames }) {
      const nets = functionNets(bar);
      const from = nets.filter((x) => x.net < 0),
        to = nets.filter((x) => x.net > 0);
      if (!from.length || !to.length) return { error: NEED_BOTH };
      return {
        text: `${school} is requesting a transfer of ${usd(moved(bar))} from ${givers(from, funcNames)} to ${receivers(to, funcNames)}. The funds are available in the giving function after accounting for actual expenditures and encumbrances, and the transfer ensures the receiving function is not over budget.`,
      };
    },
  },
  {
    id: 'maintenance',
    title: 'Maintenance',
    types: ['M'],
    build(bar, { school, funcNames }) {
      const exp = bar.lines.filter((l) => !isRevenueObject(l.obj) && l.func);
      const funcs = [...new Set(exp.map((l) => l.func))];
      const amount = usd(moved(bar));
      if (!moved(bar)) return { error: NEED_BOTH };
      const tail = 'to align the budget with actual expenditures and encumbrances.';
      if (funcs.length === 1)
        return {
          text: `${school} is requesting a maintenance transfer of ${amount} within the ${functionTitle(funcs[0], funcNames)} function ${tail}`,
        };
      const nets = functionNets(bar);
      const from = nets.filter((x) => x.net < 0),
        to = nets.filter((x) => x.net > 0);
      if (!from.length || !to.length) return { error: NEED_BOTH };
      return {
        text: `${school} is requesting a maintenance transfer of ${amount} from ${givers(from, funcNames)} to ${receivers(to, funcNames)} ${tail}`,
      };
    },
  },
  {
    id: 'increase',
    title: 'Increase / Initial Budget',
    types: ['I', 'IB'],
    build(bar, { school, fundNames }) {
      const r = revenue(bar);
      if (r <= 0) return { error: 'This template needs the revenue line for the award. Add it first.' };
      return {
        text: `${school} is requesting ${bar.type === 'IB' ? 'an initial budget' : 'an increase'} of ${usd(r)} in the ${fundTitle(bar.fund, fundNames)} fund to budget the award received.`,
      };
    },
  },
  {
    id: 'decrease',
    title: 'Decrease',
    types: ['D'],
    build(bar, { school, fundNames }) {
      const r = revenue(bar);
      if (r >= 0)
        return {
          error: 'This template needs the revenue line with the amount of the decrease. Add it first.',
        };
      return {
        text: `${school} is requesting a decrease of ${usd(r)} in the ${fundTitle(bar.fund, fundNames)} fund.`,
      };
    },
  },
];

export const templatesFor = (type) => TEMPLATES.filter((t) => t.types.includes(type));

// Returns { text } or { error }.
export function fillTemplate(id, bar, ctx) {
  const t = TEMPLATES.find((x) => x.id === id);
  if (!t) return { error: 'Choose a template.' };
  if (!t.types.includes(bar.type))
    return { error: `This template is for ${t.types.map((x) => BAR_TYPES[x]).join(' or ')} BARs.` };
  return t.build(bar, ctx);
}

// For a Transfer: which template fits. A receiving function that is over budget in the loaded Account Summary
// points to "negative function"; otherwise "positive function". null when it cannot tell.
export function suggestTemplate(bar, asr) {
  if (bar.type !== 'T' || !asr?.funds) return null;
  const fund = asr.funds.get(bar.fund);
  if (!fund) return null;
  const subtotals = new Map(fundFunctions(fund).map((f) => [f.code, f.tot.avail]));
  const to = functionNets(bar).filter((x) => x.net > 0);
  if (!to.length) return null;
  return to.some((x) => Math.round(subtotals.get(x.func) ?? 0) < 0)
    ? 'transfer-negative'
    : 'transfer-positive';
}

// True when the narrative was filled from this BAR but the BAR's lines now give different text.
// Hand edits to the narrative do not count: it compares the text as generated at fill time.
export function narrativeStale(bar, ctx) {
  const f = bar.narrativeFill;
  if (!f?.id || !bar.narrative) return false;
  const r = fillTemplate(f.id, bar, ctx);
  return !!r.error || r.text !== f.text;
}
