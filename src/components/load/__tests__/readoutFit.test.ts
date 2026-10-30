import { describe, expect, it } from 'vitest';
import { readoutFit } from '../useReadoutFit';

describe('readoutFit (PLAN 2.0b)', () => {
  it('keeps Type it | total | Clear on one row while both sides fit around the centered total', () => {
    expect(readoutFit(288, 120, [80, 66], 100)).toBe(0);
  });
  it('a 5 character total on a 320 pt phone moves the links under the math line, the bar control between them', () => {
    expect(readoutFit(288, 196, [80, 66], 104)).toBe(1);
  });
  it('130% text: the bar control gets its own row when the three do not fit', () => {
    expect(readoutFit(288, 196, [104, 86], 135)).toBe(2);
  });
  it('the wider link decides (the total stays centered)', () => {
    expect(readoutFit(300, 98, [100, 40], 0)).toBe(0);
    expect(readoutFit(300, 101, [100, 40], 0)).toBe(1);
  });
});
