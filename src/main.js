import './styles.css';
import { $, esc, money, num, sumBy } from './lib/format.js';
import { IDB } from './lib/idb.js';
import { SHEETS } from './lib/parse.js';
import { D, S, UI, loadBuffer, saveStore } from './state.js';
import { barCompute, barResults, loadBarFund, viewBAR } from './views/bar.js';
import { viewBudget } from './views/budget.js';
import { viewCap } from './views/capitalOutlay.js';
import { crResults, viewCR } from './views/cashReceipts.js';
import { jeList, jeResults, viewJE } from './views/journal.js';
import { viewRfR } from './views/reimbursements.js';
import { txResults, viewTx } from './views/transactions.js';

const NAV = [
  ['budget', 'Budget by fund'],
  ['tx', 'Transactions'],
  ['je', 'Journal entries'],
  ['bar', 'BAR builder'],
  ['rfr', 'Reimbursements'],
  ['cr', 'Cash receipts'],
  ['cap', 'Capital outlay'],
];
export function render() {
  const app = $('#app');
  if (!D.loaded) {
    app.innerHTML = importHTML();
    return;
  }
  if (!$('#main')) app.innerHTML = shellHTML();
  document
    .querySelectorAll('.nav button')
    .forEach((b) => b.setAttribute('aria-current', b.dataset.v === UI.view ? 'page' : 'false'));
  VIEWS[UI.view]();
}
function shellHTML() {
  return `<div class="app"><aside class="side"><div class="brand"><div class="word">FACTS</div>
  <div class="expand">Financial Analysis &amp; Control Tracking System</div><div class="school">${esc(D.school)}<br><span class="muted">${esc(D.cycle)}</span></div></div>
  <nav class="nav" aria-label="Sections">${NAV.map(([k, l]) => `<button data-act="nav" data-v="${k}">${l}</button>`).join('')}</nav>
  <div class="side-foot"><div class="file">${esc(D.fileName)}${D.asOf ? `<br>Run ${esc(D.asOf)}` : ''}</div>
  <div><button class="linkbtn" data-act="replace">Load a newer workbook</button></div>
  <div><button class="linkbtn" data-act="forget">Remove workbook from this browser</button></div></div></aside>
  <main id="main" tabindex="-1"></main></div>`;
}
function importHTML(msg, err) {
  return `<div class="import"><div class="imp-card"><div class="word">FACTS</div><div class="expand">Financial Analysis &amp; Control Tracking System</div>
  <label class="drop" id="drop"><input type="file" id="file" accept=".xlsx,.xlsm" data-in="file"><strong>Drop the FACTS workbook here, or choose a file</strong>
  <span class="muted">The file is read inside this browser and is never uploaded.</span></label>
  <div class="status${err ? ' err' : ''}" id="status" role="status">${esc(msg || '')}</div>
  <p class="muted" style="font-size:14px;margin-top:22px">It reads these sheets and rebuilds everything else from them:</p>
  <ul>${SHEETS.map((s) => `<li>${s}</li>`).join('')}</ul></div></div>`;
}

const VIEWS = {
  budget: viewBudget,
  tx: viewTx,
  je: viewJE,
  bar: viewBAR,
  rfr: viewRfR,
  cr: viewCR,
  cap: viewCap,
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
  replace: () => {
    const i = document.createElement('input');
    i.type = 'file';
    i.accept = '.xlsx,.xlsm';
    i.onchange = () => i.files[0] && handleFile(i.files[0]);
    i.click();
  },
  forget: async () => {
    try {
      await IDB.del('workbook');
    } catch (e) {}
    D.loaded = false;
    render();
  },
};
const saveBar = () => {
  const b = UI.bar,
    s = S();
  s.bar[b.fund] = { ...(s.bar[b.fund] || {}), amount: b.amount, basis: b.basis, mode: b.mode, obj: b.obj };
  saveStore();
};
const IN = {
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
document.addEventListener('dragover', (e) => {
  const d = e.target.closest && e.target.closest('#drop');
  if (d) {
    e.preventDefault();
    d.classList.add('hover');
  }
});
document.addEventListener('dragleave', (e) => {
  const d = e.target.closest && e.target.closest('#drop');
  if (d) d.classList.remove('hover');
});
document.addEventListener('drop', (e) => {
  const d = e.target.closest && e.target.closest('#drop');
  if (!d) return;
  e.preventDefault();
  d.classList.remove('hover');
  const f = e.dataTransfer.files[0];
  if (f) handleFile(f);
});

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
      await IDB.put('workbook', { name: file.name, buf });
    } catch (e) {}
    if (!$('#main')) render();
    else {
      $('#app').innerHTML = shellHTML();
      render();
    }
  } catch (err) {
    if (D.loaded) {
      alert(err.message);
      return;
    }
    $('#app').innerHTML = importHTML(err.message || 'That file could not be read.', true);
  }
}
(async function init() {
  render();
  try {
    const saved = await IDB.get('workbook');
    if (saved && saved.buf) {
      const st = $('#status');
      if (st) st.textContent = `Opening ${saved.name}…`;
      await new Promise((r) => setTimeout(r, 30));
      loadBuffer(saved.buf, saved.name);
      render();
    }
  } catch (e) {}
})();
