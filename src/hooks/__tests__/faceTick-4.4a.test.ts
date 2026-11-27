// PLAN 4.4a: one tick drives the time face, waking at each whole second of the shown time, never
// while it stands still or the app is in the background.
import { describe, expect, it } from 'vitest';
import { GAP_SEC, addPoint, pauseRun, startTracker, type TrackerState } from '../../lib/gps';
import { faceSec, liveHere, liveMovingMs, liveStep, startLive, type LiveRun } from '../../lib/run';
import { DEFAULT_RUN_SETUP } from '../../lib/run/goal';
import { createFaceTick, type FaceTickDeps } from '../faceTick';

const T0 = 1_700_000_000_000;
const at = (sec: number, m: number) => ({ lat: 48 + m / 111_320, lng: 2, t: T0 + sec * 1000, accuracy: 5 });

/** A fake clock with one pending timer at most (the tick never keeps two). */
function fakeClock(start: number) {
  let now = start;
  let visible = true;
  const timers = new Map<number, { at: number; fn: () => void }>();
  let seq = 0;
  const deps: FaceTickDeps = {
    now: () => now,
    later: (fn, ms) => {
      timers.set(++seq, { at: now + ms, fn });
      return seq;
    },
    cancel: (id) => void timers.delete(id),
    visible: () => visible,
  };
  /** Moves the clock to `to`, firing every timer due on the way, in order. */
  const run = (to: number) => {
    for (;;) {
      const next = [...timers.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > to) break;
      timers.delete(next[0]);
      now = next[1].at;
      next[1].fn();
    }
    now = to;
  };
  return { deps, run, pending: () => timers.size, setVisible: (v: boolean) => (visible = v), now: () => now };
}

describe('createFaceTick', () => {
  it('with a position every 6 s, the face shows every second once, in order', () => {
    let s: TrackerState = startTracker({ splitM: 1000, autoPause: true });
    const clock = fakeClock(T0);
    const shown: number[] = [];
    let prev: number | null = null;
    const tick = createFaceTick(() => ({ tracker: s, here: null }), (now) => {
      const v = faceSec(prev, liveMovingMs(s, now));
      if (v !== prev) shown.push(v);
      prev = v;
    }, clock.deps);
    tick.start();
    for (let t = 0; t <= 60; t += 6) {
      clock.run(T0 + t * 1000 + 300); // each position arrives 300 ms after its stamp
      s = addPoint(s, at(t, t * 3)).state;
      tick.poke();
    }
    clock.run(T0 + 62_000);
    expect(shown).toEqual(Array.from({ length: 63 }, (_, i) => i).slice(0, shown.length));
    expect(shown.at(-1)).toBe(62);
    tick.stop();
    expect(clock.pending()).toBe(0);
  });

  it('keeps no timer while paused, and none while the app is in the background', () => {
    let s: TrackerState = startTracker({ splitM: 1000, autoPause: true });
    s = addPoint(s, at(0, 0)).state;
    s = addPoint(s, at(6, 18)).state;
    const clock = fakeClock(T0 + 6_500);
    const ticks: number[] = [];
    const tick = createFaceTick(() => ({ tracker: s, here: null }), (now) => ticks.push(now), clock.deps);
    tick.start();
    expect(clock.pending()).toBe(1);
    s = pauseRun(s, clock.now());
    tick.poke();
    expect(clock.pending()).toBe(0);
    clock.run(T0 + 30_000);
    expect(ticks).toHaveLength(2);

    s = addPoint(startTracker({ splitM: 1000 }), at(29.5, 0)).state;
    clock.setVisible(false);
    tick.poke();
    expect(clock.pending()).toBe(0);
    clock.setVisible(true);
    tick.poke();
    expect(clock.pending()).toBe(1);
  });

  it('paused by hand: one wake when the last position goes stale, and the dot is gone after it (PLAN R5 1)', () => {
    let run: LiveRun = startLive({ id: 'r5', now: T0, setup: DEFAULT_RUN_SETUP, unit: 'km', autoPause: true });
    for (let t = 0; t <= 12; t += 2) run = liveStep(run, { type: 'fix', point: at(t, t * 3), now: T0 + t * 1000 });
    run = liveStep(run, { type: 'pause', now: T0 + 13_000 });
    const clock = fakeClock(T0 + 13_000);
    const dots: boolean[] = [];
    const tick = createFaceTick(() => run, (now) => dots.push(liveHere(run, now) !== null), clock.deps);
    tick.start();
    expect(clock.pending()).toBe(1);
    clock.run(T0 + 12_000 + 10 * GAP_SEC * 1000);
    // The start, then the one wake: the dot was there, then it is not, and no timer is left.
    expect(dots).toEqual([true, false]);
    expect(clock.pending()).toBe(0);
    tick.stop();
  });
});
