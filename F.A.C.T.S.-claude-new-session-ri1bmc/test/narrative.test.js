import { describe, it, expect } from 'vitest';
import { clearKey, getKey, keyWhere, looksLikeKey, saveKey } from '../src/lib/aiKey.js';
import { barLine, newBar } from '../src/lib/bar.js';
import { makeBarFile } from '../src/lib/barCsv.js';
import { draftNarrative, explainError, narrativeInput, narrativeRequest } from '../src/lib/narrative.js';
import { newProfile } from '../src/lib/profile.js';

const P = newProfile({
  id: 'x',
  name: 'Test School',
  districtCode: '1',
  locationRule: { type: 'lastN', n: 3 },
});
const bar = () => {
  const b = newBar('T', '11000');
  b.lines = [
    ['11000-1000-51100-0000-001707-1411', 1500],
    ['11000-2600-56118-0000-001707-0000', -1000],
    ['11000-2100-52100-0000-001707-0000', -500],
  ].map(([c, a]) => barLine(P, c, a));
  b.justification = 'PRIVATE justification words';
  b.contact = { first: 'Pat', middle: '', last: 'Example' };
  return b;
};
const names = { funcNames: { 1000: 'Instruction', 2600: 'Operations' }, fundNames: { 11000: 'Operational' } };

describe('what is sent', () => {
  it('has type, fund, function names and whole-dollar totals only', () => {
    const t = narrativeInput(bar(), names);
    expect(t).toContain('BAR type: Transfer');
    expect(t).toContain('Fund: 11000 Operational');
    expect(t).toContain('- 1000 Instruction: $1,500');
    expect(t).toContain('- 2600 Operations: -$1,000');
    expect(t).toContain('- 2100: -$500');
    expect(t).toContain('Total moved: $1,500');
  });
  it('leaves out names, justification, account codes and FTE', () => {
    const r = narrativeRequest(bar(), names);
    const all = `${r.system} ${r.user}`;
    for (const s of ['Pat', 'Example', 'PRIVATE', '51100', '001707', 'FTE']) expect(all).not.toContain(s);
  });
  it('asks for placeholders instead of invented reasons', () => {
    expect(narrativeRequest(bar(), names).system).toContain('bracketed placeholder');
  });
});

describe('draftNarrative', () => {
  const fake = (res) => ({ beta: { messages: { create: async (p) => ((fake.last = p), res) } } });
  const req = narrativeRequest(bar(), names);
  it('sends the request with fallbacks on and returns the text', async () => {
    const r = await draftNarrative(
      fake({ stop_reason: 'end_turn', content: [{ type: 'thinking' }, { type: 'text', text: ' Hello. ' }] }),
      req,
    );
    expect(r.text).toBe('Hello.');
    expect(fake.last).toMatchObject({
      model: 'claude-opus-5-5',
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low' },
    });
    expect(fake.last.messages[0].content).toBe(req.user);
  });
  it('reports a refusal, empty text and a cut-off', async () => {
    expect((await draftNarrative(fake({ stop_reason: 'refusal', content: [] }), req)).error).toContain(
      'declined',
    );
    expect((await draftNarrative(fake({ stop_reason: 'end_turn', content: [] }), req)).error).toContain(
      'no text',
    );
    expect(
      (await draftNarrative(fake({ stop_reason: 'max_tokens', content: [{ type: 'text', text: 'x' }] }), req))
        .cut,
    ).toBe(true);
  });
  it('turns API errors into plain messages without echoing anything sent', async () => {
    const boom = (status) => ({
      beta: {
        messages: {
          create: async () => {
            throw Object.assign(new Error('secret sk-ant-xyz'), { status });
          },
        },
      },
    });
    for (const [s, w] of [
      [401, 'key'],
      [429, 'busy'],
      [500, 'problem'],
      [undefined, 'internet'],
    ]) {
      const r = await draftNarrative(boom(s), req);
      expect(r.error).toContain(w);
      expect(r.error).not.toContain('sk-ant');
    }
    expect(explainError({ status: 400 })).toContain('rejected');
  });
});

describe('API key storage', () => {
  const mem = () => {
    const m = {};
    return { m, getItem: (k) => m[k] ?? null, setItem: (k, v) => (m[k] = v), removeItem: (k) => delete m[k] };
  };
  it('keeps the key in the tab unless asked to remember it', () => {
    const l = mem(),
      s = mem();
    saveKey('sk-ant-abcdefghij1', false, l, s);
    expect(keyWhere(l, s)).toBe('tab');
    expect(Object.keys(l.m)).toEqual([]);
    saveKey('sk-ant-abcdefghij2', true, l, s);
    expect(keyWhere(l, s)).toBe('browser');
    expect(getKey(l, s)).toBe('sk-ant-abcdefghij2');
    clearKey(l, s);
    expect(getKey(l, s)).toBe('');
  });
  it('checks the shape', () => {
    expect(looksLikeKey('sk-ant-abcdefghij1')).toBe(true);
    expect(looksLikeKey('hello')).toBe(false);
  });
});

describe('the upload file', () => {
  it('never carries the narrative', () => {
    const b = bar();
    b.narrative = 'NARRATIVE TEXT';
    b.lines = b.lines.slice(0, 2);
    b.lines[0].amount = 1000;
    b.lines[1].amount = -1000;
    const r = makeBarFile(b, { profile: P, fiscalYear: 2027 });
    expect(r.csv || '').not.toContain('NARRATIVE');
  });
});
