import { describe, expect, it } from 'vitest';
import { formatAmount } from '../load';
import { barSpec, plateSpec, SLEEVE_LENGTH } from '../plates';
import {
  BADGE,
  FACE,
  FRAME_WIDTH,
  MARKER_LINE,
  MIN_FACE_PAD,
  MIN_PLATE,
  TALL,
  MIN_LABEL,
  PAD,
  PAD_Y,
  barLayout,
  barScale,
  drawingHeight,
  hornLayout,
  outermost,
  plateWidth,
  runLabel,
  textWidth,
  withPlates,
  withoutOutermost,
  type BarLayout,
} from '../plateLayout';

// Card widths of the SPEC 13.4 phones (viewport minus the sheet's side padding): 320 floor, SE, 15, Pro Max.
const PHONES = [288, 343, 361, 408];
const lay = (unit: 'lb' | 'kg', perSide: number[], width = 343, bar: 'olympic' | 'womens' = 'olympic') =>
  barLayout({ unit, perSide, width, labelOf: formatAmount, bar });

/** Every plate one side's drawing stands for, heaviest first. */
const covered = (l: BarLayout, side: 'left' | 'right') => l.plates.filter((p) => p.side === side).flatMap((p) => p.weights);
const faces = (l: BarLayout) => l.plates.filter((p) => p.side === 'right').map((p) => p.text);

