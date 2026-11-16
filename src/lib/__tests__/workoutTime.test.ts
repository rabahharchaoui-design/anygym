import { describe, expect, it } from 'vitest';
import { LONG_WORKOUT_MIN, workoutTime } from '../workoutTime';

const t0 = new Date(2026, 10, 10, 19).getTime();
const min = 60_000;

describe('workoutTime (3.6z A11: the finish Time has an upper limit)', () => {
  it('a normal workout reads its minutes', () => {
    expect(workoutTime(t0, t0 + 45 * min)).toEqual({ minutes: 45, words: '45 min' });
    expect(workoutTime(t0, t0 + 20_000)).toEqual({ minutes: 0, words: '<1 min' });
    expect(workoutTime(t0, t0 + LONG_WORKOUT_MIN * min)).toEqual({ minutes: 240, words: '240 min' });
  });
  it('left open overnight (7 PM to 8 AM): "Over 4 h", never "780 min"', () => {
    expect(workoutTime(t0, t0 + 780 * min)).toEqual({ minutes: null, words: 'Over 4 h' });
    expect(workoutTime(t0, t0 + (LONG_WORKOUT_MIN + 1) * min).minutes).toBeNull();
  });
});
