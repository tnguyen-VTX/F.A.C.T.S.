import { $, missingMsg, esc, fmtD, money, monthName } from '../lib/format.js';
import { rfrState } from '../lib/parse.js';
import { D, fundLabel } from '../state.js';

export function fyMonths() {
  let y, m;
  const b = (D.begin || '').match(/(\d+)\/(\d+)\/(\d{4})/);
  if (b) {
    m = +b[1] - 1;
    y = +b[3];
  } else {
    const ds = D.rfr
      .map((r) => r.to)
      .filter(Boolean)
      .sort();
    const d = ds[0] || new Date().toISOString();
    y = +d.slice(0, 4);
    m = +d.slice(5, 7) - 1;
    if (m < 6) y--;
    m = 6;
  }
  return Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(y, m + i, 1)).toISOString().slice(0, 7));
}
export function viewRfR() {
  const main = $('#main');
  if (!D.rfr.length && D.missing.includes('RfR Summary Report')) {
    main.innerHTML = `<header class="ph"><h1>Reimbursements</h1></header>` + missingMsg('RfR Summary Report');
    return;
  }
  const months = fyMonths(),
    rows = D.rfr;
  const agg = (list) => {
    const o = { n: list.length, review: 0, dis: 0, appr: 0, approvedAmt: 0, paid: 0, requested: 0 };
    list.forEach((r) => {
      const s = rfrState(r.status);
      if (s === 'disapproved') o.dis++;
      else if (s === 'approved' || s === 'paid') o.appr++;
      else o.review++;
      o.approvedAmt += r.approved;
      o.paid += r.warrant;
      o.requested += r.requested;
    });
    return o;
  };
  const byM = months.map((ym) => ({ ym, ...agg(rows.filter((r) => r.to.slice(0, 7) === ym)) })),
    tot = agg(rows);
  const recv = {};
  D.cr
    .filter((r) => r.obj.startsWith('4'))
    .forEach((r) => {
      recv[r.fund] = (recv[r.fund] || 0) + r.credit;
    });
  const funds = [
    ...new Set([...rows.map((r) => r.fund), ...Object.keys(recv).filter((f) => /^(2[4-7]|31[24])/.test(f))]),
  ].sort();
  const mrow = (l, o, tag = 'td') =>
    `<tr><${tag}>${l}</${tag}><td class="r num">${o.n || ''}</td><td class="r num">${o.review || ''}</td><td class="r num">${o.dis || ''}</td><td class="r num">${o.appr || ''}</td><td class="r">${o.approvedAmt ? money(o.approvedAmt) : ''}</td><td class="r">${o.paid ? money(o.paid) : ''}</td></tr>`;
  main.innerHTML = `<header class="ph"><h1>Reimbursements</h1><p class="sub">Requests for reimbursement from the RfR Summary Report, matched against revenue receipts posted in the Cash Receipts Journal.</p></header>
  <h2 style="margin-top:24px">By reporting month</h2>
  <div class="scroll"><table class="t"><thead><tr><th>Period ending</th><th class="r">Submitted</th><th class="r">In review</th><th class="r">Disapproved</th><th class="r">Approved or paid</th><th class="r">$ Approved</th><th class="r">$ Paid</th></tr></thead>
  <tbody>${byM.map((o) => mrow(monthName(o.ym), o)).join('')}</tbody><tfoot>${mrow('Total', tot, 'th')}</tfoot></table></div>
  <h2 style="margin-top:28px">By fund</h2>
  <div class="scroll"><table class="t"><thead><tr><th>Fund</th><th class="r">Requests</th><th class="r">Requested</th><th class="r">Approved</th><th class="r">Warrants paid</th><th class="r">Revenue received</th><th class="r">Approved, not yet received</th></tr></thead><tbody>
  ${funds
    .map((fc) => {
      const l = rows.filter((r) => r.fund === fc),
        a = agg(l),
        rc = recv[fc] || 0;
      return `<tr><td>${esc(fundLabel(fc))}</td><td class="r num">${a.n || ''}</td><td class="r">${money(a.requested)}</td><td class="r">${money(a.approvedAmt)}</td><td class="r">${money(a.paid)}</td><td class="r">${money(rc)}</td><td class="r">${money(a.approvedAmt - rc)}</td></tr>`;
    })
    .join('')}</tbody></table></div>
  <p class="note">Lists funds with requests plus grant and state capital funds (24000 to 27999, 31200, 31400) with receipts. Revenue received sums cash receipt credits to revenue objects (4xxxx) by fund, like the Cash Receipts table on the RfR Tracker. Receipts can include prior-year requests.</p>
  <h2 style="margin-top:28px">All requests</h2>
  <div class="scroll"><table class="t"><thead><tr><th>Request</th><th>Fund</th><th>Period</th><th>Submitted</th><th>Status</th><th class="r">Requested</th><th class="r">Approved</th><th class="r">Warrant</th><th>Paid</th></tr></thead><tbody>
  ${
    rows
      .map(
        (
          r,
        ) => `<tr><td class="code">${esc(r.id)}</td><td>${esc(fundLabel(r.fund))}</td><td class="num">${fmtD(r.from)} to ${fmtD(r.to)}</td><td class="num">${fmtD(r.submitted)}</td><td><span class="pill ${rfrState(r.status)}">${esc(r.status)}</span></td>
  <td class="r">${money(r.requested)}</td><td class="r">${money(r.approved)}</td><td class="r">${r.warrant ? money(r.warrant) : ''}</td><td class="num">${fmtD(r.paidDate)}</td></tr>`,
      )
      .join('') || `<tr><td colspan="9" class="empty">No requests yet.</td></tr>`
  }</tbody></table></div>`;
}
