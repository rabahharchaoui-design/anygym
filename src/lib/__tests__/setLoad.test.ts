import { describe, expect, it } from 'vitest';
import { barbellLoad, formatSetLine, machineBase, plateMachineLoad, sumLoad } from '../load';
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

describe('formatSetLine', () => {
  it('formats each load kind in plain words', () => {
    expect(formatSetLine({ reps: 10, load: { kind: 'barbell', unit: 'lb', total: 185 } })).toBe('10 × 185 lb');
    expect(formatSetLine({ reps: 5, load: { kind: 'barbell', unit: 'kg', total: 102.5 } })).toBe('5 × 102.5 kg');
    expect(formatSetLine({ reps: 12, load: { kind: 'dumbbell_each', unit: 'lb', total: 60 } })).toBe('12 × 30 lb each');
    expect(formatSetLine({ reps: 12, load: { kind: 'single', unit: 'kg', total: 24 } })).toBe('12 × 24 kg');
    expect(formatSetLine({ reps: 12, load: { kind: 'stack', unit: 'lb', total: 120, stackValue: 120 } })).toBe('12 × 120 lb');
    expect(formatSetLine({ reps: 8, load: { kind: 'bodyweight', unit: 'lb', total: 0 } })).toBe('8 reps');
    expect(formatSetLine({ reps: 8, load: { kind: 'bodyweight', unit: 'lb', total: 25, added: 25 } })).toBe('8 reps + 25 lb');
    expect(formatSetLine({ seconds: 45, load: { kind: 'timed', unit: 'lb', total: 0 } })).toBe('45 s');
    expect(formatSetLine({ load: { kind: 'timed', unit: 'lb', total: 0 } })).toBe('0 s');
    expect(formatSetLine({ seconds: 30 })).toBe('30 s');
    expect(formatSetLine({ reps: 6 })).toBe('6 reps');
    expect(formatSetLine({ load: { kind: 'stack', unit: 'lb', total: 50 } })).toBe('0 × 50 lb');
  });
});

describe('plate loaded machine lines show the real total (PLAN 2.0a, SPEC 5.4)', () => {
  it('start + 2 × plates per side, never one plate', () => {
    const legPress = plateMachineLoad(machineBase(50), [25], 'lb')!;
    expect(sumLoad({ bar: 50, perSide: [25], unit: 'lb' }).total).toBe(100);
    expect(legPress).toMatchObject({ kind: 'plate_machine', total: 100, barWeight: 50, perSide: [25] });
    // Finish screen and History detail.
    expect(formatSetLine({ reps: 8, load: legPress })).toBe('8 × 100 lb');
    // Saved row and LAST TIME cell on the exercise view.
    expect(savedCells({ reps: 8, load: legPress }, 'plate_machine', 'lb').weight).toBe('100');
    expect(lastTimeCell({ reps: 8, load: legPress, kind: 'work' } as never)).toBe('8 × 100');
    // Plates only: just the plates, both sides.
    expect(formatSetLine({ reps: 8, load: plateMachineLoad(0, [25], 'lb')! })).toBe('8 × 50 lb');
    expect(formatSetLine({ reps: 10, load: plateMachineLoad(40, [20, 10], 'kg')! })).toBe('10 × 100 kg');
    // An unknown starting weight is never a guessed load.
    expect(plateMachineLoad(machineBase(null), [25], 'lb')).toBeNull();
  });
});
