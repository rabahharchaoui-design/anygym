import { describe, expect, it } from 'vitest';
import { solvePlates, type SolveOptions } from '../load';

// SPEC 0/5.4, completed PLAN 1.4/2.0f. Independent enumeration checks
// exact AND nearest answers when inventory gaps and a short sleeve interact.
// Literal thicknesses come from SPEC 5.3, not the production plate table.
const cases: { name: string; opts: SolveOptions; sizes: [number, number][]; base: number }[] = [
  { name: 'lb women’s bar with competition collars',
    opts: { unit: 'lb', bar: 35, collars: 'competition', inventory: [35, 25, 10], sleeveLength: 4, maxPerSide: 3 },
    sizes: [[35, 1.80], [25, 1.81], [10, 1.52]], base: 35 + 5 / 0.45359237 },
  { name: 'kg machine with starting resistance and sparse change plates',
    opts: { unit: 'kg', bar: 17.5, collars: 'none', inventory: [20, 15, 2], sleeveLength: 105, maxPerSide: 3 },
    sizes: [[20, 54], [15, 44], [2, 19]], base: 17.5 },
];

describe('sparse inventory solver against all physically possible stacks', () => {
  for (const { name, opts, sizes, base } of cases) {
    it(name, () => {
      const possible = new Set<number>();
      const enumerate = (side: number[], thickness: number) => {
        possible.add(base + 2 * side.reduce((a, b) => a + b, 0));
        if (side.length === 3) return;
        for (const [weight, width] of sizes) {
          if (thickness + width <= opts.sleeveLength! + 1e-9) enumerate([...side, weight], thickness + width);
        }
      };
      enumerate([], 0);
      const totals = [...possible].sort((a, b) => a - b);
      const targets = new Set([...totals, ...totals.map((t) => t - 0.25), ...totals.map((t) => t + 0.25)]);
      const unchanged = structuredClone(opts);
      for (const target of targets) {
        const result = solvePlates(target, opts);
        const exact = totals.some((t) => Math.abs(t - target) < 1e-7);
        expect(result.exact, `${target}: exactness`).toBe(exact);
        const check = (loading: { total: number; perSide: number[] }) => {
          expect(loading.total).toBeCloseTo(base + 2 * loading.perSide.reduce((a, b) => a + b, 0), 7);
          expect(loading.perSide.length).toBeLessThanOrEqual(3);
          expect(loading.perSide).toEqual([...loading.perSide].sort((a, b) => b - a));
          let width = 0;
          for (const w of loading.perSide) {
            expect(opts.inventory).toContain(w);
            width += sizes.find(([weight]) => weight === w)![1];
          }
          expect(width).toBeLessThanOrEqual(opts.sleeveLength! + 1e-9);
        };
        if (result.exact) check(result);
        else {
          const below = totals.filter((t) => t < target).at(-1);
          const above = totals.find((t) => t > target);
          if (below === undefined) expect(result.below).toBeUndefined();
          else {
            expect(result.below?.total).toBeCloseTo(below, 7);
            expect(result.diffBelow).toBeCloseTo(target - below, 7);
            check(result.below!);
          }
          if (above === undefined) expect(result.above).toBeUndefined();
          else {
            expect(result.above?.total).toBeCloseTo(above, 7);
            expect(result.diffAbove).toBeCloseTo(above - target, 7);
            check(result.above!);
          }
        }
      }
      expect(opts).toEqual(unchanged);
    });
  }
});
