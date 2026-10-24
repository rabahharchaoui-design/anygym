import { describe, expect, it } from 'vitest';
import { STOPPED, elapsedMs, formatClock, ringProgress, startWatch, stopWatch, wholeSeconds } from '../timer';

describe('stopwatch', () => {
  it('measures from wall clock time, resumes, and ignores repeat start/stop', () => {
    let w = startWatch(STOPPED, 1000);
    expect(w).toEqual({ startedAt: 1000, accumulated: 0 });
    expect(startWatch(w, 5000)).toBe(w);
    expect(elapsedMs(w, 3500)).toBe(2500);
    // A backgrounded tab that wakes 60 s later still reads right.
    expect(elapsedMs(w, 61_000)).toBe(60_000);
    w = stopWatch(w, 2200);
    expect(w).toEqual({ startedAt: null, accumulated: 1200 });
    expect(stopWatch(w, 9999)).toBe(w);
    expect(elapsedMs(w, 99_999)).toBe(1200);
    w = startWatch(w, 10_000);
    expect(elapsedMs(w, 10_800)).toBe(2000);
    expect(elapsedMs(w, 9_000)).toBe(1200); // clock went backwards: never negative
    expect(elapsedMs(STOPPED, 123)).toBe(0);
  });

  it('whole seconds and the mm:ss clock', () => {
    expect(wholeSeconds(1999)).toBe(1);
    expect(wholeSeconds(-5)).toBe(0);
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(9.9)).toBe('00:09');
    expect(formatClock(75)).toBe('01:15');
    expect(formatClock(3725)).toBe('62:05');
    expect(formatClock(-3)).toBe('00:00');
  });

  it('ring progress is clamped to 0..1', () => {
    expect(ringProgress(15_000, 30)).toBe(0.5);
    expect(ringProgress(45_000, 30)).toBe(1);
    expect(ringProgress(-1, 30)).toBe(0);
    expect(ringProgress(5000, undefined)).toBe(0);
    expect(ringProgress(5000, 0)).toBe(0);
  });
});
