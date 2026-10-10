import { $, missingMsg, dollars, esc, fmtM, money, num, r2, roundAway, sumBy } from '../lib/format.js';
import { D, S, UI, fundLabel } from '../state.js';

export const BASIS = { enc: 'Encumbrance', avail: 'Available', actual: 'Actual (YTD)', budget: 'Budget' };
export function barFunds() {
  return [...D.asr.funds.values()].filter((f) => f.lines.length).sort((a, b) => a.code.localeCompare(b.code));
}
export function loadBarFund(code) {
  const s = S().bar[code] || {};
  Object.assign(UI.bar, {
    fund: code,
    amount: s.amount || 0,
    basis: s.basis || 'enc',
    mode: s.mode || 'Increase',
    obj: s.obj || '',
  });
}
export function viewBAR() {
  const main = $('#main');
  const funds = barFunds();
  if (!funds.length) {
    main.innerHTML =
      `<header class="ph"><h1>BAR spread (v0.1)</h1></header>` + missingMsg('Account Summary Report');
    return;
  }
  if (!UI.bar.fund || !D.asr.funds.has(UI.bar.fund)) loadBarFund(funds[0].code);
  const b = UI.bar,
    saved = S().bar[b.fund] || {};
  main.innerHTML = `<header class="ph"><h1>BAR spread (v0.1)</h1><p class="sub">Spread a budget adjustment across a fund's lines in proportion to encumbrance, availability, spending, or budget. Allocations round to whole dollars, as on the BAR Worksheet. Settings and notes save per fund in this browser.</p></header>
  <div class="filters"><label>Fund<select data-in="barFund">${funds.map((f) => `<option value="${f.code}"${f.code === b.fund ? ' selected' : ''}>${esc(fundLabel(f.code))}</option>`).join('')}</select></label>
  <label>BAR type<select data-in="bar" data-k="mode">${['Increase', 'Transfer'].map((m) => `<option${b.mode === m ? ' selected' : ''}>${m}</option>`).join('')}</select></label>
  <label>Amount to spread<input type="number" step="1" data-in="bar" data-k="amount" value="${b.amount || ''}" placeholder="0"></label>
  <label>Objects starting with<input data-in="bar" data-k="obj" value="${esc(b.obj || '')}" placeholder="52 for benefits" size="12"></label>
  <label>Spread by<select data-in="bar" data-k="basis">${Object.entries(BASIS)
    .map(([k, l]) => `<option value="${k}"${b.basis === k ? ' selected' : ''}>${l}</option>`)
    .join('')}</select></label>
  <label class="chk"><input type="checkbox" data-in="bar" data-k="absorb"${b.absorb ? ' checked' : ''}> Put the rounding difference on the largest line</label>
  <label class="chk"><input type="checkbox" data-in="bar" data-k="skipZero"${b.skipZero ? ' checked' : ''}> Leave out lines with nothing to spread by</label></div>
  <div id="barres"></div>
  <section class="panel grid2"><label class="filters" style="margin:0;border:0;padding:0;background:none"><span>Status</span><select data-in="barNote" data-k="status">${['Not started', 'Drafted', 'Submitted', 'Approved', 'Posted'].map((s) => `<option${(saved.status || 'Not started') === s ? ' selected' : ''}>${s}</option>`).join('')}</select></label>
  <label class="filters" style="margin:0;border:0;padding:0;background:none;display:block"><span style="display:block;margin-bottom:4px">Notes</span><textarea data-in="barNote" data-k="note" placeholder="Submitted 09/09/2026">${esc(saved.note || '')}</textarea></label></section>`;
  barResults();
}
export function barCompute() {
  const b = UI.bar,
    f = D.asr.funds.get(b.fund),
    ex = new Set((S().bar[b.fund] || {}).excluded || []);
  let lines = f.lines.map((l) => ({ ...l, base: l[b.basis], share: 0, alloc: 0, absorbed: 0 }));
  if (b.obj) lines = lines.filter((l) => l.obj.startsWith(String(b.obj).trim()));
  if (b.skipZero) lines = lines.filter((l) => r2(l.base) !== 0);
  lines.forEach((l) => (l.inc = !ex.has(l.code)));
  const inc = lines.filter((l) => l.inc);
  const total = sumBy(inc, (l) => l.base),
    amt = roundAway(num(b.amount));
  inc.forEach((l) => {
    l.share = total ? l.base / total : 0;
    l.alloc = roundAway(amt * l.share);
  });
  let diff = amt - sumBy(inc, (l) => l.alloc);
  if (b.absorb && diff && inc.length && total) {
    const big = inc.reduce((m, l) => (Math.abs(l.alloc) > Math.abs(m.alloc) ? l : m));
    big.alloc += diff;
    big.absorbed = diff;
    diff = 0;
  }
  return {
    f,
    lines,
    inc,
    total,
    amt,
    diff,
    mixed: inc.some((l) => l.base > 0) && inc.some((l) => l.base < 0),
  };
}
export function barResults() {
  const el = $('#barres');
  if (!el) return;
  const c = barCompute(),
    b = UI.bar;
  el.innerHTML = `${c.mixed ? `<div class="warn">Some lines have a positive ${BASIS[b.basis].toLowerCase()} and some negative, so shares can exceed 100% or flip sign. Check the allocations before submitting.</div>` : ''}
  ${!c.total && c.lines.length ? `<div class="warn">These lines add up to zero ${BASIS[b.basis].toLowerCase()}, so there is nothing to spread by. Pick another basis.</div>` : ''}
  <div class="scroll"><table class="t"><thead><tr><th><input type="checkbox" data-in="barAll" aria-label="Include all lines"${c.lines.length && c.inc.length === c.lines.length ? ' checked' : ''}></th><th>Job</th><th>Account</th><th class="r">Budget</th><th class="r">Actual</th><th class="r">Encumbered</th><th class="r">Available</th><th class="r">Share</th><th class="r">${esc(b.mode)} amount</th><th class="r">New budget</th></tr></thead><tbody>
  ${
    c.lines
      .map(
        (
          l,
        ) => `<tr class="${r2(l.avail) < 0 ? 'over' : ''}${l.inc ? '' : ' muted'}"><td><input type="checkbox" data-in="barInc" data-code="${l.code}"${l.inc ? ' checked' : ''} aria-label="Include ${l.code}"></td><td class="num">${l.job}</td><td><span class="code">${l.code}</span><br>${esc(l.desc)}</td><td class="r">${money(l.budget)}</td><td class="r">${money(l.actual)}</td><td class="r">${money(l.enc)}</td><td class="r">${money(l.avail)}</td>
  <td class="r num">${l.inc ? (l.share * 100).toFixed(2) + '%' : ''}</td><td class="r"><b>${money(l.alloc)}</b>${l.absorbed ? `<br><span class="muted" style="font-size:12px">incl. ${fmtM(l.absorbed)} rounding</span>` : ''}</td><td class="r">${money(l.budget + l.alloc)}</td></tr>`,
      )
      .join('') ||
    `<tr><td colspan="10" class="empty">No lines match. Clear the object filter or include lines with nothing to spread by.</td></tr>`
  }</tbody>
  <tfoot><tr><th colspan="3">Included lines (${c.inc.length} of ${c.lines.length})</th><td class="r">${money(sumBy(c.inc, (l) => l.budget))}</td><td class="r">${money(sumBy(c.inc, (l) => l.actual))}</td><td class="r">${money(sumBy(c.inc, (l) => l.enc))}</td><td class="r">${money(sumBy(c.inc, (l) => l.avail))}</td><td class="r num">${c.total ? '100%' : ''}</td><td class="r">${money(sumBy(c.inc, (l) => l.alloc))}</td><td class="r">${money(sumBy(c.inc, (l) => l.budget + l.alloc))}</td></tr></tfoot></table></div>
  <div class="toolbar" style="margin-top:12px">${c.diff ? `<span class="neg">Allocations are ${fmtM(-c.diff)} away from the amount because of rounding.</span>` : ''}<button class="btn" data-act="barCopy">Copy allocations</button></div>`;
}
