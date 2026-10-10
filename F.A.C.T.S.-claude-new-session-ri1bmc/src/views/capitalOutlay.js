import { $, missingMsg, dollars, esc, money, sumBy } from '../lib/format.js';
import { D } from '../state.js';

export function viewCap() {
  const main = $('#main');
  if (!D.cap.length) {
    main.innerHTML =
      `<header class="ph"><h1>Capital outlay</h1></header>` + missingMsg('Capital Outlay Projects');
    return;
  }
  main.innerHTML = `<header class="ph"><h1>Capital outlay</h1><p class="sub">Project allocations against amounts obligated by notice of obligation (NOB) and reimbursements paid, from the Capital Outlay Projects sheet.</p></header>
  ${D.cap
    .map((p) => {
      const ob = sumBy(p.items, (i) => i.obligated),
        pd = sumBy(p.items, (i) => i.paid),
        av = p.allocation - ob;
      return `<section class="panel"><h2>Project ${esc(p.project)}</h2>
    <dl class="figs" style="margin:0 0 14px"><div><dt>Allocation</dt><dd>${dollars(p.allocation)}</dd></div><div><dt>Obligated</dt><dd>${dollars(ob)}</dd></div><div><dt>Available</dt><dd class="${av < 0 ? 'neg' : ''}">${dollars(av)}</dd></div><div><dt>RfR paid</dt><dd>${dollars(pd)}</dd></div><div><dt>Obligated, not yet paid</dt><dd>${dollars(ob - pd)}</dd></div></dl>
    <div style="overflow-x:auto"><table class="t"><thead><tr><th>NOB</th><th>Vendor</th><th class="r">Obligated</th><th class="r">RfR paid</th><th class="r">Remaining to request</th></tr></thead><tbody>
    ${p.items.map((i) => `<tr><td class="num">${esc(i.nob)}</td><td>${esc(i.vendor)}</td><td class="r">${money(i.obligated)}</td><td class="r">${money(i.paid)}</td><td class="r">${money(i.obligated - i.paid)}</td></tr>`).join('')}</tbody>
    <tfoot><tr><th colspan="2">Total</th><td class="r">${money(ob)}</td><td class="r">${money(pd)}</td><td class="r">${money(ob - pd)}</td></tr></tfoot></table></div></section>`;
    })
    .join('')}`;
}
