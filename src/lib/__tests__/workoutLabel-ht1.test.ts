// PLAN HT1: a Quick workout's History title from what was logged ("Quick · Back + Shoulders").
import { describe, expect, it } from 'vitest';
import type { LoggedSet } from '../recovery';
import type { Muscle } from '../order';
import { QUICK_FALLBACK, groupSets, quickLabel } from '../workoutLabel';

const work = (n: number, ...primary: Muscle[]): LoggedSet[] => Array.from({ length: n }, () => ({ kind: 'work', primary }));
const label = (...sets: LoggedSet[][]) => quickLabel({ sets: sets.flat() });

describe('HT1 quickLabel', () => {
  it('one group', () => {
    expect(label(work(4, 'chest'))).toBe('Quick · Chest');
  });
  it('two and three groups, most sets first (the Nov 27 back and shoulders day)', () => {
    expect(label(work(3, 'back'), work(3, 'side delts'), work(4, 'abs'))).toBe('Quick · Abs + Back + Shoulders');
    expect(label(work(6, 'back'), work(3, 'side delts'))).toBe('Quick · Back + Shoulders');
  });
  it('a tie goes to the group logged first', () => {
    expect(label(work(3, 'side delts'), work(3, 'back'))).toBe('Quick · Shoulders + Back');
    expect(label(work(3, 'back'), work(3, 'side delts'))).toBe('Quick · Back + Shoulders');
  });
  it('names at most three groups', () => {
    expect(label(work(5, 'quads'), work(4, 'chest'), work(2, 'back'), work(1, 'biceps'))).toBe('Quick · Legs + Chest + Back');
  });
  it('full body when 4 or more groups each have 3 or more sets', () => {
    expect(label(work(3, 'quads'), work(3, 'chest'), work(3, 'back'), work(3, 'front delts'))).toBe('Quick · Full body');
    // Four groups, but one has only 2 sets: named, not full body.
    expect(label(work(3, 'quads'), work(3, 'chest'), work(3, 'back'), work(2, 'front delts'))).toBe('Quick · Legs + Chest + Back');
  });
  it('warm ups and unsure sets never count; warm up only falls back to Quick workout', () => {
    expect(label([{ kind: 'warmup', primary: ['chest'] }, { kind: 'warmup', primary: ['chest'] }])).toBe(QUICK_FALLBACK);
    expect(label([{ kind: 'work', primary: ['chest'], uncertain: true }])).toBe(QUICK_FALLBACK);
    expect(label([{ kind: 'warmup', primary: ['back'] }], work(2, 'chest'))).toBe('Quick · Chest');
  });
  it('nothing logged, or nothing with a sure muscle: Quick workout', () => {
    expect(quickLabel({ sets: [] })).toBe(QUICK_FALLBACK);
    expect(label(work(3))).toBe(QUICK_FALLBACK);
  });
  it('a set with two primary groups counts once for each', () => {
    expect(groupSets({ sets: work(2, 'chest', 'triceps') })).toEqual([
      { group: 'chest', sets: 2 },
      { group: 'arms', sets: 2 },
    ]);
    expect(groupSets({ sets: work(2, 'biceps', 'forearms') })).toEqual([{ group: 'arms', sets: 2 }]);
  });
});
