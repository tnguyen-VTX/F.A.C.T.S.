import { makeBarFile } from '../lib/barCsv.js';
import {
  BAR_TYPES,
  JUSTIFICATION_MAX,
  barLine,
  barTotals,
  canDownload,
  isRevenueObject,
  newBar,
  validateBar,
} from '../lib/bar.js';
import { buildTransfer, findDeficits } from '../lib/barLogic.js';
import { isSalaryObject } from '../lib/fte.js';
import { $, esc, fmtM, missingMsg, num } from '../lib/format.js';
import { suggestJustification } from '../lib/justify.js';
import { D, FY, S, UI, fundLabel, profile, saveStore } from '../state.js';

const TYPES = ['T', 'M', 'I', 'IB', 'D'];
const LEVEL = { stop: 'Stop', warn: 'Check', info: 'Note' };

// Working state for this screen. Funds picked and settings are remembered per school and fiscal year.
export function bb() {
  if (!UI.bb) {
    const saved = S().bb || {};
    UI.bb = {
      funds: new Set(saved.funds || []),
      type: saved.type || 'T',
      mode: saved.mode || 'rank',
      cushion: saved.cushion || 0,
      draft: S().bbDraft || null,
      note: '',
      add: { code: '', amount: '' },
      startFund: '',
    };
  }
  return UI.bb;
}
const keep = () => {
  const b = bb();
  S().bb = { funds: [...b.funds], type: b.type, mode: b.mode, cushion: b.cushion };
  S().bbDraft = b.draft;
  saveStore();
};
const ctx = () => ({ profile: profile(), asr: D.asr, fiscalYear: FY.value });
const descOf = (code) => {
  for (const f of D.asr.funds.values()) for (const l of f.lines) if (l.code === code) return l.desc;
  return '';
};
export const bbFile = () => makeBarFile(bb().draft, ctx());

export function viewBarBuilder() {
  const main = $('#main');
  const funds = [...D.asr.funds.values()]
    .filter((f) => f.lines.length)
    .sort((a, b) => a.code.localeCompare(b.code));
  if (!funds.length) {
    main.innerHTML =
      `<header class="ph"><h1>BAR builder</h1></header>` + missingMsg('Account Summary Report');
    return;
  }
  const b = bb();
  main.innerHTML = `<header class="ph"><h1>BAR builder</h1><p class="sub">Find what is over budget, build the BAR, check it, and download the OBMS upload file. Pick the funds to work in; each BAR is for one fund.</p></header>
  <section class="panel"><h2>Funds</h2><div class="fundpick">${funds
    .map(
      (f) =>
        `<label class="chk"><input type="checkbox" data-in="bbFund" data-code="${esc(f.code)}"${b.funds.has(f.code) ? ' checked' : ''}> ${esc(fundLabel(f.code))}</label>`,
    )
    .join(
      '',
    )}</div><p class="muted">${b.funds.size ? `${b.funds.size} selected.` : 'None picked: all funds are shown.'}</p></section>
  <section class="panel"><h2>Start a BAR</h2><div class="filters">
  <label>BAR type<select data-in="bbType">${TYPES.map((t) => `<option value="${t}"${b.type === t ? ' selected' : ''}>${esc(BAR_TYPES[t])} (${t})</option>`).join('')}</select></label>
  <label>Fund<select data-in="bbStartFund"><option value="">Choose…</option>${funds.map((f) => `<option value="${esc(f.code)}"${b.startFund === f.code ? ' selected' : ''}>${esc(fundLabel(f.code))}</option>`).join('')}</select></label>
  <button class="btn" data-act="bbStart">Start an empty ${esc(BAR_TYPES[b.type])} BAR</button></div></section>
  <div id="bbdef"></div><div id="bbdraft"></div>`;
  bbDeficits();
  bbDraft();
}

