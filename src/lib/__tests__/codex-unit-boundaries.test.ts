import { describe, expect, it } from 'vitest';
import { makeGym } from '../../db/gyms';
import type { Gym } from '../../db/types';
import { barbellLoad, bodyweightLoad, stackLoad } from '../load';
import { progress, type PastSession } from '../progression';
import { recordsFor } from '../records';
import { currentLoad, loadSetupFor } from '../../screens/workout/exerciseLoad';

// Built PLAN 1.4, 1.9, 1.7c, 1.10c: SPEC 0, 5.4 and 6 require literal units,
// complete resistance, and honest loadable suggestions rather than raw-number comparisons.
const gym = makeGym({ name: 'Synthetic kg', type: 'full', unit: 'kg' }, 0);

describe('unit boundaries in active weights and progression', () => {
  // CODEX FOUND BUG: Progression compares raw mixed-unit weights and suggests 60 kg after a 100 kg working set.
  it('uses the physically heaviest working barbell set from a mixed-unit session', () => {
    const pounds = barbellLoad(45, [45], 'none', 'lb')!; // 135 lb = about 61 kg
    const kilos = barbellLoad(20, [20, 20], 'none', 'kg')!; // 100 kg
    const history: PastSession[] = [{ date: 1000, gymId: gym.id, unit: 'lb', sets: [
      { kind: 'work', reps: 10, load: pounds },
      { kind: 'work', reps: 9, load: kilos },
    ] }];
    const before = structuredClone(history);
    const p = progress({ exerciseId: 'squat', loadKind: 'barbell', unit: 'kg', repRange: null,
      gym: loadSetupFor(gym, 'barbell', 'squat', 'Squat'), history });
    expect(p.next.load).toMatchObject({ kind: 'barbell', unit: 'kg', total: 100, barWeight: 20 });
    expect(p.perSet.map((r) => r.target.load?.total)).toEqual([100, 100]);
    expect(p.lastTime?.sets.map((s) => s.load)).toEqual([pounds, kilos]);
    expect(history).toEqual(before);
  });

  // CODEX FOUND BUG: Stack conversion drops the added 25 lb and suggests 45 kg instead of rounding 125 lb to 57.5 kg.
  it('converts the complete stack resistance including added weight before rounding to a kg pin', () => {
    const old = stackLoad(100, 'lb', 25); // 125 lb × 0.45359237 = 56.69904625 kg
    const p = progress({ exerciseId: 'cable-row', loadKind: 'stack', unit: 'kg', repRange: null,
      gym: loadSetupFor(gym, 'stack', 'cable-row', 'Cable Row'),
      history: [{ date: 1000, gymId: gym.id, unit: 'lb', sets: [{ kind: 'work', reps: 10, load: old }] }] });
    // Default 2.5 kg pins: 57.5 is nearer the complete resistance than 55.
    expect(p.next.load?.total).toBe(57.5);
    expect(p.next.load?.unit).toBe('kg');
    expect(p.perSet[0]?.target.load).toEqual(p.next.load);
    expect(p.lastTime?.sets[0]?.load).toEqual(old);
  });

  // CODEX FOUND BUG: Pending lb plates are reinterpreted as kg, creating unavailable plates and fabricated bar or machine totals.
  it('refuses pending lb plates when the active gym changes to kg, for bars and machine horns', () => {
    const bar = barbellLoad(45, [45], 'none', 'lb')!;
    const machine: Gym = { ...gym, equipmentWeights: { press: { kind: 'plates_only', value: 0 } } };
    // The lb plate size 45 is absent from the destination kg inventory. Reinterpreting
    // its number as kg would fabricate 110 kg on the Olympic bar or 90 kg on the machine.
    expect.soft(currentLoad(bar, [45], 'barbell', gym, 'squat', 'Squat')).toBeNull();
    expect.soft(currentLoad({ kind: 'plate_machine', unit: 'lb', total: 90, barWeight: 0, perSide: [45] },
      [45], 'plate_machine', machine, 'press', 'Press')).toBeNull();
  });

  // CODEX FOUND BUG: Changing units suppresses a bodyweight rep record even though the resistance is unchanged.
  it('recognizes a bodyweight rep record after changing units, without inventing a weight record', () => {
    const before = [{ kind: 'work' as const, reps: 10, load: bodyweightLoad('lb') }];
    const today = [{ kind: 'work' as const, reps: 12, load: bodyweightLoad('kg') }];
    expect(recordsFor('push-up', 'Push-up', today, before)).toEqual([
      { exerciseId: 'push-up', kind: 'most_reps', text: 'Push-up: most reps at bodyweight, 12' },
    ]);
    expect(recordsFor('push-up', 'Push-up', [{ ...today[0]!, reps: 10 }], before)).toEqual([]);
  });
});
