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
    document.querySelector('[data-act="awardBuild"]').click();
    await new Promise((r) => setTimeout(r, 50));
    const text = document.querySelector('#bbdraft').textContent;
    expect(text).toContain('44000');
    expect(text).toContain('51100');
    expect(document.querySelector('#bbdraft').innerHTML).toContain('53414');
  });
});
