import { clearKey, getKey, keyWhere, looksLikeKey, saveKey } from '../lib/aiKey.js';
import { makeBarFile } from '../lib/barCsv.js';
import { AI, API_HOST, draftNarrative, narrativeRequest } from '../lib/narrative.js';
import {
  STATUSES,
  addStatus,
  checkBackup,
  exportBackup,
  isFrozen,
  isLocked,
  newId,
  validEntry,
  planRestore,
  saveBar,
} from '../lib/barLog.js';
import { newProfile } from '../lib/profile.js';
import { saveProfile } from '../lib/profileStore.js';
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
import { D, FY, PF, REP, S, STORE, UI, fundLabel, profile, saveStore, storage } from '../state.js';

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
export const keep = () => {
  const b = bb();
  b.dirty = true;
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
      `<header class="ph"><h1>BAR Builder</h1></header>` + missingMsg('Account Summary Report');
    return;
  }
  const b = bb();
  main.innerHTML = `<header class="ph"><h1>BAR Builder</h1><p class="sub">Find what is over budget, build the BAR, check it, and download the OBMS upload file. Pick the funds to work in; each BAR is for one fund.</p></header>
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
  <div id="bbdef"></div><div id="bbdraft"></div><div id="bbsaved"></div><div id="bbbackup"></div>`;
  bbDeficits();
  bbDraft();
  bbSaved();
  bbBackup();
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
const replaceOk = () => {
  const b = bb();
  return (
    !b.draft ||
    !b.dirty ||
    !b.draft.lines.length ||
    confirm('Replace the BAR you are working on? Unsaved changes will be lost.')
  );
};

