import './styles.css';
import { $, esc, money, num, sumBy } from './lib/format.js';
import { IDB } from './lib/idb.js';
import { readAccountSummary, readFundAudit } from './lib/importReport.js';
import { hasStop } from './lib/reportCheck.js';
import {
  earlierLoads,
  expiredKeys,
  isReportKey,
  latestKeys,
  makeRecord,
  recordUsable,
  reportKey,
  resultFromRecord,
} from './lib/reportStore.js';
import { deleteProfile, makeProfileId, saveProfile } from './lib/profileStore.js';
import { parseFundLines, parseList } from './lib/profile.js';
import {
  D,
  FY,
  PF,
  STORAGE,
  REP,
  S,
  UI,
  acceptReport,
  loadBuffer,
  profile,
  saveStore,
  setFiscalYear,
  storage,
  switchSchool,
} from './state.js';
import { barCompute, barResults, loadBarFund, viewBAR } from './views/bar.js';
import {
  bb,
  bbBuildTransfer,
  bbDeficits,
  bbDraft,
  bbFile,
  bbStartEmpty,
  bbSummary,
  bbSave,
  bbNarrFill,
  keep,
  refreshFte,
  fteNote,
  bbOpen,
  bbRemove,
  bbAddStatus,
  bbUnlock,
  backupFile,
  bbRestoreRead,
  bbRestoreApply,
  bbBackup,
  viewBarBuilder,
} from './views/barBuilder.js';
import { barLine } from './lib/bar.js';
import { suggestJustification } from './lib/justify.js';
import { splitWith } from './lib/profile.js';
import { viewBudget } from './views/budget.js';
import { viewImport } from './views/import.js';
import { viewCap } from './views/capitalOutlay.js';
import { viewAbout } from './views/about.js';
import { viewHelp } from './views/help.js';
import {
  scDirPick,
  scDirSearch,
  scDraftErrors,
  scErrors,
  scForm,
  scOpen,
  viewSchools,
} from './views/schools.js';
import { crResults, viewCR } from './views/cashReceipts.js';
import { jeList, jeResults, viewJE } from './views/journal.js';
import { viewRfR } from './views/reimbursements.js';
import { txResults, viewTx } from './views/transactions.js';

import { barOnly, homeScreen, pageScreens, pageTitle } from './mode.js';
import { JEM_ACT, JEM_IN, viewJEM } from './views/jem.js';

const NAV = [
  ['import', 'Load reports'],
  ['budget', 'Budget by fund'],
  ['tx', 'Transactions'],
  ['je', 'Journal entries'],
  ['bars', 'BAR Builder'],
  ['jem', 'Journal Entry Maker'],
  ['bar', 'BAR spread (v0.1)'],
  ['rfr', 'Reimbursements'],
  ['cr', 'Cash receipts'],
  ['cap', 'Capital outlay'],
  ['schools', 'Schools'],
  ['help', 'How to use'],
  ['about', 'About and privacy'],
];
// Screens that work before any report is loaded.
const LITE = new Set(['import', 'schools', 'about', 'help']);
const navList = () => (barOnly() ? NAV.filter(([k]) => pageScreens().has(k)) : NAV);
const keepBB = keep;
// Put the computed FTE adj back into the boxes without redrawing the screen (keeps the cursor).
const syncFte = () => {
  document.querySelectorAll('input.fte').forEach((el) => {
    el.value = bb().draft.lines[+el.dataset.i]?.fte || 0;
  });
  document.querySelectorAll('.fnote').forEach((el) => {
    const l = bb().draft.lines[+el.dataset.i];
    el.textContent = l ? fteNote(l) : '';
  });
};
const wbKey = () => 'workbook:' + PF.active;
const LEGACY_KEY = 'workbook';
export function render() {
  const app = $('#app');
  if (barOnly() && !pageScreens().has(UI.view)) UI.view = D.loaded ? homeScreen() : 'import';
  if (!D.loaded && !LITE.has(UI.view)) UI.view = 'import';
  if (barOnly()) document.title = pageTitle();
  const mode = D.loaded ? 'full' : 'lite';
  if (!$('#main') || app.dataset.mode !== mode) {
    app.innerHTML = shellHTML();
    app.dataset.mode = mode;
  }
  document
    .querySelectorAll('.nav button')
    .forEach((b) => b.setAttribute('aria-current', b.dataset.v === UI.view ? 'page' : 'false'));
  VIEWS[UI.view]();
  if (UI.view === 'import') fillEarlier();
  if (STORAGE.newer || STORAGE.unreadable)
    $('#main')?.insertAdjacentHTML(
      'afterbegin',
      `<div class="warn">${STORAGE.newer ? 'This browser holds data saved by a newer version of FACTS. It is shown but not changed, and your changes here will not be saved. Open the newer version.' : 'The saved data in this browser could not be read, so nothing will be saved over it. Restore from a backup file.'}</div>`,
    );
}
const schoolPicker = () =>
  `<label class="schoolpick"><span class="muted">School</span><select data-in="school" aria-label="School">${Object.values(
    PF.profiles,
  )
    .map(
      (p) => `<option value="${esc(p.id)}"${p.id === PF.active ? ' selected' : ''}>${esc(p.name)}</option>`,
    )
    .join('')}</select></label>`;
