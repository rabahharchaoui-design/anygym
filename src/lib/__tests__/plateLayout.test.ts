import { describe, expect, it } from 'vitest';
import { solvePlates, sumLoad } from '../load';
import { barSpec, plateSpec, SLEEVE_LENGTH } from '../plates';
import { plateColor, sideChips } from '../plateColors';
import {
  BIG_MM,
  FRAME_WIDTH,
  MIN_HIT,
  PAD,
  PAD_Y,
  SMALL_MM,
  barLayout,
  barScale,
  drawingHeight,
  hornLayout,
  outermost,
  plateThickness,
  thinFor,
  withPlates,
  withoutOutermost,
  zoomFor,
  type BarLayout,
} from '../plateLayout';

// Card widths of the SPEC 13.4 phones (viewport minus the sheet's side padding): 320 floor, SE, 15, Pro Max.
const PHONES = [288, 343, 361, 408];
const lay = (unit: 'lb' | 'kg', perSide: number[], width = 343, bar: 'olympic' | 'womens' = 'olympic') => barLayout({ unit, perSide, width, bar });

/** One side's drawn plates, innermost first. */
const drawn = (l: BarLayout, side: 'left' | 'right' = 'right') => l.plates.filter((p) => p.side === side);

const LB = [45, 35, 25, 10, 5, 2.5];
const KG = [25, 20, 15, 10, 5, 2.5, 1.25];

