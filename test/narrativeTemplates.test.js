import { describe, it, expect } from 'vitest';
import { barLine, newBar } from '../src/lib/bar.js';
import { makeBarFile } from '../src/lib/barCsv.js';
import { fillTemplate, functionNets, functionTitle, templatesFor } from '../src/lib/narrativeTemplates.js';
import { newProfile } from '../src/lib/profile.js';

const P = newProfile({
  id: 'x',
  name: 'Test School',
  districtCode: '1',
  locationRule: { type: 'lastN', n: 3 },
});
const funcNames = { 1000: 'Instruction', 2600: 'Operations', 2100: 'Support Services' };
const bar = (lines, type = 'T') => {
  const b = newBar(type, '11000');
  b.lines = lines.map(([f, o, a]) => barLine(P, `11000-${f}-${o}-0000-001707-1411`, a));
  return b;
};
const ctx = { school: 'Test School', funcNames };
const NAME = 'transfer-negative';

describe('Transfer (negative function) template', () => {
  it('is offered for Transfer BARs only', () => {
    expect(templatesFor('T').map((t) => t.title)).toEqual(['Transfer (negative function)']);
    expect(templatesFor('M')).toEqual([]);
  });
  it('fills the school, function titles with codes and the amount', () => {
    const b = bar([
      ['1000', '51100', 5000],
      ['2600', '51100', -3000],
      ['2600', '52100', -2000],
    ]);
    expect(fillTemplate(NAME, b, ctx).text).toBe(
      'Test School is requesting a transfer from the Operations (2600) function in the amount of $5,000 to Instruction (1000) function to align with actual expenditures and encumbrances. The transfer is needed to ensure the function is not over budget by any of its functions.',
    );
  });
  it('lists several giving and receiving functions', () => {
    const b = bar([
      ['1000', '51100', 4000],
      ['2100', '51100', 1000],
      ['2600', '51100', -3000],
      ['3100', '51100', -2000],
    ]);
    const t = fillTemplate(NAME, b, ctx).text;
    expect(t).toContain(
      'from the Operations (2600) function in the amount of $3,000 and the 3100 function in the amount of $2,000 to',
    );
    expect(t).toContain('to Instruction (1000) function and Support Services (2100) function to align');
  });
  it('nets lines within a function and ignores revenue lines', () => {
    const b = bar([
      ['1000', '51100', 900],
      ['1000', '52100', -100],
      ['2600', '51100', -800],
      ['0000', '41604', 700],
    ]);
    expect(functionNets(b)).toEqual([
      { func: '1000', net: 800 },
      { func: '2600', net: -800 },
    ]);
  });
  it('asks for lines when there is nothing to transfer, and refuses other BAR types', () => {
    expect(fillTemplate(NAME, bar([['1000', '51100', 500]]), ctx).error).toContain('give money');
    expect(fillTemplate(NAME, bar([['1000', '51100', 500]], 'M'), ctx).error).toContain('Transfer');
    expect(fillTemplate('nope', bar([]), ctx).error).toContain('Choose a template');
  });
  it('shows just the code when the report has no title', () => {
    expect(functionTitle('3100', funcNames)).toBe('3100');
    expect(functionTitle('1000', funcNames)).toBe('Instruction (1000)');
  });
  it('never reaches the upload file', () => {
    const b = bar([
      ['1000', '51100', 5000],
      ['2600', '51100', -5000],
    ]);
    b.narrative = fillTemplate(NAME, b, ctx).text;
    b.justification = 'Cover a deficit';
    b.contact = { first: 'Pat', middle: '', last: 'Example' };
    expect(makeBarFile(b, { profile: P, fiscalYear: 2027 }).csv || '').not.toContain('requesting a transfer');
  });
});
