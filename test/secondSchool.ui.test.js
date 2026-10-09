// @vitest-environment jsdom
// A 7-segment school end to end with made-up data: load, build a transfer, make the upload file.
import { describe, it, expect, beforeAll } from 'vitest';
import * as XLSX from 'xlsx';

const click = (el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
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
const line = (fn, obj, b, a) => [`11000-${fn}-${obj}-0000-512001-1411-00000`, 'Line', a, b, a, 0, b - a];
const sub = (label, b, a) => [`Subtotal of Element: ${label}`, '', a, b, a, 0, b - a];
const xlsx = () => {
  const rows = [
    ['Test Seven School'],
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

let st, bbv;
describe('second school (7 segments)', () => {
  beforeAll(async () => {
    localStorage.clear();
    document.body.innerHTML = '<div id="app"></div>';
    window.scrollTo = () => {};
    st = await import('../src/state.js');
    await import('../src/main.js');
    bbv = await import('../src/views/barBuilder.js');
    const { newProfile } = await import('../src/lib/profile.js');
    const { saveProfile } = await import('../src/lib/profileStore.js');
    const seg = (key, len) => ({ key, len });
    saveProfile(
      st.storage,
      st.PF,
      newProfile({
        id: 'seven',
        name: 'Test Seven School',
        districtCode: '512',
        segments: ['fund:5', 'func:4', 'obj:5', 'prog:4', 'loc:6', 'job:4', 'tail:5'].map((x) =>
          seg(x.split(':')[0], +x.split(':')[1]),
        ),
      }),
    );
    click($('.nav button[data-v="schools"]'));
    click($('button[data-act="scUse"][data-id="seven"]'));
    await flush();
    click($('.nav button[data-v="import"]'));
    const bytes = xlsx();
    const f = new File([bytes], 'a.xlsx');
    f.arrayBuffer = async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const el = $('input[data-kind="asr"]');
    Object.defineProperty(el, 'files', { value: [f], configurable: true });
    el.dispatchEvent(new Event('input', { bubbles: true }));
    await flush();
    click($('.nav button[data-v="bars"]'));
  });

  it('builds a transfer and writes a 3-digit location in the upload file', () => {
    click($('button[data-act="bbBuild"]'));
    const d = st.UI.bb.draft;
    d.contact = { first: 'Pat', middle: '', last: 'Example' };
    d.justification = 'Cover a deficit in instruction.';
    const r = bbv.bbFile();
    expect(r.ok).toBe(true);
    const rows = r.csv.split('\r\n').filter(Boolean);
    expect(rows[0].split(',')).toHaveLength(15);
    const ubl = rows[1].split(',');
    expect(ubl).toHaveLength(9);
    expect(ubl[5]).toMatch(/^\d{3}$/);
    expect(ubl[5]).toBe('001');
    expect(rows[0]).toContain('UBH,512,2027,11000,T');
  });
  it('shows nothing from Gilbert', () => {
    expect($('#main').textContent).not.toContain('Gilbert');
    expect(st.S().bars ?? []).toHaveLength(0);
  });
});
