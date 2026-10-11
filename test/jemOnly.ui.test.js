// @vitest-environment jsdom
// The Journal Entry Maker-only build: its own page title and header word, no FACTS band.
import { describe, it, expect, beforeAll, vi } from 'vitest';

const $ = (s) => document.querySelector(s);
describe('Journal Entry Maker-only mode', () => {
  beforeAll(async () => {
    vi.stubEnv('MODE', 'jem');
    localStorage.clear();
    document.body.innerHTML = '<div id="app"></div>';
    window.scrollTo = () => {};
    await import('../src/main.js');
    await new Promise((r) => setTimeout(r, 100));
  });
  it('names the page Journal Entry Maker and shows no FACTS band', () => {
    expect($('.brand .band')).toBeNull();
    expect($('.brand .word').textContent).toBe('Journal Entry Maker');
    expect(document.title).toBe('Journal Entry Maker');
  });
  it('offers the screens it needs before reports are loaded', () => {
    expect([...document.querySelectorAll('.nav button')].map((b) => b.dataset.v)).toEqual([
      'import',
      'schools',
      'help',
      'about',
    ]);
  });
  it('hides the version 0.1 workbook import', () => {
    expect($('#drop')).toBeNull();
  });
});
