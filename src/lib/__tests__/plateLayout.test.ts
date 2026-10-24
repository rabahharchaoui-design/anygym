import { describe, expect, it } from 'vitest';
import { formatAmount } from '../load';
import { SLEEVE_LENGTH, plateSpec } from '../plates';
import {
  BAR_PARTS,
  FRAME_WIDTH,
  LABEL_BAND,
  MIN_LABEL,
  PAD,
  SHAFT_GAP,
  UNDER_LABEL,
  barLayout,
  hornLayout,
  labelSize,
  outermost,
  runLabel,
  textWidth,
  withPlates,
  withoutOutermost,
} from '../plateLayout';

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
      expect(l.caps.left.x).toBeGreaterThanOrEqual(PAD - 1e-9);
      expect(l.caps.right.x + l.caps.right.width).toBeLessThanOrEqual(width - PAD + 1e-9);
      expect(l.caps.left.x + l.caps.left.width).toBeCloseTo(l.sleeves.left.x, 9);
      expect(l.caps.right.x).toBeCloseTo(l.sleeves.right.x + l.sleeves.right.width, 9);
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

  it('keeps real bar proportions: shaft thinner than sleeve, collar flange fatter, cap a touch fatter', () => {
    for (const unit of ['lb', 'kg'] as const) {
      const l = lay(unit, []);
      const p = BAR_PARTS[unit];
      expect(l.shaft.height).toBeCloseTo(p.shaftDiameter * l.scale, 9);
      expect(l.shaft.height).toBeLessThan(l.sleeves.right.height);
      expect(l.shoulders.right.height).toBeGreaterThan(l.sleeves.right.height);
      expect(l.caps.right.height).toBeGreaterThan(l.sleeves.right.height);
      // 28 vs 50 mm feel.
      expect(l.shaft.height / l.sleeves.right.height).toBeCloseTo(p.shaftDiameter / p.sleeveDiameter, 9);
    }
  });

  it('labels thick plates upright on the plate and puts thin ones under it', () => {
    const l = barLayout({ unit: 'kg', perSide: [25, 2.5], inventory: KG, width: 343, height: 168, labelOf: formatAmount, labelBand: LABEL_BAND });
    const [p25, p2] = l.plates.filter((p) => p.side === 'right');
    expect(p25!.label).toBeGreaterThanOrEqual(MIN_LABEL);
    expect(textWidth('25', p25!.label!)).toBeLessThan(p25!.width);
    expect(p2!.label).toBeNull();
    const under = l.labels.filter((u) => u.side === 'right');
    expect(under.map((u) => u.text)).toEqual(['2.5']);
    expect(under[0]!.size).toBe(UNDER_LABEL);
    expect(under[0]!.y).toBeGreaterThan(p25!.y + p25!.height);
    // It clears the upright-labelled plate before it.
    expect(under[0]!.x - textWidth('2.5', UNDER_LABEL) / 2).toBeGreaterThan(p25!.x + p25!.width);
    expect(l.labels.filter((u) => u.side === 'left').map((u) => u.text)).toEqual(['2.5']);
  });

  it('no label band means no under labels, and plates are centred in what is left', () => {
    expect(lay('lb', [2.5]).labels).toEqual([]);
    const l = barLayout({ unit: 'lb', perSide: [45], inventory: LB, width: 340, height: 168, labelOf: formatAmount, labelBand: LABEL_BAND });
    const p = l.plates[0]!;
    expect(p.y + p.height / 2).toBeCloseTo((168 - LABEL_BAND) / 2, 9);
    expect(p.y + p.height).toBeLessThanOrEqual(168 - LABEL_BAND - PAD + 1e-9);
  });

  it('one label per run of the same plate, never overlapping, nudged outward, inside the drawing', () => {
    const l = barLayout({ unit: 'lb', perSide: [45, 45, 25, 10, 5, 2.5], inventory: LB, width: 340, height: 100, labelOf: formatAmount, labelBand: LABEL_BAND });
    for (const side of ['left', 'right'] as const) {
      const own = l.labels.filter((u) => u.side === side);
      const sorted = [...own].sort((a, b) => a.x - b.x);
      for (let i = 1; i < sorted.length; i++) {
        const a = sorted[i - 1]!;
        const b = sorted[i]!;
        expect(a.x + textWidth(a.text, a.size) / 2).toBeLessThanOrEqual(b.x - textWidth(b.text, b.size) / 2 + 1e-9);
      }
      for (const u of own) {
        expect(u.x - textWidth(u.text, u.size) / 2).toBeGreaterThanOrEqual(PAD - 1e-9);
        expect(u.x + textWidth(u.text, u.size) / 2).toBeLessThanOrEqual(340 - PAD + 1e-9);
        // Nudged only outward from the plates it names.
        if (side === 'right') expect(u.x).toBeGreaterThanOrEqual(u.anchor - 1e-9);
        else expect(u.x).toBeLessThanOrEqual(u.anchor + 1e-9);
      }
      // 45, 45 share one label.
      expect(own.filter((u) => u.weight === 45).length).toBeLessThanOrEqual(1);
    }
  });

  it('never returns a negative scale for a tiny width', () => {
    expect(lay('lb', [45], LB, 10).scale).toBe(0);
  });
});

