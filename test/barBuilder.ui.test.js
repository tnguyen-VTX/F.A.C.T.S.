// @vitest-environment jsdom
// The BAR Builder screen, driven with a made-up Account Summary.
import { describe, it, expect, beforeAll } from 'vitest';
import * as XLSX from 'xlsx';

const click = (el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
const input = (el, v) => {
  if (v !== undefined) el.value = v;
  el.dispatchEvent(new Event('input', { bubbles: true }));
};
const $ = (s) => document.querySelector(s);
const flush = (ms = 150) => new Promise((r) => setTimeout(r, ms));

const PARAMS =
  'Cycle: FY26-27; Begin Date: 07/01/2026; End Date: 06/30/2027; Account Expression: [All]; Created On: 10/9/2026 12:51:18 PM';
const H = [
  'Account Code',
  'Description',
  'Actual (Date Range)',
  'Budget (YTD)',
  'Actual (YTD)',
  'Encumbrance (YTD)',
  'Available (YTD)',
];
const line = (fn, obj, b, a) => [`11000-${fn}-${obj}-1010-512001-1411`, 'Line', a, b, a, 0, b - a];
const sub = (label, b, a) => [`Subtotal of Element: ${label}`, '', a, b, a, 0, b - a];
const xlsx = () => {
  const rows = [
    ['Gilbert L. Sena Charter High School'],
    ['Account Summary Report'],
    [PARAMS],
    H,
    line('1000', '51100', 1000, 1300),
    sub('[Function] 1000 - Instruction', 1000, 1300),
    line('2600', '51100', 5000, 1000),
    sub('[Function] 2600 - Operations', 5000, 1000),
    sub('[Fund] 11000 - Operational', 6000, 2300),
    sub('Grand Total', 6000, 2300),
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Account Summary Report');
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
};

let st;
describe('BAR Builder screen', () => {
  beforeAll(async () => {
    localStorage.clear();
    document.body.innerHTML = '<div id="app"></div>';
    window.scrollTo = () => {};
    st = await import('../src/state.js');
    await import('../src/main.js');
    await flush();
    const bytes = xlsx();
    const f = new File([bytes], 'a.xlsx');
    f.arrayBuffer = async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const el = $('input[data-kind="asr"]');
    Object.defineProperty(el, 'files', { value: [f], configurable: true });
    el.dispatchEvent(new Event('input', { bubbles: true }));
    await flush();
    if ($('button[data-act="impAccept"][data-kind="asr"]'))
      click($('button[data-act="impAccept"][data-kind="asr"]'));
    click($('.nav button[data-v="bars"]'));
  });

  it('lists the over-budget function', () => {
    expect($('#main h1').textContent).toBe('BAR Builder');
    expect($('#bbdef').textContent).toContain('1000');
    expect($('button[data-act="bbBuild"]')).not.toBeNull();
  });
  it('builds a balanced transfer and keeps it as a draft', () => {
    click($('button[data-act="bbBuild"]'));
    const d = st.UI.bb.draft;
    expect(d.type).toBe('T');
    expect(d.lines.reduce((s, l) => s + l.amount, 0)).toBe(0);
    expect(d.lines.some((l) => l.amount > 0)).toBe(true);
    expect(st.S().bbDraft.lines.length).toBe(d.lines.length);
    expect($('#bbdraft').textContent).toContain('11000');
  });
  it('blocks the download until the justification is filled, then allows it', () => {
    const dl = () => $('button[data-act="bbDownload"]');
    expect(dl()?.disabled ?? true).toBe(true);
    click($('button[data-act="bbSuggest"]'));
    expect(st.UI.bb.draft.justification.length).toBeGreaterThan(0);
    expect(st.UI.bb.draft.justification).not.toMatch(/[",|]/);
  });
  it('rejects an added line that does not fit the code layout', () => {
    input($('[data-in="bbAddCode"]'), '123');
    input($('[data-in="bbAddAmt"]'), '5');
    click($('button[data-act="bbAddLine"]'));
    expect(st.UI.bb.note).toContain('does not match');
  });
  it('saves the BAR and lists it with a log', () => {
    click($('button[data-act="bbSave"]'));
    expect(st.S().bars).toHaveLength(1);
    expect($('#bbsaved').textContent).toContain('Built');
    expect(st.UI.bb.draft.savedId).toBe(st.S().bars[0].id);
    click($('button[data-act="bbSave"]'));
    expect(st.S().bars).toHaveLength(1);
  });
  it('adds a status and then freezes the lines', () => {
    const id = st.S().bars[0].id;
    const sel = $(`select[data-st="status"][data-id="${id}"]`);
    sel.value = 'Uploaded';
    $(`input[data-st="note"][data-id="${id}"]`).value = 'OBMS upload';
    click($('button[data-act="bbAddStatus"]'));
    expect(st.S().bars[0].status).toBe('Uploaded');
    expect($('#bbsaved').textContent).toContain('OBMS upload');
    click($('button[data-act="bbSave"]'));
    expect(st.UI.bb.note).toContain('frozen');
  });
  it('reopens a saved BAR', () => {
    st.UI.bb.draft = null;
    click($('button[data-act="bbOpen"]'));
    expect(st.UI.bb.draft.lines.length).toBeGreaterThan(0);
  });
  it('backs up only BARs, drafts and settings', async () => {
    const { backupFile } = await import('../src/views/barBuilder.js');
    const f = backupFile();
    expect(f.name).toMatch(/^facts-backup-\d{4}-\d\d-\d\d\.json$/);
    const data = JSON.parse(f.text);
    expect(data.app).toBe('FACTS');
    expect(JSON.stringify(data)).not.toContain('"je"');
    st.__backup = f.text;
  });
  it('shows a conflict on restore and keeps both when asked', async () => {
    const { bbRestoreRead, bbRestoreApply } = await import('../src/views/barBuilder.js');
    st.S().bars[0].updatedAt += 5000;
    bbRestoreRead(st.__backup);
    expect($('#bbbackup').textContent).toContain('1 differ');
    $('input[type="radio"][value="both"]').checked = true;
    bbRestoreApply();
    expect(st.S().bars).toHaveLength(2);
    bbRestoreRead('not json');
    expect($('#bbbackup').textContent).toContain('not a FACTS backup');
  });
  it('switching schools clears the working BAR', () => {
    st.switchSchool(st.PF.active);
    expect(st.UI.bb).toBeNull();
  });
});
