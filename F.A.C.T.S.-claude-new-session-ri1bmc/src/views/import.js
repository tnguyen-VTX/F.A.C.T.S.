import { barOnly } from '../mode.js';
import { $, esc } from '../lib/format.js';
import { D, FY, PF, REP, UI, profile } from '../state.js';

const LEVEL = { stop: 'Not loaded', warn: 'Check', info: 'Note' };
const SLOTS = {
  asr: {
    title: 'Account Summary',
    help: 'AptaFund Account Summary Report. Run it for the whole fiscal year and all accounts.',
    accept: '.xlsx,.xls,.csv',
  },
  fa: {
    title: 'Fund Audit',
    help: 'AptaFund Fund Audit Report, with the same period and accounts as the Account Summary so the two can be tied out.',
    accept: '.csv,.xlsx,.xls',
  },
};
const fmtISO = (iso) => (iso ? `${+iso.slice(5, 7)}/${+iso.slice(8, 10)}/${iso.slice(0, 4)}` : '');

function checksHTML(checks) {
  if (!checks?.length) return '';
  return `<ul class="checks">${checks
    .map((c) => `<li class="chk-${c.level}"><b>${LEVEL[c.level]}:</b> ${esc(c.msg)}</li>`)
    .join('')}</ul>`;
}
function loadedLine(kind) {
  const r = REP[kind];
  if (!r) return '';
  const p = r.params;
  const bits = [
    esc(r.name),
    kind === 'asr' && p?.begin ? `${fmtISO(p.begin)} to ${fmtISO(p.end)}` : '',
    kind === 'asr' && p?.createdOn ? `run ${esc(p.createdOn)}` : '',
    kind === 'fa' ? `${D.fa.length.toLocaleString()} lines` : '',
  ].filter(Boolean);
  return `<p class="loaded"><b>Loaded</b> · ${bits.join(' · ')}</p>`;
}
function slotHTML(kind) {
  const def = SLOTS[kind],
    st = UI.imp[kind];
  let body = '';
  if (st?.status === 'reading') body = `<p class="status">Reading ${esc(st.name)}…</p>`;
  else if (st?.status === 'error') body = `<div class="warn">${esc(st.msg)}</div>`;
  else if (st?.status === 'rejected')
    body = `<p class="status err"><b>${esc(st.result.name)}</b> was not loaded.</p>${checksHTML(st.result.checks)}`;
  else if (st?.status === 'pending')
    body = `<p class="status"><b>${esc(st.result.name)}</b> has items to check before it loads.</p>${checksHTML(st.result.checks)}
    <div class="toolbar"><button class="btn" data-act="impAccept" data-kind="${kind}">Load anyway</button><button class="btn" data-act="impDiscard" data-kind="${kind}">Choose another file</button></div>`;
  else if (REP[kind]) body = loadedLine(kind) + checksHTML(REP[kind].checks);
  return `<section class="panel slot"><h2>${def.title}</h2><p class="muted">${def.help}</p>
  <label class="drop" data-kind="${kind}"><input type="file" accept="${def.accept}" data-in="repFile" data-kind="${kind}"><strong>${REP[kind] ? 'Drop a newer file here, or choose one' : 'Drop the file here, or choose it'}</strong><span class="muted">Read inside this browser; nothing is uploaded.</span></label>
  <div class="slotbody">${body}</div></section>`;
}

export function viewImport() {
  const main = $('#main');
  const p = profile(),
    y = FY.value;
  const years = [y - 1, y, y + 1].filter((v, i, a) => a.indexOf(v) === i).sort();
  const ready = D.loaded && (REP.asr || REP.fa);
  main.innerHTML = `<header class="ph"><h1>Load reports</h1><p class="sub">Drop the AptaFund reports for one school and one fiscal year. Each file is checked against the school and year below before it is used. Reports for other schools are kept apart.</p></header>
  <div class="filters"><label>School<select data-in="school">${Object.values(PF.profiles)
    .map((s) => `<option value="${esc(s.id)}"${s.id === p.id ? ' selected' : ''}>${esc(s.name)}</option>`)
    .join('')}</select></label>
  <label>Fiscal year<select data-in="fy">${years
    .map(
      (v) => `<option value="${v}"${v === y ? ' selected' : ''}>FY${v} (7/1/${v - 1} to 6/30/${v})</option>`,
    )
    .join('')}</select></label></div>
  <div class="grid2">${slotHTML('asr')}${slotHTML('fa')}</div>
  ${ready ? `<div class="toolbar"><button class="btn primary" data-act="nav" data-v="${barOnly() ? 'bars' : 'budget'}">${barOnly() ? 'Open the BAR Builder' : 'Open the budget'}</button></div>` : ''}
  <section class="panel" id="earlier" hidden></section>
  ${
    barOnly()
      ? ''
      : `<details class="panel"><summary>Or load the whole FACTS workbook (version 0.1 way)</summary>
  <label class="drop" id="drop"><input type="file" id="file" accept=".xlsx,.xlsm" data-in="file"><strong>Drop the FACTS workbook here, or choose a file</strong>
  <span class="muted">Reads the Account Summary, Fund Audit, RfR, Cash Receipts and Capital Outlay sheets.</span></label>
  <div class="status${UI.imp.wb?.error ? ' err' : ''}" id="status" role="status">${esc(UI.imp.wb?.error || '')}</div></details>`
  }`;
}
