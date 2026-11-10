import { describe, expect, it } from 'vitest';
import { levelUpWeight, loadAt, type LevelUpRule } from '../load';
import { KG, LB } from './coach/fixtures';

// SPEC 0/5/6, completed PLAN 3.5c: the fixed examples use the standard
// 5 lb / 2.5 kg pins. Exercise fractional add-ons on user-configured steps too.
describe('coach raises on custom pin steps', () => {
  it('uses the actual resistance for the percentage, minimum and cap across custom steps and both units', () => {
    const rules: LevelUpRule[] = [
      { pct: 0.025, minAdd: 5, capPct: 0.05 },
      { pct: 0.1, minAdd: 0, capPct: 0.05 },
      { pct: 0, minAdd: 0, capPct: 0 },
    ];
    for (const base of [LB, KG]) for (const step of [1.25, 2.5, 5, 7.5, 10]) {
      const setup = { ...base, stackStep: step };
      for (const pin of [step * 4, step * 20, step * 40]) for (const added of [step / 4, step / 2, step * 2.25]) {
        for (const rule of rules) {
          const total = pin + added;
          const want = total + Math.max(total * rule.pct, rule.minAdd);
          const cap = total + Math.max(total * rule.capPct, rule.minAdd);
          // Independent oracle: enumerate the printed pin positions, allow the
          // first heavier pin even beyond the cap, then stop at the target/cap.
          const pins = Array.from({ length: 200 }, (_, i) => (i + 1) * step).filter((p) => p > total);
          const allowed = pins.filter((p, i) => i === 0 || p <= cap + 1e-9);
          const expected = allowed.find((p) => p >= want - 1e-9) ?? allowed.at(-1)!;
          const result = levelUpWeight('stack', pin, rule, setup, added);
          expect(result, JSON.stringify({ unit: base.unit, step, pin, added, rule })).toBe(expected);
          expect(loadAt('stack', result!, setup)).toMatchObject({ unit: base.unit, stackValue: expected, total: expected });
        }
      }
    }
  });
});
