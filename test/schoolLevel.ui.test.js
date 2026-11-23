// @vitest-environment jsdom
// The School-level spending (PED 3.4) screen, driven with a made-up Fund Audit for Gilbert (location 001707).
import { describe, it, expect, beforeAll } from 'vitest';

const click = (el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
const input = (el, v) => {
  if (v !== undefined) el.value = v;
  el.dispatchEvent(new Event('input', { bubbles: true }));
};
const $ = (s) => document.querySelector(s);
const flush = (ms = 100) => new Promise((r) => setTimeout(r, ms));

const row = (code, date, actual) => `11000,${code},x,${date},,Inv: 1,d,,,0,${actual},0,0`;
const CSV = [
  'Fund,Account Code,Acct. Desc.,Transaction Date,Name,Number,Description,Detail,Check,Budget,Actuals,Encumbrance,Available',
  row('11000-1000-51100-0000-001707-1411', '8/15/2026', 700),
  row('11000-1000-51100-2000-001707-1411', '8/15/2026', 200),
  row('11000-2300-55915-0000-001000-0000', '9/15/2026', 100),
  row('11000-1000-51100-0000-001707-1411', '10/15/2026', 5000), // Q2
].join('\r\n');

let st;
describe('School-level spending screen', () => {
  beforeAll(async () => {
    localStorage.clear();
    document.body.innerHTML = '<div id="app"></div>';
    window.scrollTo = () => {};
    st = await import('../src/state.js');
    const main = await import('../src/main.js');
    await flush();
    const { readFundAudit } = await import('../src/lib/importReport.js');
    st.setFiscalYear(2027);
    const r = readFundAudit('f.csv', new TextEncoder().encode(CSV), {
      profile: st.profile(),
      fiscalYear: 2027,
      asr: null,
    });
    st.acceptReport(r);
    main.render();
    click($('.nav button[data-v="sl34"]'));
  });

  it('shows Q1 spending, the program 0000 flag and the site check', () => {
    expect($('#main h1').textContent).toContain('PED 3.4');
    const t = $('#slres').textContent;
    expect(t).toContain('due in OBMS by 11/30/2026');
    expect(t).toContain('80.0% of operational spending ($800) is in program 0000, above the 60% limit');
    expect(t).toContain('coded to location 000, not a school site');
  });

  it('raises the limit, enters the 910B-5 and Special Ed codes, and keeps them', () => {
    input($('input[data-in="sl"][data-k="p0000Max"]'), '85');
    expect($('#slres').textContent).toContain('within the 85% limit');
    input($('input[data-in="slSeg"][data-i="0"][data-k="total"]'), '4000');
    input($('input[data-in="slSeg"][data-i="0"][data-k="sped"]'), '800');
    input($('input[data-in="slProg"][data-k="sped"]'), '2000');
    expect($('#slres').textContent).toContain(
      'Special Education: $200 spent to date, 100.0% of the $200 expected',
    );
    expect(JSON.parse(localStorage.getItem(st.STORE_KEY))['gilbert-l-sena/FY2027'].sl34.p0000Max).toBe(85);
  });

  it('takes 910B-5 rows pasted from a spreadsheet', () => {
    $('#main details textarea').value = '707\t8000\t1600\t0\t400\n708\t2000\t0\t0\t0';
    click($('button[data-act="slPaste"]'));
    expect(document.querySelectorAll('input[data-in="slSeg"][data-k="loc"]')).toHaveLength(2);
    expect($('#slres').textContent).toContain(
      'Site 708 has a SEG share of $2,000 but no spending coded to it',
    );
  });
});
