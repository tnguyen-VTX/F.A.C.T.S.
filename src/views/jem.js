// Journal Entry Maker: reclass actuals (Type Actual) and journal entries for approved BARs (Type Budget).
// Output is what the debits and credits would be, in AptaFund's layout. Rules: context/journal-entries.md.
import * as XLSX from 'xlsx';
import { $, esc, fmtD, fmtM, missingMsg, num, r2 } from '../lib/format.js';
import { D, FY, PF, S, UI, profile, saveStore } from '../state.js';
import { IDB } from '../lib/idb.js';
import { barJE, checkJE, jeTotals } from '../lib/je.js';
import { FILTER_KEYS, buildReclassJEs, chargeKey, hasFilter, matchingCharges } from '../lib/reclass.js';
import { checkAccounts, chartDesc, checkChartReport, parseChart } from '../lib/chartOfAccounts.js';
import { checkBarReport, parseBarReport } from '../lib/barReport.js';
import { JE_STATUSES, addJEStatus, isJEFrozen, reclassedMap, removeJE, saveJE } from '../lib/jeLog.js';

const TABS = [
  ['reclass', 'Reclass actuals'],
  ['bar', 'Entry for an approved BAR'],
  ['saved', 'Saved entries'],
];
const SEG_KEYS = ['fund', 'func', 'obj', 'prog', 'loc', 'job'];
const SEG_LABEL = {
  fund: 'Fund',
  func: 'Function',
  obj: 'Object',
  prog: 'Program',
  loc: 'Location',
  job: 'Job class',
};

export function jem() {
  UI.jem ??= {
    tab: 'reclass',
    q: '',
    filter: {},
    changes: {},
    amounts: {},
    made: null,
    bar: null,
    open: null,
    msg: '',
  };
  return UI.jem;
}
const jes = () => (S().jes ??= []);
const chartKey = () => `chart:${PF.active}:${FY.value}`;

// The school's chart for this year, restored from the browser's storage when it is not in memory.
async function ensureChart() {
  if (D.chart && D.chart.key === chartKey()) return;
  D.chart = null;
  try {
    const rec = await IDB.get(chartKey());
    if (rec && (rec.v ?? 1) <= 1)
      D.chart = { key: chartKey(), ...rec.chart, codes: new Map(rec.chart.codes) };
  } catch {
    /* no stored chart */
  }
}
const descOf = (code) =>
  chartDesc(D.chart, code) ||
  D.fa.find((r) => r.code === code)?.acctDesc ||
  D.asr?.funds.get(code.split('-')[0])?.lines.find((l) => l.code === code)?.desc ||
  '';

function acctChecks(list) {
  const r = checkAccounts(list, { chart: D.chart, ped: null });
  let h = '';
  if (r.adds.length)
    h += `<div class="warn"><b>Add these account strings in AptaFund first:</b><ul>${r.adds
      .map((a) => `<li><span class="code">${esc(a.code)}</span> ${esc(a.why)}</li>`)
      .join('')}</ul></div>`;
  if (r.stops.length)
    h += `<div class="warn"><b>PED does not allow:</b> ${r.stops.map((c) => esc(c)).join(', ')}</div>`;
  if (r.notes.length) h += r.notes.map((n) => `<p class="muted">${esc(n)}</p>`).join('');
  return h;
}

function jeTable(je) {
  const t = jeTotals(je);
  return `<div class="scroll"><table class="t"><thead><tr><th>Seq</th><th>Account code</th><th>Description</th><th>Comment</th><th class="r">Debit</th><th class="r">Credit</th></tr></thead><tbody>${je.lines
    .map(
      (l) =>
        `<tr><td class="num">${l.seq}</td><td><span class="code">${esc(l.code)}</span></td><td>${esc(l.desc)}</td><td>${esc(l.comment)}</td><td class="r num">${l.debit ? fmtM(l.debit) : ''}</td><td class="r num">${l.credit ? fmtM(l.credit) : ''}</td></tr>`,
    )
    .join(
      '',
    )}</tbody><tfoot><tr><th colspan="4">Total</th><td class="r num"><b>${fmtM(t.debit)}</b></td><td class="r num"><b>${fmtM(t.credit)}</b></td></tr></tfoot></table></div>`;
}
const checksHTML = (checks) =>
  checks.length
    ? `<ul class="checks">${checks.map((c) => `<li class="chk-${c.level}"><b>${c.level === 'stop' ? 'Stop' : 'Check'}:</b> ${esc(c.msg)}</li>`).join('')}</ul>`
    : '';
