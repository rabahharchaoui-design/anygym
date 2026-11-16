// PLAN 3.7a (1): a plate machine that can load on one side or both never shows or logs a total
// before the person answers. The plates put on are kept; once answered, load.ts totals them.
import { describe, expect, it } from 'vitest';
import { makeGym } from '../../../db/gyms';
import type { Gym, Load } from '../../../db/types';
import { formatPlatesOn } from '../../../lib/load';
import { confirmablePick, currentLoad, prefillLoad } from '../exerciseLoad';

const CALF = 'machine-seated-calf-raise';
const NAME = 'Machine Seated Calf Raise';
const SLED = 'leg-press-machine-calf-raise';
const base = (): Gym => makeGym({ name: 'G', type: 'full', unit: 'lb' }, 1);
const withStart = (g: Gym, value: number | null): Gym =>
  value === null ? g : { ...g, equipmentWeights: { ...g.equipmentWeights, [CALF]: { kind: 'starting_resistance', value } } };
const withSides = (g: Gym, h: 1 | 2): Gym => ({ ...g, machineHorns: { [CALF]: h } });
const both: Load = { kind: 'plate_machine', unit: 'lb', total: 140, barWeight: 50, perSide: [45], collars: 0 };

describe('sides not answered yet', () => {
  it('no total: the card and the rows have no load for any plates', () => {
    const g = withStart(base(), 50);
    expect(currentLoad(null, [45], 'plate_machine', g, CALF, NAME)).toBeNull();
    expect(currentLoad(both, [45], 'plate_machine', g, CALF, NAME)).toBeNull();
    expect(currentLoad(null, [], 'plate_machine', g, CALF, NAME)).toBeNull();
  });
  it('Done is held, with the start known or not: nothing is logged or kept on a guessed count', () => {
    for (const g of [withStart(base(), 50), withStart(base(), 0), base()]) {
      expect(confirmablePick({ load: null, plates: [45], unit: 'lb' }, 'plate_machine', g, CALF, NAME)).toBeNull();
    }
  });
  it('an earlier set is never carried over as a total on a guessed count', () => {
    expect(prefillLoad(both, 'plate_machine', withStart(base(), 50), CALF, NAME)).toBeNull();
  });
  it('a machine whose data is sure (a leg press sled: both) is not held', () => {
    const g = { ...base(), equipmentWeights: { [SLED]: { kind: 'starting_resistance' as const, value: 50 } } };
    expect(currentLoad(null, [45], 'plate_machine', g, SLED, 'Leg Press Machine Calf Raise')).toMatchObject({ total: 140 });
  });
});

describe('once answered, the same plates total as 3.6h2 says', () => {
  it('one side: start + plates; both: start + 2 × plates', () => {
    const g = withStart(base(), 50);
    expect(currentLoad(null, [45], 'plate_machine', withSides(g, 1), CALF, NAME)).toMatchObject({ total: 95, horns: 1 });
    expect(currentLoad(null, [45], 'plate_machine', withSides(g, 2), CALF, NAME)).toMatchObject({ total: 140 });
    expect(confirmablePick({ load: null, plates: [45], unit: 'lb' }, 'plate_machine', withSides(g, 1), CALF, NAME)?.load).toMatchObject({ total: 95 });
  });
  it('the start still unknown but the sides known: plates kept as before (load null)', () => {
    expect(confirmablePick({ load: null, plates: [45], unit: 'lb' }, 'plate_machine', withSides(base(), 1), CALF, NAME)).toEqual({ load: null, plates: [45], unit: 'lb' });
  });
});

describe('formatPlatesOn (what is sure: the plates put on)', () => {
  it('counts each size, heaviest first, in plain words', () => {
    expect(formatPlatesOn([45], 'lb')).toBe('1 × 45 lb plate');
    expect(formatPlatesOn([45, 45], 'lb')).toBe('2 × 45 lb plates');
    expect(formatPlatesOn([25, 45, 2.5], 'lb')).toBe('45 + 25 + 2.5 lb plates');
    expect(formatPlatesOn([20, 20, 1.25], 'kg')).toBe('2 × 20 + 1.25 kg plates');
    expect(formatPlatesOn([], 'kg')).toBe('No plates yet');
  });
});
