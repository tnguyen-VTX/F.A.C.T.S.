import { $, missingMsg, T0, addT, dollars, esc, money, pctS, r2 } from '../lib/format.js';
import { D, UI, funcLabel } from '../state.js';

export function barHTML(t) {
  const spend = t.actual + t.enc,
    scale = Math.max(t.budget, spend, 1);
  const a = (Math.max(0, t.actual) / scale) * 100,
    e = (Math.max(0, t.enc) / scale) * 100,
    b = (Math.max(0, t.budget) / scale) * 100;
  const ov =
    spend > t.budget + 0.005
      ? `<i class="ov" style="left:${b}%;width:${Math.min(100, a + e) - b}%"></i>`
      : '';
  return `<div class="bar" role="img" aria-label="${pctS(spend, t.budget)} of budget committed"><i class="seg-a" style="left:0;width:${a}%"></i><i class="seg-e" style="left:${a}%;width:${e}%"></i>${ov}<span class="mk" style="left:calc(${b}% - 1px)"></span></div>`;
}
export const cells = (t) =>
  `<td class="r">${money(t.budget)}</td><td class="r">${money(t.actual)}</td><td class="r">${money(t.enc)}</td><td class="r">${money(t.avail)}</td>`;
export const pcts = (t) =>
  `<td class="r num">${pctS(t.actual, t.budget)}</td><td class="r num">${pctS(t.actual + t.enc, t.budget)}</td>`;
export function picture(T) {
  const spend = T.actual + T.enc,
    scale = Math.max(T.budget, spend, 1),
    w = (x) => (Math.max(0, x) / scale) * 100;
  const free = Math.max(0, T.budget - spend);
  return `<section class="picture" aria-label="Spending picture"><div class="pic-bar"><span class="seg-a" style="width:${w(T.actual)}%"></span><span class="seg-e" style="width:${w(T.enc)}%"></span><span class="seg-v" style="width:${w(free)}%"></span></div>
  <dl class="figs"><div><dt>Budget</dt><dd>${dollars(T.budget)}</dd></div><div><dt><i class="sw seg-a"></i>Actual</dt><dd>${dollars(T.actual)}</dd></div>
  <div><dt><i class="sw seg-e"></i>Encumbered</dt><dd>${dollars(T.enc)}</dd></div><div><dt><i class="sw seg-v"></i>Available</dt><dd class="${T.avail < 0 ? 'neg' : ''}">${dollars(T.avail)}</dd></div>
  <div><dt>Committed</dt><dd>${pctS(spend, T.budget)}</dd></div></dl></section>`;
}
export function fundBody(f) {
  const open = UI.openFunds.has(f.code),
    over = r2(f.tot.avail) < 0;
  let h = `<tbody><tr class="click${over ? ' over' : ''}" data-act="toggleFund" data-k="${f.code}" tabindex="0" aria-expanded="${open}">
    <th scope="row"><span class="caret"></span><b>${f.code}</b> ${esc(f.name)}</th>${cells(f.tot)}${pcts(f.tot)}<td>${barHTML(f.tot)}</td></tr>`;
  if (open) {
    const byF = new Map();
    f.lines.forEach((l) => {
      if (!byF.has(l.func)) byF.set(l.func, []);
      byF.get(l.func).push(l);
    });
    for (const [fn, ls] of [...byF].sort((a, b) => a[0].localeCompare(b[0]))) {
      const t = ls.reduce(addT, T0());
      h += `<tr class="fn"><td>${esc(funcLabel(fn))}</td>${cells(t)}${pcts(t)}<td></td></tr>`;
      h += ls
        .map(
          (l) =>
            `<tr class="line${r2(l.avail) < 0 ? ' over' : ''}"><td><span class="code">${l.code}</span><br>${esc(l.desc)}</td>${cells(l)}${pcts(l)}<td>${barHTML(l)}</td></tr>`,
        )
        .join('');
    }
  }
  return h + '</tbody>';
}
export function viewBudget() {
  const main = $('#main');
  const funds = [...D.asr.funds.values()].sort((a, b) => a.code.localeCompare(b.code));
  if (!funds.length) {
    main.innerHTML =
      `<header class="ph"><h1>Budget by fund</h1></header>` + missingMsg('Account Summary Report');
    return;
  }
  const T = funds.map((f) => f.tot).reduce(addT, T0());
  const over = funds.filter((f) => r2(f.tot.avail) < 0);
  const shown = UI.overOnly ? over : funds;
  main.innerHTML = `<header class="ph"><h1>Budget by fund</h1><p class="sub">${esc(D.cycle)} expenditures from the Account Summary Report. Select a fund to see its lines by function; red rows are over budget once encumbrances are counted.</p></header>
  ${picture(T)}
  <div class="toolbar"><label class="chk"><input type="checkbox" data-in="overOnly" ${UI.overOnly ? 'checked' : ''}> Only funds over budget (${over.length})</label>
  <div class="legend"><span><i class="sw seg-a"></i>Actual</span><span><i class="sw seg-e"></i>Encumbered</span><span><i class="sw seg-o"></i>Over budget</span><span>| budget line</span></div>
  <button class="btn small" data-act="expandAll">${UI.openFunds.size ? 'Collapse all' : 'Expand all'}</button></div>
  <div class="scroll"><table class="t"><thead><tr><th>Fund</th><th class="r">Budget</th><th class="r">Actual</th><th class="r">Encumbered</th><th class="r">Available</th><th class="r">Spent</th><th class="r">Committed</th><th style="min-width:150px">Budget used</th></tr></thead>
  ${shown.map(fundBody).join('')}
  <tfoot><tr><th>All funds</th>${cells(T)}${pcts(T)}<td>${barHTML(T)}</td></tr></tfoot></table></div>`;
}