export function bbBuildTransfer(fund, func) {
  const b = bb(),
    d = findDeficits(D.asr, [fund]).find((x) => x.func === func);
  if (!d || !replaceOk()) return;
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
  if (!b.startFund || !replaceOk()) return;
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
  el.innerHTML = `<section class="panel obms"><div class="toolbar"><h2 style="margin:0">${esc(BAR_TYPES[bar.type])} BAR · ${esc(p.name)} · fund ${esc(bar.fund)} · FY${FY.value}</h2><span><button class="btn primary" data-act="bbSave">Save BAR</button> <button class="btn" data-act="bbDiscard">Discard this BAR</button></span></div>
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
  ${['I', 'IB', 'D'].includes(bar.type) ? fieldIn(bar.type === 'D' ? 'Amount of the decrease (optional cap)' : 'Award amount (optional cap)', 'award', bar.award, 'inputmode="decimal" size="14"') : ''}
  <label class="fld"><span>Justification <span id="bbcount" class="muted"></span></span><textarea rows="3" data-in="bbField" data-k="justification">${esc(bar.justification)}</textarea></label>
  <div class="toolbar"><button class="btn" data-act="bbSuggest">Suggest wording</button></div>
  ${narrativePanel(bar)}
  <div class="scroll"><table class="t"><thead><tr><th>Account</th><th>Type</th><th>Func</th><th>Object</th><th class="r">Adj amount</th><th class="r">FTE adj</th><th></th></tr></thead><tbody>${
    bar.lines.map((l, i) => lineRow(l, i)).join('') ||
    '<tr><td colspan="7" class="empty">No lines yet. Add one below.</td></tr>'
  }</tbody><tfoot id="bbfoot"></tfoot></table></div>
  <div class="filters"><label>Add a line: account code<input type="text" size="34" data-in="bbAddCode" value="${esc(b.add.code)}" placeholder="11000-1000-51100-0000-001707-1411"></label>
  <label>Amount<input type="number" step="1" data-in="bbAddAmt" value="${esc(b.add.amount)}"></label><button class="btn" data-act="bbAddLine">Add line</button></div>
  <div id="bbsum"></div></section>`;
  const saved = entryOf(bar.savedId);
  if (saved && isFrozen(saved)) {
    el.querySelectorAll('input, textarea, select').forEach((x) => (x.disabled = true));
    el.querySelectorAll(
      '[data-act="bbDel"], [data-act="bbSuggest"], [data-act="bbAddLine"], [data-act="bbSave"], [data-act="bbNarrPreview"], [data-act="bbNarrSend"]',
    ).forEach((x) => (x.disabled = true));
  }
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

// ---- Saved BARs and their status log ----
// Local calendar date (New Mexico), not the UTC date.
const ymd = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = () => ymd(new Date());
const locked = () => isLocked(FY.value, today()) && !bb().unlock;
const basisNow = () => ({
  asrFile: REP.asr?.name || D.fileName || '',
  asOf: D.asOf || '',
  begin: D.begin || '',
});

export function bbSave() {
  const b = bb();
  if (!b.draft) return;
  if (locked()) {
    b.note = `FY${FY.value} is locked (more than 4 months after the year ended). Unlock it to save.`;
    return bbDraft();
  }
  const r = saveBar(S().bars || [], b.draft, basisNow());
  if (r.error) {
    b.note = r.error;
    return bbDraft();
  }
  S().bars = r.list;
  b.draft.savedId = r.entry.id;
  b.note = '';
  keep();
  b.dirty = false;
  bbDraft();
  bbSaved();
}
export function bbOpen(id) {
  const b = bb(),
    e = (S().bars || []).find((x) => x.id === id);
  if (!e) return;
  if (!replaceOk()) return;
  b.draft = JSON.parse(JSON.stringify(e.bar));
  b.note = isFrozen(e) ? `This BAR is ${e.status}: its lines are frozen. Make a new BAR to change them.` : '';
  keep();
  b.dirty = false;
  bbDraft();
}
const entryOf = (id) => (S().bars || []).find((x) => x.id === id);
export function bbRemove(id) {
  const e = entryOf(id);
  if (e && isFrozen(e)) {
    bb().note = `A BAR that is ${e.status} cannot be deleted. Add the status Cancelled first if it was sent by mistake.`;
    return bbDraft();
  }
  if (locked()) {
    bb().note = `FY${FY.value} is locked. Unlock it to delete a BAR.`;
    return bbDraft();
  }
  if (!confirm('Delete this saved BAR and its status log?')) return;
  S().bars = (S().bars || []).filter((x) => x.id !== id);
  const b = bb();
  if (b.draft?.savedId === id) delete b.draft.savedId;
  keep();
  bbSaved();
}
export function bbAddStatus(id) {
  if (locked()) {
    bb().note = `FY${FY.value} is locked. Unlock it to change a BAR's status.`;
    return bbDraft();
  }
  const q = (k) => $(`[data-st="${k}"][data-id="${id}"]`)?.value || '';
  const bars = S().bars || [];
  const i = bars.findIndex((x) => x.id === id);
  if (i < 0 || !q('status')) return;
  bars[i] = addStatus(bars[i], q('status'), q('date') || today(), q('note'));
  S().bars = bars;
  keep();
  bbSaved();
}
export function bbUnlock() {
  bb().unlock = true;
  bbSaved();
}

export function bbSaved() {
  const el = $('#bbsaved');
  if (!el) return;
  const bars = [...(S().bars || [])].sort(
    (a, b) => a.bar.fund.localeCompare(b.bar.fund) || a.createdAt - b.createdAt,
  );
  const lock = isLocked(FY.value, today());
  el.innerHTML = `<section class="panel"><h2>Saved BARs · ${esc(profile().name)} · FY${FY.value}</h2>${
    bb().note && !bb().draft ? `<div class="warn">${esc(bb().note)}</div>` : ''
  }${
    lock
      ? `<p class="warn">FY${FY.value} ended more than 4 months ago. ${bb().unlock ? 'Unlocked for this session.' : '<button class="btn" data-act="bbUnlock">Unlock to edit</button>'}</p>`
      : ''
  }${
    bars.length
      ? bars
          .map((e) => {
            const t = barTotals(e.bar);
            return `<div class="saved"><div class="toolbar"><b>${esc(BAR_TYPES[e.bar.type])} · fund ${esc(e.bar.fund)}</b>
        <span>${e.bar.docId ? `Doc ${esc(e.bar.docId)} · ` : ''}${e.bar.lines.length} lines · ${fmtM(t.net)} · <b>${esc(e.status)}</b>${isFrozen(e) ? ' (frozen)' : ''}</span>
        <span><button class="btn" data-act="bbOpen" data-id="${esc(e.id)}">Open</button> <button class="btn" data-act="bbRemove" data-id="${esc(e.id)}">Delete</button></span></div>
        ${e.basis?.asrFile ? `<p class="muted">Built from ${esc(e.basis.asrFile)}${e.basis.asOf ? `, created ${esc(e.basis.asOf)}` : ''}</p>` : ''}
        <table class="t"><thead><tr><th>Status</th><th>Date</th><th>Note</th></tr></thead><tbody>${e.log.map((l) => `<tr><td>${esc(l.status)}</td><td>${esc(l.date)}</td><td>${esc(l.note)}</td></tr>`).join('')}</tbody></table>
        <div class="filters"><label>New status<select data-st="status" data-id="${esc(e.id)}">${STATUSES.map((s) => `<option>${s}</option>`).join('')}</select></label>
        <label>Date<input type="date" data-st="date" data-id="${esc(e.id)}" value="${today()}"></label>
        <label>Note<input type="text" data-st="note" data-id="${esc(e.id)}"></label>
        <button class="btn" data-act="bbAddStatus" data-id="${esc(e.id)}">Add to log</button></div></div>`;
          })
          .join('')
      : '<p class="muted">Nothing saved yet. Build a BAR and choose Save BAR.</p>'
  }</section>`;
}

// ---- Backup: export, and restore with a per-BAR comparison ----
export const backupFile = () => {
  const data = exportBackup({ profiles: Object.values(PF.profiles), store: STORE });
  return { name: `facts-backup-${today()}.json`, text: JSON.stringify(data, null, 2) };
};

// Read a backup file's text and work out what restoring it would change. Nothing is applied yet.
export function bbRestoreRead(text) {
  const b = bb();
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    data = null;
  }
  const err = checkBackup(data);
  if (err) {
    b.restore = { error: err };
    return bbBackup();
  }
  const plans = Object.entries(data.schools).map(([key, v]) => ({
    key,
    data: v,
    plan: planRestore(STORE[key]?.bars || [], (v?.bars || []).filter(validEntry)),
  }));
  const newSchools = (data.profiles || []).filter((p) => p.id && !PF.profiles[p.id]);
  b.restore = { plans, newSchools };
  bbBackup();
}

