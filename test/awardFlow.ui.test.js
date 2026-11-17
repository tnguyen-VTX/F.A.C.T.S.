// @vitest-environment jsdom
// The whole path with a school whose profile is not Gilbert: memo text -> form -> build -> Suggest wording -> narrative.
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { newProfile } from '../src/lib/profile.js';

const $ = (s) => document.querySelector(s);
const type = (sel, v) => {
  const el = $(sel);
  el.value = v;
  el.dispatchEvent(new Event('input', { bubbles: true }));
};
const MEMO = [
  'EXHIBIT A (27528 - Planning Award - FY26-27)',
  'Award Name: Community Schools',
  '(Revenue Code 43202)',
  '68475004 Rio Gallinas School for Ecology and the Arts $ 80,000',
  'GRAND TOTAL $ 4,883,225',
].join('\n');

describe('award memo to wording, for a school that is not Gilbert', () => {
  beforeAll(async () => {
    vi.stubEnv('MODE', 'bar-single');
    localStorage.clear();
    const p = newProfile({
      id: 'rio',
      name: 'Rio Gallinas School for Ecology and the Arts',
      entityName: 'Rio Gallinas School',
      districtCode: '068',
      locationIds: ['004'],
      funds: [],
    });
    localStorage.setItem('barbuilder.profiles.v1', JSON.stringify({ active: 'rio', profiles: { rio: p } }));
    document.body.innerHTML = '<div id="app"></div>';
    window.scrollTo = () => {};
    await import('../src/main.js');
    await new Promise((r) => setTimeout(r, 100));
  });
  it('builds a draft with the revenue line and suggests wording and a narrative', async () => {
    $('.nav button[data-v="bars"]').click();
    type('textarea[data-in="awardPaste"]', MEMO);
    $('[data-act="awardRead"]').click();
    expect($('input[data-in="awardRev"][data-f="obj"]').value).toBe('43202');
    expect($('input[data-in="awardRev"][data-f="amount"]').value).toBe('80000');
    type('input[data-in="awardRow"][data-f="func"]', '1000');
    type('input[data-in="awardRow"][data-f="obj"]', '56118');
    type('input[data-in="awardRow"][data-f="amount"]', '80000');
    $('[data-act="awardBuild"]').click();
    await new Promise((r) => setTimeout(r, 30));
    expect($('#bbdraft').textContent).toContain('43202');
    $('[data-act="bbSuggest"]').click();
    expect($('textarea[data-k="justification"]').value).toMatch(/^Initial budget of \$80000 in fund 27528/);
    $('[data-act="bbNarrFill"]').click();
    expect($('textarea[data-k="narrative"]').value).toMatch(/requesting an initial budget of \$80,000/);
  });
});