const head = (je) =>
  `<p><b>Type</b> ${esc(je.type)} · <b>Transaction date</b> ${esc(fmtD(je.date))} · <b>Comment</b> ${esc(je.comment)}</p>`;

function entryBlock(je, i, scope) {
  const checks = checkJE(je);
  const stop = checks.some((c) => c.level === 'stop');
  return `<section class="panel"><h3>${esc(je.comment)}</h3>${head(je)}${checksHTML(checks)}${jeTable(je)}
  ${acctChecks(je.lines.map((l) => l.code))}
  <div class="toolbar"><button class="btn primary" data-act="jemSave" data-scope="${scope}" data-i="${i}"${stop ? ' disabled' : ''}>Save entry</button>
  <button class="btn" data-act="jemCopy" data-scope="${scope}" data-i="${i}">Copy lines</button>
  <button class="btn" data-act="jemXlsx" data-scope="${scope}" data-i="${i}">Download Excel</button></div></section>`;
}

// ---- Screen ----
export function viewJEM() {
  const main = $('#main'),
    j = jem();
  if (!D.fa.length && !D.asr) {
    main.innerHTML =
      `<header class="ph"><h1>Journal Entry Maker</h1></header>` +
      missingMsg('Account Summary and Fund Audit');
    return;
  }
  main.innerHTML = `<header class="ph"><h1>Journal Entry Maker</h1><p class="sub">The debits and credits for a reclass of actuals or an approved BAR, in AptaFund's layout, for ${esc(profile().name)} FY${FY.value}. Nothing is sent anywhere: key the entry into AptaFund yourself.</p></header>
  <div id="jemchart"></div>
  <div class="tabs" role="tablist">${TABS.map(([k, n]) => `<button class="btn${j.tab === k ? ' primary' : ''}" role="tab" data-act="jemTab" data-tab="${k}">${n}</button>`).join(' ')}</div>
  <div id="jembody"></div>`;
  ensureChart().then(() => {
    chartPanel();
    body();
  });
  chartPanel();
  body();
}
function chartPanel() {
  const el = $('#jemchart');
  if (!el) return;
  const c = D.chart;
  el.innerHTML = `<section class="panel"><h2>Account checks</h2>
  <p class="muted">Every account code in an entry is checked against the school's AptaFund Chart Of Accounts report, so you know which strings to add in AptaFund first. Codes are also meant to be checked against the PED Chart Line Listing; that file is not loaded yet.</p>
  <p class="${c ? 'loaded' : 'muted'}">${c ? `<b>Chart loaded</b> · ${esc(c.school)} · FY${esc(String(c.fiscalYear))} · ${c.codes.size.toLocaleString()} account codes` : 'No chart loaded for this school and year.'}</p>
  <label class="btn">Load the chart of accounts…<input type="file" accept=".xlsx,.xls" data-in="jemChartFile" hidden></label> ${esc(jem().msg)}</section>`;
}
function body() {
  const el = $('#jembody'),
    j = jem();
  if (!el) return;
  if (j.tab === 'reclass') el.innerHTML = reclassHTML();
  else if (j.tab === 'bar') el.innerHTML = barHTML();
  else el.innerHTML = savedHTML();
}

// ---- Reclass ----
function reclassHTML() {
  const j = jem(),
    p = profile();
  if (!D.fa.length) return missingMsg('Fund Audit Report');
  const boxes = p.segments
    .filter((x) => FILTER_KEYS.includes(x.key))
    .map(
      (x) =>
        `<label>${SEG_LABEL[x.key]}<input type="text" size="${x.len + 1}" maxlength="${x.len}" inputmode="numeric" data-in="jemFilter" data-k="${x.key}" value="${esc(j.filter[x.key] || '')}" placeholder="any"></label>`,
    )
    .join('');
  return `<section class="panel"><h2>Choose the charges</h2><p class="muted">Fill in any of the account code parts; a part you leave empty matches everything, and a short value matches everything that starts with it (53 matches 53414). The text box also searches names, detail and the account description.</p>
  <div class="filters">${boxes}<label>Name, detail or description<input type="search" data-in="jemFilter" data-k="text" value="${esc(j.filter.text || '')}" placeholder="optional"></label></div></section>
  <div id="jemcharges">${chargesHTML()}</div><div id="jemout">${madeHTML()}</div>`;
}
const filterText = (f) =>
  [
    ...FILTER_KEYS.filter((k) => f[k]).map((k) => `${SEG_LABEL[k].toLowerCase()} ${f[k]}`),
    f.text ? `"${f.text}"` : '',
  ]
    .filter(Boolean)
    .join(', ');
