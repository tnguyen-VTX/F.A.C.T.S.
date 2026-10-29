// "Start from an award letter": read a PDF (or pasted text), suggest the BAR's values, let the user confirm, build the BAR.
import workerSrc from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { buildAwardBar, defaultLocationSegment, parseAward, spreadAwardOverFund } from '../lib/awardLetter.js';
import { $, esc, fmtM, num } from '../lib/format.js';
import { saveProfile } from '../lib/profileStore.js';
import { D, PF, UI, profile, storage } from '../state.js';
import { bb, keep } from './barBuilder.js';

const aw = () => UI.award;
const SRC = (x) => (x?.src ? `<span class="muted fnote" title="From the letter: ${esc(x.src)}">from: ${esc(x.src.slice(0, 70))}</span>` : '');
const fundLabel = (c) => {
  const n = profile().funds.find((x) => x.code === c)?.name || D.fundNames?.[c];
  return n ? `${c} ${n}` : c;
};
const flowthrough = (f) => !!profile().funds.find((x) => x.code === f)?.flowthrough;

export function awardPanelHTML() {
  const a = aw();
  const funds = [...profile().funds.map((x) => x.code)];
  if (a?.form?.fund && !funds.includes(a.form.fund)) funds.push(a.form.fund);
  const intro = `<p class="muted">Read an award letter (a PDF with selectable text) and start an Initial Budget or Increase BAR from it. The file is read in this browser and not stored. Every value is a suggestion: check it against the letter.</p>
  <div class="filters"><label class="btn">Choose a PDF or text file…<input type="file" accept=".pdf,application/pdf,.txt,text/plain" data-in="awardFile" hidden></label>
  <span class="muted">or paste the letter's text:</span></div>
  <textarea rows="3" data-in="awardPaste" placeholder="Paste text from the letter here" aria-label="Pasted award letter text">${esc(a?.paste || '')}</textarea>
  <div class="toolbar"><button class="btn" data-act="awardRead">Read the pasted text</button> <span class="muted" id="awardmsg">${esc(a?.note || '')}</span></div>`;
  if (!a?.form) return `<section class="panel"><h2>Start from an award letter</h2>${intro}</section>`;
  const f = a.form,
    ft = flowthrough(f.fund);
  const inp = (label, k, extra = '', src) =>
    `<label class="fld"><span>${label}</span><input type="text" data-in="awardField" data-k="${k}" value="${esc(f[k] ?? '')}" ${extra}>${SRC(src)}</label>`;
  return `<section class="panel"><h2>Start from an award letter</h2>${intro}
  <h3>Check what was read</h3>
  <div class="filters"><label>BAR type<select data-in="awardField" data-k="type">${[['IB', 'Initial Budget (IB)'], ['I', 'Increase (I)'], ['D', 'Decrease (D)']].map(([v, t]) => `<option value="${v}"${f.type === v ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
  <label>Fund<select data-in="awardField" data-k="fund"><option value="">Choose…</option>${funds.map((x) => `<option value="${esc(x)}"${f.fund === x ? ' selected' : ''}>${esc(fundLabel(x))}</option>`).join('')}</select></label>${SRC(a.parsed.fund)}
  ${inp('Location segment', 'loc', 'maxlength="12"')}</div>
  ${a.parsed.planning ? `<p class="muted">The letter shows a planning award of ${fmtM(a.parsed.planning.value)} and a final award of ${fmtM(a.parsed.final.value)}; the BAR is for the increase.</p>` : ''}
  <h3>Revenue</h3>
  <div class="scroll"><table class="t"><thead><tr><th>Revenue object (4xxxx)</th><th class="r">Amount</th><th></th></tr></thead><tbody>${f.revenue
    .map(
      (r, i) =>
        `<tr><td><input type="text" class="amt" data-in="awardRev" data-f="obj" data-i="${i}" value="${esc(r.obj ?? '')}" size="7" maxlength="5" placeholder="4xxxx" aria-label="Revenue object ${i + 1}"></td>
    <td class="r"><input type="number" step="0.01" class="amt" data-in="awardRev" data-f="amount" data-i="${i}" value="${esc(r.amount ?? '')}" aria-label="Revenue amount ${i + 1}"></td>
    <td><button class="linkbtn" data-act="awardDelRev" data-i="${i}">Remove</button></td></tr>`,
    )
    .join('')}</tbody></table></div>
  <div class="toolbar"><button class="btn" data-act="awardAddRev">Add a revenue line</button> ${SRC(a.parsed.revObj)}</div>
  ${
    ft
      ? `<div class="filters">${inp('Budget from (mm/dd/yyyy)', 'from', '', a.parsed.from)}${inp('Budget to (mm/dd/yyyy)', 'to', '', a.parsed.to)}${inp('Carryover ($)', 'carryover', '', a.parsed.carryover)}${inp('Current year allocation ($)', 'allocation', '', a.parsed.allocation)}${inp('Total approved budget ($)', 'total', '', a.parsed.total)}</div>`
      : ''
  }
  <h3>Expenditure lines</h3>
  <div class="scroll"><table class="t"><thead><tr><th>Use</th><th>Function</th><th>Object</th><th>Program</th><th>Job class</th><th class="r">Amount</th><th>From the letter</th><th></th></tr></thead><tbody>${f.rows
    .map(
      (r, i) =>
        `<tr><td><input type="checkbox" data-in="awardRow" data-f="on" data-i="${i}"${r.on ? ' checked' : ''} aria-label="Use line ${i + 1}"></td>
    ${['func', 'obj', 'prog', 'job'].map((k) => `<td><input type="text" class="amt" data-in="awardRow" data-f="${k}" data-i="${i}" value="${esc(r[k] ?? '')}" size="6" aria-label="${k} line ${i + 1}"></td>`).join('')}
    <td class="r"><input type="number" step="1" class="amt" data-in="awardRow" data-f="amount" data-i="${i}" value="${esc(r.amount ?? '')}" aria-label="Amount line ${i + 1}"></td>
    <td class="muted fnote">${esc((r.src || '').slice(0, 60))}</td><td><button class="linkbtn" data-act="awardDelRow" data-i="${i}">Remove</button></td></tr>`,
    )
    .join('')}</tbody></table></div>
  <div class="toolbar"><button class="btn" data-act="awardAddRow">Add a line</button>${D.asr ? ' <button class="btn" data-act="awardSpread">Spread over this fund\'s budget</button>' : ''} <span id="awardsum">${esc(awardSum())}</span></div>
  <p class="warn" id="awardmsg2" role="alert"${a.err ? '' : ' hidden'}>${esc(a.err || '')}</p>
  <div class="toolbar"><button class="btn" data-act="awardBuild">Build the BAR</button> <button class="linkbtn" data-act="awardCancel">Cancel</button></div></section>`;
}

const revTotal = (f) => f.revenue.reduce((x, r) => x + num(r.amount), 0);
function awardSum() {
  const f = aw()?.form;
  if (!f) return '';
  const total = f.rows.filter((r) => r.on).reduce((s, r) => s + num(r.amount), 0),
    award = revTotal(f);
  const diff = Math.round((award - total) * 100) / 100;
  return `Lines total ${fmtM(total)} of the ${fmtM(award)} revenue${diff ? `; ${fmtM(diff)} not yet assigned` : '; they match'}.`;
}
const redraw = () => {
  const el = $('#bbaward');
  if (el) el.innerHTML = awardPanelHTML();
};
const refreshSum = () => {
  const el = $('#awardsum');
  if (el) el.textContent = awardSum();
};

function load(lines, note = '') {
  const p = profile();
  const parsed = parseAward(lines, p);
  if (!parsed.lineCount) {
    UI.award = { ...(aw() || {}), form: null, note: 'No text was found. A scanned PDF has no text to read: paste the text instead, or start an empty BAR.' };
    return redraw();
  }
  const fund = parsed.fund?.value || '';
  const remembered = p.awardRevenue?.[fund] || '';
  const revenue = parsed.revenue.length
    ? parsed.revenue.map((r) => ({ obj: r.obj, amount: r.amount }))
    : [{ obj: remembered, amount: parsed.award ? parsed.award.value : '' }];
  const give = (x) => (x ? String(x.value) : '');
  const total = revenue.reduce((x, r) => x + num(r.amount), 0);
  const spread = D.asr && fund && total ? spreadAwardOverFund(D.asr.funds.get(fund), total) : [];
  UI.award = {
    parsed,
    paste: aw()?.paste || '',
    note: note || `Read ${parsed.lineCount} lines of text.${spread.length ? " The lines are a split of the award over the fund's budget, not from the letter." : ''}`,
    form: {
      type: parsed.type || 'IB',
      fund,
      revenue,
      loc: defaultLocationSegment(p),
      from: parsed.from?.value || '',
      to: parsed.to?.value || '',
      carryover: give(parsed.carryover),
      allocation: give(parsed.allocation),
      total: give(parsed.total),
      rows: parsed.rows.length
        ? parsed.rows.map((r) => ({ on: true, func: r.func, obj: r.obj, prog: r.prog, job: r.job, amount: r.amount, src: r.src }))
        : spread.length
          ? spread
          : [{ on: true, func: '', obj: '', prog: '0000', job: '0000', amount: '' }],
    },
  };
  redraw();
}

export const AWARD_IN = {
  awardFile: async (t) => {
    const file = t.files?.[0];
    t.value = '';
    if (!file) return;
    UI.award = { ...(aw() || {}), note: 'Reading…' };
    try {
      if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
        const { pdfToLines } = await import('../lib/pdfText.js');
        load(await pdfToLines(new Uint8Array(await file.arrayBuffer()), { workerSrc }), `Read ${file.name}.`);
      } else load((await file.text()).split(/\r?\n/), `Read ${file.name}.`);
    } catch (e) {
      UI.award = { ...(aw() || {}), form: null, note: `Could not read that file (${e.message || e}). Paste its text instead.` };
      redraw();
    }
  },
  awardPaste: (t) => {
    UI.award = { ...(aw() || {}), paste: t.value };
  },
  awardField: (t) => {
    const f = aw().form,
      k = t.dataset.k;
    f[k] = t.value;
    if (k === 'fund') for (const r of f.revenue) r.obj = r.obj || profile().awardRevenue?.[t.value] || '';
    if (k === 'fund' || k === 'type') return redraw();
  },
  awardRev: (t) => {
    aw().form.revenue[+t.dataset.i][t.dataset.f] = t.value;
    refreshSum();
  },
  awardRow: (t) => {
    const r = aw().form.rows[+t.dataset.i],
      k = t.dataset.f;
    r[k] = k === 'on' ? t.checked : t.value;
    refreshSum();
  },
};

export const AWARD_ACT = {
  awardRead: () => load((aw()?.paste || '').split(/\r?\n/), 'Read the pasted text.'),
  awardAddRev: () => {
    aw().form.revenue.push({ obj: '', amount: '' });
    redraw();
  },
  awardDelRev: (t) => {
    const f = aw().form;
    if (f.revenue.length > 1) f.revenue.splice(+t.dataset.i, 1);
    redraw();
  },
  awardSpread: () => {
    const f = aw().form;
    const rows = D.asr ? spreadAwardOverFund(D.asr.funds.get(f.fund), revTotal(f)) : [];
    if (rows.length) f.rows = rows;
    else aw().err = 'There are no budget lines for this fund in the loaded Account Summary to split over.';
    redraw();
  },
  awardAddRow: () => {
    aw().form.rows.push({ on: true, func: '', obj: '', prog: '0000', job: '0000', amount: '' });
    redraw();
  },
  awardDelRow: (t) => {
    aw().form.rows.splice(+t.dataset.i, 1);
    redraw();
  },
  awardCancel: () => {
    UI.award = null;
    redraw();
  },
  awardBuild: () => {
    const a = aw(),
      b = bb();
    if (b.draft && b.dirty && b.draft.lines.length && !confirm('Replace the BAR you are working on? Unsaved changes will be lost.')) return;
    const r = buildAwardBar(profile(), a.form, { funcNames: D.asr?.funcNames, fundNames: D.fundNames });
    if (r.errors) {
      a.err = r.errors.join(' ');
      return redraw();
    }
    const p = profile();
    const ro = a.form.revenue.find((r) => /^4\d{4}$/.test(r.obj))?.obj;
    if (ro && a.form.revenue.length === 1) saveProfile(storage, PF, { ...p, awardRevenue: { ...(p.awardRevenue || {}), [a.form.fund]: ro } });
    b.draft = r.bar;
    b.type = r.bar.type;
    b.note = '';
    UI.award = null;
    keep();
    return 'built';
  },
};
