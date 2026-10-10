// The optional AI-drafted narrative: what is sent, how it is sent, how errors read. Nothing here runs
// until the user previews the exact text and presses Send. The result never goes into the upload file.
import { BAR_TYPES, barTotals, isRevenueObject } from './bar.js';

export const NARRATIVE_MODEL = 'claude-opus-5-5';
export const API_HOST = 'https://api.anthropic.com';

export const NARRATIVE_SYSTEM = `You help a New Mexico charter school business manager write the explanation that accompanies a budget adjustment request (BAR) to the Public Education Department.
Write two to four short paragraphs of plain, factual prose. Use only the facts you are given. Do not invent reasons, dates, grants, people or amounts. Where the reason for the change is not given, write a bracketed placeholder such as [reason for the change] for the business manager to fill in. Do not use headings or bullet points.`;

const usd = (n) => {
  const v = Math.round(Math.abs(n));
  return `${n < 0 ? '-' : ''}$${v.toLocaleString('en-US')}`;
};

// A short, non-identifying summary: BAR type, fund, function names and whole-dollar totals. No account
// descriptions, contact names, justification text, FTE or any employee information.
export function narrativeInput(bar, { funcNames = {}, fundNames = {} } = {}) {
  const t = barTotals(bar);
  const byFunc = new Map();
  for (const l of bar.lines) {
    if (isRevenueObject(l.obj)) continue;
    byFunc.set(l.func, (byFunc.get(l.func) || 0) + (Number.isFinite(l.amount) ? l.amount : 0));
  }
  const rows = [...byFunc.entries()]
    .filter(([, v]) => Math.round(v) !== 0)
    .sort((a, b) => a[0].localeCompare(b[0]));
  const name = (f) => `${f}${funcNames[f] ? ' ' + funcNames[f] : ''}`;
  const out = [
    `BAR type: ${BAR_TYPES[bar.type] || bar.type}`,
    `Fund: ${bar.fund}${fundNames[bar.fund] ? ' ' + fundNames[bar.fund] : ''}`,
  ];
  if (['I', 'IB', 'D'].includes(bar.type)) out.push(`Revenue: ${usd(t.revenue)}`);
  const up = rows.filter(([, v]) => v > 0),
    down = rows.filter(([, v]) => v < 0);
  if (up.length) out.push('Functions receiving budget:', ...up.map(([f, v]) => `- ${name(f)}: ${usd(v)}`));
  if (down.length)
    out.push('Functions giving up budget:', ...down.map(([f, v]) => `- ${name(f)}: ${usd(v)}`));
  out.push(`Total moved: ${usd(up.reduce((s, [, v]) => s + v, 0))}`);
  return out.join('\n');
}

export const narrativeRequest = (bar, names) => ({
  model: NARRATIVE_MODEL,
  system: NARRATIVE_SYSTEM,
  user: `Write the narrative for this BAR.\n\n${narrativeInput(bar, names)}`,
});

// The SDK is loaded only when the button is pressed, so the page loads nothing from it before then.
export const AI = {
  async makeClient(apiKey) {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    return new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1 });
  },
};

export function explainError(e) {
  const s = e?.status;
  if (s === 401 || s === 403) return 'The AI service did not accept the API key. Check it and save it again.';
  if (s === 429) return 'The AI service is busy or the key has hit its limit. Try again in a minute.';
  if (s === 400) return 'The AI service rejected the request. Nothing was drafted.';
  if (s >= 500) return 'The AI service had a problem. Try again later.';
  return 'Could not reach the AI service. Check your internet connection and try again.';
}

// Calls the model once. `client` is injectable for tests. Returns { text } or { error }.
export async function draftNarrative(client, req) {
  try {
    const res = await client.beta.messages.create({
      model: req.model,
      max_tokens: 4000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low' },
      system: req.system,
      messages: [{ role: 'user', content: req.user }],
    });
    if (res.stop_reason === 'refusal')
      return { error: 'The AI service declined to write this narrative. Write it yourself.' };
    const text = (res.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    if (!text) return { error: 'The AI service returned no text. Try again.' };
    return { text, cut: res.stop_reason === 'max_tokens' };
  } catch (e) {
    return { error: explainError(e) };
  }
}