/** Every multiset of up to `max` plates from `sizes`, heaviest first. */
function combos(sizes: readonly number[], max: number): number[][] {
  const out: number[][] = [[]];
  const walk = (from: number, acc: number[]) => {
    if (acc.length === max) return;
    for (let i = from; i < sizes.length; i++) {
      const next = [...acc, sizes[i]!];
      out.push(next);
      walk(i, next);
    }
  };
  walk(0, []);
  return out;
}

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
    // Diameters at the bar's scale; thickness is the one exception (stylized, consistent).
    for (const p of l.plates) {
      expect(p.height).toBeCloseTo(plateSpec(p.weight, 'kg').diameter * l.scale, 9);
      expect(p.width).toBeCloseTo(plateThickness(p.weight, 'kg') * l.scale, 9);
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

  it('at zoom 1 the whole bar fills the width with side margins, mirrored about the centre', () => {
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

  it('scale and height come from the width alone (only the camera zoom follows the plates)', () => {
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
    expect(lay('lb', []).height).toBeCloseTo(drawingHeight(343, 'lb'), 9);
  });

  it('reserves the biggest plate at its closest zoom: one 450 mm plate fills the height exactly', () => {
    for (const width of PHONES) {
      for (const unit of ['lb', 'kg'] as const) {
        const l = lay(unit, [unit === 'lb' ? 45 : 25], width);
        const p = l.plates[0]!;
        // On screen (after the zoom about cy) the plate spans PAD_Y to height - PAD_Y.
        expect(l.cy + (p.y - l.cy) * l.zoom).toBeCloseTo(PAD_Y, 6);
        expect(l.cy + (p.y + p.height - l.cy) * l.zoom).toBeCloseTo(l.height - PAD_Y, 6);
        // Any heavier load is further away: never taller than the drawing.
        for (const perSide of [[45, 45], [45, 35, 25, 10, 5, 2.5], [5], [2.5], []]) {
          const m = lay(unit, unit === 'lb' ? perSide : perSide.map(() => 20), width);
          for (const q of m.plates) expect(q.height * m.zoom).toBeLessThanOrEqual(l.height - 2 * PAD_Y + 1e-6);
        }
      }
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
    expect(hornLayout({ unit: 'lb', perSide: [45], width: 10 }).scale).toBe(0);
  });
});

describe('picture first (PLAN 2.0d): every plate drawn, the camera zooms out', () => {
  it('every plate is drawn on both sides for every combination of up to 7 plates (lb and kg), never grouped', () => {
    for (const [unit, sizes] of [['lb', LB], ['kg', KG]] as const) {
      for (const perSide of combos(sizes, 7)) {
        for (const width of [288, 343, 408]) {
          const l = lay(unit, perSide, width);
          expect(drawn(l, 'right').map((p) => p.weight)).toEqual(perSide);
          expect(drawn(l, 'left').map((p) => p.weight)).toEqual(perSide);
          // Touching, inside the drawn sleeve, never past its end.
          const r = drawn(l);
          r.forEach((p, i) => {
            expect(p.x).toBeCloseTo(i === 0 ? l.sleeves.right.x : r[i - 1]!.x + r[i - 1]!.width, 6);
            expect(p.width).toBeGreaterThan(0);
          });
          if (r.length) expect(r[r.length - 1]!.x + r[r.length - 1]!.width).toBeLessThanOrEqual(l.sleeves.right.x + l.sleeves.right.width + 1e-6);
        }
      }
    }
  });

  it('the zoom never grows as a plate is added (monotonic), from a close empty bar down to the whole bar (1)', () => {
    for (const [unit, sizes] of [['lb', LB], ['kg', KG]] as const) {
      for (const perSide of combos(sizes, 6)) {
        const z = zoomFor(perSide, unit);
        expect(z).toBeGreaterThanOrEqual(1);
        for (const w of sizes) expect(zoomFor(withPlates(perSide, w, 1), unit)).toBeLessThanOrEqual(z + 1e-12);
      }
      expect(zoomFor([], unit)).toBeGreaterThan(zoomFor([sizes[0]!], unit));
      expect(zoomFor(Array(7).fill(sizes[0]), unit)).toBe(1);
    }
  });

  it('the empty bar fills the width: zoomed in, the sleeves run on past the edges', () => {
    for (const width of PHONES) {
      const l = lay('lb', [], width);
      expect(l.zoom).toBeGreaterThan(1.2);
      expect(l.cropped).toBe(true);
      const screenCap = l.cx + (l.caps.right.x + l.caps.right.width - l.cx) * l.zoom;
      expect(screenCap).toBeGreaterThan(width);
      // The shaft and collars stay in view.
      expect(l.cx + (l.shoulders.right.x + l.shoulders.right.width - l.cx) * l.zoom).toBeLessThan(width - PAD);
    }
  });

  it('320 px floor at 700 lb (7 × 45, 10 and 2.5 each side) and 7 × 45 + 2 × 2.5: whole bar, thinner plates, all drawn', () => {
    const r = solvePlates(700, { bar: 45, inventory: LB, collars: 'none', unit: 'lb' });
    expect(r.exact).toBe(true);
    if (!r.exact) return;
    for (const perSide of [r.perSide, [45, 45, 45, 45, 45, 45, 45, 2.5, 2.5]]) {
      for (const width of [320, 288]) {
        const l = lay('lb', perSide, width);
        expect(l.zoom).toBe(1);
        expect(l.thin).toBeLessThan(1);
        expect(drawn(l).length).toBe(perSide.length);
        expect(drawn(l, 'left').length).toBe(perSide.length);
        const last = drawn(l)[perSide.length - 1]!;
        expect(last.x + last.width).toBeCloseTo(l.sleeves.right.x + l.sleeves.right.width, 6);
        // Still a visible plate each: at least 2.5 px on the narrowest card.
        for (const p of drawn(l)) expect(p.width).toBeGreaterThan(2.5);
      }
    }
    // 7 × 25 kg is past the real sleeve (capacity says no), but the drawing still shows all seven.
    const k = lay('kg', Array(7).fill(25), 288);
    expect(drawn(k).length).toBe(7);
    expect(k.zoom).toBe(1);
  });

  it('shaft ÷ sleeve stays within 5% of 1310/415 at every zoom (the whole scene scales as one)', () => {
    for (const [unit, sizes] of [['lb', LB], ['kg', KG]] as const) {
      for (const perSide of combos(sizes, 4)) {
        const l = lay(unit, perSide, 320);
        const ratio = (l.shaft.width * l.zoom) / (l.sleeves.right.width * l.zoom);
        expect(Math.abs(ratio / (1310 / 415) - 1)).toBeLessThan(0.05);
      }
    }
  });

  it('stylized thickness: one size for the big plates, thinner for 5 and under', () => {
    expect(plateThickness(45, 'lb')).toBeCloseTo(BIG_MM / 25.4, 9);
    expect(plateThickness(10, 'lb')).toBe(plateThickness(55, 'lb'));
    expect(plateThickness(5, 'lb')).toBeCloseTo(SMALL_MM / 25.4, 9);
    expect(plateThickness(2.5, 'lb')).toBe(plateThickness(5, 'lb'));
    expect(plateThickness(25, 'kg')).toBe(BIG_MM);
    expect(plateThickness(5, 'kg')).toBe(SMALL_MM);
    expect(SMALL_MM).toBeLessThan(BIG_MM);
    expect(() => plateThickness(7, 'lb')).toThrow();
    expect(thinFor([45, 45], 'lb')).toBe(1);
  });

  it('each side is a big tap target from the sleeve out, at least 48 px, at every zoom', () => {
    for (const width of PHONES) {
      for (const perSide of [[2.5], [45], [45, 45, 45], [45, 45, 45, 45, 45, 45, 45]]) {
        const l = lay('lb', perSide, width);
        expect(l.hits.right!.width).toBeGreaterThanOrEqual(MIN_HIT);
        expect(l.hits.right!.x + l.hits.right!.width).toBe(width);
        expect(l.hits.right!.height).toBe(l.height);
        expect(l.hits.left!.x).toBe(0);
        expect(l.hits.left!.width).toBeCloseTo(l.hits.right!.width, 9);
        // It covers every drawn plate on screen.
        for (const p of drawn(l)) expect(l.cx + (p.x - l.cx) * l.zoom).toBeGreaterThanOrEqual(l.hits.right!.x - 1e-6);
      }
    }
  });

  it('colours per the table, and the drawn plates carry them', () => {
    const lb: Array<[number, string]> = [[55, 'red'], [45, 'blue'], [35, 'yellow'], [25, 'green'], [10, 'white'], [5, 'gray'], [2.5, 'gray']];
    const kg: Array<[number, string]> = [[25, 'red'], [20, 'blue'], [15, 'yellow'], [10, 'green'], [5, 'white'], [2.5, 'black'], [1.25, 'chrome']];
    for (const [w, c] of lb) expect(plateColor(w, 'lb')).toBe(c);
    for (const [w, c] of kg) expect(plateColor(w, 'kg')).toBe(c);
    expect(drawn(lay('lb', [45, 35, 2.5])).map((p) => p.color)).toEqual(['blue', 'yellow', 'gray']);
    expect(() => plateColor(3, 'kg')).toThrow();
  });

  it('the chips line is the side grouped by weight, heaviest first, with its colour', () => {
    expect(sideChips([2.5, 45, 10, 35, 45, 5, 35], 'lb')).toEqual([
      { weight: 45, count: 2, color: 'blue' },
      { weight: 35, count: 2, color: 'yellow' },
      { weight: 10, count: 1, color: 'white' },
      { weight: 5, count: 1, color: 'gray' },
      { weight: 2.5, count: 1, color: 'gray' },
    ]);
    expect(sideChips([], 'kg')).toEqual([]);
    for (const [unit, sizes] of [['lb', LB], ['kg', KG]] as const) {
      for (const perSide of combos(sizes, 5)) {
        const chips = sideChips(perSide, unit);
        // The chips stand for exactly the drawn multiset.
        expect(chips.flatMap((c) => Array<number>(c.count).fill(c.weight))).toEqual(perSide);
        expect(chips.map((c) => c.weight)).toEqual([...new Set(perSide)]);
      }
    }
  });

  it('SPEC 5.4 unchanged: sumLoad of what is drawn equals the solver total (45 to 700 lb, 60 to 220 kg)', () => {
    const cases: Array<['lb' | 'kg', number, number, number[]]> = [
      ...[45, 135, 225, 315, 400, 495, 700].map((t) => ['lb', t, 45, LB] as ['lb', number, number, number[]]),
      ...[60, 100, 140, 220].map((t) => ['kg', t, 20, KG] as ['kg', number, number, number[]]),
    ];
    for (const [unit, target, bar, inventory] of cases) {
      const r = solvePlates(target, { bar, inventory, collars: 'none', unit });
      expect(r.exact, `${target} ${unit}`).toBe(true);
      if (!r.exact) continue;
      for (const width of [288, 408]) {
        const l = lay(unit, r.perSide, width);
        const right = drawn(l).map((p) => p.weight);
        expect(right).toEqual(r.perSide);
        expect(sumLoad({ bar, perSide: right, collars: 'none', unit }).total).toBe(target);
      }
    }
  });
});

describe('hornLayout', () => {
  const horn = (unit: 'lb' | 'kg', perSide: number[], width = 343) => hornLayout({ unit, perSide, width });

  it('one horn = one Olympic sleeve at the same scale, height and zoom as the bar, the same picture style', () => {
    for (const width of PHONES) {
      const h = horn('lb', [25, 45], width);
      const b = lay('lb', [25, 45], width);
      expect(h.scale).toBe(b.scale);
      expect(h.height).toBe(b.height);
      expect(h.zoom).toBe(b.zoom);
      expect(h.sleeves.right.width).toBeCloseTo(SLEEVE_LENGTH.lb * h.scale, 9);
      expect(h.sides).toEqual(['right']);
      expect(h.frame!.width).toBe(FRAME_WIDTH);
      expect(h.plates.map((p) => p.weight)).toEqual([45, 25]);
      expect(h.plates.map((p) => p.color)).toEqual(['blue', 'green']);
      expect(h.plates[0]!.x).toBeCloseTo(h.sleeves.right.x, 9);
      expect(h.plates[1]!.x).toBeCloseTo(h.plates[0]!.x + h.plates[0]!.width, 9);
      expect(h.shoulders.right.x).toBeCloseTo(h.frame!.x + FRAME_WIDTH, 9);
      expect(h.caps.right.x).toBeCloseTo(h.sleeves.right.x + h.sleeves.right.width, 9);
      expect(h.sleeves.left.width).toBe(0);
      expect(h.shaft.width).toBe(0);
      expect(h.hits.left).toBeUndefined();
      expect(h.hits.right!.width).toBeGreaterThanOrEqual(MIN_HIT);
      // The whole horn stays in view, even zoomed in.
      expect(h.cx + (h.frame!.x - h.cx) * h.zoom).toBeGreaterThanOrEqual(0);
      expect(h.cx + (h.caps.right.x + h.caps.right.width - h.cx) * h.zoom).toBeLessThanOrEqual(width);
    }
  });

  it('a full horn draws every plate, thinner, never grouped', () => {
    const h = horn('kg', Array(8).fill(25));
    expect(h.plates.length).toBe(8);
    expect(h.thin).toBeLessThan(1);
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