describe('under labels name every plate (PLAN 1.7b)', () => {
  const named = (l: ReturnType<typeof barLayout>, side: 'left' | 'right') =>
    l.plates.filter((p) => p.side === side && p.label !== null).length +
    l.labels.filter((u) => u.side === side).reduce((n, u) => n + u.count, 0);

  it('315 lb: three 45s per side read "3×45", not a lone "45"', () => {
    for (const width of [300, 340, 400]) {
      const l = barLayout({ unit: 'lb', perSide: [45, 45, 45], inventory: LB, width, height: 96, labelOf: formatAmount, labelBand: LABEL_BAND });
      for (const side of ['left', 'right'] as const) {
        expect(named(l, side)).toBe(3);
        const own = l.labels.filter((u) => u.side === side);
        if (own.length) expect(own.map((u) => u.text)).toEqual(['3×45']);
      }
    }
  });

  it('never fewer labels than plates on phone widths, lb and kg', () => {
    const PHONES = [264, 288, 340, 400];
    const loads: Array<['lb' | 'kg', number[], readonly number[], number[]]> = [
      ['lb', [45, 45, 25, 10, 5, 2.5], LB, PHONES],
      ['lb', [45, 45, 45, 45], LB, PHONES],
      ['lb', [45, 25], LB, PHONES],
      ['kg', [20, 20, 20], KG, PHONES],
      ['kg', [25, 20, 10, 5, 2.5], KG, PHONES],
      // Seven different plates per side only fit from a normal phone width up.
      ['kg', [25, 25, 20, 10, 5, 2.5, 1.25], KG, [340, 400]],
    ];
    for (const [unit, perSide, inv, widths] of loads) {
      for (const width of widths) {
        for (const height of [96, 168]) {
          const l = barLayout({ unit, perSide, inventory: inv, width, height, labelOf: formatAmount, labelBand: LABEL_BAND });
          expect(named(l, 'right'), `${unit} ${perSide.join('+')} @${width}x${height}`).toBe(perSide.length);
          expect(named(l, 'left')).toBe(perSide.length);
        }
      }
    }
  });

  it('runLabel', () => {
    expect(runLabel(1, '45')).toBe('45');
    expect(runLabel(3, '2.5')).toBe('3×2.5');
  });
});

