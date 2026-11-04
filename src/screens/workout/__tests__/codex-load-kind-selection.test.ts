import { describe, expect, it } from 'vitest';
import { makeGym } from '../../../db/gyms';
import type { Gym, Load } from '../../../db/types';
import { barbellLoad, plateMachineLoad, singleLoad } from '../../../lib/load';
import { confirmablePick, currentLoad } from '../exerciseLoad';

// Built PLAN 1.6, 1.7i, 2.0c: changing Loaded with requires a new selection
// (SPEC 0 and 20.2), rather than silently substituting the new equipment's base.
describe('selection identity when Loaded with changes', () => {
  // CODEX FOUND BUG: A held-weight selection becomes a confirmable bare bar after changing Loaded with to barbell.
  it('requires a new bar selection instead of turning a held weight into a bare Olympic or women’s bar', () => {
    for (const unit of ['lb', 'kg'] as const) {
      const gym = makeGym({ name: 'Synthetic gym', type: 'full', unit }, 1);
      const held = singleLoad(unit === 'lb' ? 60 : 24, unit);
      for (const bar of ['olympic', 'womens'] as const) {
        // Control: explicitly selected plates still use this bar's exact base.
        const plate = unit === 'lb' ? 10 : 5;
        const valid = barbellLoad(gym.bars[bar], [plate], 'none', unit, bar)!;
        expect(currentLoad(valid, [plate], 'barbell', gym, 'squat', 'Squat', bar)?.total)
          .toBe(gym.bars[bar]! + 2 * plate);
        expect.soft(currentLoad(held, [], 'barbell', gym, 'squat', 'Squat', bar)).toBeNull();
        expect.soft(confirmablePick({ load: held, plates: [], unit }, 'barbell', gym, 'squat', 'Squat', bar)).toBeNull();
      }
    }
  });

  // CODEX FOUND BUG: A selection from another load kind becomes a confirmable machine weight without reselection.
  it('requires a new machine selection instead of accepting another load kind and adding starting resistance', () => {
    for (const unit of ['lb', 'kg'] as const) {
      const base = unit === 'lb' ? 50 : 25;
      const plate = unit === 'lb' ? 10 : 5;
      const gym: Gym = { ...makeGym({ name: 'Synthetic machine', type: 'full', unit }, 1),
        collars: 'competition', equipmentWeights: { press: { kind: 'starting_resistance', value: base } } };
      const valid = plateMachineLoad(base, [plate], unit)!;
      expect(confirmablePick({ load: valid, plates: [plate], unit }, 'plate_machine', gym, 'press', 'Press')?.load?.total)
        .toBe(base + 2 * plate); // Starting resistance once, plates twice, no bar collars.
      const incompatible: Load[] = [singleLoad(plate, unit), barbellLoad(gym.bars.olympic, [plate], 'none', unit)!];
      for (const load of incompatible) {
        const plates = load.perSide ?? [];
        expect.soft(currentLoad(load, plates, 'plate_machine', gym, 'press', 'Press')).toBeNull();
        expect.soft(confirmablePick({ load, plates, unit }, 'plate_machine', gym, 'press', 'Press')).toBeNull();
      }
    }
  });
});
