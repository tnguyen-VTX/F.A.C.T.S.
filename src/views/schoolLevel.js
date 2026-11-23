// School-level expenditures (PED accreditation component 3.4). Uses the loaded Fund Audit (or the Account Summary
// when no Fund Audit is loaded) and the school-level SEG amounts typed or pasted from the 910B-5.
import { $, esc, fmtD, money, num } from '../lib/format.js';
import { parseList } from '../lib/profile.js';
import { fiscalYearOf } from '../lib/reportCheck.js';
import { CATEGORIES, QUARTERS, parseSegPaste, schoolLevelCheck, withDefaults } from '../lib/schoolLevel.js';
import { D, FY, S, profile, saveStore } from '../state.js';

const LEVEL = { stop: 'Stop', warn: 'Check', info: 'Note' };
const settings = () => (S().sl34 = withDefaults(S().sl34, profile()));
const fy = () => fiscalYearOf(D.cycle) || FY.value;
const p1 = (n) => (n == null ? '—' : `${n.toFixed(1)}%`);
const catName = (k) => CATEGORIES.find(([c]) => c === k)?.[1] || '';

function run() {
  const s = settings();
  const dated = !!D.fa?.length;
  const lines = dated ? D.fa : [...(D.asr?.funds?.values() || [])].flatMap((f) => f.lines);
  return schoolLevelCheck(lines, { profile: profile(), fiscalYear: fy(), settings: s, dated });
}

function resultsHTML() {
  const r = run();
  const checks = r.checks
    .map((c) => `<li class="chk-${c.level}"><b>${LEVEL[c.level]}:</b> ${esc(c.msg)}</li>`)
    .join('');
  const source = r.dated
    ? `Fund Audit actuals dated ${fmtD(r.begin)} to ${fmtD(r.end)}`
    : 'Account Summary actuals for the period the report covers (load a Fund Audit to limit them to the quarter)';
  const sites = r.sites
    .map(
      (x) =>
        `<tr${x.site ? '' : ' class="over"'}><td>${esc(x.loc)}${x.site ? '' : ' <span class="muted">(not a school site)</span>'}</td><td class="r">${money(x.spend)}</td><td class="r num">${p1(x.spendShare)}</td><td class="r">${money(x.seg)}</td><td class="r num">${p1(x.segShare)}</td><td class="r num">${p1(x.ofExpected)}</td></tr>`,
    )
    .join('');
  const cats = r.categories
    .map(
      (c) =>
        `<tr><td>${c.label}</td><td>${c.codes.length ? esc(c.codes.join(', ')) : '<span class="muted">not set</span>'}</td><td class="r">${money(c.spend)}</td><td class="r">${money(c.seg)}</td><td class="r">${money(c.expected)}</td><td class="r num">${p1(c.ofExpected)}</td></tr>`,
    )
    .join('');
  const progs = r.programs
    .map(
      (p) =>
        `<tr${p.prog === '0000' && r.p0000.flag ? ' class="over"' : ''}><td class="code">${esc(p.prog)}</td><td>${esc(catName(p.cat))}</td><td class="r">${money(p.spend)}</td><td class="r num">${p1(p.share)}</td></tr>`,
    )
    .join('');
  return `<p class="muted">Q${r.quarter} year to date: ${source}. Operational spending ${money(r.total)}.${r.due ? ` Q${r.quarter} expenditures are due in OBMS by ${fmtD(r.due)}.` : ''}</p>
  <p class="status${r.ok ? '' : ' err'}"><b>${r.ok ? 'Nothing to check.' : 'Items to check before submitting.'}</b></p>
  <ul class="checks">${checks}</ul>
  <h3>Spending by school site vs the 910B-5</h3>
  <div class="scroll"><table class="t"><thead><tr><th>Location</th><th class="r">Spent to date</th><th class="r">Share of site spending</th><th class="r">SEG for the year</th><th class="r">Share of SEG</th><th class="r">Spent vs Q${r.quarter} share of SEG</th></tr></thead><tbody>${sites}</tbody></table></div>
  <h3>Special Education, Gifted and At-Risk</h3>
  <div class="scroll"><table class="t"><thead><tr><th>Program area</th><th>Program codes</th><th class="r">Spent to date</th><th class="r">SEG for the year</th><th class="r">Expected by Q${r.quarter}</th><th class="r">Spent vs expected</th></tr></thead><tbody>${cats}</tbody></table></div>
  <h3>Operational spending by program</h3>
  <div class="scroll"><table class="t"><thead><tr><th>Program</th><th>Counts as</th><th class="r">Spent to date</th><th class="r">Share</th></tr></thead><tbody>${progs}</tbody></table></div>`;
}