export function bbDeficits() {
  const el = $('#bbdef');
  if (!el) return;
  const b = bb(),
    list = findDeficits(D.asr, [...b.funds]);
  el.innerHTML = `<section class="panel"><h2>Over budget</h2><p class="muted">Functions whose Available is below zero. A transfer adds the deficit plus a cushion and takes it from other functions of the same fund that have room.</p>
  <div class="filters"><label>Cushion ($)<input type="number" min="0" step="1" data-in="bbCushion" value="${b.cushion || 0}"></label>
  <label>Take from<select data-in="bbMode"><option value="rank"${b.mode === 'rank' ? ' selected' : ''}>Functions in my order first</option><option value="spread"${b.mode === 'spread' ? ' selected' : ''}>Spread across all with room</option></select></label></div>
  ${
    list.length
      ? `<div class="scroll"><table class="t"><thead><tr><th>Fund</th><th>Function</th><th class="r">Available</th><th class="r">Deficit</th><th></th></tr></thead><tbody>${list
          .map(
            (d) =>
              `<tr><td>${esc(fundLabel(d.fund))}</td><td>${esc(d.func)} ${esc(d.funcName)}</td><td class="r"><span class="num neg">${fmtM(d.avail)}</span></td><td class="r num">${fmtM(d.deficit)}</td><td class="r"><button class="btn" data-act="bbBuild" data-fund="${esc(d.fund)}" data-func="${esc(d.func)}">Build a transfer</button></td></tr>`,
          )
          .join('')}</tbody></table></div>`
      : '<p>Nothing is over budget in the funds shown.</p>'
  }</section>`;
}

// Build a balanced transfer for one deficit function and make it the working BAR.
export function bbBuildTransfer(fund, func) {
  const b = bb(),
    d = findDeficits(D.asr, [fund]).find((x) => x.func === func);
  if (!d) return;
  const t = buildTransfer(D.asr, d, {
    cushion: num(b.cushion),
    mode: b.mode,
    priority: profile().donorPriority || [],
  });
  const bar = newBar('T', fund);
  bar.lines = t.lines.map((l) => barLine(profile(), l.code, l.amount));
  bar.justification = suggestJustification(bar, { funcNames: D.asr.funcNames, fundNames: D.fundNames });
  b.draft = bar;
  b.note = t.shortfall
    ? `The other functions in this fund can cover only $${(t.amount - t.shortfall).toLocaleString()} of the $${t.amount.toLocaleString()} needed; $${t.shortfall.toLocaleString()} is short. Add lines, lower the amount, or reduce the cushion, or the BAR will not balance.`
    : '';
  keep();
}
export function bbStartEmpty() {
  const b = bb();
  if (!b.startFund) return;
  b.draft = newBar(b.type, b.startFund);
  b.note = '';
  keep();
}

function lineRow(l, i, asrLine) {
  const salary = isSalaryObject(l.obj, profile().fteObjects) && !isRevenueObject(l.obj);
  return `<tr class="${l.amount < 0 ? 'give' : ''}"><td><span class="code">${esc(l.code)}</span><br><span class="muted">${esc(descOf(l.code))}</span></td>
  <td>${isRevenueObject(l.obj) ? 'REV' : 'EXP'}</td><td class="num">${esc(l.func)}</td><td class="num">${esc(l.obj)}</td><td class="r"><input type="number" step="1" class="amt" data-in="bbAmt" data-i="${i}" value="${l.amount}" aria-label="Amount for ${esc(l.code)}"></td>
  <td class="r">${salary ? `<input type="number" step="0.0001" class="fte" data-in="bbFte" data-i="${i}" value="${l.fte || 0}" aria-label="FTE for ${esc(l.code)}">` : '<span class="muted">N/A</span>'}</td>
  <td class="r"><button class="linkbtn" data-act="bbDel" data-i="${i}" aria-label="Remove ${esc(l.code)}">Remove</button></td></tr>`;
}
const fieldIn = (label, path, val, extra = '') =>
  `<label class="fld"><span>${label}</span><input type="text" data-in="bbField" data-k="${path}" value="${esc(val ?? '')}" ${extra}></label>`;

