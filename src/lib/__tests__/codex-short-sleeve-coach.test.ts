import { describe, expect, it } from 'vitest';
import { loadAt, scaledWeight, stepDown, stepUp, type LoadSetup } from '../load';

// SPEC 0/5.3/6; completed PLAN 2.0f/3.8. Unlike a numerical inventory
// gap alone, a short sleeve prevents adding enough small plates to bridge it.
const cases: { kind: 'barbell' | 'plate_machine'; setup: LoadSetup; totals: number[] }[] = [
  { kind: 'barbell', setup: {
    unit: 'lb', base: 35, plates: [25, 2.5], collars: 'none', sleeveLength: 1.82,
    dumbbellRange: null, stackStep: 5,
  }, totals: [35, 40, 85] },
  { kind: 'barbell', setup: {
    unit: 'kg', base: 15, plates: [25, 1.25], collars: 'competition', sleeveLength: 65,
    dumbbellRange: null, stackStep: 2.5,
  }, totals: [20, 22.5, 25, 27.5, 30, 70] },
  { kind: 'plate_machine', setup: {
    unit: 'kg', base: 25, plates: [25, 1.25], collars: 'competition', sleeveLength: 65,
    dumbbellRange: null, stackStep: 2.5,
  }, totals: [25, 27.5, 30, 32.5, 35, 75] },
];

describe('coach steps across a sleeve-limited inventory gap', () => {
  it('finds the next heavier physical loading, including a plate exchange, and stops at capacity', () => {
    for (const { kind, setup, totals } of cases) {
      const before = structuredClone(setup);
      for (const [i, value] of totals.entries()) {
        expect(loadAt(kind, value, setup)).not.toBeNull();
        expect(stepUp(kind, value, setup), `${kind} ${value} ${setup.unit}`).toBe(totals[i + 1] ?? null);
      }
      expect(setup).toEqual(before);
    }
  });

  // CODEX FOUND BUG: Short-sleeve inventory gaps make stepDown and lighter-week scaling return null despite an available lighter bar or machine load.
  // Real gap (Codex 1112-1717): queued as PLAN 3.6w part 5. Expected failure until that fix lands; then this
  // line turns red on its own and becomes a plain it().
  it.fails('finds a lighter loading for a deload even when the nominal decrement rounds back to the current load', () => {
    for (const { kind, setup, totals } of cases) {
      const heaviest = totals.at(-1)!;
      const lighter = totals.at(-2)!;
      // Totals are independently enumerated from the SPEC plate thicknesses:
      // lb: one 25 OR one 2.5; kg: one 25 OR up to four 1.25s.
      expect.soft(stepDown(kind, heaviest, setup), `${kind} ${setup.unit}: step down`).toBe(lighter);
      expect.soft(scaledWeight(kind, heaviest, 0.9, setup, true), `${kind} ${setup.unit}: lighter week`).toBe(lighter);
      const load = loadAt(kind, lighter, setup)!;
      expect(load.total).toBe(lighter);
      expect(load.collars).toBe(kind === 'barbell' && setup.unit === 'kg' ? 5 : 0);
    }
  });
});
