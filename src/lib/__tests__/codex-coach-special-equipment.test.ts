import { describe, expect, it } from 'vitest';
import { loadAt, warmUpLadder, type LoadSetup } from '../load';

const kg: LoadSetup = {
  unit: 'kg', base: 15, plates: [25, 20, 15, 10, 5, 2.5, 1.25],
  collars: 'competition', sleeveLength: 320, dumbbellRange: null, stackStep: 2.5,
};

describe('coach warm ups on nonstandard equipment (SPEC 0, 5, 15; PLAN 3.8)', () => {
  // CODEX FOUND BUG: The coach suggests an unloadable 15 kg empty-bar warm up when the women's bar has 5 kg competition collars.
  it('counts competition collars on the empty women’s bar so every warm up can actually be logged', () => {
    const ladder = warmUpLadder('barbell', 100, kg);
    expect(ladder).toHaveLength(3);
    for (const step of ladder) {
      const load = loadAt('barbell', step.value, kg);
      expect(load, `unloadable warm up: ${step.value} kg`).not.toBeNull();
      expect(load!.total).toBe(15 + 5 + 2 * load!.perSide!.reduce((a, b) => a + b, 0));
    }
    expect(ladder[0]).toEqual({ value: 20, reps: 10 });
  });

  it('uses each machine’s starting resistance and both horns, without inheriting competition collars', () => {
    for (const base of [0, 25, 70]) {
      const setup: LoadSetup = { ...kg, base, plates: [20, 5, 1.25] };
      const before = structuredClone(setup);
      const ladder = warmUpLadder('plate_machine', 150, setup);
      expect(ladder.length).toBeGreaterThan(0);
      let previous = -1;
      for (const step of ladder) {
        const load = loadAt('plate_machine', step.value, setup);
        expect(load).not.toBeNull();
        expect(load!.collars).toBe(0);
        expect(load!.total).toBe(base + 2 * load!.perSide!.reduce((a, b) => a + b, 0));
        expect(step.value).toBeGreaterThan(previous);
        expect(step.value).toBeLessThan(150);
        previous = step.value;
      }
      expect(setup).toEqual(before);
    }
  });
});
