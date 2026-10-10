// Wording templates for the BAR's longer narrative. Pure: the text is filled from the BAR's own lines.
// The narrative is for the business manager's records and the PED explanation; it never goes in the upload file.
import { BAR_TYPES, isRevenueObject } from './bar.js';

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
