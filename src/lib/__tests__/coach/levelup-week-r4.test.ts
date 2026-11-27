// PLAN R4 (1), (5): the Level up line speaks for the whole week, never for the latest workout only.
// "You hit N × R" only when every workout that week logged that scheme at one weight; "two weeks in a
// row" only across the same set count and whole weight; "with reps to spare" only with Easy in both.
import { describe, expect, it } from 'vitest';
import { weeklyLevelUp } from '../../coach';
import { NOW, bar, lift, nov, sess } from './fixtures';

const reason = (l: ReturnType<typeof lift>) => weeklyLevelUp([l], [], NOW)?.earned[0]?.reason;

describe('Level up reads every workout of the week (R4 1)', () => {
  it('every workout at the top at one weight: the line', () => {
    const l = lift({ sessions: [sess(nov(6), [12, 12, 12], bar(200)), sess(nov(3), [12, 12, 12], bar(200))] });
    expect(reason(l)).toBe('+10 lb: you hit 3 × 12 last week');
  });
  it('an earlier workout below the top: holding steady, no raise', () => {
    const l = lift({ sessions: [sess(nov(6), [12, 12, 12], bar(200)), sess(nov(3), [12, 10, 9], bar(200))] });
    expect(weeklyLevelUp([l], [], NOW)).toMatchObject({ earned: [], holding: [{ reason: 'Holding steady: aim for 12 reps on every set first' }] });
  });
  it('the workouts at different weights: no line at all', () => {
    const l = lift({ sessions: [sess(nov(6), [12, 12, 12], bar(205)), sess(nov(3), [12, 12, 12], bar(200))] });
    expect(weeklyLevelUp([l], [], NOW)).toBeNull();
  });
  it('the workouts with a different set count or range: no line at all', () => {
    const sets = lift({ sessions: [sess(nov(6), [12, 12, 12], bar(200)), sess(nov(3), [12, 12], bar(200))] });
    expect(weeklyLevelUp([sets], [], NOW)).toBeNull();
    const range = lift({ sessions: [sess(nov(6), [12, 12, 12], bar(200)), sess(nov(3), [10, 10, 10], bar(200), [8, 10])] });
    expect(weeklyLevelUp([range], [], NOW)).toBeNull();
  });
});
