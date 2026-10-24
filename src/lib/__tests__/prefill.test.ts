import { describe, expect, it } from 'vitest';
import { makeGym } from '../../db/gyms';
import type { Gym, Load } from '../../db/types';
import { currentLoad, prefillLoad } from '../../screens/workout/exerciseLoad';

const lbGym = (): Gym => makeGym({ name: 'Home', type: 'full', unit: 'lb' }, 0);

describe('prefillLoad (SPEC 13.5: a repeat set is one tap)', () => {
  it('rebuilds a barbell load on today\'s bar, so the total is right for this gym', () => {
    const gym = lbGym();
    const prev: Load = { kind: 'barbell', unit: 'lb', total: 185, barWeight: 45, perSide: [45, 25] };
    expect(prefillLoad(prev, 'barbell', gym, 'barbell-back-squat', 'Barbell Back Squat')).toEqual(prev);
    const womens = { ...gym, bars: { ...gym.bars, olympic: 35 } };
    expect(prefillLoad(prev, 'barbell', womens, 'barbell-back-squat', 'Barbell Back Squat')!.total).toBe(175);
  });

  it('gives up honestly instead of guessing', () => {
    const gym = lbGym();
    const bar: Load = { kind: 'barbell', unit: 'lb', total: 245, barWeight: 45, perSide: [100] };
    expect(prefillLoad(bar, 'barbell', gym, 'x', 'Bench')).toBeNull(); // 100 lb plates are off by default
    expect(prefillLoad({ ...bar, perSide: undefined }, 'barbell', gym, 'x', 'Bench')).toBeNull();
    expect(prefillLoad({ ...bar, unit: 'kg' }, 'barbell', gym, 'x', 'Bench')).toBeNull();
    expect(prefillLoad(bar, 'dumbbell_each', gym, 'x', 'Bench')).toBeNull();
    expect(prefillLoad(undefined, 'barbell', gym, 'x', 'Bench')).toBeNull();
    // Smith bar unknown at this gym: no total.
    expect(prefillLoad({ kind: 'barbell', unit: 'lb', total: 135, barWeight: 45, perSide: [45] }, 'barbell', gym, 'x', 'Smith Squat')).toBeNull();
  });

  it('plate loaded machines use this gym\'s starting resistance', () => {
    const gym = lbGym();
    const prev: Load = { kind: 'plate_machine', unit: 'lb', total: 90, barWeight: 0, perSide: [45] };
    expect(prefillLoad(prev, 'plate_machine', gym, 'leg-press', 'Leg Press')).toBeNull(); // not answered yet
    const answered = { ...gym, equipmentWeights: { 'leg-press': { kind: 'plates_only' as const, value: 0 } } };
    expect(prefillLoad(prev, 'plate_machine', answered, 'leg-press', 'Leg Press')).toEqual(prev);
    expect(prefillLoad({ ...prev, perSide: [100] }, 'plate_machine', answered, 'leg-press', 'Leg Press')).toBeNull();
  });

  it('dumbbells and single weights must be in the gym range', () => {
    const gym = lbGym();
    expect(prefillLoad({ kind: 'dumbbell_each', unit: 'lb', total: 60 }, 'dumbbell_each', gym, 'x', 'Curl')).toEqual({ kind: 'dumbbell_each', unit: 'lb', total: 60 });
    expect(prefillLoad({ kind: 'single', unit: 'lb', total: 35 }, 'single', gym, 'x', 'Goblet')).toEqual({ kind: 'single', unit: 'lb', total: 35 });
    expect(prefillLoad({ kind: 'single', unit: 'lb', total: 37 }, 'single', gym, 'x', 'Goblet')).toBeNull();
    expect(prefillLoad({ kind: 'single', unit: 'lb', total: 35 }, 'single', { ...gym, dumbbellRange: null }, 'x', 'Goblet')).toBeNull();
  });

  it('stack keeps the pin and added weight when the pin exists on this machine', () => {
    const gym = lbGym();
    const prev: Load = { kind: 'stack', unit: 'lb', total: 130, stackValue: 120, added: 10 };
    expect(prefillLoad(prev, 'stack', gym, 'lat-pulldown', 'Lat Pulldown')).toEqual(prev);
    expect(prefillLoad({ kind: 'stack', unit: 'lb', total: 120, stackValue: 120 }, 'stack', gym, 'x', 'Row')).toEqual({ kind: 'stack', unit: 'lb', total: 120, stackValue: 120 });
    expect(prefillLoad({ ...prev, stackValue: 122 }, 'stack', gym, 'x', 'Row')).toBeNull();
    expect(prefillLoad({ ...prev, stackValue: undefined }, 'stack', gym, 'x', 'Row')).toBeNull();
  });

  it('bodyweight keeps added weight; timed has no load', () => {
    const gym = lbGym();
    expect(prefillLoad({ kind: 'bodyweight', unit: 'lb', total: 25, added: 25 }, 'bodyweight', gym, 'x', 'Dip')).toEqual({ kind: 'bodyweight', unit: 'lb', total: 25, added: 25 });
    expect(prefillLoad({ kind: 'bodyweight', unit: 'lb', total: 0 }, 'bodyweight', gym, 'x', 'Dip')).toEqual({ kind: 'bodyweight', unit: 'lb', total: 0 });
    expect(prefillLoad({ kind: 'timed', unit: 'lb', total: 0 }, 'timed', gym, 'x', 'Plank')).toEqual({ kind: 'timed', unit: 'lb', total: 0 });
  });
});

