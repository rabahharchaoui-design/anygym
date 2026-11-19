// PLAN 4.6b (1): standing by the wide circle (poor accuracy) while the 4 m rule says moving, the clock
// counts and the way from the standing spot waits for the runner to leave it. A run that ends there
// (End, Pause, a GPS gap) must still get that way as distance, or its pace is wrong. A phone the 4 m
// rule calls standing keeps adding nothing.
import { describe, expect, it } from 'vitest';
import { addPoint, pauseRun, processTrack, readTracker, resumeRun, startTracker, type TrackInput, type TrackerOptions, type TrackerState } from '..';
import { at, standing, straight } from './fixtures';

const KM = { splitM: 1000 };
const pts = (raw: ReturnType<typeof straight>): TrackInput[] => raw.map((point) => ({ type: 'point' as const, point }));
const PAUSE: TrackInput = { type: 'pause' };

/**
 * A noiseless 1 m/s walk at 20 m accuracy for 90 s: 8 m in 8 s is inside the 10 m circle (still for the
 * distance) and outside the 4 m rule (the clock goes). It leaves the 40 m resume circle at 48 s, is
 * still again from 56 s, and ends 34 m past the spot, still inside the circle.
 */
const walk = () => straight({ speed: 1, seconds: 90, accuracy: 20 });

function fed(raw: ReturnType<typeof straight>, options: TrackerOptions = KM): TrackerState {
  let s = startTracker(options);
  for (const p of raw) s = addPoint(s, p).state;
  return s;
}

const sumSplits = (s: TrackerState) => {
  const r = readTracker(s).splits;
  const all = r.partial ? [...r.full, r.partial] : [...r.full];
  return { m: all.reduce((a, x) => a + x.distanceM, 0), sec: all.reduce((a, x) => a + x.sec, 0) };
};

describe('the withheld leg is not lost when the run ends inside the wide circle (PLAN 4.6b 1)', () => {
  // PLAN 4.4d (3): the standing circle is capped at 6 m, so this walk (8 m in 8 s) is no longer
  // read as standing at all (was: still by the 10 m circle, its way withheld). Its distance counts
  // as it goes; the last step (shorter than the estimate's wobble) waits for the next fix.
  it('the walk is no longer read as standing at 20 m: its distance counts as it goes, the clock going', () => {
    const s = fed(walk());
    expect(s.still).toBe(false);
    expect(s.stopped).toBe(false);
    expect(Math.abs(s.distanceM - 90)).toBeLessThan(4);
  });

  it('End or Pause: the walk saves 90 m for its 90 s, not only the part before the circle', () => {
    const r = processTrack([...pts(walk()), PAUSE], KM);
    // Before 4.6b: 56 m for 90 s (0.62 m/s shown for a 1 m/s walk).
    expect(r.reading.movingSec).toBeCloseTo(90, 6);
    expect(r.reading.distanceM).toBeCloseTo(90, 6);
    expect(1 / r.reading.averagePace!).toBeCloseTo(1, 6);
    // The leg ends on a point of the track, so the line and the distance agree.
    expect(r.points[r.points.length - 1]!.t).toBe(r.state.lastGood!.t);
  });

  it('pauseRun with the clock at the tap counts the same leg', () => {
    const s = fed(walk());
    const paused = pauseRun(s, s.lastGood!.t + 500);
    expect(paused.distanceM).toBeCloseTo(90, 6);
    expect(paused.movingMs).toBe(90_500);
  });

  it('flushing twice never counts twice: a second pause, or a pause, resume and pause, adds nothing', () => {
    const once = pauseRun(fed(walk()));
    expect(pauseRun(once)).toBe(once);
    const again = pauseRun(resumeRun(once));
    expect(again.distanceM).toBe(once.distanceM);
    expect(again.timedM).toBe(once.timedM);
  });

  it('the splits still add up to the distance and the moving time', () => {
    for (const splitM of [20, 50, 1000]) {
      const s = pauseRun(fed(walk(), { splitM }));
      const sum = sumSplits(s);
      expect(sum.m).toBeCloseTo(s.distanceM, 6);
      expect(sum.sec).toBeCloseTo(s.movingMs / 1000, 6);
    }
  });

  it('a GPS gap after it: the leg counts before the gap, and the line breaks at its end', () => {
    const on = straight({ speed: 1, seconds: 30, startSec: 150, startEast: 150, accuracy: 20 });
    const r = processTrack([...pts(walk()), ...pts(on)], KM);
    const gap = r.breaks.find((b) => b.kind === 'gap')!;
    expect(gap.fromT).toBe(walk()[90]!.t);
    // Before 4.6b the 34 m from the standing spot to the last point before the gap were lost:
    // 56 m timed by the gap, now 90 m (the bridge across it is untimed either way). Since 4.4d the
    // walk is no longer read as standing, so it counts as it goes: live, at most one step (under
    // 4 m) waits for the next fix; the gap counts it.
    const before = processTrack(pts(walk()), KM);
    expect(before.state.timedM).toBeGreaterThan(86);
    expect(r.state.timedM).toBeGreaterThanOrEqual(90 - 1e-6);
    expect(gap.distanceM).toBeCloseTo(gap.bridged ? 60 : 0, 6);
    const sum = sumSplits(r.state);
    expect(sum.m).toBeCloseTo(r.reading.distanceM, 6);
    expect(sum.sec).toBeCloseTo(r.reading.movingSec, 6);
  });
});

