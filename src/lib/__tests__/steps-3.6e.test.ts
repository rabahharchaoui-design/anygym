// PLAN 3.6e (audit A6): one step up on a bar or plate machine is the nearest loadable total above,
// never a jump over a weight the gym can load (135 → 145 with 45s and 25s, not 155 or 185).
import { describe, expect, it } from 'vitest';
import { levelUpWeight, loadAt, stepDown, stepUp, type LoadSetup } from '../load';

const lb = (plates: number[], over: Partial<LoadSetup> = {}): LoadSetup => ({ unit: 'lb', base: 45, plates, collars: 'none', dumbbellRange: null, stackStep: 5, ...over });
const kg = (plates: number[], over: Partial<LoadSetup> = {}): LoadSetup => ({ unit: 'kg', base: 20, plates, collars: 'none', dumbbellRange: null, stackStep: 2.5, ...over });

describe('A6: no small plates', () => {
  it('135 lb goes to 145, the next total the gym can load', () => {
    expect(stepUp('barbell', 135, lb([45, 25, 10]))).toBe(145); // was 155
    expect(stepUp('barbell', 135, lb([45, 25]))).toBe(145); // was 185
    expect(stepUp('barbell', 135, lb([45, 35, 25]))).toBe(145); // was 185
    expect(stepUp('barbell', 135, lb([45, 10]))).toBe(145); // five 10s a side; was 155
    expect(stepUp('barbell', 60, kg([20, 10]))).toBe(80); // 20 + 2 × 20 → nothing between → 20 + 2 × 30
    expect(stepUp('barbell', 100, kg([20, 10]))).toBe(120);
  });
  it('the usual plates still step 5 lb / 2.5 kg', () => {
    expect(stepUp('barbell', 135, lb([45, 35, 25, 10, 5, 2.5]))).toBe(140);
    expect(stepUp('barbell', 135, lb([45, 35, 25, 10, 5, 2.5, 1.25]))).toBe(140);
    expect(stepUp('barbell', 60, kg([25, 20, 15, 10, 5, 2.5, 1.25]))).toBe(62.5);
    expect(stepUp('barbell', 60, kg([25, 20, 15, 10, 5, 2.5, 1.25, 0.5]))).toBe(62.5);
  });
  it('one step down is the mirror: 145 back to 135, not 95', () => {
    expect(stepDown('barbell', 145, lb([45, 25]))).toBe(135); // was 95
    expect(stepDown('barbell', 145, lb([45, 25, 10]))).toBe(135); // was 125
  });
  it('the coach raise walks the same steps', () => {
    expect(levelUpWeight('barbell', 135, { pct: 0.025, minAdd: 5, capPct: 0.05 }, lb([45, 25]))).toBe(145); // was 185
  });
});

// A small seeded generator: the same cases every run.
function rng(seed: number) {
  let x = seed;
  return () => {
    x = (x * 1664525 + 1013904223) % 4294967296;
    return x / 4294967296;
  };
}

describe('property: a step up is the smallest loadable increase of at least 5 lb / 2.5 kg', () => {
  const sizes = { lb: [45, 35, 25, 10, 5, 2.5, 1.25], kg: [25, 20, 15, 10, 5, 2.5, 1.25, 0.5] };
  const next = rng(36);
  for (let n = 0; n < 40; n++) {
    const unit = next() < 0.5 ? ('lb' as const) : ('kg' as const);
    const plates = sizes[unit].filter(() => next() < 0.5);
    if (!plates.length) plates.push(sizes[unit][0]!);
    const kind = next() < 0.7 ? ('barbell' as const) : ('plate_machine' as const);
    const horns = kind === 'plate_machine' && next() < 0.5 ? (1 as const) : undefined;
    const base = kind === 'barbell' ? (unit === 'lb' ? 45 : 20) : next() < 0.5 ? 0 : 10;
    const setup: LoadSetup = { unit, base, plates, collars: 'none', dumbbellRange: null, stackStep: 5, ...(horns ? { horns } : {}) };
    const min = unit === 'lb' ? 5 : 2.5;
    it(`${kind} ${unit} base ${base} plates ${plates.join('/')}${horns ? ' one horn' : ''}`, () => {
      // Every loadable total on a 0.25 grid, from the oracle that makes a real Load (loadAt).
      const totals: number[] = [];
      for (let i = 0; i <= 480; i++) {
        const v = base + i * 0.25;
        if (loadAt(kind, v, setup)) totals.push(v);
      }
      expect(totals.length).toBeGreaterThan(1);
      // The grid's last steps may have their next total beyond the grid: leave those out.
      for (const v of totals.filter((t) => t <= base + 60)) {
        const want = totals.find((t) => t >= v + min - 1e-9) ?? null;
        expect(stepUp(kind, v, setup), `from ${v}`).toBe(want);
      }
    });
  }
});
