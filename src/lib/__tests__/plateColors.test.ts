import { describe, expect, it } from 'vitest';
import { PLATE_SPECS } from '../plates';
import { PAINT, chipText, plateColor, sideChips } from '../plateColors';

describe('plate colours (PLAN 2.0d)', () => {
  it('every known plate size has a colour with paint', () => {
    for (const unit of ['lb', 'kg'] as const) {
      for (const p of PLATE_SPECS[unit]) expect(PAINT[plateColor(p.weight, unit)].fill).toMatch(/^#[0-9A-F]{6}$/);
    }
  });

  it('chip text: "45 ×2" for a pair of a size, the bare weight for one', () => {
    const [a, b] = sideChips([45, 45, 2.5], 'lb');
    expect(chipText(a!, String)).toBe('45 ×2');
    expect(chipText(b!, String)).toBe('2.5');
  });
});
