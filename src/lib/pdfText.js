// Text of a PDF, as lines, read in the browser with pdf.js (nothing is uploaded). Loaded only when a PDF is chosen.
// Words on the same baseline are joined into one line (so table rows stay together), top to bottom, page by page.
export async function pdfToLines(bytes, { workerSrc } = {}) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  if (workerSrc) pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true, isEvalSupported: false }).promise;
  const lines = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      lines.push(...rowsFromItems(content.items));
    }
  } finally {
    await doc.destroy();
  }
  return lines;
}

// items: pdf.js text items ({ str, transform: [a,b,c,d,x,y] }). Pure, so it can be tested without a PDF.
export function rowsFromItems(items, tolerance = 3) {
  const words = items
    .filter((i) => typeof i.str === 'string' && i.str.trim() !== '')
    .map((i) => ({ s: i.str, x: i.transform[4], y: i.transform[5] }));
  words.sort((a, b) => b.y - a.y || a.x - b.x);
  const rows = [];
  for (const w of words) {
    const row = rows.find((r) => Math.abs(r.y - w.y) <= tolerance);
    if (row) row.words.push(w);
    else rows.push({ y: w.y, words: [w] });
  }
  return rows
    .sort((a, b) => b.y - a.y)
    .map((r) =>
      r.words
        .sort((a, b) => a.x - b.x)
        .map((w) => w.s.trim())
        .join(' ')
        .replace(/\s+/g, ' '),
    );
}
