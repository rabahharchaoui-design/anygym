import { describe, expect, it } from 'vitest';
import { STOPPED, captureHold, elapsedMs, formatClock, ringProgress, startWatch, stopWatch, wholeSeconds } from '../timer';

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

import { formatElapsed } from '../timer';

describe('formatElapsed', () => {
  it('m:ss under an hour, then h:mm:ss', () => {
    expect(formatElapsed(0)).toBe('0:00');
    expect(formatElapsed(-5)).toBe('0:00');
    expect(formatElapsed(65.9)).toBe('1:05');
    expect(formatElapsed(3599)).toBe('59:59');
    expect(formatElapsed(3600)).toBe('1:00:00');
    expect(formatElapsed(3725)).toBe('1:02:05');
  });
});

describe('captureHold (PLAN 1.10c fix 1: Log set reads the live hold)', () => {
  it('stop at 10 s, Start again, Log set while running: saves the live total, not the stale 10 s', () => {
    let w = startWatch(STOPPED, 0);
    w = stopWatch(w, 10_000);
    w = startWatch(w, 20_000); // Start again
    const { watch, seconds } = captureHold(w, 27_400);
    expect(seconds).toBe(17);
    expect(watch).toEqual({ startedAt: null, accumulated: 17_400 });
  });

  it('a stopped watch reads as is', () => {
    expect(captureHold({ startedAt: null, accumulated: 9_999 }, 50_000)).toEqual({ watch: { startedAt: null, accumulated: 9_999 }, seconds: 9 });
  });
});