export function bbRestoreApply() {
  const b = bb(),
    r = b.restore;
  if (!r?.plans) return;
  for (const p of r.newSchools) saveProfile(storage, PF, newProfile(p));
  for (const { key, data, plan } of r.plans) {
    const st = (STORE[key] ??= {});
    st.je ??= [];
    st.bar ??= {};
    st.bars ??= [];
    st.bars.push(...plan.added);
    for (const c of plan.conflicts) {
      const pick = document.querySelector(`input[name="rs-${key}-${c.id}"]:checked`)?.value || 'keep';
      const frozen = isFrozen(c.current);
      if (pick === 'backup' && !frozen) st.bars = st.bars.map((e) => (e.id === c.id ? c.incoming : e));
      else if (pick === 'both' || (pick === 'backup' && frozen)) {
        const id = newId(Date.now());
        st.bars.push({ ...c.incoming, id, bar: { ...c.incoming.bar, savedId: id } });
      }
    }
    if (data.bbDraft && !st.bbDraft) st.bbDraft = data.bbDraft;
    if (data.bb && !st.bb) st.bb = data.bb;
  }
  saveStore();
  UI.bb = null;
  b.restore = null;
  viewBarBuilder();
}

const logText = (e) => e.log.map((l) => `${esc(l.status)} ${esc(l.date)}`).join(', ');
const when = (n) => (n ? ymd(new Date(n)) : '—');