function shellHTML() {
  const all = navList();
  const nav = D.loaded ? all : all.filter(([k]) => LITE.has(k));
  const head = barOnly()
    ? `<div class="word plain">${pageTitle()}</div>`
    : `<div class="band"><img class="logo" src="./brand/vertex-horizontal-white.png" width="800" height="173" alt="Vertex Education"><div class="word">FACTS</div>\n  <div class="expand">Financial Analysis &amp; Control Tracking System</div></div>`;
  return `<div class="app"><aside class="side"><div class="brand">${head}<div class="school">${schoolPicker()}${D.loaded ? `<span class="muted">${esc(D.school)} · ${esc(D.cycle)}</span>` : ''}</div></div>
  <nav class="nav" aria-label="Sections">${nav.map(([k, l]) => `<button data-act="nav" data-v="${k}">${l}</button>`).join('')}</nav>
  <div class="side-foot">${
    D.loaded
      ? `<div class="file">${esc(D.fileName)}${D.asOf ? `<br>Run ${esc(D.asOf)}` : ''}</div>
  <div><button class="linkbtn" data-act="forget">Clear loaded reports</button></div>`
      : ''
  }</div></aside>
  <main id="main" tabindex="-1"></main></div>`;
}

const VIEWS = {
  import: viewImport,
  budget: viewBudget,
  tx: viewTx,
  je: viewJE,
  bars: viewBarBuilder,
  jem: viewJEM,
  bar: viewBAR,
  rfr: viewRfR,
  cr: viewCR,
  cap: viewCap,
  schools: viewSchools,
  about: viewAbout,
  help: viewHelp,
};
async function copyText(t, btn) {
  try {
    await navigator.clipboard.writeText(t);
    if (btn) {
      const o = btn.textContent;
      btn.textContent = 'Copied';
      setTimeout(() => (btn.textContent = o), 1500);
    }
  } catch (e) {
    const w = document.createElement('textarea');
    w.value = t;
    w.style.cssText = 'position:fixed;inset:10% 10% auto;height:60%;z-index:9';
    document.body.appendChild(w);
    w.select();
    w.addEventListener('blur', () => w.remove());
  }
}
const csv = (rows) =>
  rows
    .map((r) => r.map((v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v)).join(','))
    .join('\n');
