// @vitest-environment jsdom
// The Load reports screen, driven with made-up files.
import { describe, it, expect, beforeAll } from 'vitest';
import * as XLSX from 'xlsx';

const click = (el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
const input = (el, v) => {
  if (v !== undefined) el.value = v;
  el.dispatchEvent(new Event('input', { bubbles: true }));
};
const $ = (s) => document.querySelector(s);
const flush = (ms = 150) => new Promise((r) => setTimeout(r, ms));

const A = '11000-1000-51100-1010-512001-1411-00000';
const PARAMS =
  'Cycle: FY26-27; Begin Date: 07/01/2026; End Date: 06/30/2027; Account Expression: [All]; Created On: 10/9/2026 12:51:18 PM';
const xlsx = (school = 'Test Seven School', params = PARAMS) => {
  const rows = [
    [school],
    ['Account Summary Report'],
    [params],
    [
      'Account Code',
      'Description',
      'Actual (Date Range)',
      'Budget (YTD)',
      'Actual (YTD)',
      'Encumbrance (YTD)',
      'Available (YTD)',
    ],
    [A, 'Line', 5, 100, 5, 20, 75],
    ['Subtotal of Element: [Fund] 11000 - Operational', '', 5, 100, 5, 20, 75],
    ['Grand Total', '', 5, 100, 5, 20, 75],
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Account Summary Report');
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
};
const csv = (actual = 5) =>
  new TextEncoder().encode(
    `Fund,Account Code,Acct. Desc.,Transaction Date,Name,Number,Description,Detail,Check,Budget,Actuals,Encumbrance,Available\r\n11000,${A},x,9/8/2026,,Inv: 1,d,,,100.0000,${actual}.0000,20.0000,75.0000\r\n`,
  );
// jsdom has no Blob.arrayBuffer in every version; give the made-up file one.
const file = (bytes, name) => {
  const f = new File([bytes], name);
  f.arrayBuffer = async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return f;
};
const drop = async (kind, f) => {
  const el = $(`input[data-kind="${kind}"]`);
  Object.defineProperty(el, 'files', { value: [f], configurable: true });
  el.dispatchEvent(new Event('input', { bubbles: true }));
  await flush();
};

let st;
describe('Load reports screen', () => {
  beforeAll(async () => {
    localStorage.clear();
    document.body.innerHTML = '<div id="app"></div>';
    window.scrollTo = () => {};
    st = await import('../src/state.js');
    await import('../src/main.js');
    await flush();
    // A 7-segment school, like the real one.
    const { newProfile } = await import('../src/lib/profile.js');
    const { saveProfile } = await import('../src/lib/profileStore.js');
    const seg = (key, len) => ({ key, len });
    saveProfile(
      st.storage,
      st.PF,
      newProfile({
        id: 'seven',
        name: 'Test Seven School',
        segments: [
          seg('fund', 5),
          seg('func', 4),
          seg('obj', 5),
          seg('prog', 4),
          seg('loc', 6),
          seg('job', 4),
          seg('tail', 5),
        ],
      }),
    );
    click($('.nav button[data-v="schools"]'));
    click($('button[data-act="scUse"][data-id="seven"]'));
    await flush();
    click($('.nav button[data-v="import"]'));
  });

  it('opens on the Load reports screen when nothing is loaded', () => {
    expect($('#main h1').textContent).toBe('Load reports');
    expect($('input[data-kind="asr"]')).not.toBeNull();
    expect($('.nav button[data-v="budget"]')).toBeNull();
  });
  it('rejects a report for another school and loads nothing', async () => {
    await drop('asr', file(xlsx('Another School'), 'a.xlsx'));
    expect($('.slotbody').textContent).toContain('was not loaded');
    expect($('.slotbody').textContent).toContain('Names as reports print them');
    expect(st.D.loaded).toBe(false);
  });
  it('holds a report with warnings until it is confirmed', async () => {
    await drop('asr', file(xlsx('Test Seven School', PARAMS.replace('06/30/2027', '09/30/2026')), 'a.xlsx'));
    expect($('.slotbody').textContent).toContain('not the full fiscal year');
    expect(st.D.loaded).toBe(false);
    click($('button[data-act="impAccept"][data-kind="asr"]'));
    expect(st.D.loaded).toBe(true);
    expect($('.nav button[data-v="budget"]')).not.toBeNull();
    click($('.nav button[data-v="import"]'));
  });
  it('loads a clean report at once and ties the Fund Audit to it', async () => {
    await drop('asr', file(xlsx(), 'a.xlsx'));
    expect($('.slot:nth-child(1) .loaded').textContent).toContain('a.xlsx');
    await drop('fa', file(csv(), 'f.csv'));
    expect($('#main').textContent).toContain('ties to the Account Summary');
    expect(st.D.fa).toHaveLength(1);
    expect(st.S().je).toEqual([]);
  });
  it('warns when the Fund Audit does not tie, naming the fund', async () => {
    await drop('fa', file(csv(9), 'f2.csv'));
    expect($('.slot:nth-child(2) .slotbody').textContent).toContain('does not match the Account Summary');
    expect($('.slot:nth-child(2) .slotbody').textContent).toContain('11000 (actual)');
    click($('button[data-act="impAccept"][data-kind="fa"]'));
    expect(st.D.fa[0].actual).toBe(9);
  });
  it('switching schools shows none of the other school’s reports', async () => {
    click($('.nav button[data-v="schools"]'));
    click($('button[data-act="scUse"][data-id="gilbert-l-sena"]'));
    await flush();
    expect(st.D.loaded).toBe(false);
    expect(st.D.asr).toBeNull();
    expect(st.D.fa).toBeNull();
    expect(st.REP.asr).toBeNull();
    expect($('#main h1').textContent).toBe('Schools');
  });
});
