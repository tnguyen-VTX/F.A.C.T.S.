// @vitest-environment jsdom
// Smoke test: loads the workbook, then opens every screen and exercises the main controls.
import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';

import { join } from 'node:path';
const FIXTURE = join(process.cwd(), 'fixtures', 'facts.xlsx');
const click = (el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
const input = (el, v) => {
  if (v !== undefined) el.value = v;
  el.dispatchEvent(new Event('input', { bubbles: true }));
};
const $ = (s) => document.querySelector(s);

describe.skipIf(!existsSync(FIXTURE))('screens', () => {
  beforeAll(async () => {
    document.body.innerHTML = '<div id="app"></div>';
    window.scrollTo = () => {};
    const { loadBuffer } = await import('../src/state.js');
    await import('../src/main.js');
    const buf = readFileSync(FIXTURE);
    loadBuffer(new Uint8Array(buf), 'facts.xlsx');
    const { D } = await import('../src/state.js');
    expect(D.loaded).toBe(true);
    (await import('../src/main.js')).render();
  }, 30000);

  const go = (v) => {
    const b = $(`.nav button[data-v="${v}"]`);
    if (b) click(b);
  };

  it('renders every screen without errors', async () => {
    for (const v of ['budget', 'tx', 'je', 'bar', 'rfr', 'cr', 'cap']) {
      go(v);
      expect($('#main h1')).not.toBeNull();
    }
  });
  it('expands a fund and groups transactions', () => {
    go('budget');
    click($('tr[data-k="24190"]'));
    expect(document.querySelectorAll('tr.line').length).toBeGreaterThan(0);
    go('tx');
    input($('select[data-k="fund"]'), '24106');
    expect($('#txres tfoot').textContent).toContain('5,807.56');
  });
  it('builds a BAR and flags a JE line', () => {
    go('bar');
    input($('select[data-in="barFund"]'), '24106');
    input($('input[data-k="obj"]'), '52');
    input($('input[data-k="amount"]'), '1084');
    expect($('#barres tfoot').textContent).toContain('1,084.00');
    go('je');
    click($('button[data-act="jeAdd"]'));
    expect($('#jelist table')).not.toBeNull();
  });
});