describe('true scale bar (SPEC 5.6 TRUE SCALE)', () => {
  it('shaft ÷ sleeve is within 5% of 1310/415 on every phone width, lb and kg (the ratio test)', () => {
    for (const width of [320, 375, 393, 440, ...PHONES]) {
      for (const unit of ['lb', 'kg'] as const) {
        for (const load of [[], [45, 45, 45, 45]] as const) {
          const perSide = unit === 'lb' ? [...load] : load.map(() => 20);
          const l = lay(unit, perSide, width);
          const ratio = l.shaft.width / l.sleeves.right.width;
          expect(Math.abs(ratio / (1310 / 415) - 1), `${unit} @${width}: ${ratio}`).toBeLessThan(0.05);
          expect(l.sleeves.left.width).toBeCloseTo(l.sleeves.right.width, 9);
        }
      }
    }
  });

  it("women's bar: shaft ÷ sleeve within 5% of 1310/320, 25 mm shaft, 2010 mm overall", () => {
    for (const width of [320, 375, 393, 440]) {
      const l = lay('kg', [], width, 'womens');
      expect(Math.abs(l.shaft.width / l.sleeves.right.width / (1310 / 320) - 1)).toBeLessThan(0.05);
      expect(l.shaft.height / l.scale).toBeCloseTo(25, 9);
      const overall = l.sleeves.right.x + l.sleeves.right.width - l.sleeves.left.x;
      expect(overall / l.scale).toBeCloseTo(2010, 6);
    }
    expect(barSpec('womens', 'kg')).toMatchObject({ total: 2010, shaft: 1310, sleeve: 320, collar: 30, shaftDiameter: 25 });
  });

  it('one scale for everything: plates, sleeves, shaft and collars use the same pixels per mm', () => {
    const l = lay('kg', [25, 10]);
    const spec = barSpec('olympic', 'kg');
    expect(l.shaft.width).toBeCloseTo(1310 * l.scale, 9);
    expect(l.shaft.height).toBeCloseTo(28 * l.scale, 9);
    expect(l.sleeves.right.width).toBeCloseTo(415 * l.scale, 9);
    expect(l.sleeves.right.height).toBeCloseTo(50 * l.scale, 9);
    expect(l.shoulders.right.width).toBeCloseTo(spec.collar * l.scale, 9);
    // Diameters at the bar's scale; thickness is the one exception (fat numbered plates).
    for (const p of l.plates) {
      expect(p.height).toBeCloseTo(plateSpec(p.weight, 'kg').diameter * l.scale, 9);
      expect(p.width).toBeGreaterThanOrEqual(plateWidth(343) - 1e-9);
    }
    // SPEC 5.3 table: 15 and 25 kg are both 450 mm discs (44 and 64 mm thick).
    expect(plateSpec(15, 'kg').diameter).toBe(plateSpec(25, 'kg').diameter);
    // Overall 2200 mm.
    const overall = l.sleeves.right.x + l.sleeves.right.width - l.sleeves.left.x;
    expect(overall / l.scale).toBeCloseTo(2200, 6);
  });

  it('a 45 lb plate is the same 450 mm disc as a 20 kg plate, smaller plates at their real diameters', () => {
    const lb = lay('lb', [45, 10]);
    const kg = lay('kg', [20]);
    const p45 = lb.plates.find((p) => p.weight === 45)!;
    // Same disc; the lb bar is 3 mm longer (16.4 in sleeves), so within 0.5%.
    expect(Math.abs(p45.height / kg.plates[0]!.height - 1)).toBeLessThan(0.005);
    expect(lb.plates.find((p) => p.weight === 10)!.height / p45.height).toBeCloseTo(10.04 / (450 / 25.4), 9);
  });

  it('the bar fills the width with side margins, mirrored about the centre', () => {
    for (const width of PHONES) {
      const l = lay('lb', [45, 25], width);
      expect(l.caps.left.x).toBeCloseTo(PAD, 9);
      expect(l.caps.right.x + l.caps.right.width).toBeCloseTo(width - PAD, 9);
      expect(l.shaft.x + l.shaft.width / 2).toBeCloseTo(width / 2, 9);
      const r = l.plates.filter((p) => p.side === 'right');
      const m = l.plates.filter((p) => p.side === 'left');
      r.forEach((p, i) => {
        expect(m[i]!.x + m[i]!.width).toBeCloseTo(width - p.x, 9);
        expect(m[i]!.y).toBe(p.y);
      });
    }
  });

  it('scale and height come from the width alone: empty, one plate and heavy stacks match', () => {
    const heights = new Set<number>();
    const scales = new Set<number>();
    for (const perSide of [[], [45], [45, 45, 45, 45], [45, 35, 25, 10, 5, 2.5]]) {
      const l = lay('lb', perSide);
      heights.add(l.height);
      scales.add(l.scale);
    }
    expect(scales.size).toBe(1);
    expect(heights.size).toBe(1);
    expect(lay('lb', []).scale).toBe(barScale(343, 'lb'));
    expect(lay('lb', []).height).toBeCloseTo(drawingHeight(barScale(343, 'lb'), 'lb'), 9);
  });

  it('reserves the biggest plate: the 450 mm plate sits inside the drawing', () => {
    for (const width of PHONES) {
      const l = lay('kg', [25], width);
      const p = l.plates[0]!;
      expect(p.y).toBeCloseTo(PAD_Y, 9);
      expect(p.y + p.height).toBeCloseTo(l.floor, 9);
      // No number row under the plates any more.
      expect(l.height).toBeCloseTo(l.floor + PAD_Y, 9);
    }
  });

  it('puts the heaviest innermost against the collar, no gaps', () => {
    const l = lay('kg', [10, 25], 408);
    const r = l.plates.filter((p) => p.side === 'right');
    expect(r.map((p) => p.weight)).toEqual([25, 10]);
    expect(r[0]!.x).toBeCloseTo(l.sleeves.right.x, 9);
    expect(r[1]!.x).toBeCloseTo(r[0]!.x + r[0]!.width, 9);
    expect(l.plates.filter((p) => p.side === 'left').map((p) => p.weight)).toEqual([25, 10]);
  });

  it('thin bar, fat sleeves, collar flange and end cap at real diameters', () => {
    for (const unit of ['lb', 'kg'] as const) {
      const l = lay(unit, []);
      expect(l.shaft.height / l.sleeves.right.height).toBeCloseTo(28 / 50, 6);
      expect(l.shoulders.right.height).toBeGreaterThan(l.sleeves.right.height);
      expect(l.caps.right.height).toBeGreaterThan(l.sleeves.right.height);
    }
  });

  it('never returns a negative scale for a tiny width', () => {
    expect(lay('lb', [45], 10).scale).toBe(0);
    expect(hornLayout({ unit: 'lb', perSide: [45], width: 10, labelOf: formatAmount }).scale).toBe(0);
  });
});

