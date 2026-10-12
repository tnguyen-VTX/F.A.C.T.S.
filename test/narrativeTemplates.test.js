import { describe, it, expect } from 'vitest';
import { barLine, newBar } from '../src/lib/bar.js';
import { makeBarFile } from '../src/lib/barCsv.js';
import {
  fillTemplate,
  functionNets,
  functionTitle,
  narrativeStale,
  suggestTemplate,
  templatesFor,
} from '../src/lib/narrativeTemplates.js';
import { newProfile } from '../src/lib/profile.js';
import { makeAsr } from './helpers/makeAsr.js';

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
    expect(templatesFor('T').map((t) => t.title)).toEqual([
      'Transfer (negative function)',
      'Transfer (positive function)',
    ]);
    expect(templatesFor('M').map((t) => t.id)).toEqual(['maintenance']);
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

describe('the other four narratives', () => {
  const c = { ...ctx, fundNames: { 11000: 'Operational Fund', 24101: 'Title I' } };
  const rev = (type, amt) => {
    const b = newBar(type, '24101');
    b.lines = [
      barLine(P, '24101-0000-41604-0000-001707-0000', amt),
      barLine(P, '24101-1000-51100-0000-001707-1411', amt),
    ];
    return b;
  };
  it('Transfer (positive function)', () => {
    const b = bar([
      ['1000', '51100', 5000],
      ['2600', '51100', -3000],
      ['2100', '52100', -2000],
    ]);
    expect(fillTemplate('transfer-positive', b, c).text).toBe(
      'Test School is requesting a transfer of $5,000 from the Support Services (2100) function and the Operations (2600) function to Instruction (1000) function. The funds are available in the giving function after accounting for actual expenditures and encumbrances, and the transfer ensures the receiving function is not over budget.',
    );
  });
  it('Maintenance between functions', () => {
    const b = bar(
      [
        ['2600', '51100', -300],
        ['2100', '51100', 300],
      ],
      'M',
    );
    expect(fillTemplate('maintenance', b, c).text).toBe(
      'Test School is requesting a maintenance transfer of $300 from the Operations (2600) function to Support Services (2100) function to align the budget with actual expenditures and encumbrances.',
    );
  });
  it('Maintenance within one function', () => {
    const b = bar(
      [
        ['1000', '51100', -300],
        ['1000', '52100', 300],
      ],
      'M',
    );
    expect(fillTemplate('maintenance', b, c).text).toBe(
      'Test School is requesting a maintenance transfer of $300 within the Instruction (1000) function to align the budget with actual expenditures and encumbrances.',
    );
  });
  it('Increase and Initial Budget', () => {
    expect(fillTemplate('increase', rev('I', 12000), c).text).toBe(
      'Test School is requesting an increase of $12,000 in the Title I (24101) fund to budget the award received.',
    );
    expect(fillTemplate('increase', rev('IB', 12000), c).text).toContain('an initial budget of $12,000');
  });
  it('Decrease says nothing about the reason', () => {
    expect(fillTemplate('decrease', rev('D', -800), c).text).toBe(
      'Test School is requesting a decrease of $800 in the Title I (24101) fund.',
    );
  });
  it('asks for the lines when they are missing and refuses the wrong BAR type', () => {
    expect(fillTemplate('increase', newBar('I', '24101'), c).error).toContain('revenue');
    expect(fillTemplate('decrease', rev('I', 100), c).error).toContain('Decrease');
  });
});

describe('suggesting a Transfer template', () => {
  const asr = makeAsr({ 1000: [['51100', 1000, 1300, 0]], 2100: [['51100', 1000, 100, 0]] });
  it('negative when a receiving function is over budget, positive otherwise', () => {
    const toOver = bar([
      ['1000', '51100', 300],
      ['2100', '51100', -300],
    ]);
    const toRoom = bar([
      ['2100', '51100', 300],
      ['1000', '51100', -300],
    ]);
    expect(suggestTemplate(toOver, asr)).toBe('transfer-negative');
    expect(suggestTemplate(toRoom, asr)).toBe('transfer-positive');
  });
  it('has no suggestion without a report or for other BAR types', () => {
    expect(suggestTemplate(bar([['1000', '51100', 300]]), null)).toBeNull();
    expect(suggestTemplate(bar([['1000', '51100', 300]], 'M'), asr)).toBeNull();
  });
});

describe('a narrative that no longer matches the BAR', () => {
  const b = bar([
    ['1000', '51100', 300],
    ['2600', '51100', -300],
  ]);
  const fill = () => {
    const r = fillTemplate(NAME, b, ctx);
    b.narrative = r.text;
    b.narrativeFill = { id: NAME, text: r.text };
  };
  it('is fresh right after filling and after a hand edit', () => {
    fill();
    expect(narrativeStale(b, ctx)).toBe(false);
    b.narrative += ' Edited by hand.';
    expect(narrativeStale(b, ctx)).toBe(false);
  });
  it('is stale once an amount changes', () => {
    fill();
    b.lines[0].amount = 350;
    b.lines[1].amount = -350;
    expect(narrativeStale(b, ctx)).toBe(true);
  });
  it('is never stale when it was written without a template', () => {
    delete b.narrativeFill;
    b.narrative = 'my own';
    expect(narrativeStale(b, ctx)).toBe(false);
  });
});
