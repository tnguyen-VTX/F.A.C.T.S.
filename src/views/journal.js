import { $, missingMsg, esc, fmtD, fmtM, money, num, r2, sumBy } from '../lib/format.js';
import { D, S, UI } from '../state.js';

export function viewJE() {
  const main = $('#main');
  if (!D.fa.length) {
    main.innerHTML = `<header class="ph"><h1>Journal entries</h1></header>` + missingMsg('Fund Audit Report');
    return;
  }
  const jobs = [...new Set(D.fa.filter((r) => r.actual !== 0).map((r) => r.job))].sort();
  main.innerHTML = `<header class="ph"><h1>Journal entries</h1><p class="sub">Actual charges by account and detail, like the JE Worksheet pivot. Flag anything charged to the wrong place, then track it until it posts. Your list is saved in this browser.</p></header>
  <section class="panel" id="jelist"></section>
  <div class="filters"><label>Job class<select data-in="je" data-k="job"><option value="">All</option>${jobs.map((j) => `<option${UI.je.job === j ? ' selected' : ''}>${esc(j)}</option>`).join('')}</select></label>
  <label>Account, description or detail<input type="search" data-in="je" data-k="q" value="${esc(UI.je.q)}" placeholder="52112 or PR27-03"></label></div>
  <div id="jeres"></div>`;
  jeList();
  jeResults();
}
export function jeResults() {
  const el = $('#jeres');
  if (!el) return;
  const { job, q } = UI.je,
    ql = q.toLowerCase();
  const accts = new Map();
  for (const r of D.fa) {
    if (r.actual === 0 || (job && r.job !== job)) continue;
    if (!accts.has(r.code))
      accts.set(r.code, { code: r.code, desc: r.acctDesc, total: 0, details: new Map() });
    const a = accts.get(r.code);
    a.total += r.actual;
    const dk = r.detail || '(none)';
    if (!a.details.has(dk)) a.details.set(dk, { total: 0, dates: new Map() });
    const d = a.details.get(dk);
    d.total += r.actual;
    d.dates.set(r.date, (d.dates.get(r.date) || 0) + r.actual);
  }
  let list = [...accts.values()].sort((a, b) => a.code.localeCompare(b.code));
  if (ql)
    list = list.filter((a) =>
      `${a.code} ${a.desc} ${[...a.details.keys()].join(' ')}`.toLowerCase().includes(ql),
    );
  const flagged = new Set(S().je.map((e) => e.code + '|' + e.detail));
  const LIM = 150;
  el.innerHTML = list.length
    ? list
        .slice(0, LIM)
        .map(
          (
            a,
          ) => `<div class="acct"><div class="acct-h"><span class="code">${a.code}</span><span class="d">${esc(a.desc)}</span>${money(a.total)}</div>
    <div style="overflow-x:auto"><table class="t"><tbody>${[...a.details]
      .sort((x, y) => x[0].localeCompare(y[0]))
      .map(([dk, d]) => {
        const dates = [...d.dates].filter(([, v]) => r2(v) !== 0).sort((x, y) => x[0].localeCompare(y[0]));
        const ds =
          dates
            .slice(0, 8)
            .map(([dt, v]) => `${fmtD(dt)} ${fmtM(v)}`)
            .join('; ') + (dates.length > 8 ? `; +${dates.length - 8} more` : '');
        const isF = flagged.has(a.code + '|' + dk);
        return `<tr><td style="width:22%">${esc(dk)}</td><td class="dates">${esc(ds)}</td><td class="r" style="width:130px">${money(d.total)}</td>
      <td style="width:110px">${isF ? '<span class="flagged">On JE list</span>' : `<button class="btn small" data-act="jeAdd" data-code="${a.code}" data-desc="${esc(a.desc)}" data-detail="${esc(dk)}" data-amt="${r2(d.total)}">Flag</button>`}</td></tr>`;
      })
      .join('')}</tbody></table></div></div>`,
        )
        .join('') +
      (list.length > LIM
        ? `<p class="note">Showing ${LIM} of ${list.length} accounts. Search or pick a job class to narrow it.</p>`
        : '')
    : `<div class="panel empty">No actual charges match. Clear the search or choose a different job class.</div>`;
}
export function jeList() {
  const el = $('#jelist');
  if (!el) return;
  const je = S().je;
  if (!je.length) {
    el.innerHTML = `<h2>JE list</h2><p class="muted" style="margin:0">Nothing flagged yet. Use Flag on any line below to start the list.</p>`;
    return;
  }
  const opt = (arr, v) => arr.map((o) => `<option${o === v ? ' selected' : ''}>${o}</option>`).join('');
  el.innerHTML = `<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:10px"><h2 style="margin:0">JE list</h2><span class="muted">${je.filter((e) => e.status !== 'Posted').length} open</span>
  <button class="btn small" data-act="jeCopy" style="margin-left:auto">Copy list</button></div>
  <div style="overflow-x:auto"><table class="t jel"><thead><tr><th>Account</th><th>Detail</th><th class="r">Amount</th><th>Type</th><th>Note</th><th>Status</th><th>Posted</th><th></th></tr></thead><tbody>
  ${je
    .map(
      (e) => `<tr><td><span class="code">${e.code}</span><br>${esc(e.desc)}</td><td>${esc(e.detail)}</td>
  <td class="r"><input class="amt" type="number" step="0.01" value="${e.amount}" data-in="jeEdit" data-id="${e.id}" data-k="amount" aria-label="Amount"></td>
  <td><select data-in="jeEdit" data-id="${e.id}" data-k="type" aria-label="Type">${opt(['Reclass', 'Correction', 'Accrual', 'Other'], e.type)}</select></td>
  <td><input class="nt" value="${esc(e.note)}" data-in="jeEdit" data-id="${e.id}" data-k="note" placeholder="Reclass to 11000-2600" aria-label="Note"></td>
  <td><select data-in="jeEdit" data-id="${e.id}" data-k="status" aria-label="Status">${opt(['Draft', 'Submitted', 'Posted'], e.status)}</select></td>
  <td><input type="date" value="${esc(e.posted)}" data-in="jeEdit" data-id="${e.id}" data-k="posted" aria-label="Posted date"></td>
  <td><button class="btn small" data-act="jeDel" data-id="${e.id}" aria-label="Remove">Remove</button></td></tr>`,
    )
    .join('')}</tbody>
  <tfoot><tr><th colspan="2">Total</th><td class="r" id="jetot">${money(sumBy(je, (e) => num(e.amount)))}</td><td colspan="5"></td></tr></tfoot></table></div>`;
}
