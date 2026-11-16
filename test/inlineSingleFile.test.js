import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { inlineHtml } from '../scripts/inline-single-file.mjs';

const html = `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'self'" />
<link rel="icon" href="./brand/favicon-32.png" />
<script type="module" crossorigin src="./assets/index.js"></script>
<link rel="stylesheet" crossorigin href="./assets/style.css"></head><body><div id="app"></div></body></html>`;
const files = { 'assets/index.js': 'const a="$&"; const b="</script>"; const img="./brand/x.png";', 'assets/style.css': 'body{color:red}' };

describe('single-file build', () => {
  const out = inlineHtml(html, (f) => files[f], () => 'data:image/png;base64,AAA');
  it('has no separate file references and keeps $ patterns and </script safe', () => {
    expect(out).not.toMatch(/(?:src|href)="\.\/(?:assets|brand)\//);
    expect(out).toContain('<style>body{color:red}</style>');
    expect(out).toContain('const a="$&"');
    expect(out).toContain('<\\/script>');
    expect(out).toContain('data:image/png;base64,AAA');
  });
  it('allows only its own inline script, by hash, and no network', () => {
    const script = out.match(/<script type="module">([\s\S]*)<\/script>/)[1];
    const hash = createHash('sha256').update(script).digest('base64');
    const csp = out.match(/Content-Security-Policy" content="([^"]*)"/)[1];
    expect(csp).toContain(`script-src 'sha256-${hash}'`);
    expect(csp).toContain("connect-src 'none'");
  });
});
