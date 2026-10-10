// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest';

const $ = (s) => document.querySelector(s);
describe('Help screen', () => {
  beforeAll(async () => {
    localStorage.clear();
    document.body.innerHTML = '<div id="app"></div>';
    window.scrollTo = () => {};
    await import('../src/main.js');
    await new Promise((r) => setTimeout(r, 100));
    $('.nav button[data-v="help"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  it('opens before any report is loaded with all seven steps', () => {
    expect($('#main h1').textContent).toContain('How to use');
    expect([...document.querySelectorAll('#main h2')].map((h) => h.textContent[0])).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
    ]);
  });
  it('links only to screens that exist', () => {
    const known = new Set([...document.querySelectorAll('.nav button')].map((b) => b.dataset.v));
    const links = [...document.querySelectorAll('#main [data-act="nav"]')].map((b) => b.dataset.v);
    expect(links.length).toBeGreaterThan(0);
    // Screens that need a loaded report are not in the menu yet; the menu holds the rest.
    for (const v of links) expect(['bars', ...known]).toContain(v);
  });
  it('gives a contact for OBMS rejections', () => {
    expect($('#main a[href="mailto:tim.nguyen@vertexeducation.com"]')).not.toBeNull();
  });
});
