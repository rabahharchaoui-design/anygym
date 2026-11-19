// PLAN 4.4c: the run fixes from the Grok audit and the 4.4a review.
import { describe, expect, it } from 'vitest';
import { GAP_SEC } from '../../gps';
import { DASHED_NOTE } from '../summary';

describe('the dashed stretch caption (fix 2)', () => {
  it('says what the clock does: a pause is left out, a GPS gap keeps only its first GAP_SEC seconds', () => {
    expect(DASHED_NOTE).toContain('Dashed');
    expect(DASHED_NOTE).toMatch(/pause/i);
    expect(DASHED_NOTE).toContain(`first ${GAP_SEC} seconds`);
    expect(DASHED_NOTE).not.toContain('That stretch is not counted as moving time');
  });
});