const ACT = {
  ...JEM_ACT,
  nav: (t) => {
    UI.view = t.dataset.v;
    render();
    $('#main')?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  },
  toggleFund: (t) => {
    const k = t.dataset.k;
    UI.openFunds.has(k) ? UI.openFunds.delete(k) : UI.openFunds.add(k);
    viewBudget();
  },
  expandAll: () => {
    if (UI.openFunds.size) UI.openFunds.clear();
    else D.asr.funds.forEach((f, k) => UI.openFunds.add(k));
    viewBudget();
  },
  txOpen: (t) => {
    const k = t.dataset.k;
    UI.tx.open.has(k) ? UI.tx.open.delete(k) : UI.tx.open.add(k);
    txResults();
  },
  txSort: (t) => {
    const k = t.dataset.k;
    if (UI.tx.sort === k) UI.tx.dir *= -1;
    else {
      UI.tx.sort = k;
      UI.tx.dir = k === 'key' ? 1 : -1;
    }
    txResults();
  },
  txReset: () => {
    UI.tx.f = {};
    UI.tx.open.clear();
    viewTx();
  },
  jeAdd: (t) => {
    S().je.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      code: t.dataset.code,
      desc: t.dataset.desc,
      detail: t.dataset.detail,
      amount: num(t.dataset.amt),
      type: 'Reclass',
      note: '',
      status: 'Draft',
      posted: '',
    });
    saveStore();
    jeList();
    jeResults();
  },
  jeDel: (t) => {
    const s = S();
    s.je = s.je.filter((e) => e.id !== t.dataset.id);
    saveStore();
    jeList();
    jeResults();
  },
  jeCopy: (t) =>
    copyText(
      csv([
        ['Account', 'Description', 'Detail', 'Amount', 'Type', 'Note', 'Status', 'Posted'],
        ...S().je.map((e) => [e.code, e.desc, e.detail, e.amount, e.type, e.note, e.status, e.posted]),
      ]),
      t,
    ),
  barCopy: (t) => {
    const c = barCompute();
    copyText(
      csv([
        ['Account Code', 'Description', UI.bar.mode + ' amount'],
        ...c.inc.filter((l) => l.alloc).map((l) => [l.code, l.desc, l.alloc]),
      ]),
      t,
    );
  },
  crOpen: (t) => {
    const k = t.dataset.k;
    UI.cr.open.has(k) ? UI.cr.open.delete(k) : UI.cr.open.add(k);
    crResults();
  },
  forget: async () => {
    try {
      await IDB.del(wbKey());
      if (PF.active === 'gilbert-l-sena') await IDB.del(LEGACY_KEY);
    } catch (e) {}
    Object.assign(D, { loaded: false, asr: null, fa: null, rfr: null, cr: null, cap: null });
    REP.asr = REP.fa = null;
    UI.imp = { asr: null, fa: null, wb: null };
    UI.view = 'import';
    render();
  },
  bbBuild: (t) => {
    bbBuildTransfer(t.dataset.fund, t.dataset.func, t.dataset.kind || 'T');
    bbDraft();
    $('#bbdraft')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  },
  bbStart: () => {
    bbStartEmpty();
    bbDraft();
  },
  bbDel: (t) => {
    bb().draft.lines.splice(+t.dataset.i, 1);
    keepBB();
    bbDraft();
  },
  bbAddLine: () => {
    const b = bb(),
      code = b.add.code.trim();
    if (!splitWith(profile(), code)) {
      b.note = `"${code}" does not match the account code layout of ${profile().name}.`;
      return bbDraft();
    }
    b.note = '';
    b.draft.lines.push(barLine(profile(), code, num(b.add.amount)));
    refreshFte(b.draft);
    b.add = { code: '', amount: '' };
    keepBB();
    bbDraft();
  },
  bbBackupDownload: () => {
    const f = backupFile();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([f.text], { type: 'application/json' }));
    a.download = f.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
  bbRestoreApply: () => bbRestoreApply(),
  bbRestoreCancel: () => {
    bb().restore = null;
    bbBackup();
  },
  bbNarrFill: () => bbNarrFill(),
  bbNarrCopy: (t) => {
    const x = bb().draft?.narrative;
    if (x) copyText(x, t);
  },
  bbSave: () => bbSave(),
  bbOpen: (t) => bbOpen(t.dataset.id),
  bbRemove: (t) => bbRemove(t.dataset.id),
  bbAddStatus: (t) => bbAddStatus(t.dataset.id),
  bbUnlock: () => bbUnlock(),
  bbDiscard: () => {
    if (!confirm('Discard this BAR? Its lines and wording will be lost.')) return;
    bb().draft = null;
    bb().note = '';
    keepBB();
    bbDraft();
  },
  bbSuggest: () => {
    const d = bb().draft;
    d.justification = suggestJustification(d, { funcNames: D.asr.funcNames, fundNames: D.fundNames });
    keepBB();
    bbDraft();
  },
  bbDownload: () => {
    const r = bbFile();
    if (!r.ok) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([r.csv], { type: 'text/csv;charset=utf-8' }));
    a.download = r.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
  bbCopy: (t) => {
    const r = bbFile();
    if (r.ok) copyText(r.csv, t);
  },
  impAccept: (t) => {
    const kind = t.dataset.kind,
      st = UI.imp[kind];
    if (st?.status !== 'pending') return;
    acceptReport(st.result);
    UI.imp[kind] = null;
    render();
    persistReport(kind);
  },
  loadEarlier: async (t) => {
    try {
      const rec = await IDB.get(t.dataset.key);
      if (!recordUsable(rec)) return;
      acceptReport(resultFromRecord(rec), rec.at);
    } catch (e) {}
    render();
  },
  impDiscard: (t) => {
    UI.imp[t.dataset.kind] = null;
    render();
  },
  scDirPick: (t) => scDirPick(+t.dataset.i),
  scNew: () => {
    scOpen();
    scForm();
  },
  scEdit: (t) => {
    scOpen(t.dataset.id);
    scForm();
  },
  scCancel: () => {
    UI.sc = null;
    scForm();
  },
  scUse: (t) => useSchool(t.dataset.id),
  scDelete: async (t) => {
    const id = t.dataset.id,
      p = PF.profiles[id];
    if (!p || !confirm(`Remove ${p.name} from this browser? Its saved notes stay stored but are hidden.`))
      return;
    const wasActive = id === PF.active;
    const r = deleteProfile(storage, PF, id);
    if (!r.ok) return alert(r.errors.join('\n'));
    if (wasActive) await useSchool(PF.active);
    else viewSchools();
  },
  scSave: async () => {
    const sc = UI.sc;
    if (!sc) return;
    const d = sc.draft;
    if (sc.isNew) d.id = makeProfileId(d.name, PF.profiles);
    const r = saveProfile(storage, PF, d);
    if (!r.ok) {
      $('#scerr').innerHTML = scErrors();
      return;
    }
    UI.sc = null;
    // The active school's reports were read with the old layout; read them again.
    if (d.id === PF.active) await useSchool(d.id);
    else viewSchools();
  },
};
const saveBar = () => {
  const b = UI.bar,
    s = S();
  s.bar[b.fund] = { ...(s.bar[b.fund] || {}), amount: b.amount, basis: b.basis, mode: b.mode, obj: b.obj };
  saveStore();
};
const IN = {
  ...JEM_IN,
  file: (t) => t.files[0] && handleFile(t.files[0]),
  overOnly: (t) => {
    UI.overOnly = t.checked;
    viewBudget();
  },
  txf: (t) => {
    UI.tx.f[t.dataset.k] = t.value;
    UI.tx.open.clear();
    txResults();
  },
  txgroup: (t) => {
    UI.tx.group = t.value;
    UI.tx.open.clear();
    UI.tx.sort = t.value === 'month' ? 'key' : UI.tx.sort;
    UI.tx.dir = t.value === 'month' ? 1 : UI.tx.dir;
    txResults();
  },
  je: (t) => {
    UI.je[t.dataset.k] = t.value;
    jeResults();
  },
  jeEdit: (t) => {
    const e = S().je.find((x) => x.id === t.dataset.id);
    if (!e) return;
    e[t.dataset.k] = t.dataset.k === 'amount' ? num(t.value) : t.value;
    saveStore();
    if (t.dataset.k === 'amount') {
      const el = $('#jetot');
      if (el) el.innerHTML = money(sumBy(S().je, (x) => num(x.amount)));
    }
  },
  barFund: (t) => {
    loadBarFund(t.value);
    viewBAR();
  },
  bar: (t) => {
    const k = t.dataset.k;
    UI.bar[k] = t.type === 'checkbox' ? t.checked : t.value;
    if (k === 'amount' || k === 'basis' || k === 'mode' || k === 'obj') saveBar();
    barResults();
  },
  barInc: (t) => {
    const s = S(),
      o = (s.bar[UI.bar.fund] = { ...(s.bar[UI.bar.fund] || {}) });
    const ex = new Set(o.excluded || []);
    t.checked ? ex.delete(t.dataset.code) : ex.add(t.dataset.code);
    o.excluded = [...ex];
    saveStore();
    barResults();
  },
  barAll: (t) => {
    const s = S(),
      o = (s.bar[UI.bar.fund] = { ...(s.bar[UI.bar.fund] || {}) });
    const codes = barCompute().lines.map((l) => l.code);
    const ex = new Set(o.excluded || []);
    codes.forEach((c) => (t.checked ? ex.delete(c) : ex.add(c)));
    o.excluded = [...ex];
    saveStore();
    barResults();
  },
  barNote: (t) => {
    const s = S();
    s.bar[UI.bar.fund] = { ...(s.bar[UI.bar.fund] || {}), [t.dataset.k]: t.value };
    saveStore();
  },
  crq: (t) => {
    UI.cr.q = t.value;
    crResults();
  },
  bbRestoreFile: async (t) => {
    const f = t.files?.[0];
    if (f) bbRestoreRead(await f.text());
    t.value = '';
  },
  bbNarrTpl: (t) => {
    if (bb().draft) bb().draft.narrTpl = t.value;
    bb().narrMsg = '';
    keepBB();
  },
  bbFund: (t) => {
    const b = bb();
    t.checked ? b.funds.add(t.dataset.code) : b.funds.delete(t.dataset.code);
    keepBB();
    viewBarBuilder();
  },
  bbType: (t) => {
    bb().type = t.value;
    keepBB();
    viewBarBuilder();
  },
  bbStartFund: (t) => {
    bb().startFund = t.value;
  },
  bbCushion: (t) => {
    bb().cushion = Math.max(0, num(t.value));
    keepBB();
  },
  bbMode: (t) => {
    bb().mode = t.value;
    keepBB();
  },
  bbAmt: (t) => {
    bb().draft.lines[+t.dataset.i].amount = num(t.value);
    refreshFte(bb().draft);
    syncFte();
    keepBB();
    bbSummary();
  },
  bbLineFte: (t) => {
    const l = bb().draft.lines[+t.dataset.i];
    l.lineFte = Math.max(0, num(t.value));
    bb().lineFte[l.code] = l.lineFte;
    l.fteManual = false;
    refreshFte(bb().draft);
    syncFte();
    keepBB();
    bbSummary();
  },
  bbFte: (t) => {
    const l = bb().draft.lines[+t.dataset.i];
    l.fte = num(t.value);
    l.fteManual = true;
    keepBB();
    bbSummary();
  },
  bbField: (t) => {
    const path = t.dataset.k.split('.'),
      d = bb().draft;
    let o = d;
    for (const k of path.slice(0, -1)) o = o[k];
    o[path.at(-1)] = t.value;
    keepBB();
    bbSummary();
  },
  bbAddCode: (t) => {
    bb().add.code = t.value;
  },
  bbAddAmt: (t) => {
    bb().add.amount = t.value;
  },
  school: (t) => useSchool(t.value),
  fy: (t) => {
    setFiscalYear(parseInt(t.value, 10));
    UI.imp.asr = UI.imp.fa = null;
    render();
  },
  repFile: (t) => t.files[0] && handleReport(t.dataset.kind, t.files[0]),
  sc: (t) => {
    const d = UI.sc.draft,
      k = t.dataset.k;
    if (k === 'cushion') d.defaultCushion = { type: 'amount', value: num(t.value) };
    else d[k] = t.value;
    $('#scerr').innerHTML = scErrors();
  },
  scDirQ: (t) => scDirSearch(t.value),
  scBank: (t) => {
    const d = UI.sc.draft;
    d.bankAccount = { pattern: t.value.trim(), byFund: d.bankAccount?.byFund || {} };
    $('#scerr').innerHTML = scErrors();
  },
  scBankFunds: (t) => {
    const d = UI.sc.draft,
      byFund = {};
    for (const l of t.value.split('\n')) {
      const m = l.match(/^\s*(\d{5})\s*[,\s]\s*(\S+)\s*$/);
      if (m) byFund[m[1]] = m[2];
    }
    d.bankAccount = { pattern: d.bankAccount?.pattern || '', byFund };
    $('#scerr').innerHTML = scErrors();
  },
  scLocIds: (t) => {
    UI.sc.draft.locationIds = t.value
      .split(/[,\s]+/)
      .map((x) => x.trim())
      .filter(Boolean);
    $('#scerr').innerHTML = scErrors();
  },
  scSeg: (t) => {
    const d = UI.sc.draft,
      k = t.dataset.k,
      n = parseInt(t.value, 10);
    if (k === 'tail') {
      d.segments = d.segments.filter((s) => s.key !== 'tail');
      if (n > 0) d.segments.push({ key: 'tail', len: n, label: 'Extra' });
    } else {
      const s = d.segments.find((x) => x.key === k);
      if (s) s.len = isNaN(n) ? 0 : n;
    }
    $('#scerr').innerHTML = scErrors();
  },
  scLoc: (t) => {
    const r = UI.sc.draft.locationRule,
      k = t.dataset.k;
    if (k === 'type') {
      r.type = t.value;
      if (t.value === 'lastN' && !r.n) r.n = 3;
    } else if (k === 'n') r.n = parseInt(t.value, 10);
    else r.confirmed = t.checked;
    if (k !== 'n') scForm();
    else $('#scerr').innerHTML = scErrors();
  },
  scNames: (t) => {
    UI.sc.draft.reportNames = t.value
      .split(/\r?\n/)
      .map((x) => x.trim())
      .filter(Boolean);
    $('#scerr').innerHTML = scErrors();
  },
  scFunds: (t) => {
    UI.sc.fundsText = t.value;
    UI.sc.draft.funds = parseFundLines(t.value);
    $('#scerr').innerHTML = scErrors();
  },
  scPriority: (t) => {
    UI.sc.priorityText = t.value;
    UI.sc.draft.donorPriority = parseList(t.value);
    $('#scerr').innerHTML = scErrors();
  },
};
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-act]');
  if (t && ACT[t.dataset.act]) ACT[t.dataset.act](t, e);
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const t = e.target.closest('tr[data-act]');
  if (t && e.target === t) {
    e.preventDefault();
    ACT[t.dataset.act](t, e);
  }
});
document.addEventListener('input', (e) => {
  const t = e.target.closest('[data-in]');
  if (t && IN[t.dataset.in]) IN[t.dataset.in](t, e);
});
const DROP = '#drop, .drop[data-kind]';
document.addEventListener('dragover', (e) => {
  const d = e.target.closest && e.target.closest(DROP);
  if (d) {
    e.preventDefault();
    d.classList.add('hover');
  }
});
document.addEventListener('dragleave', (e) => {
  const d = e.target.closest && e.target.closest(DROP);
  if (d) d.classList.remove('hover');
});
document.addEventListener('drop', (e) => {
  const d = e.target.closest && e.target.closest(DROP);
  if (!d) return;
  e.preventDefault();
  d.classList.remove('hover');
  const f = e.dataTransfer.files[0];
  if (!f) return;
  if (d.dataset.kind) handleReport(d.dataset.kind, f);
  else handleFile(f);
});