function chargesHTML() {
  const j = jem(),
    p = profile();
  if (!hasFilter(j.filter))
    return '<section class="panel"><p class="muted">Fill in at least one box above to list charges.</p></section>';
  const found = matchingCharges(D.fa, j.filter, reclassedMap(jes()));
  const groups = found.groups;
  if (!groups.length) return '<section class="panel"><p class="muted">No charges match.</p></section>';
  return `<section class="panel"><h2>${esc(filterText(j.filter))}</h2>${found.more ? `<div class="warn">${found.codes} account codes match; only the first ${groups.length} are shown. Narrow the filter to see the rest.</div>` : ''}<p class="muted">For each account code, type only the parts that change; the rest stay the same. Then type how much of each charge to move. Entries are dated the last day of the charge's month.</p>
  ${groups
    .map((g) => {
      const parts = g.code.split('-');
      const ch = j.changes[g.code] || {};
      return `<div class="grp"><h3><span class="code">${esc(g.code)}</span> ${esc(g.desc)} <span class="muted">${fmtM(g.total)}</span></h3>
      <div class="filters">${p.segments
        .map((s, i) =>
          SEG_KEYS.includes(s.key)
            ? `<label>${SEG_LABEL[s.key]}<input type="text" size="${s.len + 1}" maxlength="${s.len}" inputmode="numeric" data-in="jemChg" data-code="${esc(g.code)}" data-k="${s.key}" value="${esc(ch[s.key] || '')}" placeholder="${esc(parts[i])}"></label>`
            : '',
        )
        .join('')}</div>
      <div class="scroll"><table class="t"><thead><tr><th>Date</th><th class="r">Actual</th><th class="r">Already reclassed</th><th class="r">Left</th><th class="r">Move</th><th></th></tr></thead><tbody>${g.charges
        .map(
          (c) =>
            `<tr><td>${esc(fmtD(c.date))}</td><td class="r num">${fmtM(c.actual)}</td><td class="r num">${fmtM(c.reclassed)}</td><td class="r num">${fmtM(c.remaining)}</td>
            <td class="r"><input type="number" step="0.01" min="0" class="amt" data-in="jemAmt" data-code="${esc(g.code)}" data-date="${esc(c.date)}" value="${esc(j.amounts[chargeKey(g.code, c.date)] ?? '')}" aria-label="Amount to move from ${esc(g.code)} on ${esc(fmtD(c.date))}"></td>
            <td><button class="linkbtn" data-act="jemAll" data-code="${esc(g.code)}" data-date="${esc(c.date)}" data-left="${c.remaining}">All that is left</button></td></tr>`,
        )
        .join('')}</tbody></table></div></div>`;
    })
    .join('')}
  <div class="toolbar"><button class="btn primary" data-act="jemMake">Make the entries</button></div></section>`;
}
function madeHTML() {
  const m = jem().made;
  if (!m) return '';
  return (
    (m.errors.length
      ? `<div class="warn"><ul>${m.errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></div>`
      : '') +
    (m.jes.length ? `<h2>Entries</h2>` : '') +
    m.jes.map((je, i) => entryBlock(je, i, 'made')).join('')
  );
}

// ---- Approved BAR ----
function barHTML() {
  const j = jem(),
    b = j.bar;
  let h = `<section class="panel"><h2>Approved BAR</h2><p class="muted">Load PED's Budget Adjustment Request Report for an approved BAR, as an Excel file. Decreases become credits and increases debits; the entry is dated with the last PED approval date.</p>
  <label class="btn">Load the approved BAR (Excel)…<input type="file" accept=".xlsx,.xls" data-in="jemBarFile" hidden></label> <span class="muted">${esc(j.msg)}</span></section>`;
  if (b) {
    h += `<section class="panel"><h3>BAR ${esc(b.rep.docId)}</h3><p>${esc(b.rep.entity)} · FY ${esc(b.rep.fiscalYearText)} · ${esc(b.rep.typeName || b.rep.typeCode)} · ${b.rep.lines.length} lines</p>${checksHTML(b.checks)}
    ${b.je ? `<label class="fld"><span>Transaction date (PED approval date)</span><input type="date" data-in="jemBarDate" value="${esc(b.date)}"></label></section><div id="jembar">${entryBlock(b.je, 0, 'bar')}</div>` : '</section>'}`;
  }
  return h;
}
function makeBarJE() {
  const b = jem().bar;
  if (!b) return;
  if (b.checks.some((c) => c.level === 'stop')) {
    b.je = null;
    return;
  }
  b.je = barJE({
    docId: b.rep.docId,
    fund: b.rep.lines[0]?.code.split('-')[0] || '',
    typeName: b.rep.typeName,
    date: b.date,
    lines: b.rep.lines.map((l) => ({
      code: l.code,
      amount: l.amount,
      desc: chartDesc(D.chart, l.code) || l.desc,
    })),
  });
}

