// @vitest-environment jsdom
// Start an Initial Budget BAR from an award letter, with no Account Summary loaded.
import { describe, it, expect, beforeAll, vi } from 'vitest';

const $ = (s) => document.querySelector(s);
const type = (sel, v) => {
  const el = $(sel);
  el.value = v;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
};
const LETTER = [
  'Grant Name: Title I Part A',
  'Fund: 24101',
  'Total Award: $2,350.00',
  '1000 51100 Salaries 800.00',
  '2100 52311 Benefits 900.00',
  '2300 53414 Supplies 650.00',
].join('\n');

describe('award letter panel', () => {
  beforeAll(async () => {
    vi.stubEnv('MODE', 'bar-builder');
    localStorage.clear();
    document.body.innerHTML = '<div id="app"></div>';
    window.scrollTo = () => {};
    await import('../src/main.js');
    await new Promise((r) => setTimeout(r, 100));
    $('.nav button[data-v="schools"]').click();
  });
  it('is reachable before any report is loaded and shows the award panel', () => {
    $('.nav button[data-v="bars"]').click();
    expect(document.body.textContent).toContain('Start from an award letter');
    expect(document.body.textContent).toContain('Over budget');
  });
  it('reads pasted text, suggests values, and builds a balanced IB BAR', async () => {
    const ta = $('textarea[data-in="awardPaste"]');
    expect(ta).not.toBeNull();
    type('textarea[data-in="awardPaste"]', LETTER);
    document.querySelector('[data-act="awardRead"]').click();
    expect(document.body.textContent).toContain('Check what was read');
    expect($('input[data-in="awardRev"][data-f="amount"]').value).toBe('2350');
    expect(document.querySelectorAll('input[data-in="awardRow"][data-f="on"]').length).toBe(3);
    expect($('#awardsum').textContent).toContain('they match');
  });
});

describe('building from the panel', () => {
  it('builds the BAR into the draft and balances', async () => {
    type('input[data-in="awardRev"][data-f="obj"]', '44000');
    type('input[data-k="loc"]', '001707');
    // a salary line (51100) with no FTE: the FTE box is outlined in red and building asks first
    const fteBox = document.querySelector('input[data-in="awardRow"][data-f="fte"]');
    expect(fteBox.classList.contains('bad')).toBe(true);
    let asked = '';
    window.confirm = (m) => ((asked = m), false);
    document.querySelector('[data-act="awardBuild"]').click();
    expect(asked).toContain('no FTE');
    expect(document.querySelector('#bbdraft').textContent).not.toContain('44000'); // declined: nothing built
    fteBox.value = '1';
    fteBox.dispatchEvent(new Event('input', { bubbles: true }));
    expect(fteBox.classList.contains('bad')).toBe(false);
    asked = '';
    document.querySelector('[data-act="awardBuild"]').click();
    expect(asked).toBe(''); // no question once every salary line has an FTE
    await new Promise((r) => setTimeout(r, 50));
    const text = document.querySelector('#bbdraft').textContent;
    expect(text).toContain('44000');
    expect(text).toContain('51100');
    expect(document.querySelector('#bbdraft').innerHTML).toContain('53414');
  });
});

describe('typing a fund that is not on the profile', () => {
  it('lets the Start a BAR fund box take any 5-digit code, and refuses a bad one', async () => {
    document.querySelector('.nav button[data-v="bars"]').click();
    const box = document.querySelector('input[data-in="bbStartFund"]');
    expect(box).not.toBeNull();
    box.value = '2410';
    box.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('[data-act="bbStart"]').click();
    expect(document.querySelector('#bbstartmsg').textContent).toContain('5-digit');
    expect(document.querySelector('#bbstartmsg').hidden).toBe(false);
    window.confirm = () => true; // an earlier test left a draft
    box.value = '24190';
    box.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('[data-act="bbStart"]').click();
    await new Promise((r) => setTimeout(r, 30));
    expect(document.querySelector('#bbstartmsg').textContent).toBe('');
    expect(document.querySelector('#bbstartmsg').hidden).toBe(true);
    expect(document.querySelector('#bbdraft').textContent).toContain('24190');
  });
});

describe('Suggest wording without an Account Summary', () => {
  it('fills the justification from the revenue line, and explains when there is nothing to word', async () => {
    document.querySelector('.nav button[data-v="bars"]').click();
    window.confirm = () => true;
    const box = document.querySelector('input[data-in="bbStartFund"]');
    box.value = '24190';
    box.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('[data-act="bbStart"]').click();
    await new Promise((r) => setTimeout(r, 30));
    document.querySelector('[data-act="bbSuggest"]').click();
    expect(document.querySelector('#bbsuggestmsg').textContent).toContain('revenue line');
    // add a revenue line (a code that fits Gilbert's layout), then ask again
    const code = document.querySelector('input[data-in="bbAddCode"]');
    code.value = '24190-0000-44000-0000-001707-0000';
    code.dispatchEvent(new Event('input', { bubbles: true }));
    const amt = document.querySelector('input[data-in="bbAddAmt"]');
    amt.value = '2350';
    amt.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('[data-act="bbAddLine"]').click();
    document.querySelector('[data-act="bbSuggest"]').click();
    expect(document.querySelector('textarea[data-k="justification"]').value).toMatch(/^Initial budget of \$2350 in /);
  });
});

describe('row icons: duplicate, clear and remove', () => {
  it('each icon says what it does and works on an expenditure line', async () => {
    document.querySelector('.nav button[data-v="bars"]').click();
    const ta = document.querySelector('textarea[data-in="awardPaste"]');
    ta.value = 'Fund: 24101\nTotal Award: $2,350.00\n1000 51100 Salaries 800.00\n2100 52311 Benefits 900.00';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('[data-act="awardRead"]').click();
    const rows = () => document.querySelectorAll('input[data-in="awardRow"][data-f="func"]');
    expect(rows().length).toBe(2);
    const dup = document.querySelector('[data-act="awardDupRow"][data-i="0"]');
    expect(dup.title).toBe('Duplicate this expenditure line');
    expect(document.querySelector('[data-act="awardClearRow"][data-i="0"]').getAttribute('aria-label')).toBe('Clear the fields of this expenditure line');
    expect(document.querySelector('[data-act="awardDelRow"][data-i="0"]').title).toBe('Remove this expenditure line');
    dup.click();
    expect(rows().length).toBe(3);
    expect([...rows()].map((x) => x.value)).toEqual(['1000', '1000', '2100']);
    document.querySelector('[data-act="awardClearRow"][data-i="1"]').click();
    expect([...rows()].map((x) => x.value)).toEqual(['1000', '', '2100']);
    expect(document.querySelectorAll('input[data-f="amount"][data-i="1"]')[0].value).toBe('');
    document.querySelector('[data-act="awardDelRow"][data-i="1"]').click();
    expect(rows().length).toBe(2);
    // revenue rows have them too
    document.querySelector('[data-act="awardDupRev"][data-i="0"]').click();
    expect(document.querySelectorAll('input[data-in="awardRev"][data-f="amount"]').length).toBe(2);
  });
});