describe('fat numbered plates (SPEC 5.6, G Oct 25 6:13 PM)', () => {
  it('plate width: 24 px on the 320 floor, growing to 28 px on a Pro Max', () => {
    expect(plateWidth(288)).toBe(24);
    expect(plateWidth(343)).toBeCloseTo(25.83, 2);
    expect(plateWidth(408)).toBe(28);
    expect(plateWidth(200)).toBe(24);
    expect(plateWidth(600)).toBe(28);
  });

  it('every number fits inside its plate face, bold and at least 11 px', () => {
    expect(FACE).toBeGreaterThanOrEqual(MIN_LABEL);
    expect(BADGE).toBeGreaterThanOrEqual(MIN_LABEL);
    for (const width of PHONES) {
      for (const [unit, perSide] of [
        ['lb', [45, 35, 25, 10, 5, 2.5, 1.25]],
        ['kg', [25, 20, 15, 10, 5, 2.5, 1.25, 0.5]],
        ['lb', [45, 45, 45, 45]],
        ['kg', [2.5, 2.5, 2.5]],
      ] as const) {
        const l = lay(unit, [...perSide], width);
        for (const p of l.plates) {
          if (p.more) for (const line of p.lines) expect(textWidth(line, BADGE) + MIN_FACE_PAD).toBeLessThanOrEqual(p.width + 1e-9);
          else expect(textWidth(p.face, FACE) + MIN_FACE_PAD).toBeLessThanOrEqual(p.width + 1e-9);
          if (p.badge) expect(textWidth(p.badge, BADGE) + MIN_FACE_PAD).toBeLessThanOrEqual(p.width + 1e-9);
          expect(p.width).toBeGreaterThanOrEqual(MIN_PLATE - 1e-9);
          // Stacked marker lines fit its height.
          if (p.more) expect(p.lines.length * MARKER_LINE).toBeLessThanOrEqual(p.height);
        }
        // Every plate is accounted for, on both sides.
        expect(covered(l, 'right')).toEqual([...perSide].sort((a, b) => b - a));
        expect(covered(l, 'left')).toEqual(covered(l, 'right'));
      }
    }
  });

  it('the check loads on 320, 375 and 440: single plates while they fit, then one plate per run', () => {
    const expected: Array<['lb' | 'kg', number[], string[]]> = [
      ['lb', [], []],
      ['lb', [45], ['45']],
      ['lb', [45, 45], ['45', '45']],
      ['lb', [45, 45, 45], ['3×45']],
      ['lb', [45, 45, 45, 45], ['4×45']],
      ['kg', [20], ['20']],
      ['kg', [25, 15], ['25', '15']],
      ['kg', [25, 25, 10], ['2×25', '10']],
    ];
    for (const width of [288, 343, 408]) {
      for (const [unit, perSide, texts] of expected) {
        const l = lay(unit, perSide, width);
        expect(faces(l), `${unit} ${perSide.join('+')} @${width}`).toEqual(texts);
        // Fat plates stay on the drawn sleeve.
        const end = l.sleeves.right.x + l.sleeves.right.width;
        for (const p of l.plates.filter((q) => q.side === 'right')) expect(p.x + p.width).toBeLessThanOrEqual(end + 1e-6);
      }
    }
    // A run on a tall plate: the number on the face, "×3" under it.
    const p = lay('lb', [45, 45, 45]).plates[0]!;
    expect([p.face, p.badge]).toEqual(['45', '×3']);
    // A run on a short plate: one line.
    const q = lay('kg', [2.5, 2.5, 2.5], 288).plates[0]!;
    expect([q.face, q.badge, q.text]).toEqual(['3×2.5', null, '3×2.5']);
  });

  it('every number equals what is drawn: 205 lb and 102.5 kg on 320, 375 and 440', () => {
    // 320: 45, then the marker printing "25" over "10". 375 and 440: three squeezed fat plates.
    const l320 = lay('lb', [45, 25, 10], 288);
    expect(faces(l320)).toEqual(['45', 'then 25 · 10']);
    const m = l320.plates.find((p) => p.side === 'right' && p.more)!;
    expect(m.lines).toEqual(['25', '10']);
    expect(m.weights).toEqual([25, 10]);
    expect(l320.breakdown).toBeNull();
    for (const width of [343, 408]) {
      const l = lay('lb', [45, 25, 10], width);
      expect(faces(l)).toEqual(['45', '25', '10']);
      expect(Math.min(...l.plates.map((p) => p.width))).toBeGreaterThanOrEqual(MIN_PLATE);
    }
    expect(faces(lay('kg', [25, 15, 1.25], 288))).toEqual(['25', 'then 15 · 1.25']);
    expect(faces(lay('kg', [25, 15, 1.25], 343))).toEqual(['25', 'then 15 · 1.25']);
    expect(faces(lay('kg', [25, 15, 1.25], 408))).toEqual(['25', '15', '1.25']);
    expect(l320.shaft).toEqual(lay('lb', [], 288).shaft);
  });

  it('more than 3 runs on the marker: two lines and "+N", and a breakdown line names every plate', () => {
    const l = lay('lb', [45, 45, 35, 25, 10, 5, 2.5], 288);
    const m = l.plates.find((p) => p.side === 'right' && p.more)!;
    expect(m.lines).toEqual(['35', '25', '+3']);
    expect(l.breakdown).toBe('then 35 · 25 · 10 · 5 · 2.5');
    expect(covered(l, 'right')).toEqual([45, 45, 35, 25, 10, 5, 2.5]);
  });

  it('one badge rule: under TALL px "3×25" on one line, at TALL and up "25" with "×3" under it', () => {
    const short = lay('lb', [25, 25, 25], 288).plates[0]!;
    expect(short.height).toBeLessThan(TALL);
    expect([short.face, short.badge]).toEqual(['3×25', null]);
    expect(textWidth('3×25', FACE) + MIN_FACE_PAD).toBeLessThanOrEqual(short.width);
    const tall = lay('lb', [25, 25, 25], 343).plates[0]!;
    expect(tall.height).toBeGreaterThanOrEqual(TALL);
    expect([tall.face, tall.badge]).toEqual(['25', '×3']);
  });
});