// ---- Saved ----
function savedHTML() {
  const list = jes().slice().reverse();
  if (!list.length)
    return '<section class="panel"><p class="muted">No saved entries yet. Make an entry and choose Save entry.</p></section>';
  const j = jem();
  return `<section class="panel"><h2>Saved entries</h2>${list
    .map((e) => {
      const t = jeTotals(e.je);
      return `<div class="grp"><h3>${esc(e.je.comment)} <span class="muted">${esc(e.kind === 'bar' ? 'BAR' : 'Reclass')} · ${esc(fmtD(e.je.date))} · ${fmtM(t.debit)}</span></h3>
      <p><b>${esc(e.status)}</b>${e.number ? ` · AptaFund ${esc(e.number)}` : ''} · ${e.log.map((l) => `${esc(l.status)} ${esc(l.date)}`).join(', ')}</p>
      <div class="filters"><label>New status<select data-st="status" data-id="${esc(e.id)}">${JE_STATUSES.map((s) => `<option>${s}</option>`).join('')}</select></label>
      <label>Date<input type="date" data-st="date" data-id="${esc(e.id)}"></label>
      <label>AptaFund number<input type="text" size="10" data-st="number" data-id="${esc(e.id)}" value="${esc(e.number)}"></label>
      <button class="btn" data-act="jemStatus" data-id="${esc(e.id)}">Add status</button>
      <button class="btn" data-act="jemView" data-id="${esc(e.id)}">${j.open === e.id ? 'Hide lines' : 'Show lines'}</button>
      <button class="btn" data-act="jemXlsx" data-scope="saved" data-id="${esc(e.id)}">Download Excel</button>
      <button class="btn" data-act="jemDelete" data-id="${esc(e.id)}"${isJEFrozen(e) ? ' disabled' : ''}>Delete</button></div>
      ${j.open === e.id ? jeTable(e.je) : ''}</div>`;
    })
    .join('')}</section>`;
}

