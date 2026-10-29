// @vitest-environment jsdom
// The BAR Builder-only build: five screens, no FACTS header band.
import { describe, it, expect, beforeAll, vi } from 'vitest';

const $ = (s) => document.querySelector(s);
describe('BAR Builder-only mode', () => {
  beforeAll(async () => {
    vi.stubEnv('MODE', 'bar-builder');
    localStorage.clear();
    document.body.innerHTML = '<div id="app"></div>';
    window.scrollTo = () => {};
    await import('../src/main.js');
    await new Promise((r) => setTimeout(r, 100));
  });
  it('shows no FACTS header band or logo, and names the page BAR Builder', () => {
    expect($('.brand .band')).toBeNull();
    expect($('.brand img')).toBeNull();
    expect($('.brand .word').textContent).toBe('BAR Builder');
    expect(document.title).toBe('BAR Builder');
  });
  it('offers only the screens the BAR Builder needs', () => {
    const v = [...document.querySelectorAll('.nav button')].map((b) => b.dataset.v);
    expect(v).toEqual(['import', 'bars', 'schools', 'help', 'about']);
  });
  it('hides the version 0.1 workbook import', () => {
    expect($('#drop')).toBeNull();
  });
});