describe('currentLoad (PLAN 1.10c fixes 4, 5, 11: one canonical load through load.ts)', () => {
  it('editing a machine starting resistance rebuilds the active load: 0 → 50 start with 45 per side is 140', () => {
    const gym = lbGym();
    const plates0 = { ...gym, equipmentWeights: { 'leg-press': { kind: 'plates_only' as const, value: 0 } } };
    const start50 = { ...gym, equipmentWeights: { 'leg-press': { kind: 'starting_resistance' as const, value: 50 } } };
    const picked: Load = { kind: 'plate_machine', unit: 'lb', total: 90, barWeight: 0, perSide: [45] };
    expect(currentLoad(picked, [45], 'plate_machine', plates0, 'leg-press', 'Leg Press')).toEqual(picked);
    expect(currentLoad(picked, [45], 'plate_machine', start50, 'leg-press', 'Leg Press')).toEqual({ kind: 'plate_machine', unit: 'lb', total: 140, barWeight: 50, perSide: [45] });
    // Not answered yet: no total, never a guess.
    expect(currentLoad(picked, [45], 'plate_machine', gym, 'leg-press', 'Leg Press')).toBeNull();
  });

  it('a bar weight edit rebuilds the barbell load; EZ bars stay unknown until answered', () => {
    const gym = lbGym();
    expect(currentLoad(null, [45], 'barbell', gym, 'barbell-back-squat', 'Barbell Back Squat')!.total).toBe(135);
    expect(currentLoad(null, [10], 'barbell', gym, 'ez-bar-curl', 'EZ Bar Curl')).toBeNull();
    const ez = { ...gym, bars: { ...gym.bars, ez_curl: 25 } };
    expect(currentLoad(null, [10], 'barbell', ez, 'ez-bar-curl', 'EZ Bar Curl')).toEqual({ kind: 'barbell', unit: 'lb', total: 45, barWeight: 25, perSide: [10] });
    const trap = { ...gym, bars: { ...gym.bars, trap: 55 } };
    expect(currentLoad(null, [45], 'barbell', trap, 'trap-bar-deadlift', 'Trap Bar Deadlift')!.total).toBe(145);
  });

  it('a stack step change drops a pin the new step lacks (15 lb on a 10 lb step), never rounds it', () => {
    const gym = lbGym();
    const pin15: Load = { kind: 'stack', unit: 'lb', total: 15, stackValue: 15 };
    expect(currentLoad(pin15, [], 'stack', gym, 'leg-press', 'Leg Press')).toEqual(pin15);
    const by10 = { ...gym, equipmentWeights: { 'leg-press': { kind: 'stack_step' as const, value: 10 } } };
    expect(currentLoad(pin15, [], 'stack', by10, 'leg-press', 'Leg Press')).toBeNull();
    expect(currentLoad({ kind: 'stack', unit: 'lb', total: 20, stackValue: 20 }, [], 'stack', by10, 'leg-press', 'Leg Press')!.total).toBe(20);
  });

  it('bodyweight keeps its added weight; timed is just the hold', () => {
    const gym = lbGym();
    expect(currentLoad({ kind: 'bodyweight', unit: 'lb', total: 25, added: 25 }, [], 'bodyweight', gym, 'x', 'Pull Up')).toEqual({ kind: 'bodyweight', unit: 'lb', total: 25, added: 25 });
    expect(currentLoad(null, [], 'bodyweight', gym, 'x', 'Pull Up')).toEqual({ kind: 'bodyweight', unit: 'lb', total: 0 });
    expect(currentLoad(null, [], 'timed', gym, 'x', 'Plank')).toEqual({ kind: 'timed', unit: 'lb', total: 0 });
    expect(currentLoad(null, [], 'dumbbell_each', gym, 'x', 'Curl')).toBeNull();
  });
});
