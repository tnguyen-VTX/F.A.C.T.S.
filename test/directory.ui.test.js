// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest';

const click = (el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
const $ = (s) => document.querySelector(s);
const flush = (ms = 200) => new Promise((r) => setTimeout(r, ms));

describe('PED directory search on the Schools screen', () => {
  beforeAll(async () => {
    localStorage.clear();
    document.body.innerHTML = '<div id="app"></div>';
    window.scrollTo = () => {};
    await import('../src/main.js');
    await flush(100);
    click($('.nav button[data-v="schools"]'));
    click($('button[data-act="scNew"]'));
  });
  it('finds a school and fills the district code and location ID', async () => {
    const q = $('input[data-in="scDirQ"]');
    q.value = 'cesar chavez community';
    q.dispatchEvent(new Event('input', { bubbles: true }));
    await flush(400);
    expect($('#scdir').textContent).toContain('512');
    click($('#scdir button[data-act="scDirPick"]'));
    expect($('input[data-k="districtCode"]').value).toBe('512');
    expect($('input[data-in="scLocIds"]').value).toBe('001');
    expect($('input[data-k="name"]').value).not.toBe('');
  });
  it('says so when nothing matches', async () => {
    const q = $('input[data-in="scDirQ"]');
    q.value = 'zzzzqqq';
    q.dispatchEvent(new Event('input', { bubbles: true }));
    await flush(300);
    expect($('#scdir').textContent).toContain('No match');
  });
});
