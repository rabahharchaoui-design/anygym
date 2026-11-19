// PLAN 4.6b (1): a walk that ends inside the wide standing circle (poor accuracy) saves the way it
// walked there, on every path a run stops by: End, Pause, the app closing (restore), a GPS gap.
import { describe, expect, it } from 'vitest';
import { at, standing, straight, T0 } from '../../gps/__tests__/fixtures';
import { haversineM, type RawPoint } from '../../gps';
import { DEFAULT_RUN_SETUP } from '../goal';
import { liveStep, readLive, startLive, type LiveAction, type LiveRun } from '../live';
import { liveRow, parseSnapshot, restoreLive, toSnapshot } from '../snapshot';
import { finishRun } from '../summary';
import { gpxFileName } from '../gpx';

const start = (autoPause = true) => startLive({ id: 'r1', now: T0, setup: DEFAULT_RUN_SETUP, unit: 'km', autoPause });
const fix = (point: RawPoint): LiveAction => ({ type: 'fix', point });
const feed = (run: LiveRun, points: RawPoint[]) => points.map(fix).reduce(liveStep, run);
/** 1 m/s for 90 s at 20 m accuracy: ends 34 m past the standing spot, inside the 40 m resume circle. */
const walk = () => feed(start(), straight({ speed: 1, seconds: 90, accuracy: 20 }));
const trackM = (run: LiveRun) => run.points.reduce((sum, p, i) => (i === 0 ? 0 : sum + haversineM(run.points[i - 1]!, p)), 0);

describe('the withheld leg at End, Pause and restore (PLAN 4.6b 1)', () => {
  it('End: the saved run has 90 m for its 90 s (before 4.6b: 56 m), and its track ends where the walk did', () => {
    const live = walk();
    expect(readLive(live).distanceM).toBeCloseTo(56, 6);
    const ended = liveStep(live, { type: 'pause', now: T0 + 90_000 });
    const row = finishRun(ended, T0 + 90_000);
    expect(row.distanceM).toBeCloseTo(90, 6);
    expect(row.movingSec).toBe(90);
    expect(row.timedM).toBeCloseTo(90, 6);
    expect(row.points[row.points.length - 1]![2]).toBe(T0 + 90_000);
    expect(trackM(ended)).toBeCloseTo(row.distanceM, 6);
  });

  it('Pause, then End: counted once', () => {
    const paused = liveStep(walk(), { type: 'pause', now: T0 + 90_000 });
    const ended = liveStep(paused, { type: 'pause', now: T0 + 95_000 });
    expect(ended).toBe(paused);
    expect(finishRun(ended, T0 + 95_000).distanceM).toBeCloseTo(90, 6);
  });

  it('the app closed there: the restored run has the leg, once, and its track still fits the snapshot', () => {
    const live = walk();
    const savedAt = T0 + 90_000;
    const back = restoreLive(liveRow(live), parseSnapshot(JSON.stringify(toSnapshot(live, savedAt)), 'r1'), { unit: 'km', autoPause: true });
    expect(readLive(back).distanceM).toBeCloseTo(90, 6);
    expect(back.points.length).toBe(live.points.length + 1);
    // Saved again and restored again (paused now): nothing more is added.
    const again = restoreLive(liveRow(back), parseSnapshot(JSON.stringify(toSnapshot(back, savedAt)), 'r1'), { unit: 'km', autoPause: true });
    expect(readLive(again).distanceM).toBeCloseTo(90, 6);
    expect(again.points.length).toBe(back.points.length);
  });

  it('a GPS gap: the leg joins the track before the gap, and the gap starts at its end', () => {
    const after = feed(walk(), straight({ speed: 1, seconds: 10, startSec: 150, startEast: 150, accuracy: 20 }));
    const gap = after.breaks.find((b) => b.kind === 'gap')!;
    expect(gap.fromT).toBe(T0 + 90_000);
    expect(after.points.some((p) => p.t === T0 + 90_000)).toBe(true);
    expect(after.tracker.timedM).toBeGreaterThanOrEqual(90 - 1e-6);
  });

  it('a still phone (the 4 m rule says standing) ends with nothing added, auto pause on or off', () => {
    for (const autoPause of [true, false]) {
      const live = feed(start(autoPause), [at(0, 0, 0, 20), ...standing({ seed: 3, sigma: 0.3, seconds: 120, startSec: 1, accuracy: 20 })]);
      const ended = liveStep(live, { type: 'pause', now: T0 + 121_000 });
      expect(ended.tracker.distanceM).toBe(live.tracker.distanceM);
      expect(ended.points).toBe(live.points);
    }
  });
});

describe('two runs started in the same minute get two GPX files (PLAN 4.6b 2)', () => {
  it('the name has the local start time to the second', () => {
    const first = new Date(2026, 5, 1, 7, 5, 3).getTime();
    const second = new Date(2026, 5, 1, 7, 5, 41).getTime();
    expect(gpxFileName({ startedAt: first })).toBe('AnyGym-run-2026-06-01-070503.gpx');
    expect(gpxFileName({ startedAt: second })).toBe('AnyGym-run-2026-06-01-070541.gpx');
  });
});
