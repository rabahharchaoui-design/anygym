import { describe, expect, it } from 'vitest';
import { PLATE_SPECS } from '../plates';
import { PAINT, SHEET_BG, chipText, contrast, plateColor, sideChips } from '../plateColors';

describe('plate colours (PLAN 2.0d)', () => {
  it('every known plate size has a colour with paint', () => {
    for (const unit of ['lb', 'kg'] as const) {
      for (const p of PLATE_SPECS[unit]) expect(PAINT[plateColor(p.weight, unit)].fill).toMatch(/^#[0-9A-F]{6}$/);
    }
  });

  it('the colour table (G, PLAN 2.0d; two grays for lb 5 and 2.5 after the 2.0d critic)', () => {
    const lb: Array<[number, string]> = [[55, 'red'], [45, 'blue'], [35, 'yellow'], [25, 'green'], [10, 'white'], [5, 'gray'], [2.5, 'graphite']];
    const kg: Array<[number, string]> = [[25, 'red'], [20, 'blue'], [15, 'yellow'], [10, 'green'], [5, 'white'], [2.5, 'black'], [1.25, 'chrome']];
    for (const [w, c] of lb) expect(plateColor(w, 'lb')).toBe(c);
    for (const [w, c] of kg) expect(plateColor(w, 'kg')).toBe(c);
    expect(PAINT.gray.fill).toBe('#8C9098');
    expect(PAINT.graphite.fill).toBe('#6B6F77');
  });

  it('lb 5 and 2.5 are two distinct grays, both lighter than the old dark gray', () => {
    const five = PAINT[plateColor(5, 'lb')].fill;
    const small = PAINT[plateColor(2.5, 'lb')].fill;
    expect(five).not.toBe(small);
    for (const c of [five, small]) expect(contrast(c, SHEET_BG)).toBeGreaterThan(contrast('#55585F', SHEET_BG));
  });

  it('every plate reads on the dark sheet: its body or its 1 px light edge has 3:1 contrast', () => {
    for (const unit of ['lb', 'kg'] as const) {
      for (const p of PLATE_SPECS[unit]) {
        const paint = PAINT[plateColor(p.weight, unit)];
        const best = Math.max(contrast(paint.fill, SHEET_BG), paint.edge ? contrast(paint.edge, SHEET_BG) : 0);
        expect(best, `${p.weight} ${unit}`).toBeGreaterThanOrEqual(3);
      }
    }
    // The dark ones carry the light edge: kg 2.5 black and both lb grays.
    expect(PAINT[plateColor(2.5, 'kg')].edge).toBeDefined();
    expect(PAINT.gray.edge).toBeDefined();
    expect(PAINT.graphite.edge).toBeDefined();
    expect(contrast(PAINT.black.edge!, PAINT.black.fill)).toBeGreaterThan(2);
  });

  it('contrast: black on white is 21, a colour on itself is 1', () => {
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 6);
    expect(contrast('#6B6F77', '#6B6F77')).toBe(1);
  });

  it('chip text: "45 ×2" for a pair of a size, the bare weight for one', () => {
    const [a, b] = sideChips([45, 45, 2.5], 'lb');
    expect(chipText(a!, String)).toBe('45 ×2');
    expect(chipText(b!, String)).toBe('2.5');
  });
});
