// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';

const $ = (s) => document.querySelector(s);
describe('Vertex branding', () => {
  beforeAll(async () => {
    localStorage.clear();
    document.body.innerHTML = '<div id="app"></div>';
    window.scrollTo = () => {};
    await import('../src/main.js');
    await new Promise((r) => setTimeout(r, 100));
  });
  it('shows the reversed wordmark with alt text and its true aspect ratio', () => {
    const img = $('.brand .band img.logo');
    expect(img.getAttribute('alt')).toBe('Vertex Education');
    expect(img.getAttribute('src')).toMatch(/^\.\/brand\//);
    const ratio = img.getAttribute('width') / img.getAttribute('height');
    expect(ratio).toBeCloseTo(3000 / 650, 1);
  });
  it('ships the brand files and favicon links', () => {
    for (const f of ['vertex-horizontal-white.png', 'favicon-32.png', 'apple-touch-icon.png'])
      expect(fs.existsSync(`public/brand/${f}`)).toBe(true);
    const html = fs.readFileSync('index.html', 'utf8');
    expect(html).toContain('rel="icon"');
    expect(html).toContain('apple-touch-icon');
  });
});
