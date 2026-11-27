// PLAN R5 (1): paused by hand, the live screen never woke, so the "You are here" dot (R3) stayed on
// the pause spot after the signal went quiet. One wake while paused by hand, at the moment the last
// position passes the gap limit, none after that until a new position comes in (no ticking loop).
import { describe, expect, it } from 'vitest';
import { GAP_SEC } from '../../gps';
import { liveHere, liveStep, msToNextFace, startLive, type LiveRun } from '..';
import { DEFAULT_RUN_SETUP } from '../goal';

const T0 = 1_700_000_000_000;
const at = (sec: number, m: number) => ({ lat: 48 + m / 111_320, lng: 2, t: T0 + sec * 1000, accuracy: 5 });
const fix = (run: LiveRun, sec: number, m: number) => liveStep(run, { type: 'fix', point: at(sec, m), now: T0 + sec * 1000 });
const wake = (run: LiveRun, nowMs: number) => msToNextFace(run.tracker, nowMs, run.here?.t ?? null);

/** Ran 30 s at 3 m/s, a position every 2 s, then paused by hand at 31 s. */
function pausedByHand(): LiveRun {
  let run = startLive({ id: 'p', now: T0, setup: DEFAULT_RUN_SETUP, unit: 'km', autoPause: true });
  for (let t = 0; t <= 30; t += 2) run = fix(run, t, t * 3);
  return liveStep(run, { type: 'pause', now: T0 + 31_000 });
}

describe('msToNextFace paused by hand (PLAN R5 1)', () => {
  it('wakes once, when the last position passes the gap limit', () => {
    const run = pausedByHand();
    expect(run.tracker.manual).toBe(true);
    const w = wake(run, T0 + 31_000);
    expect(w).toBe(GAP_SEC * 1000 - 1000 + 1);
    // At that wake the dot is gone; a moment before it was still there.
    expect(liveHere(run, T0 + 31_000 + w! - 1)).not.toBeNull();
    expect(liveHere(run, T0 + 31_000 + w!)).toBeNull();
  });

  it('then stands: no more wakes until a new position', () => {
    const run = pausedByHand();
    expect(wake(run, T0 + 30_000 + GAP_SEC * 1000 + 1)).toBeNull();
    expect(wake(run, T0 + 30_000 + 5 * GAP_SEC * 1000)).toBeNull();
  });

  it('a position while paused moves the one wake to its own gap limit', () => {
    const run = fix(pausedByHand(), 40, 90);
    expect(run.tracker.manual).toBe(true);
    expect(run.here?.t).toBe(T0 + 40_000);
    expect(wake(run, T0 + 41_000)).toBe(GAP_SEC * 1000 - 1000 + 1);
  });

  it('without the dot time it stands as before', () => {
    expect(msToNextFace(pausedByHand().tracker, T0 + 31_000)).toBeNull();
  });
});
