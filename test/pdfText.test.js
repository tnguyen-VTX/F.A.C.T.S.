import { describe, it, expect } from 'vitest';
import { pdfToLines, rowsFromItems } from '../src/lib/pdfText.js';
import { parseAward } from '../src/lib/awardLetter.js';

// A one-page PDF with text lines at given positions (made up; no real award letter).
function makePdf(lines) {
  const content = lines.map(([x, y, t]) => `BT /F1 11 Tf ${x} ${y} Td (${t}) Tj ET`).join('\n');
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offs = [];
  objs.forEach((o, i) => {
    offs.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(out);
}

describe('PDF text', () => {
  it('joins words on one baseline into rows, top to bottom', () => {
    const rows = rowsFromItems([
      { str: 'Total', transform: [1, 0, 0, 1, 50, 700] },
      { str: 'Award:', transform: [1, 0, 0, 1, 90, 701] },
      { str: '$2,350.00', transform: [1, 0, 0, 1, 200, 700] },
      { str: 'Fund 24101', transform: [1, 0, 0, 1, 50, 720] },
    ]);
    expect(rows).toEqual(['Fund 24101', 'Total Award: $2,350.00']);
  });
  it('reads a generated PDF and the parser finds the award', async () => {
    const bytes = makePdf([
      [50, 740, 'Notice of Grant Award'],
      [50, 720, 'Fund: 24101'],
      [50, 700, 'Total Award:'],
      [200, 700, '$2,350.00'],
      [50, 680, 'Award Period: 07/01/2026 through 06/30/2027'],
    ]);
    const lines = await pdfToLines(bytes);
    expect(lines).toContain('Total Award: $2,350.00');
    const r = parseAward(lines, { funds: [{ code: '24101' }] });
    expect([r.fund.value, r.award.value, r.from.value, r.to.value]).toEqual(['24101', 2350, '07/01/2026', '06/30/2027']);
  });
});
