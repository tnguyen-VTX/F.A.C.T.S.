import { describe, it, expect } from 'vitest';
import { allocateDonors } from '../src/lib/barLogic.js';
import { makeAsr } from './helpers/makeAsr.js';

const asr = makeAsr({
  2100: [['51100', 500, 0, 0]],
  2500: [['51100', 500, 0, 0]],
  1000: [['51100', 500, 0, 0]],
});
const funcs = (kind) =>
  allocateDonors(asr, { fund: '11000', excludeFunc: '2100', need: kind ? 300 : 800, kind }).lines.map(
    (l) => l.code.split('-')[1],
  );

describe('donor series filter', () => {
  it('T takes only from other series', () => expect(funcs('T')).toEqual(['1000']));
  it('M takes only from the same series', () => expect(funcs('M')).toEqual(['2500']));
  it('no kind takes from any other function', () => expect(funcs()).toHaveLength(2));
});