// Read one dropped report for the selected school and fiscal year, run the checks, then load it,
// hold it for confirmation (warnings), or reject it (a stop).
async function handleReport(kind, file) {
  UI.imp[kind] = { status: 'reading', name: file.name };
  render();
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    await new Promise((r) => setTimeout(r, 20));
    const ctx = { profile: profile(), fiscalYear: FY.value, asr: REP.asr ? D.asr : null };
    const result =
      kind === 'asr' ? readAccountSummary(file.name, bytes, ctx) : readFundAudit(file.name, bytes, ctx);
    if (hasStop(result.checks)) UI.imp[kind] = { status: 'rejected', result };
    else if (result.checks.some((c) => c.level === 'warn')) UI.imp[kind] = { status: 'pending', result };
    else {
      acceptReport(result);
      UI.imp[kind] = null;
      persistReport(kind);
    }
  } catch (err) {
    UI.imp[kind] = { status: 'error', msg: err.message || 'That file could not be read.' };
  }
  render();
}

async function handleFile(file) {
  const st = $('#status');
  if (st) {
    st.className = 'status';
    st.textContent = `Reading ${file.name}…`;
  }
  try {
    const buf = await file.arrayBuffer();
    await new Promise((r) => setTimeout(r, 30));
    loadBuffer(buf, file.name);
    try {
      await IDB.put(wbKey(), { name: file.name, buf });
    } catch (e) {}
    if (LITE.has(UI.view)) UI.view = 'budget';
    render();
  } catch (err) {
    UI.imp.wb = { error: err.message || 'That file could not be read.' };
    UI.view = 'import';
    render();
  }
}
// Keep the accepted report's parsed rows so a reload brings them back. Old loads are pruned.
async function persistReport(kind) {
  try {
    const r = REP[kind];
    if (!r) return;
    const result =
      kind === 'asr'
        ? { kind, name: r.name, asr: D.asr, params: r.params, checks: r.checks }
        : { kind, name: r.name, fa: D.fa, checks: r.checks };
    await IDB.put(
      reportKey(PF.active, r.fy, kind, r.at),
      makeRecord(result, { school: PF.active, fy: r.fy, at: r.at }),
    );
    for (const k of expiredKeys((await IDB.keys()).filter(isReportKey))) await IDB.del(k);
  } catch (e) {}
}
// Bring back the newest saved reports for the active school and fiscal year. True if any came back.
// "Earlier loads": every kept load for this school and year (30 days), each reloadable.
async function fillEarlier() {
  const el = $('#earlier');
  if (!el) return;
  let list = [];
  try {
    list = earlierLoads((await IDB.keys()).filter(isReportKey), PF.active, FY.value);
  } catch (e) {}
  const now = (k) => REP[k]?.at;
  list = list.filter((x) => x.at !== now(x.kind));
  if (!$('#earlier')) return;
  el.hidden = !list.length;
  if (!list.length) return;
  const label = { asr: 'Account Summary', fa: 'Fund Audit' };
  el.innerHTML = `<h2>Earlier loads</h2><p class="muted">Kept in this browser for 30 days. Choosing one makes it the report FACTS uses now.</p>
  <ul class="plain">${list
    .map(
      (x) =>
        `<li>${label[x.kind]} · loaded ${esc(new Date(x.at).toLocaleString())} <button class="btn" data-act="loadEarlier" data-key="${esc(x.key)}">Use this load</button></li>`,
    )
    .join('')}</ul>`;
}
async function restoreReports() {
  try {
    const latest = latestKeys((await IDB.keys()).filter(isReportKey), PF.active, FY.value);
    // Fund Audit first, so loading the Account Summary re-checks it.
    for (const kind of ['fa', 'asr']) {
      if (!latest[kind]) continue;
      const rec = await IDB.get(latest[kind]);
      if (recordUsable(rec)) acceptReport(resultFromRecord(rec), rec.at);
    }
    return !!(latest.asr || latest.fa);
  } catch (e) {
    return false;
  }
}
// Open the active school's saved workbook, if this browser has one. Returns an error message or ''.
async function loadSaved() {
  if (await restoreReports()) return '';
  let saved = null;
  try {
    saved = await IDB.get(wbKey());
    if (!saved && PF.active === 'gilbert-l-sena') saved = await IDB.get(LEGACY_KEY);
  } catch (e) {
    return ''; // no browser file cache available: start from the import screen
  }
  if (!saved || !saved.buf) return '';
  const st = $('#status');
  if (st) st.textContent = `Opening ${saved.name}…`;
  await new Promise((r) => setTimeout(r, 30));
  try {
    loadBuffer(saved.buf, saved.name);
  } catch (e) {
    return e.message || 'The saved workbook could not be read with this school layout.';
  }
  return '';
}
// Make a school the active one. Its own saved workbook opens; no other school's data is shown.
async function useSchool(id) {
  UI.sc = null;
  if (!switchSchool(id)) return;
  const err = await loadSaved();
  render();
  if (err && !D.loaded) {
    UI.imp.wb = { error: err };
    render();
  }
}
(async function init() {
  render();
  await IDB.moveLegacy();
  await loadSaved();
  render();
})();
