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
  it('the walk is standing by the wide circle at its end, with the clock going (the case)', () => {
    const s = fed(walk());
    expect(s.still).toBe(true);
    expect(s.stopped).toBe(false);
    expect(s.lastGood!.t).toBeGreaterThan(s.lastRecorded!.t);
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
    // 56 m timed by the gap, now 90 m (the bridge across it is untimed either way).
    const before = processTrack(pts(walk()), KM);
    expect(before.state.timedM).toBeCloseTo(56, 6);
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