describe('a still phone still adds nothing (PLAN 4.6b 1)', () => {
  // Wander well inside the 4 m rule: the clock stops (auto pause on), the standing state holds.
  const still = (accuracy: number) => standing({ seed: 7, sigma: 0.3, seconds: 120, accuracy });

  it('End, Pause, auto pause on or off, at 5 and 20 m accuracy: no distance', () => {
    for (const accuracy of [5, 20])
      for (const autoPause of [true, false]) {
        const s = fed(still(accuracy), { ...KM, autoPause });
        expect(s.stopped).toBe(true);
        const before = s.distanceM;
        expect(pauseRun(s).distanceM).toBe(before);
        expect(processTrack([...pts(still(accuracy)), PAUSE], { ...KM, autoPause }).reading.distanceM).toBe(before);
      }
  });

  it('a GPS gap that ends back on the spot: no distance', () => {
    for (const accuracy of [5, 20])
      for (const autoPause of [true, false]) {
        const s = fed(still(accuracy), { ...KM, autoPause });
        const back = standing({ seed: 8, sigma: 0.3, seconds: 0, startSec: 200, accuracy })[0]!;
        expect(addPoint(s, back).state.distanceM).toBe(s.distanceM);
      }
  });

  it('a GPS gap that ends away from the spot adds the bridge only, as before', () => {
    const s = fed(still(5));
    const after = addPoint(s, at(30, 0, 160, 5)).state;
    expect(after.distanceM - s.distanceM).toBeCloseTo(30, 0);
  });
});

describe('a walk at poor accuracy that then stands until the clock stops, then ends (PLAN 4.6b 3)', () => {
  // 1 m/s at 20 m for 30 s (still by the 10 m circle from 8 s on, the clock going), then standing
  // at 30 m: the 4 m rule stops the clock at 34 s. The 22 m from the spot to there were walked on the clock.
  const walkThenStand = () => [...straight({ speed: 1, seconds: 30, accuracy: 20 }), ...straight({ speed: 0, seconds: 29, startSec: 31, startEast: 30, accuracy: 20 })];

  // PLAN 4.4d: the walk is counted as it goes (not withheld: before 4.4d 8 m live, 30 at End). The
  // estimate runs about a meter past an abrupt stop and settles on the spot 2 s later, so: within
  // 1.5 m of 30 m live and at End, and 36 s on the clock (was exactly 30 m and 34 s).
  it('End keeps the walked distance: about 30 m for 36 s (before 4.6b: 8 m)', () => {
    const s = fed(walkThenStand());
    expect(s.stopped).toBe(true);
    expect(Math.abs(s.distanceM - 30)).toBeLessThan(1.5);
    const r = processTrack([...pts(walkThenStand()), PAUSE], KM);
    expect(Math.abs(r.reading.distanceM - 30)).toBeLessThan(1.5);
    expect(r.reading.movingSec).toBe(36);
    expect(r.state.timedM).toBeCloseTo(r.reading.distanceM, 6);
    expect(r.points[r.points.length - 1]!.t).toBe(s.stopAt!.t);
    expect(pauseRun(pauseRun(s)).distanceM).toBeCloseTo(r.reading.distanceM, 6);
    const sum = sumSplits(pauseRun(s));
    expect(sum.m).toBeCloseTo(r.reading.distanceM, 6);
    expect(sum.sec).toBeCloseTo(36, 6);
  });

  it('a phone that never moved still adds nothing', () => {
    const raw = straight({ speed: 0, seconds: 60, accuracy: 20 });
    const s = fed(raw);
    expect(s.stopped).toBe(true);
    expect(pauseRun(s).distanceM).toBe(0);
  });
});