export function bbBackup() {
  const el = $('#bbbackup');
  if (!el) return;
  const r = bb().restore;
  let panel = '';
  if (r?.error) panel = `<div class="warn">${esc(r.error)}</div>`;
  else if (r) {
    const n = (k) => r.plans.reduce((s, p) => s + p.plan[k].length, 0);
    panel = `<h3>Restore from backup</h3><p>${n('added')} new BAR(s) will be added, ${n('same')} already here, ${n('conflicts')} differ.${
      r.newSchools.length ? ` ${r.newSchools.length} school profile(s) will be added.` : ''
    } Nothing is replaced unless you choose it.</p>${r.plans
      .flatMap((p) =>
        p.plan.conflicts.map(
          (
            c,
          ) => `<div class="saved"><b>${esc(p.key)} · ${esc(BAR_TYPES[c.current.bar.type])} · fund ${esc(c.current.bar.fund)}</b>
      <table class="t"><thead><tr><th></th><th>Last changed</th><th>Status</th><th>Lines</th><th>Log</th></tr></thead><tbody>
      <tr><td>This browser</td><td>${when(c.current.updatedAt)}</td><td>${esc(c.current.status)}</td><td>${c.current.bar.lines.length}</td><td>${logText(c.current)}</td></tr>
      <tr><td>Backup</td><td>${when(c.incoming.updatedAt)}</td><td>${esc(c.incoming.status)}</td><td>${c.incoming.bar.lines.length}</td><td>${logText(c.incoming)}</td></tr></tbody></table>
      ${[
        ['keep', 'Keep this browser’s'],
        ['backup', 'Use the backup’s'],
        ['both', 'Keep both'],
      ]
        .map(
          ([v, t], i) =>
            `<label class="chk"><input type="radio" name="rs-${esc(p.key)}-${esc(c.id)}" value="${v}"${i === 0 ? ' checked' : ''}> ${t}</label>`,
        )
        .join(' ')}</div>`,
        ),
      )
      .join(
        '',
      )}<div class="toolbar"><button class="btn primary" data-act="bbRestoreApply">Restore</button> <button class="btn" data-act="bbRestoreCancel">Cancel</button></div>`;
  }
  el.innerHTML = `<section class="panel"><h2>Backup</h2><p class="muted">The backup file holds school profiles, saved BARs with their status logs, drafts and settings. It never holds reports, position data or keys. Restoring on a new browser means loading the reports again.</p>
  <div class="toolbar"><button class="btn" data-act="bbBackupDownload">Download a backup</button>
  <label class="btn">Restore from a backup…<input type="file" accept=".json,application/json" data-in="bbRestoreFile" hidden></label></div>${panel}</section>`;
}

// ---- Optional AI-drafted narrative ----
const ls = () => (typeof localStorage !== 'undefined' ? localStorage : null);
const ss = () => (typeof sessionStorage !== 'undefined' ? sessionStorage : null);
const narr = () => (bb().narr ??= { preview: null, busy: false, msg: '' });
const names = () => ({ funcNames: D.asr.funcNames, fundNames: D.fundNames });

