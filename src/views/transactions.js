import { $, missingMsg, T0, addT, esc, fmtD, money, monthName } from '../lib/format.js';
import { D, UI, funcLabel, fundLabel } from '../state.js';

export const SRC = {
  DE: 'Deductions',
  PO: 'Purchase orders',
  JO: 'Jobs',
  IN: 'Vouchers',
  JE: 'Journal entries',
  CR: 'Cash receipts',
  // Derived for CSV exports that have no Src column (see deriveSource in lib/parse.js).
  PR: 'Payroll registers',
  RF: 'Cash receipt fees',
  EN: 'Encumbrances',
};
export const TXF = [
  ['fund', 'Fund'],
  ['func', 'Function'],
  ['obj', 'Object'],
  ['job', 'Job class'],
  ['prog', 'Program'],
  ['src', 'Source'],
];
export const optLabel = (k, v) =>
  k === 'fund'
    ? fundLabel(v)
    : k === 'func'
      ? funcLabel(v)
      : k === 'src'
        ? `${v}${SRC[v] ? ' ' + SRC[v] : ''}`
        : v;
export const GROUPS = {
  name: { label: 'Vendor or employee', key: (r) => r.name || '(no name)' },
  account: { label: 'Account', key: (r) => r.code, sub: (r) => r.acctDesc },
  detail: { label: 'Detail (PO, register)', key: (r) => r.detail || '(none)' },
  fund: { label: 'Fund', key: (r) => r.fund, sub: (r) => D.fundNames[r.fund] || '' },
  func: { label: 'Function', key: (r) => r.func, sub: (r) => D.asr.funcNames[r.func] || '' },
  obj: { label: 'Object', key: (r) => r.obj, sub: (r) => r.acctDesc },
  job: { label: 'Job class', key: (r) => r.job },
  src: { label: 'Source', key: (r) => r.src, sub: (r) => SRC[r.src] || '' },
  month: {
    label: 'Month',
    key: (r) => r.date.slice(0, 7),
    sub: (r) => (r.date ? monthName(r.date.slice(0, 7)) : ''),
  },
};
export function viewTx() {
  const main = $('#main');
  if (!D.fa.length) {
    main.innerHTML = `<header class="ph"><h1>Transactions</h1></header>` + missingMsg('Fund Audit Report');
    return;
  }
  const f = UI.tx.f,
    uniq = (k) => [...new Set(D.fa.map((r) => r[k]))].filter(Boolean).sort();
  const names = uniq('name');
  main.innerHTML = `<header class="ph"><h1>Transactions</h1><p class="sub">Every line of the Fund Audit Report (${D.fa.length.toLocaleString()} lines). Filter, then group to see what makes up a balance. Select a group to list its transactions.</p></header>
  <div class="filters">${TXF.map(
    ([k, l]) =>
      `<label>${l}<select data-in="txf" data-k="${k}"><option value="">All</option>${uniq(k)
        .map(
          (v) => `<option value="${esc(v)}"${f[k] === v ? ' selected' : ''}>${esc(optLabel(k, v))}</option>`,
        )
        .join('')}</select></label>`,
  ).join('')}
  <label>Vendor or employee<input list="dl-name" data-in="txf" data-k="name" value="${esc(f.name || '')}" placeholder="Any"></label>
  <label>Detail contains<input data-in="txf" data-k="detail" value="${esc(f.detail || '')}" placeholder="PO27-015"></label>
  <label>From<input type="date" data-in="txf" data-k="from" value="${esc(f.from || '')}"></label>
  <label>To<input type="date" data-in="txf" data-k="to" value="${esc(f.to || '')}"></label>
  <label>Search text<input type="search" data-in="txf" data-k="q" value="${esc(f.q || '')}" placeholder="Description, number, check"></label>
  <label>Group by<select data-in="txgroup">${Object.entries(GROUPS)
    .map(([k, g]) => `<option value="${k}"${UI.tx.group === k ? ' selected' : ''}>${g.label}</option>`)
    .join('')}</select></label>
  <button class="btn" data-act="txReset">Clear filters</button></div>
  <datalist id="dl-name">${names.map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
  <div id="txres"></div>`;
  txResults();
}
export function txFiltered() {
  const f = UI.tx.f,
    name = (f.name || '').toLowerCase(),
    det = (f.detail || '').toLowerCase(),
    q = (f.q || '').toLowerCase();
  return D.fa.filter(
    (r) =>
      (!f.fund || r.fund === f.fund) &&
      (!f.func || r.func === f.func) &&
      (!f.obj || r.obj === f.obj) &&
      (!f.job || r.job === f.job) &&
      (!f.prog || r.prog === f.prog) &&
      (!f.src || r.src === f.src) &&
      (!name || r.name.toLowerCase().includes(name)) &&
      (!det || r.detail.toLowerCase().includes(det)) &&
      (!f.from || r.date >= f.from) &&
      (!f.to || r.date <= f.to) &&
      (!q || `${r.tdesc} ${r.desc} ${r.number} ${r.check} ${r.tno} ${r.acctDesc}`.toLowerCase().includes(q)),
  );
}
export function txResults() {
  const el = $('#txres');
  if (!el) return;
  const rows = txFiltered(),
    G = GROUPS[UI.tx.group];
  const map = new Map();
  for (const r of rows) {
    const k = G.key(r);
    if (!map.has(k)) map.set(k, { key: k, sub: G.sub ? G.sub(r) : '', rows: [], ...T0() });
    addT(map.get(k), r).rows.push(r);
  }
  const s = UI.tx.sort,
    dir = UI.tx.dir;
  const groups = [...map.values()].sort((a, b) =>
    s === 'key'
      ? dir * String(a.key).localeCompare(String(b.key))
      : s === 'n'
        ? dir * (a.rows.length - b.rows.length)
        : dir * (a[s] - b[s]),
  );
  const T = rows.reduce(addT, T0());
  const LIMIT = 600;
  // Some exports carry no budget amounts (zero in every row). Budget and Available would then mislead.
  const hasBudget = D.fa.some((r) => r.budget);
  const cols = hasBudget ? 6 : 4;
  const th = (k, l, r) =>
    `<th class="${r ? 'r' : ''}" data-act="txSort" data-k="${k}" aria-sort="${s === k ? (dir > 0 ? 'ascending' : 'descending') : 'none'}">${l}${s === k ? (dir > 0 ? ' ▲' : ' ▼') : ''}</th>`;
  el.innerHTML = `<p class="note">${rows.length.toLocaleString()} lines in ${groups.length.toLocaleString()} groups.</p>
  <div class="scroll"><table class="t"><thead><tr>${th('key', G.label)}${th('n', 'Lines', 1)}${hasBudget ? th('budget', 'Budget', 1) : ''}${th('actual', 'Actual', 1)}${th('enc', 'Encumbrance', 1)}${hasBudget ? th('avail', 'Available', 1) : ''}</tr></thead>
  ${groups
    .slice(0, LIMIT)
    .map((g) => {
      const open = UI.tx.open.has(g.key);
      return `<tbody><tr class="click" data-act="txOpen" data-k="${esc(g.key)}" tabindex="0" aria-expanded="${open}"><td><span class="caret"></span>${esc(G.key === GROUPS.fund.key ? g.key : g.key)}${g.sub ? ` <span class="muted">${esc(g.sub)}</span>` : ''}</td>
    <td class="r num">${g.rows.length}</td>${hasBudget ? `<td class="r">${money(g.budget)}</td>` : ''}<td class="r">${money(g.actual)}</td><td class="r">${money(g.enc)}</td>${hasBudget ? `<td class="r">${money(g.avail)}</td>` : ''}</tr>
    ${open ? `<tr><td colspan="${cols}" class="nest">${txTable(g.rows)}</td></tr>` : ''}</tbody>`;
    })
    .join('')}
  <tfoot><tr><th>Total</th><td class="r num">${rows.length.toLocaleString()}</td>${hasBudget ? `<td class="r">${money(T.budget)}</td>` : ''}<td class="r">${money(T.actual)}</td><td class="r">${money(T.enc)}</td>${hasBudget ? `<td class="r">${money(T.avail)}</td>` : ''}</tr></tfoot></table></div>
  ${hasBudget ? '' : '<p class="note">This Fund Audit has no budget amounts, so Budget and Available are not shown. Budget by fund has them.</p>'}
  ${groups.length > LIMIT ? `<p class="note">Showing the first ${LIMIT} groups. Narrow the filters to see the rest.</p>` : ''}`;
}
export function txTable(rows) {
  const LIM = 400;
  const list = [...rows].sort(
    (a, b) => a.date.localeCompare(b.date) || String(a.tno).localeCompare(String(b.tno)),
  );
  return `<div style="overflow-x:auto"><table class="t"><thead><tr><th>Date</th><th>Src</th><th>Transaction</th><th>Name</th><th>Description</th><th>Detail</th><th>Account</th><th class="r">Actual</th><th class="r">Encumbrance</th></tr></thead><tbody>
  ${list
    .slice(0, LIM)
    .map(
      (r) =>
        `<tr><td class="num">${fmtD(r.date)}</td><td>${esc(r.src)}</td><td>${esc(r.tdesc)} ${r.tno !== '' ? `<span class="muted">#${esc(r.tno)}</span>` : ''}</td><td>${esc(r.name)}</td><td>${esc([r.number, r.desc].filter(Boolean).join(' '))}</td><td>${esc(r.detail)}</td><td class="code">${r.code}</td><td class="r">${money(r.actual)}</td><td class="r">${money(r.enc)}</td></tr>`,
    )
    .join('')}
  </tbody></table></div>${list.length > LIM ? `<p class="note">First ${LIM} of ${list.length} lines. Add a filter to narrow this group.</p>` : ''}`;
}
