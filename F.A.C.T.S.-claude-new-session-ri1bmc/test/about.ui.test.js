// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest';

const $ = (s) => document.querySelector(s);
describe('About screen', () => {
  beforeAll(async () => {
    localStorage.clear();
    document.body.innerHTML = '<div id="app"></div>';
    window.scrollTo = () => {};
    await import('../src/main.js');
    await new Promise((r) => setTimeout(r, 100));
  });
  it('opens before any report is loaded and says nothing is uploaded', () => {
    $('.nav button[data-v="about"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect($('#main h1').textContent).toContain('About');
    expect($('#main').textContent).toContain('Nothing is uploaded');
  });
  it('says how to report a problem', () => {
    expect($('#main a[href^="mailto:"]').textContent).toContain('@vertexeducation.com');
  });
  it('tells users that other tools on the site share the browser storage', () => {
    expect($('#main').textContent).toContain('share this browser storage');
  });
  it('names the one outside connection', () => {
    expect($('#main').textContent).toContain('optional AI narrative');
  });
});
