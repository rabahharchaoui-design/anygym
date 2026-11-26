import { describe, expect, it } from 'vitest';
import { LONG_WORKOUT_MIN, sessionTime, workoutTime } from '../workoutTime';

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
    expect(workoutTime(t0, t0 + (LONG_WORKOUT_MIN + 1) * min)?.minutes).toBeNull();
  });
  it('PLAN M18a: an end before the start (the clock went back) or a time that is not a number is no time, never "<1 min"', () => {
    expect(workoutTime(t0, t0 - 5 * min)).toBeNull();
    expect(workoutTime(Number.NaN, t0)).toBeNull();
    expect(workoutTime(t0, Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe('sessionTime (PLAN M18a: start to save, or nothing)', () => {
  it('a finished workout: from its start to its save', () => {
    expect(sessionTime({ startedAt: t0, endedAt: t0 + 52 * min, imported: false })).toEqual({ minutes: 52, words: '52 min' });
  });
  it('still going: no time', () => {
    expect(sessionTime({ startedAt: t0, imported: false })).toBeNull();
  });
  it('imported (startedAt is the file order, SPEC 9.3): no time, even with an endedAt', () => {
    expect(sessionTime({ startedAt: 3, imported: true })).toBeNull();
    expect(sessionTime({ startedAt: 3, endedAt: 3, imported: true })).toBeNull();
    expect(sessionTime({ startedAt: 3, endedAt: 4 * min, imported: false })).toBeNull();
  });
});
