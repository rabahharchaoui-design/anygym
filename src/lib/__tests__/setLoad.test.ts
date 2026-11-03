import { describe, expect, it } from 'vitest';
import { barbellLoad, machineBase, plateMachineLoad, sumLoad } from '../load';
import { formatSet } from '../setWords';
import { lastTimeCell, savedCells } from '../setTable';

describe('barbellLoad', () => {
  it('bar + 2 × plates + collars, stored with its breakdown', () => {
    expect(barbellLoad(45, [45, 25], 'none', 'lb')).toEqual({ kind: 'barbell', unit: 'lb', total: 185, barWeight: 45, perSide: [45, 25], collars: 0 });
    expect(barbellLoad(20, [20, 5], 'competition', 'kg')!.total).toBe(75);
    expect(barbellLoad(45, [], 'none', 'lb')!.total).toBe(45);
  });
  it('is null while the bar is unknown (never a guess)', () => {
    expect(barbellLoad(null, [45], 'none', 'lb')).toBeNull();
  });
  it('copies the plates', () => {
    const plates = [45];
    const load = barbellLoad(45, plates, 'none', 'lb')!;
    plates.push(10);
    expect(load.perSide).toEqual([45]);
  });
});

describe('formatSet', () => {
  it('formats each load kind in plain words', () => {
    expect(formatSet({ reps: 10, load: { kind: 'barbell', unit: 'lb', total: 185 } })).toBe('185 lb × 10');
    expect(formatSet({ reps: 5, load: { kind: 'barbell', unit: 'kg', total: 102.5 } })).toBe('102.5 kg × 5');
    expect(formatSet({ reps: 12, load: { kind: 'dumbbell_each', unit: 'lb', total: 60 } })).toBe('30 lb each × 12');
    expect(formatSet({ reps: 12, load: { kind: 'single', unit: 'kg', total: 24 } })).toBe('24 kg × 12');
    expect(formatSet({ reps: 12, load: { kind: 'stack', unit: 'lb', total: 120, stackValue: 120 } })).toBe('120 lb × 12');
    expect(formatSet({ reps: 8, load: { kind: 'bodyweight', unit: 'lb', total: 0 } })).toBe('8 reps');
    expect(formatSet({ reps: 8, load: { kind: 'bodyweight', unit: 'lb', total: 25, added: 25 } })).toBe('+25 lb × 8');
    expect(formatSet({ seconds: 45, load: { kind: 'timed', unit: 'lb', total: 0 } })).toBe('45 s');
    expect(formatSet({ load: { kind: 'timed', unit: 'lb', total: 0 } })).toBe('0 s');
    expect(formatSet({ seconds: 30 })).toBe('30 s');
    expect(formatSet({ reps: 6 })).toBe('6 reps');
    expect(formatSet({ load: { kind: 'stack', unit: 'lb', total: 50 } })).toBe('50 lb × 0');
  });
});

describe('plate loaded machine lines show the real total (PLAN 2.0a, SPEC 5.4)', () => {
  it('start + 2 × plates per side, never one plate', () => {
    const legPress = plateMachineLoad(machineBase(50), [25], 'lb')!;
    expect(sumLoad({ bar: 50, perSide: [25], unit: 'lb' }).total).toBe(100);
    expect(legPress).toMatchObject({ kind: 'plate_machine', total: 100, barWeight: 50, perSide: [25] });
    // Finish screen and History detail.
    expect(formatSet({ reps: 8, load: legPress })).toBe('100 lb × 8');
    // Saved row and LAST TIME cell on the exercise view.
    expect(savedCells({ reps: 8, load: legPress }, 'plate_machine', 'lb').weight).toBe('100');
    expect(lastTimeCell({ reps: 8, load: legPress, kind: 'work' } as never)).toBe('100 × 8');
    // Plates only: just the plates, both sides.
    expect(formatSet({ reps: 8, load: plateMachineLoad(0, [25], 'lb')! })).toBe('50 lb × 8');
    expect(formatSet({ reps: 10, load: plateMachineLoad(40, [20, 10], 'kg')! })).toBe('100 kg × 10');
    // An unknown starting weight is never a guessed load.
    expect(plateMachineLoad(machineBase(null), [25], 'lb')).toBeNull();
  });
});