export function bbDraft() {
  const el = $('#bbdraft');
  if (!el) return;
  const b = bb(),
    bar = b.draft,
    p = profile();
  if (!bar) {
    el.innerHTML = '';
    return;
  }
  const flow = (p.funds || []).find((f) => f.code === bar.fund)?.flowthrough;
  el.innerHTML = `<section class="panel obms"><div class="toolbar"><h2 style="margin:0">${esc(BAR_TYPES[bar.type])} BAR · ${esc(p.name)} · fund ${esc(bar.fund)} · FY${FY.value}</h2><button class="btn" data-act="bbDiscard">Discard this BAR</button></div>
  ${b.note ? `<div class="warn">${esc(b.note)}</div>` : ''}
  <div class="grid2"><div>
  <dl class="kv"><dt>Document ID</dt><dd><input type="text" data-in="bbField" data-k="docId" value="${esc(bar.docId || '')}" placeholder="Assigned by OBMS after upload"></dd>
  <dt>Fiscal year</dt><dd>${FY.value - 1}-${FY.value}</dd><dt>BAR type</dt><dd>${esc(BAR_TYPES[bar.type])}${flow ? ' (flowthrough fund)' : ''}</dd>
  <dt>Fund</dt><dd>${esc(fundLabel(bar.fund))}</dd><dt>Entity</dt><dd>${esc(p.entityName || p.name)}</dd><dt>District code</dt><dd>${esc(p.districtCode || '—')}</dd></dl></div>
  <div>${fieldIn('Contact first name', 'contact.first', bar.contact.first)}${fieldIn('Contact middle name', 'contact.middle', bar.contact.middle)}${fieldIn('Contact last name', 'contact.last', bar.contact.last)}</div></div>
  ${
    flow
      ? `<h3>Flowthrough fund</h3><div class="grid2"><div>${fieldIn('Change scope (Y or N)', 'flowthrough.scope', bar.flowthrough.scope, 'size="3" maxlength="1"')}${fieldIn('Budget from (mm/dd/yyyy)', 'flowthrough.from', bar.flowthrough.from)}${fieldIn('Budget to (mm/dd/yyyy)', 'flowthrough.to', bar.flowthrough.to)}</div><div>${fieldIn('Approved carryover', 'flowthrough.carryover', bar.flowthrough.carryover)}${fieldIn('Current-year allocation', 'flowthrough.allocation', bar.flowthrough.allocation)}${fieldIn('Total approved budget', 'flowthrough.total', bar.flowthrough.total)}</div></div>`
      : ''
  }
  <label class="fld"><span>Justification <span id="bbcount" class="muted"></span></span><textarea rows="3" data-in="bbField" data-k="justification">${esc(bar.justification)}</textarea></label>
  <div class="toolbar"><button class="btn" data-act="bbSuggest">Suggest wording</button></div>
  <div class="scroll"><table class="t"><thead><tr><th>Account</th><th>Type</th><th>Func</th><th>Object</th><th class="r">Adj amount</th><th class="r">FTE adj</th><th></th></tr></thead><tbody>${
    bar.lines.map((l, i) => lineRow(l, i)).join('') ||
    '<tr><td colspan="7" class="empty">No lines yet. Add one below.</td></tr>'
  }</tbody><tfoot id="bbfoot"></tfoot></table></div>
  <div class="filters"><label>Add a line: account code<input type="text" size="34" data-in="bbAddCode" value="${esc(b.add.code)}" placeholder="11000-1000-51100-0000-001707-1411"></label>
  <label>Amount<input type="number" step="1" data-in="bbAddAmt" value="${esc(b.add.amount)}"></label><button class="btn" data-act="bbAddLine">Add line</button></div>
  <div id="bbsum"></div></section>`;
  bbSummary();
}

// Totals, checks and the download button: redrawn on every edit, without touching the inputs.
export function bbSummary() {
  const b = bb(),
    bar = b.draft,
    el = $('#bbsum');
  if (!el || !bar) return;
  const t = barTotals(bar),
    checks = validateBar(bar, ctx()),
    ok = canDownload(checks) && bar.lines.length > 0;
  const foot = $('#bbfoot');
  if (foot)
    foot.innerHTML = `<tr><th colspan="4">Totals</th><td class="r"><b>${fmtM(t.net)}</b></td><td class="r num">${t.fte.toFixed(4)}</td><td></td></tr>
    <tr><td colspan="4" class="muted">Revenue ${fmtM(t.revenue)} · Expenditure ${fmtM(t.expenditure)}</td><td colspan="3"></td></tr>`;
  const cnt = $('#bbcount');
  if (cnt) cnt.textContent = `${bar.justification.length} of ${JUSTIFICATION_MAX}`;
  const file = ok ? makeBarFile(bar, ctx()) : null;
  el.innerHTML = `<h3>Checks</h3>${
    checks.length
      ? `<ul class="checks">${checks.map((c) => `<li class="chk-${c.level}"><b>${LEVEL[c.level]}:</b> ${esc(c.msg)}</li>`).join('')}</ul>`
      : '<p class="muted">No problems found.</p>'
  }
  <div class="toolbar"><button class="btn primary" data-act="bbDownload"${ok ? '' : ' disabled'}>Download the OBMS upload file</button><button class="btn" data-act="bbCopy"${ok ? '' : ' disabled'}>Copy the file text</button>
  <span class="muted">${ok ? esc(file.name) : 'Fix the items marked Stop to make the file.'}</span></div>`;
}
