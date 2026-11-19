// PLAN 4.4b (6): when GPS is lost the old pace is not shown, and the watch is started again.
import { describe, expect, it } from 'vitest';
import { at, T0 } from '../../gps/__tests__/fixtures';
import { GAP_SEC } from '../../gps';
import { DEFAULT_RUN_SETUP } from '../goal';
import { liveStep, startLive, type LiveRun } from '../live';
import { readLiveAt, rewatchDue } from '../liveClock';

const running = (): LiveRun => {
  let r = startLive({ id: 'r', now: T0, setup: DEFAULT_RUN_SETUP, unit: 'km', autoPause: true });
  for (let s = 0; s <= 60; s++) r = liveStep(r, { type: 'fix', point: at(s * 3, 0, s) });
  return r;
};
const last = T0 + 60_000;

describe('GPS lost on the live screen (PLAN 4.4b 6)', () => {
  it('the current pace shows until the wait becomes a gap, then none ("--"), and comes back with positions', () => {
    const r = running();
    expect(readLiveAt(r, last + 5000).currentPace).not.toBeNull();
    expect(readLiveAt(r, last + GAP_SEC * 1000).currentPace).not.toBeNull();
    expect(readLiveAt(r, last + GAP_SEC * 1000 + 1).currentPace).toBeNull();
    expect(readLiveAt(r, last + 120_000).currentPace).toBeNull();
    // The average pace is the run's, not a reading of now: it stays.
    expect(readLiveAt(r, last + 120_000).averagePace).not.toBeNull();
    let back = r;
    for (let s = 90; s <= 130; s++) back = liveStep(back, { type: 'fix', point: at(180 + (s - 90) * 3, 0, s) });
    expect(readLiveAt(back, T0 + 130_000).currentPace).not.toBeNull();
  });

  it('the watch is started again once per GAP_SEC while the gap lasts, never while positions come or when paused', () => {
    const r = running();
    expect(rewatchDue(r, last + 10_000, T0)).toBe(false);
    expect(rewatchDue(r, last + GAP_SEC * 1000 + 1, T0)).toBe(true);
    // Just started again: give it GAP_SEC before the next try.
    expect(rewatchDue(r, last + 20_000, last + 16_000)).toBe(false);
    expect(rewatchDue(r, last + 32_000, last + 16_000)).toBe(true);
    expect(rewatchDue(liveStep(r, { type: 'pause', now: last + 1000 }), last + 60_000, T0)).toBe(false);
  });

  it('GPS that never came or said it is unavailable is asked again the same way; a denied one is not', () => {
    const fresh = startLive({ id: 'r', now: T0, setup: DEFAULT_RUN_SETUP, unit: 'km', autoPause: true });
    expect(rewatchDue(fresh, T0 + 10_000, T0)).toBe(false);
    expect(rewatchDue(fresh, T0 + 16_000, T0)).toBe(true);
    expect(rewatchDue(liveStep(fresh, { type: 'gps', trouble: 'unavailable' }), T0 + 16_000, T0)).toBe(true);
    expect(rewatchDue(liveStep(fresh, { type: 'gps', trouble: 'denied' }), T0 + 60_000, T0)).toBe(false);
  });
});