function narrativePanel(bar) {
  const n = narr(),
    where = keyWhere(ls(), ss());
  return `<section class="ai"><h3>Longer narrative (AI-drafted, optional)</h3>
  <p class="muted">For the PED's longer explanation. It is not part of the upload file. When you choose Draft, FACTS shows the exact text first, and only sends it to Anthropic (${esc(API_HOST)}) after you press Send. It holds fund, BAR type, function names and whole-dollar totals; never names, FTE, account descriptions or your justification.</p>
  <div class="filters"><label>Your Anthropic API key<input type="password" id="aikey" autocomplete="off" size="30" placeholder="${where ? 'A key is saved' : 'sk-ant-...'}"></label>
  <label class="chk"><input type="checkbox" id="airemember"${where === 'browser' ? ' checked' : ''}> Remember on this computer</label>
  <button class="btn" data-act="bbKeySave">Save key</button><button class="btn" data-act="bbKeyClear">Clear key</button></div>
  <p class="muted">${where === 'browser' ? 'The key is saved in this browser.' : where === 'tab' ? 'The key is kept until you close this tab.' : 'No key saved.'} Other tools on this site share this browser's storage, so use a key with a low spending limit, and clear it when you are done.</p>
  <div class="toolbar"><button class="btn" data-act="bbNarrPreview"${n.busy ? ' disabled' : ''}>Draft with AI…</button> <span class="muted" id="bbnarrmsg">${esc(n.msg)}</span></div>
  <div id="bbnarrprev">${previewHTML()}</div>
  <label class="fld"><span>Narrative (AI-drafted: check every sentence before you use it)</span><textarea rows="8" data-in="bbField" data-k="narrative">${esc(bar.narrative || '')}</textarea></label>
  <div class="toolbar"><button class="btn" data-act="bbNarrCopy">Copy narrative</button></div></section>`;
}
function previewHTML() {
  const p = narr().preview;
  if (!p) return '';
  return `<div class="panel"><h4>This exact text will be sent to ${esc(API_HOST)} (model ${esc(p.model)})</h4>
  <pre class="sent">${esc(p.system)}\n\n${esc(p.user)}</pre>
  <div class="toolbar"><button class="btn primary" data-act="bbNarrSend">Send</button> <button class="btn" data-act="bbNarrCancel">Cancel</button></div></div>`;
}
const refreshNarr = () => {
  const m = $('#bbnarrmsg'),
    pv = $('#bbnarrprev');
  if (m) m.textContent = narr().msg;
  if (pv) pv.innerHTML = previewHTML();
};

export function bbKeySave() {
  const k = ($('#aikey')?.value || '').trim();
  if (!looksLikeKey(k)) {
    narr().msg = 'That does not look like an Anthropic API key (it starts with sk-ant-).';
    return refreshNarr();
  }
  saveKey(k, !!$('#airemember')?.checked, ls(), ss());
  narr().msg = 'Key saved.';
  bbDraft();
}
export function bbKeyClear() {
  clearKey(ls(), ss());
  narr().msg = 'Key cleared.';
  bbDraft();
}
export function bbNarrPreview() {
  const b = bb(),
    n = narr();
  if (!getKey(ls(), ss())) {
    n.msg = 'Save your API key first.';
    return refreshNarr();
  }
  if (!b.draft?.lines.length) {
    n.msg = 'Add the BAR lines first.';
    return refreshNarr();
  }
  n.preview = narrativeRequest(b.draft, names());
  n.msg = '';
  refreshNarr();
}
export function bbNarrCancel() {
  narr().preview = null;
  refreshNarr();
}
export async function bbNarrSend() {
  const b = bb(),
    n = narr(),
    req = n.preview,
    key = getKey(ls(), ss());
  if (!req || !key || !b.draft || n.busy) return;
  n.busy = true;
  n.msg = 'Drafting…';
  refreshNarr();
  const target = b.draft;
  const r = await draftNarrative(await AI.makeClient(key), req);
  n.busy = false;
  n.preview = null;
  if (r.error) n.msg = r.error;
  else {
    target.narrative = r.text;
    n.msg = r.cut
      ? 'Drafted, but the text was cut off. Add what is missing.'
      : 'Drafted. Check every sentence.';
    keep();
  }
  if (b.draft === target) bbDraft();
  else refreshNarr();
}
