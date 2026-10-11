// @vitest-environment jsdom
// The Journal Entry Maker screen, driven with a made-up Account Summary and Fund Audit.
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
const A = '31400-4000-53414-0000-001707-0000';
const SEG = {
  fund: '31400',
  func: '4000',
  obj: '53414',
  prog: '0000',
  loc: '001707',
  job: '0000',
  detail: '',
};
const xlsx = () => {
  const rows = [
    ['Gilbert L. Sena Charter High School'],
    ['Account Summary Report'],
    [PARAMS],
    H,
    [A, 'Other Charges', 100, 1000, 100, 0, 900],
    ['Subtotal of Element: [Function] 4000 - Capital Outlay', '', 100, 1000, 100, 0, 900],
    ['Subtotal of Element: [Fund] 31400 - Special Capital', '', 100, 1000, 100, 0, 900],
    ['Subtotal of Element: Grand Total', '', 100, 1000, 100, 0, 900],
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Account Summary Report');
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
};

let st;
describe('Journal Entry Maker screen', () => {
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
    st.D.fa = [
      { ...SEG, code: A, name: 'Vendor One', date: '2026-09-15', actual: 2332, acctDesc: 'Other Charges' },
      { ...SEG, code: A, name: 'Vendor One', date: '2026-08-20', actual: 375, acctDesc: 'Other Charges' },
    ];
    click($('.nav button[data-v="jem"]'));
  });
  it('shows the screen with its three tabs', () => {
    expect($('#main h1').textContent).toBe('Journal Entry Maker');
    expect([...document.querySelectorAll('[data-act="jemTab"]')].length).toBe(3);
  });
  it('offers a name / vendor dropdown with totals and says expenditures, not charges', () => {
    const sel = $('select[data-in="jemFilter"][data-k="name"]');
    expect(sel.textContent).toContain('Vendor One (2,707.00)');
    expect($('#main').textContent.toLowerCase()).not.toContain('charge');
    input(sel, 'Vendor One');
    expect($('#jemcharges').textContent).toContain(A);
    input(sel, '');
  });
  it('makes one entry per month for a reclass between funds, balanced', () => {
    input($('input[data-in="jemFilter"][data-k="fund"]'), '31400');
    input($('input[data-in="jemFilter"][data-k="text"]'), 'vendor one');
    input($('input[data-in="jemChg"][data-k="fund"]'), '11000');
    input($('input[data-in="jemChg"][data-k="func"]'), '2600');
    const amts = [...document.querySelectorAll('input[data-in="jemAmt"]')];
    expect(amts).toHaveLength(2);
    click($('button[data-act="jemAll"]'));
    input(amts[1], '2332');
    click($('button[data-act="jemMake"]'));
    const text = $('#jemout').textContent;
    expect(text).toContain('To reclass expenditures from 31400 to 11000');
    expect(text).toContain('11000-2600-53414-0000-001707-0000');
    expect(text).toContain('31400-0000-11011-0000-000000-0000');
    expect(document.querySelectorAll('#jemout .panel')).toHaveLength(2);
  });
  it('saves an entry, keeps what was reclassed and moves it through statuses', () => {
    click($('button[data-act="jemSave"]'));
    expect(st.S().jes).toHaveLength(1);
    expect(st.S().jes[0].moves[0].amount).toBe(375);
    click($('[data-act="jemTab"][data-tab="saved"]'));
    expect($('#jembody').textContent).toContain('Prepared');
    const id = st.S().jes[0].id;
    $(`select[data-st="status"][data-id="${id}"]`).value = 'Posted';
    $(`input[data-st="number"][data-id="${id}"]`).value = '00047858';
    click($('button[data-act="jemStatus"]'));
    expect(st.S().jes[0].status).toBe('Posted');
    expect(st.S().jes[0].number).toBe('00047858');
    click($('[data-act="jemTab"][data-tab="reclass"]'));
    input($('input[data-in="jemFilter"][data-k="obj"]'), '534');
    expect($('#jembody').textContent).toContain('0.00'); // 375 fully reclassed: nothing left on 8/20
  });
  it('makes the Budget entry from an approved BAR Excel report, dated with the last signature', async () => {
    const W = 45;
    const row = (cells) => {
      const r = Array(W).fill('');
      for (const [i, v] of Object.entries(cells)) r[i] = v;
      return r;
    };
    const ln = (func, obj, adj) =>
      row({
        1: '31400 Special',
        3: `${func} X`,
        8: `${obj} Obj`,
        14: '0000 No',
        21: '001707 Gilbert',
        23: '0000 None',
        27: '$100.00',
        35: adj,
      });
    const rows = [
      row({ 34: 'Doc. ID:', 37: '001-707-2627-0009-T' }),
      row({ 14: 'Fiscal Year:', 20: '2026-2027', 28: 'Entity Name:', 35: 'Gilbert L Sena Charter Hs' }),
      row({
        1: 'Fund',
        3: 'Function',
        8: 'Object',
        14: 'Program',
        21: 'Location',
        23: 'Job Class',
        27: 'Present Budget',
        35: 'Adj Amt Exp',
      }),
      ln('4000', '53414', '$(50.00)'),
      ln('4000', '56119', '$50.00'),
      row({ 33: 'DOC. TOTAL', 35: '$0.00' }),
      row({ 1: 'Approvals by Digital Signature' }),
      row({ 1: 'Name', 8: 'Role', 20: 'Date' }),
      row({ 1: 'Pat', 8: 'Fiscal Director', 20: 46302.55 }),
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'S');
    const bytes = new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
    click($('[data-act="jemTab"][data-tab="bar"]'));
    const f = new File([bytes], 'bar.xlsx');
    f.arrayBuffer = async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const el = $('input[data-in="jemBarFile"]');
    Object.defineProperty(el, 'files', { value: [f], configurable: true });
    el.dispatchEvent(new Event('input', { bubbles: true }));
    await flush();
    const t = $('#jembody').textContent;
    expect(t).toContain('BAR 001-707-2627-0009-T Fund 31400 Transfer');
    expect(t).toContain('31400-4000-53414-0000-001707-0000');
    expect($('input[data-in="jemBarDate"]').value).toBe('2026-10-07');
    click($('button[data-act="jemSave"]'));
    expect(st.S().jes.some((e) => e.kind === 'bar' && e.docId === '001-707-2627-0009-T')).toBe(true);
  });
  it('loads a PED listing and checks the codes against it, leaving bank lines out', async () => {
    const H2 =
      'ChartOfAccountsName,AccountType,FundCode,FundName,FunctionCode,FunctionName,ObjectCode,ObjectName,ProgramCode,ProgramName,JobClassCode,JobClassName';
    const csv = [
      H2,
      'PED Uniform 2026-2027,Expenditure,31400,Special,4000,Capital,56119,Supplies,0000,No Program,0000,No Job',
    ].join('\n');
    const f = new File([csv], 'listing.csv');
    f.stream = () =>
      new ReadableStream({
        start(c) {
          c.enqueue(new TextEncoder().encode(csv));
          c.close();
        },
      });
    click($('[data-act="jemTab"][data-tab="reclass"]'));
    const el = $('input[data-in="jemPedFile"]');
    Object.defineProperty(el, 'files', { value: [f], configurable: true });
    el.dispatchEvent(new Event('input', { bubbles: true }));
    await flush(300);
    expect($('#jemchart').textContent).toContain('PED listing loaded');
    expect($('#jemchart').textContent).toContain('31400');
    input($('input[data-in="jemFilter"][data-k="fund"]'), '31400');
    input($('input[data-in="jemFilter"][data-k="text"]'), 'vendor one');
    input($('input[data-in="jemChg"][data-k="fund"]'), '31400');
    input($('input[data-in="jemChg"][data-k="func"]'), '4000');
    input($('input[data-in="jemChg"][data-k="obj"]'), '56119');
    click($('button[data-act="jemAll"]'));
    click($('button[data-act="jemMake"]'));
    expect($('#jemout').textContent).toContain('PED does not allow');
  });
});
