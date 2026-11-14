import { expect, it } from 'vitest';
import { solvePlates, type SolveOptions } from '../load';

// SPEC 0/5.3/5.4; completed PLAN 1.4/2.0f. Unlike the single-setup
// oracle tests, alternate identical plate numbers across units, capacity limits,
// bars, collars and machine bases, then revisit them in reverse order.
it('cached plate solutions stay exact and physically loadable when equipment settings alternate', () => {
  const cases: Array<{ opts: SolveOptions; widths: number[]; base: number }> = [
    { opts: { unit: 'lb', inventory: [25, 10, 5], bar: 35, sleeveLength: 3.4, maxPerSide: 2 }, widths: [1.81, 1.52, 1.05], base: 35 },
    { opts: { unit: 'kg', inventory: [25, 10, 5], bar: 15, collars: 'competition', sleeveLength: 64, maxPerSide: 2 }, widths: [64, 32, 26], base: 20 },
    { opts: { unit: 'kg', inventory: [25, 10, 5], bar: 27.5, sleeveLength: 64, maxPerSide: 1 }, widths: [64, 32, 26], base: 27.5 },
    { opts: { unit: 'kg', inventory: [25, 10, 5], bar: 0, sleeveLength: 64, maxPerSide: 2 }, widths: [64, 32, 26], base: 0 },
    { opts: { unit: 'lb', inventory: [25, 10, 5], bar: 45, collars: 'competition', sleeveLength: 3.4, maxPerSide: 2 }, widths: [1.81, 1.52, 1.05], base: 45 + 5 / 0.45359237 },
  ];
  for (const { opts, widths, base } of [...cases, ...[...cases].reverse()]) {
    const totals = new Set<number>();
    const enumerate = (side: number, width: number, count: number) => {
      totals.add(base + side * 2);
      if (count === opts.maxPerSide) return;
      opts.inventory.forEach((w, i) => {
        if (width + widths[i]! <= opts.sleeveLength! + 1e-9) enumerate(side + w, width + widths[i]!, count + 1);
      });
    };
    enumerate(0, 0, 0);
    const possible = [...totals].sort((a, b) => a - b);
    const before = structuredClone(opts);
    for (const delta of [-1, 0, 9, 10, 15, 20, 30, 40, 50, 60, 100]) {
      const target = base + delta;
      const result = solvePlates(target, opts);
      const exact = possible.find((v) => Math.abs(v - target) < 1e-7);
      expect(result.exact, JSON.stringify({ target, opts })).toBe(exact !== undefined);
      const check = (answer: { total: number; perSide: number[] }) => {
        expect(answer.total).toBeCloseTo(base + 2 * answer.perSide.reduce((a, b) => a + b, 0), 7);
        expect(answer.perSide.length).toBeLessThanOrEqual(opts.maxPerSide!);
        expect(answer.perSide.reduce((n, w) => n + widths[opts.inventory.indexOf(w)]!, 0)).toBeLessThanOrEqual(opts.sleeveLength! + 1e-9);
        for (const w of answer.perSide) expect(opts.inventory).toContain(w);
      };
      if (result.exact) { expect(result.total).toBeCloseTo(target, 7); check(result); }
      else {
        const below = possible.filter((v) => v < target).at(-1);
        const above = possible.find((v) => v > target);
        if (below === undefined) expect(result.below).toBeUndefined();
        else expect(result.below?.total).toBeCloseTo(below, 7);
        if (above === undefined) expect(result.above).toBeUndefined();
        else expect(result.above?.total).toBeCloseTo(above, 7);
        if (result.below) { check(result.below); expect(result.diffBelow).toBeCloseTo(target - below!, 7); }
        if (result.above) { check(result.above); expect(result.diffAbove).toBeCloseTo(above! - target, 7); }
      }
    }
    expect(opts).toEqual(before);
  }
});
