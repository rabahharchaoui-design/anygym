import { describe, expect, it } from 'vitest';
import { formatAmount } from '../load';
import { SLEEVE_LENGTH, plateSpec } from '../plates';
import { MIN_LABEL, PAD, SHAFT_GAP, barLayout, labelSize, outermost, withPlates, withoutOutermost } from '../plateLayout';

const LB = [45, 35, 25, 10, 5, 2.5];
const KG = [25, 20, 15, 10, 5, 2.5, 1.25];
const lay = (unit: 'lb' | 'kg', perSide: number[], inventory = unit === 'lb' ? LB : KG, width = 340) =>
  barLayout({ unit, perSide, inventory, width, height: 168, labelOf: formatAmount });

describe('barLayout', () => {
  it('draws plates to real proportions: height = diameter, width = thickness, one scale', () => {
    const l = lay('lb', [45, 25]);
    const right = l.plates.filter((p) => p.side === 'right');
    expect(right.map((p) => p.weight)).toEqual([45, 25]);
    for (const p of right) {
      expect(p.height).toBeCloseTo(plateSpec(p.weight, 'lb').diameter * l.scale, 9);
      expect(p.width).toBeCloseTo(plateSpec(p.weight, 'lb').thickness * l.scale, 9);
    }
    expect(l.sleeves.right.width).toBeCloseTo(SLEEVE_LENGTH.lb * l.scale, 9);
  });

  it('puts the heaviest innermost and mirrors both sides exactly', () => {
    const l = lay('kg', [1.25, 25, 15]);
    const right = l.plates.filter((p) => p.side === 'right');
    const left = l.plates.filter((p) => p.side === 'left');
    expect(right.map((p) => p.weight)).toEqual([25, 15, 1.25]);
    expect(left.map((p) => p.weight)).toEqual([25, 15, 1.25]);
    // Right side starts at the shoulder and grows outward without gaps.
    expect(right[0]!.x).toBeCloseTo(l.sleeves.right.x, 9);
    expect(right[1]!.x).toBeCloseTo(right[0]!.x + right[0]!.width, 9);
    // Mirror about the centre line.
    right.forEach((r, i) => {
      const m = left[i]!;
      expect(m.x + m.width).toBeCloseTo(l.width - r.x, 9);
      expect(m.y).toBe(r.y);
    });
  });

  it('fits the biggest inventory plate in the height and both sleeves in the width', () => {
    for (const width of [300, 343, 398]) {
      const l = lay('lb', [], LB, width);
      expect(plateSpec(45, 'lb').diameter * l.scale).toBeLessThanOrEqual(168 - 2 * PAD + 1e-9);
      expect(l.sleeves.left.x).toBeGreaterThanOrEqual(PAD - 1e-9);
      expect(l.sleeves.right.x + l.sleeves.right.width).toBeLessThanOrEqual(width - PAD + 1e-9);
      expect(l.shaft.width).toBe(SHAFT_GAP);
    }
  });

  it('scale depends on the inventory, not on what is loaded (no jumps while loading)', () => {
    expect(lay('lb', []).scale).toBe(lay('lb', [45, 45, 45]).scale);
    // 100 lb plates are bigger, so enabling them shrinks the scale.
    expect(lay('lb', [], [100, ...LB]).scale).toBeLessThanOrEqual(lay('lb', []).scale);
  });

  it('uses every known plate size when the inventory is empty', () => {
    expect(lay('kg', [], []).scale).toBe(lay('kg', [], KG).scale);
  });

  it('labels thick plates and leaves thin ones unlabelled', () => {
    const l = lay('lb', [45, 2.5], LB, 343);
    const [p45, p25] = l.plates.filter((p) => p.side === 'right');
    expect(p45!.label).toBeGreaterThanOrEqual(MIN_LABEL);
    expect(p25!.label).toBeNull();
  });

  it('never returns a negative scale for a tiny width', () => {
    expect(lay('lb', [45], LB, 10).scale).toBe(0);
  });
});

describe('labelSize', () => {
  it('is at least the minimum readable size or null', () => {
    expect(labelSize(20, 100, '45')).toBe(13);
    expect(labelSize(13, 100, '45')).toBe(11);
    expect(labelSize(12.9, 100, '45')).toBeNull();
  });
  it('drops the label when the text would not fit along the plate', () => {
    expect(labelSize(20, 20, '102.5')).toBeNull();
  });
});

describe('plate list edits', () => {
  it('adds plates keeping heaviest first', () => {
    expect(withPlates([45, 10], 25, 1)).toEqual([45, 25, 10]);
    expect(withPlates([], 10, 2)).toEqual([10, 10]);
  });
  it('removes the outermost (lightest) plate', () => {
    expect(withoutOutermost([45, 25, 10])).toEqual([45, 25]);
    expect(withoutOutermost([10, 45])).toEqual([45]);
    expect(withoutOutermost([])).toEqual([]);
  });
  it('names the outermost plate', () => {
    expect(outermost([45, 25])).toBe(25);
    expect(outermost([])).toBeNull();
  });
});