function segTableHTML(s) {
  const cell = (i, k, v) =>
    `<td><input type="text" inputmode="decimal" class="r" size="12" data-in="slSeg" data-i="${i}" data-k="${k}" value="${esc(v || '')}" aria-label="${k}"></td>`;
  const rows = s.seg
    .map(
      (r, i) =>
        `<tr><td><input type="text" inputmode="numeric" maxlength="3" size="4" data-in="slSeg" data-i="${i}" data-k="loc" value="${esc(r.loc)}" aria-label="Location"></td>${cell(i, 'total', r.total)}${cell(i, 'sped', r.sped)}${cell(i, 'gifted', r.gifted)}${cell(i, 'atrisk', r.atrisk)}<td><button class="linkbtn" data-act="slDelRow" data-i="${i}">Remove</button></td></tr>`,
    )
    .join('');
  return `<div class="scroll"><table class="t"><thead><tr><th>Location (3 digits)</th><th>Total SEG</th><th>Special Education</th><th>Gifted</th><th>At-Risk</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
  <div class="toolbar"><button class="btn" data-act="slAddRow">Add a site</button></div>
  <details><summary>Paste rows from a spreadsheet</summary><p class="muted">One row per site: location, total SEG, Special Education, Gifted, At-Risk, separated by tabs (as copied from Excel). Pasted rows replace the table.</p>
  <textarea id="slpaste" rows="4" aria-label="Pasted 910B-5 rows"></textarea><div class="toolbar"><button class="btn" data-act="slPaste">Use pasted rows</button></div></details>`;
}

export function viewSchoolLevel() {
  const main = $('#main');
  const s = settings();
  main.innerHTML = `<header class="ph"><h1>School-level expenditures (PED 3.4)</h1><p class="sub">Accreditation component 3.4. Compares operational spending coded to school sites with the school-level SEG shares on the 910B-5, checks Special Education, Gifted and At-Risk program alignment, and flags a charter with more than ${esc(s.p0000Max)}% of operational spending in program 0000. Nothing is sent anywhere.</p></header>
  <div class="filters">
    <label>Quarter<select data-in="sl" data-k="quarter">${QUARTERS.map((q) => `<option value="${q.q}"${q.q === +s.quarter ? ' selected' : ''}>${q.label}</option>`).join('')}</select></label>
    <label>Operational fund(s)<input type="text" data-in="sl" data-k="funds" value="${esc(s.funds.join(', '))}"></label>
    <label>Program 0000 limit (%)<input type="number" min="0" max="100" step="1" data-in="sl" data-k="p0000Max" value="${esc(s.p0000Max)}"></label>
    <label>Site share tolerance (points)<input type="number" min="0" max="100" step="1" data-in="sl" data-k="siteTolerance" value="${esc(s.siteTolerance)}"></label>
    <label class="chk"><input type="checkbox" data-in="sl" data-k="charter"${s.charter ? ' checked' : ''}> Charter school</label>
  </div>
  <section class="panel"><h2>910B-5 school-level SEG</h2><p class="muted">The year's SEG for each school site, from the 910B-5.</p><div id="slseg">${segTableHTML(s)}</div></section>
  <section class="panel"><h2>Program codes</h2><p class="muted">The program codes that count as each area (from the PED chart of accounts or the School Budget Bureau training). Separate codes with commas.</p><div class="filters">
  ${CATEGORIES.map(([k, label]) => `<label>${label}<input type="text" data-in="slProg" data-k="${k}" value="${esc((s.progs[k] || []).join(', '))}"></label>`).join('')}
  </div></section>
  <section class="panel" id="slres">${resultsHTML()}</section>`;
}

const refresh = () => {
  saveStore();
  const el = $('#slres');
  if (el) el.innerHTML = resultsHTML();
};

export const SL_ACT = {
  slAddRow: () => {
    settings().seg.push({ loc: '', total: 0, sped: 0, gifted: 0, atrisk: 0 });
    saveStore();
    viewSchoolLevel();
  },
  slDelRow: (t) => {
    settings().seg.splice(+t.dataset.i, 1);
    saveStore();
    viewSchoolLevel();
  },
  slPaste: () => {
    const rows = parseSegPaste($('#slpaste')?.value);
    if (!rows.length) return;
    settings().seg = rows;
    saveStore();
    viewSchoolLevel();
  },
};

export const SL_IN = {
  sl: (t) => {
    const s = settings(),
      k = t.dataset.k;
    if (k === 'charter') s.charter = t.checked;
    else if (k === 'funds') s.funds = parseList(t.value);
    else if (k === 'quarter') s.quarter = +t.value;
    else s[k] = num(t.value);
    refresh();
  },
  slSeg: (t) => {
    const r = settings().seg[+t.dataset.i];
    if (!r) return;
    r[t.dataset.k] = t.dataset.k === 'loc' ? t.value.trim() : num(t.value);
    refresh();
  },
  slProg: (t) => {
    settings().progs[t.dataset.k] = parseList(t.value);
    refresh();
  },
};
