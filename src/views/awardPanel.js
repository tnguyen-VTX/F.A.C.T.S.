// "Start from an award letter": read a PDF (or pasted text), suggest the BAR's values, let the user confirm, build the BAR.
import workerSrc from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { buildAwardBar, defaultLocationSegment, parseAward } from '../lib/awardLetter.js';
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
  <div class="filters"><label>BAR type<select data-in="awardField" data-k="type"><option value="IB"${f.type === 'IB' ? ' selected' : ''}>Initial Budget (IB)</option><option value="I"${f.type === 'I' ? ' selected' : ''}>Increase (I)</option></select></label>
  <label>Fund<select data-in="awardField" data-k="fund"><option value="">Choose…</option>${funds.map((x) => `<option value="${esc(x)}"${f.fund === x ? ' selected' : ''}>${esc(fundLabel(x))}</option>`).join('')}</select></label>${SRC(a.parsed.fund)}</div>
  <div class="filters">${inp('Award amount ($)', 'award', 'inputmode="decimal"', a.parsed.award)}
  ${inp('Revenue object', 'revObj', 'maxlength="5" placeholder="4xxxx"')}
  ${inp('Location segment', 'loc', 'maxlength="12"')}</div>
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
  <div class="toolbar"><button class="btn" data-act="awardAddRow">Add a line</button> <span id="awardsum">${esc(awardSum())}</span></div>
  <p class="warn" id="awardmsg2" role="alert"${a.err ? '' : ' hidden'}>${esc(a.err || '')}</p>
  <div class="toolbar"><button class="btn" data-act="awardBuild">Build the BAR</button> <button class="linkbtn" data-act="awardCancel">Cancel</button></div></section>`;
}

function awardSum() {
  const f = aw()?.form;
  if (!f) return '';
  const total = f.rows.filter((r) => r.on).reduce((s, r) => s + num(r.amount), 0),
    award = num(f.award);
  const diff = Math.round((award - total) * 100) / 100;
  return `Lines total ${fmtM(total)} of the ${fmtM(award)} award${diff ? `; ${fmtM(diff)} not yet assigned` : '; they match'}.`;
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
  const give = (x) => (x ? String(x.value) : '');
  UI.award = {
    parsed,
    paste: aw()?.paste || '',
    note: note || `Read ${parsed.lineCount} lines of text.`,
    form: {
      type: 'IB',
      fund,
      award: give(parsed.award),
      revObj: p.awardRevenue?.[fund] || '',
      loc: defaultLocationSegment(p),
      from: parsed.from?.value || '',
      to: parsed.to?.value || '',
      carryover: give(parsed.carryover),
      allocation: give(parsed.allocation),
      total: give(parsed.total),
      rows: parsed.rows.map((r) => ({ on: true, func: r.func, obj: r.obj, prog: r.prog, job: r.job, amount: r.amount, src: r.src })),
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
    if (k === 'fund') f.revObj = profile().awardRevenue?.[t.value] || f.revObj;
    if (k === 'fund' || k === 'type') return redraw();
    if (k === 'award') refreshSum();
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
    saveProfile(storage, PF, { ...p, awardRevenue: { ...(p.awardRevenue || {}), [a.form.fund]: a.form.revObj } });
    b.draft = r.bar;
    b.type = r.bar.type;
    b.note = '';
    UI.award = null;
    keep();
    return 'built';
  },
};
