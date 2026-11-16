// Turns a Vite build (index.html + one JS + one CSS, assets already inlined as data URIs) into ONE .html file.
// Usage: node scripts/inline-single-file.mjs <dist folder> <output file name>   (the file is written inside the dist folder)
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.woff2': 'font/woff2' };
const dataUri = (file) => `data:${MIME[extname(file)] || 'application/octet-stream'};base64,${readFileSync(file).toString('base64')}`;

// Pure: html text + a reader for files next to it -> one html text. Exported for the test.
export function inlineHtml(html, read, readBinaryUri) {
  // Stylesheets -> <style>
  html = html.replace(/<link rel="stylesheet"[^>]*href="\.\/([^"]+)"[^>]*>/g, (_, f) => `<style>${read(f)}</style>`);
  // Scripts -> inline module (</script inside the code must not end the tag)
  let script = '';
  html = html.replace(/<script type="module"[^>]*src="\.\/([^"]+)"[^>]*><\/script>/g, (_, f) => {
    script += read(f);
    return '';
  });
  // Files from public/ that the page or code refers to by path -> data URIs
  const refs = new Set([...(html + script).matchAll(/\.\/brand\/[A-Za-z0-9._-]+/g)].map((m) => m[0]));
  for (const r of refs) {
    const uri = readBinaryUri(r.slice(2));
    html = html.split(r).join(uri);
    script = script.split(r).join(uri);
  }
  script = script.replace(/<\/script/gi, '<\\/script');
  const hash = createHash('sha256').update(script).digest('base64');
  html = html.replace(/(<meta http-equiv="Content-Security-Policy" content=")[^"]*(")/, (_, a, b) => {
    const csp = [
      "default-src 'self'",
      `script-src 'sha256-${hash}'`,
      "style-src 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src data:",
      "connect-src 'none'",
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'none'",
    ].join('; ');
    return a + csp + b;
  });
  // A function, not a string: the code contains $& and similar, which String.replace would expand.
  return html.replace('</body>', () => `<script type="module">${script}</script>\n  </body>`);
}

if (process.argv[1] && basename(process.argv[1]) === 'inline-single-file.mjs') {
  const [dir, out] = process.argv.slice(2);
  if (!dir || !out) throw new Error('Usage: node scripts/inline-single-file.mjs <dist folder> <output file name>');
  const html = readFileSync(join(dir, 'index.html'), 'utf8');
  const result = inlineHtml(
    html,
    (f) => readFileSync(join(dir, f), 'utf8'),
    (f) => dataUri(join(dir, f)),
  );
  if (/(?:src|href)="\.\/(?:assets|brand)\//.test(result)) throw new Error('The page still refers to a separate file.');
  writeFileSync(join(dir, out), result);
  console.log(`Wrote ${join(dir, out)} (${(result.length / 1048576).toFixed(1)} MB)`);
}