// ---- Output helpers ----
const pick = (scope, t) => {
  const j = jem();
  if (scope === 'made') return j.made?.jes[+t.dataset.i];
  if (scope === 'bar') return j.bar?.je;
  return jes().find((e) => e.id === t.dataset.id)?.je;
};
function lineText(je) {
  return je.lines
    .map((l) => [l.seq, l.code, l.desc, l.comment, l.debit.toFixed(2), l.credit.toFixed(2)].join('\t'))
    .join('\n');
}
function workbookFor(je) {
  const t = jeTotals(je);
  const rows = [
    ['Type', je.type],
    ['Transaction date', je.date],
    ['Comment', je.comment],
    [],
    ['Sequence', 'Account Code', 'Description', 'Comment', 'Debit', 'Credit'],
    ...je.lines.map((l) => [l.seq, l.code, l.desc, l.comment, l.debit, l.credit]),
    ['', '', '', 'Total', t.debit, t.credit],
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Journal Entry');
  return wb;
}
const fileName = (je) => `JE_${je.date}_${je.comment.replace(/[^A-Za-z0-9]+/g, '_').slice(0, 60)}.xlsx`;
function download(je) {
  const bytes = XLSX.write(workbookFor(je), { type: 'array', bookType: 'xlsx' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
  a.download = fileName(je);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---- Events (merged into ACT and IN in main.js) ----
export const JEM_ACT = {
  jemTab: (t) => {
    jem().tab = t.dataset.tab;
    jem().msg = '';
    viewJEM();
  },
  jemAll: (t) => {
    jem().amounts[chargeKey(t.dataset.code, t.dataset.date)] = String(r2(num(t.dataset.left)));
    const el = document.querySelector(
      `input[data-in="jemAmt"][data-code="${t.dataset.code}"][data-date="${t.dataset.date}"]`,
    );
    if (el) el.value = jem().amounts[chargeKey(t.dataset.code, t.dataset.date)];
  },
  jemMake: () => {
    const j = jem();
    const groups = matchingCharges(D.fa, j.filter, reclassedMap(jes()), { maxCodes: 100000 }).groups;
    const remaining = {},
      choices = [];
    for (const g of groups)
      for (const c of g.charges) {
        remaining[chargeKey(g.code, c.date)] = c.remaining;
        const amt = num(j.amounts[chargeKey(g.code, c.date)]);
        if (amt > 0)
          choices.push({ code: g.code, date: c.date, amount: amt, change: j.changes[g.code] || {} });
      }
    j.made = buildReclassJEs(choices, { profile: profile(), desc: descOf, remaining });
    if (!choices.length) j.made.errors.push('Type an amount to move on at least one charge.');
    const el = $('#jemout');
    if (el) el.innerHTML = madeHTML();
  },
  jemSave: (t) => {
    const je = pick(t.dataset.scope, t);
    if (!je || checkJE(je).some((c) => c.level === 'stop')) return;
    const j = jem();
    const src =
      t.dataset.scope === 'bar'
        ? { kind: 'bar', je, docId: j.bar.rep.docId }
        : {
            kind: 'reclass',
            je,
            vendor: filterText(j.filter),
            moves: je.moves || [],
          };
    const r = saveJE(jes(), src);
    j.msg = r.error || 'Saved.';
    if (!r.error) {
      S().jes = r.list;
      saveStore();
    }
    viewJEM();
  },
  jemCopy: async (t) => {
    const je = pick(t.dataset.scope, t);
    if (!je) return;
    try {
      await navigator.clipboard.writeText(lineText(je));
      t.textContent = 'Copied';
    } catch {
      t.textContent = 'Copy failed';
    }
  },
  jemXlsx: (t) => {
    const je = pick(t.dataset.scope, t);
    if (je) download(je);
  },
  jemStatus: (t) => {
    const id = t.dataset.id,
      q = (k) => document.querySelector(`[data-st="${k}"][data-id="${id}"]`)?.value || '';
    const e = jes().find((x) => x.id === id);
    if (!e) return;
    const upd = addJEStatus(e, q('status') || 'Prepared', q('date'), '', q('number'));
    S().jes = jes().map((x) => (x.id === id ? upd : x));
    saveStore();
    body();
  },
  jemView: (t) => {
    jem().open = jem().open === t.dataset.id ? null : t.dataset.id;
    body();
  },
  jemDelete: (t) => {
    const r = removeJE(jes(), t.dataset.id);
    if (r.error) jem().msg = r.error;
    else {
      S().jes = r.list;
      saveStore();
    }
    body();
  },
};
async function readRows(file) {
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false });
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
}
export const JEM_IN = {
  jemFilter: (t) => {
    const j = jem();
    j.filter[t.dataset.k] = t.value.trim();
    j.made = null;
    const el = $('#jemcharges');
    if (el) el.innerHTML = chargesHTML();
    const out = $('#jemout');
    if (out) out.innerHTML = '';
  },
  jemChg: (t) => {
    const j = jem();
    (j.changes[t.dataset.code] ??= {})[t.dataset.k] = t.value.trim();
  },
  jemAmt: (t) => {
    jem().amounts[chargeKey(t.dataset.code, t.dataset.date)] = t.value;
  },
  jemChartFile: async (t) => {
    const f = t.files?.[0];
    if (!f) return;
    try {
      const chart = parseChart(await readRows(f), profile(), FY.value);
      const checks = checkChartReport(chart, { profile: profile(), fiscalYear: FY.value });
      if (checks.some((c) => c.level === 'stop')) jem().msg = checks[0].msg;
      else {
        D.chart = { key: chartKey(), ...chart };
        await IDB.put(chartKey(), {
          v: 1,
          at: Date.now(),
          chart: { school: chart.school, fiscalYear: chart.fiscalYear, codes: [...chart.codes] },
        });
        jem().msg = '';
      }
    } catch (e) {
      jem().msg = `Could not read that file: ${e.message}`;
    }
    t.value = '';
    chartPanel();
    body();
  },
  jemBarFile: async (t) => {
    const f = t.files?.[0];
    if (!f) return;
    const j = jem();
    try {
      const rep = parseBarReport(await readRows(f), profile());
      const checks = checkBarReport(rep, { profile: profile(), fiscalYear: FY.value });
      j.bar = { rep, checks, date: rep.approvalDate, je: null };
      makeBarJE();
      j.msg = '';
    } catch (e) {
      j.msg = `Could not read that file: ${e.message}`;
      j.bar = null;
    }
    t.value = '';
    body();
  },
  jemBarDate: (t) => {
    const b = jem().bar;
    if (!b) return;
    b.date = t.value;
    makeBarJE();
    const el = $('#jembar');
    if (el && b.je) el.innerHTML = entryBlock(b.je, 0, 'bar');
  },
};
