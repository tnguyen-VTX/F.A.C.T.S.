import { $, missingMsg, esc, fmtD, money, sumBy } from '../lib/format.js';
import { D, UI, fundLabel } from '../state.js';

export function viewCR() {
  const main = $('#main');
  if (!D.cr.length) {
    main.innerHTML =
      `<header class="ph"><h1>Cash receipts</h1></header>` + missingMsg('Cash Receipts Journal Report');
    return;
  }
  main.innerHTML = `<header class="ph"><h1>Cash receipts</h1><p class="sub">Credits from the Cash Receipts Journal by fund and date, like the Cash Receipts pivot. Select a fund to see its deposits.</p></header>
  <div class="filters"><label>Search batches<input type="search" data-in="crq" value="${esc(UI.cr.q)}" placeholder="SB-9, CR27-0004, Title I"></label></div><div id="crres"></div>`;
  crResults();
}
export function crResults() {
  const el = $('#crres');
  const q = UI.cr.q.toLowerCase();
  const rows = D.cr.filter(
    (r) => !q || `${r.batch} ${r.bdesc} ${r.customer} ${r.adesc} ${r.code}`.toLowerCase().includes(q),
  );
  const byF = new Map();
  rows.forEach((r) => {
    if (!byF.has(r.fund)) byF.set(r.fund, []);
    byF.get(r.fund).push(r);
  });
  const funds = [...byF].sort((a, b) => a[0].localeCompare(b[0]));
  const total = sumBy(rows, (r) => r.credit);
  el.innerHTML = `<div class="scroll"><table class="t"><thead><tr><th>Fund</th><th class="r">Batches</th><th class="r">Credits</th></tr></thead>
  ${funds
    .map(([fc, ls]) => {
      const open = UI.cr.open.has(fc);
      const batches = new Map();
      ls.forEach((r) => {
        const k = r.date + '|' + r.batch;
        if (!batches.has(k))
          batches.set(k, { date: r.date, batch: r.batch, desc: r.bdesc, status: r.status, credit: 0 });
        batches.get(k).credit += r.credit;
      });
      return `<tbody><tr class="click" data-act="crOpen" data-k="${fc}" tabindex="0" aria-expanded="${open}"><td><span class="caret"></span>${esc(fundLabel(fc))}</td><td class="r num">${batches.size}</td><td class="r">${money(sumBy(ls, (r) => r.credit))}</td></tr>
    ${
      open
        ? `<tr><td colspan="3" class="nest"><table class="t"><thead><tr><th>Date</th><th>Batch</th><th>Description</th><th>Status</th><th class="r">Credits</th></tr></thead><tbody>${[
            ...batches.values(),
          ]
            .sort((a, b) => a.date.localeCompare(b.date))
            .map(
              (b) =>
                `<tr><td class="num">${fmtD(b.date)}</td><td class="code">${esc(b.batch)}</td><td>${esc(b.desc)}</td><td>${esc(b.status)}</td><td class="r">${money(b.credit)}</td></tr>`,
            )
            .join('')}</tbody></table></td></tr>`
        : ''
    }</tbody>`;
    })
    .join('')}
  <tfoot><tr><th>Total</th><td></td><td class="r">${money(total)}</td></tr></tfoot></table></div>`;
}
