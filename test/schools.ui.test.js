// @vitest-environment jsdom
// Schools screen and school separation, using a tiny made-up workbook (no real data).
import { describe, it, expect, beforeAll } from 'vitest';
import * as XLSX from 'xlsx';

const click = (el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
const input = (el, v) => {
  if (v !== undefined) el.value = v;
  el.dispatchEvent(new Event('input', { bubbles: true }));
};
const $ = (s) => document.querySelector(s);
const flush = () => new Promise((r) => setTimeout(r, 120));

const rows = [
  ['Test School'],
  ['Cycle: FY2027; Created On: 10/1/2026'],
  ['Account Code', 'Description', '', 'Budget', 'Actual', 'Encumbrance', 'Available'],
  ['11000-1000-51100-1010-001707-1411', 'A line', '', 1000, 200, 100, 700],
  ['Subtotal of Element: [Fund] 11000 - Operational', '', '', 1000, 200, 100, 700],
  ['Grand Total', '', '', 1000, 200, 100, 700],
];
const workbook = () => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Account Summary Report');
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
};

let st, main;
describe('schools', () => {
  beforeAll(async () => {
    // v0.1 saved data, keyed by fiscal year alone.
    localStorage.setItem(
      'facts.v1',
      JSON.stringify({ FY2027: { je: [{ id: 'old', note: 'legacy' }], bar: {} } }),
    );
    document.body.innerHTML = '<div id="app"></div>';
    window.scrollTo = () => {};
    window.alert = () => {};
    st = await import('../src/state.js');
    main = await import('../src/main.js');
    await flush();
  });

  it('starts on the import screen with a school picker', () => {
    expect($('select[data-in="school"]').value).toBe('gilbert-l-sena');
    expect($('#drop')).not.toBeNull();
  });
  it('keeps v0.1 saved entries with Gilbert', () => {
    st.loadBuffer(workbook(), 't.xlsx');
    expect(st.D.loaded).toBe(true);
    expect(st.S().je.map((e) => e.note)).toEqual(['legacy']);
    expect(st.STORE['FY2027']).toBeUndefined();
  });
  it('adds a 7-segment school from the Schools screen', async () => {
    st.UI.view = 'schools';
    main.render();
    click($('button[data-act="scNew"]'));
    input($('input[data-in="sc"][data-k="name"]'), 'Test Seven School');
    input($('input[data-in="sc"][data-k="districtCode"]'), '512');
    input($('input[data-in="scSeg"][data-k="tail"]'), '5');
    input($('textarea[data-in="scFunds"]'), '11000, Operational\n24101, Title I, F');
    expect($('#scerr').textContent).toContain('Looks good');
    click($('button[data-act="scSave"]'));
    await flush();
    expect(st.PF.profiles['test-seven-school'].segments).toHaveLength(7);
    expect(st.PF.profiles['test-seven-school'].funds[1].flowthrough).toBe(true);
    expect($('#main').textContent).toContain('Test Seven School');
  });
  it('refuses to save a school with a problem', () => {
    click($('button[data-act="scNew"]'));
    click($('button[data-act="scSave"]'));
    expect($('#scerr').textContent).toContain('Give the school a name');
    click($('button[data-act="scCancel"]'));
  });
  it("switching schools hides the other school's workbook and entries", async () => {
    click($('button[data-act="scUse"][data-id="test-seven-school"]'));
    await flush();
    expect(st.PF.active).toBe('test-seven-school');
    expect(st.D.loaded).toBe(false);
    st.loadBuffer(workbook(), 't.xlsx'); // the 6-segment sample has no 7-segment lines here
    expect(st.D.asr.funds.get('11000')?.lines ?? []).toHaveLength(0);
    expect(st.S().je).toEqual([]);
    st.S().je.push({ id: 'x', note: 'seven only' });
    st.saveStore();
    click($('select[data-in="school"]'));
    input($('select[data-in="school"]'), 'gilbert-l-sena');
    await flush();
    st.loadBuffer(workbook(), 't.xlsx');
    expect(st.S().je.map((e) => e.note)).toEqual(['legacy']);
    expect(st.D.asr.funds.get('11000').lines).toHaveLength(1);
  });
  it('cannot delete the last school, and can delete another', async () => {
    window.confirm = () => true;
    st.UI.view = 'schools';
    st.switchSchool('gilbert-l-sena');
    main.render();
    click($('button[data-act="scDelete"][data-id="test-seven-school"]'));
    await flush();
    expect(st.PF.profiles['test-seven-school']).toBeUndefined();
    click($('button[data-act="scDelete"][data-id="gilbert-l-sena"]'));
    await flush();
    expect(st.PF.profiles['gilbert-l-sena']).toBeDefined();
  });
});