describe('overflow (SPEC 5.3): never a shrunken shaft', () => {
  it('plates past the real sleeve end keep the shaft and scale and are counted', () => {
    const ok = lay('lb', Array(9).fill(45));
    const over = lay('lb', [...Array(9).fill(45), 10, 10]);
    expect(over.shaft).toEqual(ok.shaft);
    expect(over.scale).toBe(ok.scale);
    expect(over.height).toBe(ok.height);
    expect(ok.overflow).toBe(0);
    expect(faces(ok)).toEqual(['9×45']);
    expect(over.overflow).toBe(2);
    expect(faces(over)).toEqual(['9×45', 'then 2×10']);
    expect(over.plates.find((p) => p.more)!.lines).toEqual(['2×10']);
    expect(covered(over, 'right')).toEqual([...Array(9).fill(45), 10, 10]);
  });

  it("women's 320 mm sleeve holds five 25 kg plates exactly; the sixth overflows", () => {
    expect(lay('kg', Array(5).fill(25), 343, 'womens').overflow).toBe(0);
    const six = lay('kg', [...Array(6).fill(25), 5, 2.5], 343, 'womens');
    expect(six.overflow).toBe(3);
    expect(faces(six)).toEqual(['5×25', 'then 25 · 5 · 2.5']);
    expect(lay('kg', Array(6).fill(25)).overflow).toBe(0);
    expect(lay('kg', Array(7).fill(25)).overflow).toBe(1);
  });

  it('a mixed overfull sleeve folds into the marker as far as needed', () => {
    const l = lay('kg', [25, 25, 25, 25, 25, 20, 15, 10, 5], 288, 'womens');
    expect(l.overflow).toBeGreaterThan(0);
    expect(l.plates.filter((p) => p.side === 'right').length).toBeLessThanOrEqual(2);
    expect(covered(l, 'right')).toEqual([25, 25, 25, 25, 25, 20, 15, 10, 5]);
    // Not even one run fits beside the rest: one plate for everything.
    const tiny = barLayout({ unit: 'kg', perSide: Array(8).fill(25), width: 100, labelOf: formatAmount });
    expect(tiny.plates.filter((p) => p.side === 'right').map((p) => p.text)).toEqual(['then 8×25']);
  });

  it('runLabel', () => {
    expect(runLabel(1, '45')).toBe('45');
    expect(runLabel(3, '2.5')).toBe('3×2.5');
  });
});

describe('hornLayout', () => {
  const horn = (unit: 'lb' | 'kg', perSide: number[], width = 343) => hornLayout({ unit, perSide, width, labelOf: formatAmount });

  it('one horn = one Olympic sleeve at the same scale as the bar, the same fat numbered plates', () => {
    for (const width of PHONES) {
      const h = horn('lb', [25, 45], width);
      const b = lay('lb', [], width);
      expect(h.scale).toBe(b.scale);
      expect(h.height).toBe(b.height);
      expect(h.sleeves.right.width).toBeCloseTo(SLEEVE_LENGTH.lb * h.scale, 9);
      expect(h.sides).toEqual(['right']);
      expect(h.frame!.width).toBe(FRAME_WIDTH);
      expect(h.plates.map((p) => p.text)).toEqual(['45', '25']);
      expect(h.plates[0]!.x).toBeCloseTo(h.sleeves.right.x, 9);
      expect(h.plates[1]!.x).toBeCloseTo(h.plates[0]!.x + h.plates[0]!.width, 9);
      expect(h.plates[0]!.width).toBeGreaterThanOrEqual(plateWidth(width));
      expect(h.shoulders.right.x).toBeCloseTo(h.frame!.x + FRAME_WIDTH, 9);
      expect(h.caps.right.x).toBeCloseTo(h.sleeves.right.x + h.sleeves.right.width, 9);
      expect(h.sleeves.left.width).toBe(0);
      expect(h.shaft.width).toBe(0);
    }
  });

  it('a full horn groups, then shows the overflow', () => {
    expect(horn('lb', [45, 45, 45, 45]).plates.map((p) => p.text)).toEqual(['4×45']);
    const h = horn('kg', Array(8).fill(25));
    expect(h.overflow).toBe(2);
    expect(h.plates.map((p) => p.text)).toEqual(['6×25', 'then 2×25']);
    expect(horn('lb', []).plates).toEqual([]);
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
