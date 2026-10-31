import { describe, expect, it } from 'vitest';
import { solvePlates, sumLoad } from '../load';
import { barSpec, plateSpec, SLEEVE_LENGTH } from '../plates';
import { plateColor, sideChips } from '../plateColors';
import {
  BIG_MM,
  EDGE_PX,
  FRAME_MM,
  HORN_CLOSE,
  HORN_FIRST,
  HORN_FULL,
  MIN_HIT,
  PAD,
  PAD_Y,
  SMALL_MM,
  barLayout,
  barScale,
  drawingHeight,
  hornHeight,
  hornLayout,
  outermost,
  plateThickness,
  thinFor,
  withPlates,
  withoutOutermost,
  ZOOM_CLOSE,
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
    expect(hornLayout({ unit: 'lb', perSide: [45], width: 10 }).scale).toBeGreaterThanOrEqual(0);
    expect(hornLayout({ unit: 'lb', perSide: [45], width: 0 }).zoom).toBe(1);
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

  it('the empty bar is seen close (about 2.2×): the right sleeve big and whole, the bar runs off to the left', () => {
    for (const width of PHONES) {
      const l = lay('lb', [], width);
      expect(l.zoom).toBeCloseTo(ZOOM_CLOSE, 9);
      expect(l.cropped).toBe(true);
      const sx = (x: number) => l.cx + (x - l.cx) * l.zoom;
      // The right end stays in the drawing, the sleeve fills a good third of the width.
      const capEnd = sx(l.caps.right.x + l.caps.right.width);
      expect(capEnd).toBeLessThanOrEqual(width);
      expect(capEnd).toBeGreaterThan(width - 3 * PAD);
      expect((sx(l.sleeves.right.x + l.sleeves.right.width) - sx(l.sleeves.right.x)) / width).toBeGreaterThan(0.33);
      // The left end is past the edge (a photo's crop).
      expect(sx(l.caps.left.x)).toBeLessThan(0);
    }
  });

  it('from the first plate the camera is centred and BOTH outermost plates fit with a margin, for every load', () => {
    for (const [unit, sizes] of [['lb', LB], ['kg', KG]] as const) {
      for (const perSide of combos(sizes, 7)) {
        if (!perSide.length) continue;
        for (const width of [288, 343, 408, 428]) {
          const l = lay(unit, perSide, width);
          expect(l.cx).toBe(width / 2);
          expect(l.cropped).toBe(false);
          const sx = (x: number) => l.cx + (x - l.cx) * l.zoom;
          const r = drawn(l);
          const m = drawn(l, 'left');
          const outR = sx(r[r.length - 1]!.x + r[r.length - 1]!.width);
          const outL = sx(m[m.length - 1]!.x);
          // Inside the viewBox with a margin, and mirror images of each other.
          expect(outR).toBeLessThanOrEqual(width - Math.min(EDGE_PX, PAD) + 1e-6);
          expect(outL).toBeGreaterThanOrEqual(Math.min(EDGE_PX, PAD) - 1e-6);
          expect(outL).toBeCloseTo(width - outR, 6);
          for (const p of l.plates) expect(p.height * l.zoom).toBeLessThanOrEqual(l.height - 2 * PAD_Y + 1e-6);
        }
      }
    }
  });

  it('about 1.3× for one plate per side, easing to 1× at a full sleeve, monotonic from the first plate', () => {
    for (const width of [288, 343, 408]) {
      for (const unit of ['lb', 'kg'] as const) {
        const big = unit === 'lb' ? 45 : 20;
        const zs = [1, 2, 3, 4, 5, 6, 7].map((n) => lay(unit, Array(n).fill(big), width).zoom);
        expect(zs[0]).toBeGreaterThan(1.2);
        expect(zs[0]).toBeLessThan(1.4);
        expect(zs[6]).toBe(1);
        for (let i = 1; i < zs.length; i++) expect(zs[i]!).toBeLessThanOrEqual(zs[i - 1]! + 1e-12);
        // Every plate added from any load never zooms in.
        for (const perSide of combos(unit === 'lb' ? LB : KG, 4)) {
          if (!perSide.length) continue;
          const z = lay(unit, perSide, width).zoom;
          for (const w of unit === 'lb' ? LB : KG) expect(lay(unit, withPlates(perSide, w, 1), width).zoom).toBeLessThanOrEqual(z + 1e-12);
        }
      }
    }
  });

  it('a removal never zooms in: the held zoom stays, while every plate still fits', () => {
    const before = lay('lb', [45, 45, 45, 45]);
    const after = barLayout({ unit: 'lb', perSide: [45, 45, 45], width: 343, hold: before.zoom });
    expect(after.zoom).toBeCloseTo(before.zoom, 12);
    expect(lay('lb', [45, 45, 45]).zoom).toBeGreaterThan(before.zoom);
    // Emptied: the close up again; a held zoom never pushes below 1.
    expect(barLayout({ unit: 'lb', perSide: [], width: 343, hold: 1 }).zoom).toBe(ZOOM_CLOSE);
    expect(barLayout({ unit: 'lb', perSide: [45], width: 343, hold: 0.5 }).zoom).toBe(1);
  });

  it('a short drawing (maxHeight) pulls back sooner so the tallest plate always fits, still monotonic', () => {
    for (const width of PHONES) {
      for (const unit of ['lb', 'kg'] as const) {
        const natural = drawingHeight(width, unit);
        const height = drawingHeight(width, unit, natural * 0.8);
        expect(height).toBeCloseTo(natural * 0.8, 9);
        // Never shorter than the whole bar's view of a big plate.
        expect(drawingHeight(width, unit, 10)).toBeCloseTo(2 * PAD_Y + (unit === 'lb' ? 450 / 25.4 : 450) * barScale(width, unit), 6);
        let last = Infinity;
        for (const perSide of [[], [unit === 'lb' ? 2.5 : 1.25], [unit === 'lb' ? 45 : 20], [unit === 'lb' ? 45 : 20, unit === 'lb' ? 45 : 20]]) {
          const l = barLayout({ unit, perSide, width, maxHeight: natural * 0.8 });
          expect(l.height).toBeCloseTo(height, 9);
          for (const p of l.plates) expect(p.height * l.zoom).toBeLessThanOrEqual(l.height - 2 * PAD_Y + 1e-6);
          expect(l.zoom).toBeLessThanOrEqual(last + 1e-12);
          last = l.zoom;
        }
      }
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
      for (const perSide of [[], [2.5], [45], [45, 45, 45], [45, 45, 45, 45, 45, 45, 45]]) {
        const l = lay('lb', perSide, width);
        expect(l.hits.right!.width).toBeGreaterThanOrEqual(MIN_HIT);
        expect(l.hits.right!.x + l.hits.right!.width).toBe(width);
        expect(l.hits.right!.height).toBe(l.height);
        expect(l.hits.left!.x).toBe(0);
        expect(l.hits.left!.width).toBeGreaterThanOrEqual(MIN_HIT);
        expect(l.hits.left!.width).toBeLessThanOrEqual(l.hits.right!.x);
        // It covers every drawn plate on screen, both sides.
        for (const p of drawn(l)) expect(l.cx + (p.x - l.cx) * l.zoom).toBeGreaterThanOrEqual(l.hits.right!.x - 1e-6);
        for (const p of drawn(l, 'left')) {
          const right = l.cx + (p.x + p.width - l.cx) * l.zoom;
          if (right > 0) expect(right).toBeLessThanOrEqual(l.hits.left!.width + 1e-6);
        }
      }
    }
    // At the whole bar the two sides are mirror images.
    const full = lay('lb', Array(7).fill(45));
    expect(full.hits.left!.width).toBeCloseTo(full.hits.right!.width, 9);
  });

  it('colours per the table, and the drawn plates carry them', () => {
    const lb: Array<[number, string]> = [[55, 'red'], [45, 'blue'], [35, 'yellow'], [25, 'green'], [10, 'white'], [5, 'gray'], [2.5, 'graphite']];
    const kg: Array<[number, string]> = [[25, 'red'], [20, 'blue'], [15, 'yellow'], [10, 'green'], [5, 'white'], [2.5, 'black'], [1.25, 'chrome']];
    for (const [w, c] of lb) expect(plateColor(w, 'lb')).toBe(c);
    for (const [w, c] of kg) expect(plateColor(w, 'kg')).toBe(c);
    expect(drawn(lay('lb', [45, 35, 5, 2.5])).map((p) => p.color)).toEqual(['blue', 'yellow', 'gray', 'graphite']);
    expect(() => plateColor(3, 'kg')).toThrow();
  });

  it('the chips line is the side grouped by weight, heaviest first, with its colour', () => {
    expect(sideChips([2.5, 45, 10, 35, 45, 5, 35], 'lb')).toEqual([
      { weight: 45, count: 2, color: 'blue' },
      { weight: 35, count: 2, color: 'yellow' },
      { weight: 10, count: 1, color: 'white' },
      { weight: 5, count: 1, color: 'gray' },
      { weight: 2.5, count: 1, color: 'graphite' },
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

  it('one horn = one Olympic sleeve on a machine post, the same picture style, its own camera', () => {
    for (const width of PHONES) {
      const h = horn('lb', [25, 45], width);
      expect(h.sleeves.right.width).toBeCloseTo(SLEEVE_LENGTH.lb * h.scale, 9);
      expect(h.sides).toEqual(['right']);
      expect(h.frame!.width).toBeCloseTo((FRAME_MM / 25.4) * h.scale, 9);
      expect(h.plates.map((p) => p.weight)).toEqual([45, 25]);
      expect(h.plates.map((p) => p.color)).toEqual(['blue', 'green']);
      expect(h.plates[0]!.x).toBeCloseTo(h.sleeves.right.x, 9);
      expect(h.plates[1]!.x).toBeCloseTo(h.plates[0]!.x + h.plates[0]!.width, 9);
      expect(h.shoulders.right.x).toBeCloseTo(h.frame!.x + h.frame!.width, 9);
      expect(h.caps.right.x).toBeCloseTo(h.sleeves.right.x + h.sleeves.right.width, 9);
      expect(h.sleeves.left.width).toBe(0);
      expect(h.shaft.width).toBe(0);
      expect(h.hits.left).toBeUndefined();
      expect(h.hits.right!.width).toBeGreaterThanOrEqual(MIN_HIT);
      expect(h.height).toBe(hornHeight(width, 'lb'));
      // Every plate inside the drawing's height at its zoom.
      for (const p of h.plates) expect(p.height * h.zoom).toBeLessThanOrEqual(h.height - 2 * PAD_Y + 1e-6);
    }
  });

  it('horn camera: a close up when empty, HORN_FIRST with the first plate, easing to 1 at a full horn, no jump', () => {
    for (const width of PHONES) {
      for (const unit of ['lb', 'kg'] as const) {
        for (const maxHeight of [undefined, 120, 90]) {
          const at = (perSide: number[]) => hornLayout({ unit, perSide, width, maxHeight });
          const e = at([]);
          const sx = (x: number) => e.cx + (x - e.cx) * e.zoom;
          // The empty horn whole and big, at most HORN_CLOSE.
          expect(sx(e.frame!.x)).toBeGreaterThanOrEqual(0);
          expect(sx(e.caps.right.x + e.caps.right.width)).toBeLessThanOrEqual(width);
          expect(e.zoom).toBeLessThanOrEqual(HORN_CLOSE);
          // A full horn at zoom 1 is at most HORN_FULL of the width.
          const full = e.caps.right.x + e.caps.right.width - e.frame!.x;
          expect(full / width).toBeLessThanOrEqual(HORN_FULL + 1e-9);
          const big = unit === 'lb' ? 45 : 20;
          const zs = [1, 2, 3, 4, 5, 6].map((n) => at(Array(n).fill(big)).zoom);
          expect(zs[0]).toBeCloseTo(HORN_FIRST, 9);
          expect(zs[5]).toBe(1);
          const steps = zs.slice(1).map((z, i) => zs[i]! - z);
          // Even steps (no single jump) until full.
          for (const d of steps.slice(0, 4)) expect(d).toBeCloseTo(steps[0]!, 9);
          const sizes = unit === 'lb' ? LB : KG;
          for (const perSide of combos(sizes, 4)) {
            const l = at(perSide);
            for (const p of l.plates) expect(p.height * l.zoom).toBeLessThanOrEqual(l.height - 2 * PAD_Y + 1e-6);
            if (!perSide.length) continue;
            for (const w of sizes) expect(at(withPlates(perSide, w, 1)).zoom).toBeLessThanOrEqual(l.zoom + 1e-12);
          }
          expect(at(Array(8).fill(sizes[0])).zoom).toBe(1);
        }
      }
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