describe('underLabels edge cases', () => {
  it('drops labels that would leave a narrow drawing', () => {
    const l = barLayout({ unit: 'lb', perSide: [45, 35, 25, 10, 5, 2.5], inventory: LB, width: 150, height: 100, labelOf: formatAmount, labelBand: LABEL_BAND });
    const right = l.labels.filter((u) => u.side === 'right');
    expect(right.length).toBeLessThan(6);
    for (const u of l.labels) {
      expect(u.x - textWidth(u.text, u.size) / 2).toBeGreaterThanOrEqual(PAD - 1e-9);
      expect(u.x + textWidth(u.text, u.size) / 2).toBeLessThanOrEqual(150 - PAD + 1e-9);
    }
  });

  it('labels under thin plates clear upright labelled plates on both sides', () => {
    const l = barLayout({ unit: 'kg', perSide: [25, 25, 10, 1.25], inventory: KG, width: 380, height: 168, labelOf: formatAmount, labelBand: LABEL_BAND });
    const left = l.plates.filter((p) => p.side === 'left');
    const leftLabels = l.labels.filter((u) => u.side === 'left');
    expect(left[0]!.label).not.toBeNull();
    const lastUpright = left.filter((p) => p.label !== null).pop()!;
    for (const u of leftLabels) expect(u.x + textWidth(u.text, u.size) / 2).toBeLessThan(lastUpright.x);
  });

  it('a horn gets under labels too', () => {
    const h = hornLayout({ unit: 'lb', perSide: [45, 2.5], inventory: LB, width: 340, height: 120, labelOf: formatAmount, labelBand: LABEL_BAND });
    expect(h.labels.map((u) => u.text)).toContain('2.5');
    expect(h.caps.right.x).toBeCloseTo(h.sleeves.right.x + h.sleeves.right.width, 9);
  });
});

describe('labelSize', () => {
  it('is at least the minimum readable size or null', () => {
    expect(labelSize(20, 100, '45')).toBe(13);
    expect(labelSize(17, 100, '45')).toBe(11);
    expect(labelSize(16.5, 100, '45')).toBeNull();
  });
  it('is upright: the text must fit across the plate width, not along its height', () => {
    expect(labelSize(20, 100, '102.5')).toBeNull();
    expect(labelSize(60, 14, '45')).toBeNull();
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

describe('hornLayout', () => {
  const horn = (unit: 'lb' | 'kg', perSide: number[], inventory: number[] = unit === 'lb' ? LB : KG, width = 340) =>
    hornLayout({ unit, perSide, inventory, width, height: 168, labelOf: formatAmount });

  it('draws one horn out of a frame, plates heaviest innermost, to scale', () => {
    const l = horn('lb', [25, 45]);
    expect(l.sides).toEqual(['right']);
    expect(l.frame!.width).toBe(FRAME_WIDTH);
    expect(l.plates.every((p) => p.side === 'right')).toBe(true);
    expect(l.plates.map((p) => p.weight)).toEqual([45, 25]);
    expect(l.plates[0]!.x).toBeCloseTo(l.sleeves.right.x, 9);
    expect(l.plates[1]!.x).toBeCloseTo(l.plates[0]!.x + l.plates[0]!.width, 9);
    expect(l.sleeves.right.width).toBeCloseTo(SLEEVE_LENGTH.lb * l.scale, 9);
    expect(l.shoulders.right.x).toBeCloseTo(l.frame!.x + FRAME_WIDTH, 9);
    for (const p of l.plates) {
      expect(p.height).toBeCloseTo(plateSpec(p.weight, 'lb').diameter * l.scale, 9);
      expect(p.y + p.height / 2).toBeCloseTo(84, 9);
    }
    expect(l.sleeves.left.width).toBe(0);
    expect(l.shaft.width).toBe(0);
  });

  it('stays inside the drawing on narrow and wide stages, kg too', () => {
    for (const width of [200, 340, 600]) {
      const w = horn('kg', [25, 20, 10], KG, width);
      const right = w.sleeves.right.x + w.sleeves.right.width;
      expect(w.frame!.x).toBeGreaterThanOrEqual(PAD - 1e-9);
      expect(right).toBeLessThanOrEqual(width - PAD + 1e-9);
      for (const p of w.plates) expect(p.y).toBeGreaterThanOrEqual(PAD - 1e-9);
    }
    expect(horn('lb', [], []).plates).toEqual([]);
    expect(horn('lb', [45], LB, 10).scale).toBe(0);
  });
});
