import { parseASR } from '../../src/lib/parse.js';

// Build a made-up Account Summary: { '2600': [[obj, budget, actual, enc], ...], ... } for fund 11000.
export function makeAsr(blocks) {
  const rows = [
    ['Test School'],
    ['Cycle: FY26-27'],
    [
      'Account Code',
      'Description',
      'Actual (Date Range)',
      'Budget (YTD)',
      'Actual (YTD)',
      'Encumbrance (YTD)',
      'Available (YTD)',
    ],
  ];
  for (const [fn, lines] of Object.entries(blocks)) {
    const tot = [0, 0, 0, 0];
    for (const [obj, b, a, e] of lines) {
      const v = [b, a, e, b - a - e];
      v.forEach((x, i) => (tot[i] += x));
      rows.push([`11000-${fn}-${obj}-0000-001707-1411`, 'x', 0, ...v]);
    }
    rows.push([`Subtotal of Element: [Function] ${fn} - F${fn}`, '', 0, ...tot]);
  }
  rows.push(['Grand Total', '', 0, 0, 0, 0, 0]);
  return parseASR(rows);
}
