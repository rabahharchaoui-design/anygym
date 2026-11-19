// SPEC 12.3 splits (boundaries exactly on and between points, mile and km) and SPEC 12.2 pace.
import { describe, expect, it } from 'vitest';
import {
  addSplitStep, averagePace, currentPace, isStill, leftStill, pacePerUnit, pushPace, pushRecent, readSplits, resumeRadiusM, splitPace, startSplits, unitMeters,
  AVG_PACE_MIN_M, METERS_PER_KM, METERS_PER_MILE, PACE_MIN_M, PACE_MIN_SEC, PACE_WINDOW_SEC, STILL_RADIUS_M, type GpsPoint, type PaceSample, type SplitState, type SplitStep,
} from '..';
import { at } from './fixtures';

const run = (unitM: number, steps: SplitStep[]) => {
  let state: SplitState = startSplits(unitM);
  const completedAt: number[] = [];
  steps.forEach((s, i) => {
    const r = addSplitStep(state, s);
    state = r.state;
    r.completed.forEach(() => completedAt.push(i));
  });
  return { state, completedAt, ...readSplits(state) };
};
const timed = (distanceM: number, sec: number): SplitStep => ({ distanceM, ms: sec * 1000, timed: true, gap: false });

describe('units', () => {
  it('a split is a mile or a km', () => {
    expect(unitMeters('km')).toBe(METERS_PER_KM);
    expect(unitMeters('mi')).toBe(METERS_PER_MILE);
    expect(METERS_PER_MILE).toBe(1609.344);
  });
});

describe('splits', () => {
  it('a boundary exactly on a point closes the split there, with nothing left over', () => {
    const r = run(1000, [timed(250, 100), timed(250, 100), timed(250, 100), timed(250, 100)]);
    expect(r.completedAt).toEqual([3]);
    expect(r.full).toEqual([{ index: 1, distanceM: 1000, sec: 400, timedM: 1000, gap: false }]);
    expect(r.partial).toBeNull();
  });

  it('a boundary between two points is interpolated in time', () => {
    // 600 m in 100 s, then 600 m in 150 s: the km ends 400 m into the second step, after 100 of its 150 s.
    const r = run(1000, [timed(600, 100), timed(600, 150)]);
    expect(r.full).toHaveLength(1);
    expect(r.full[0]!.sec).toBeCloseTo(200, 9);
    expect(r.partial).toMatchObject({ index: 2, gap: false });
    expect(r.partial!.distanceM).toBeCloseTo(200, 9);
    expect(r.partial!.sec).toBeCloseTo(50, 9);
  });

  it('works per mile', () => {
    const r = run(METERS_PER_MILE, [timed(1000, 300), timed(1000, 300)]);
    expect(r.full).toHaveLength(1);
    expect(r.full[0]!.distanceM).toBe(METERS_PER_MILE);
    expect(r.full[0]!.sec).toBeCloseTo(300 + 300 * 0.609344, 9);
    expect(r.partial!.distanceM).toBeCloseTo(2000 - METERS_PER_MILE, 9);
    expect(splitPace(r.full[0]!)! * METERS_PER_MILE).toBeCloseTo(r.full[0]!.sec, 9);
  });

  it('one long step can close several splits; across a gap they carry no time and no pace', () => {
    const r = run(1000, [timed(500, 150), { distanceM: 2500, ms: 0, timed: false, gap: true }, timed(100, 30)]);
    expect(r.completedAt).toEqual([1, 1, 1]);
    expect(r.full.map((s) => [s.index, s.sec, s.timedM, s.gap])).toEqual([[1, 150, 500, true], [2, 0, 0, true], [3, 0, 0, true]]);
    expect(splitPace(r.full[0]!)).toBeCloseTo(0.3, 9);
    expect(splitPace(r.full[1]!)).toBeNull();
    // The gap ended exactly on a boundary: the next split is clean.
    expect(r.partial).toEqual({ index: 4, distanceM: 100, sec: 30, timedM: 100, gap: false });
  });

  it('a gap that ends inside a split marks that split', () => {
    const r = run(1000, [{ distanceM: 1200, ms: 0, timed: false, gap: true }]);
    expect(r.full[0]!.gap).toBe(true);
    expect(r.partial).toMatchObject({ distanceM: 200, timedM: 0, gap: true });
  });

  it('float sums that land a hair short of the boundary still close the split', () => {
    const r = run(1, Array.from({ length: 10 }, () => timed(0.1, 1)));
    expect(r.completedAt).toEqual([9]);
    expect(r.full[0]!.sec).toBeCloseTo(10, 9);
    expect(r.partial).toBeNull();
  });

  it('time with no distance stays in the open split and never closes one', () => {
    const r = run(1000, [timed(1000, 300), timed(0, 20), timed(0, 20)]);
    expect(r.full).toHaveLength(1);
    expect(r.partial).toEqual({ index: 2, distanceM: 0, sec: 40, timedM: 0, gap: false });
    expect(splitPace(r.partial!)).toBeNull();
  });

  it('has no partial split before anything happened, and refuses a split length under a meter', () => {
    expect(readSplits(startSplits(1000))).toEqual({ full: [], partial: null });
    expect(() => startSplits(0)).toThrow();
    expect(() => startSplits(0.5)).toThrow();
    expect(() => startSplits(Number.NaN)).toThrow();
  });

  it('a split with distance but no time has no pace', () => {
    expect(splitPace({ index: 1, distanceM: 1000, sec: 0, timedM: 1000, gap: false })).toBeNull();
    expect(splitPace({ index: 1, distanceM: 1000, sec: 300, timedM: PACE_MIN_M - 1, gap: true })).toBeNull();
  });
});

describe('pace', () => {
  const samples = (speed: number, seconds: number): PaceSample[] => {
    let w: PaceSample[] = [];
    for (let s = 0; s <= seconds; s++) w = pushPace(w, { movingMs: s * 1000, timedM: speed * s });
    return w;
  };

  it('has no pace yet with nothing, with one sample, or with too little moving time', () => {
    expect(currentPace([])).toBeNull();
    expect(currentPace(samples(3, 0))).toBeNull();
    expect(currentPace(samples(3, PACE_MIN_SEC - 1))).toBeNull();
    expect(currentPace(samples(3, PACE_MIN_SEC))).toBeCloseTo(1 / 3, 9);
  });

  it('has no pace when the window holds too little distance', () => {
    // PLAN 4.4d: the window is PACE_WINDOW_SEC (15 s, was 30). Under PACE_MIN_M (10 m) in it is no
    // pace: 0.6 m/s for 15 s is 9 m, inside the GPS noise; 0.7 m/s is 10.5 m.
    expect(currentPace(samples(0.6, 30))).toBeNull();
    expect(currentPace(samples(0.7, 30))).toBeCloseTo(1 / 0.7, 9);
  });

  it('keeps a window of PACE_WINDOW_SEC of moving time', () => {
    const w = samples(3, 100);
    expect(w[0]!.movingMs).toBe((100 - PACE_WINDOW_SEC) * 1000);
    expect(w).toHaveLength(PACE_WINDOW_SEC + 1);
  });

  it('follows a change of speed within the window', () => {
    let w = samples(3, 60);
    for (let s = 1; s <= 30; s++) w = pushPace(w, { movingMs: (60 + s) * 1000, timedM: 180 + 2 * s });
    expect(currentPace(w)).toBeCloseTo(0.5, 9);
  });

  it('average pace needs 50 m and some time', () => {
    expect(averagePace(20, AVG_PACE_MIN_M - 0.1)).toBeNull();
    expect(averagePace(0, 100)).toBeNull();
    expect(averagePace(20, AVG_PACE_MIN_M)).toBeCloseTo(0.4, 9);
  });

  it('turns seconds per meter into seconds per mile or km, and keeps "no pace" as it is', () => {
    expect(pacePerUnit(0.3, METERS_PER_KM)).toBeCloseTo(300, 9);
    expect(pacePerUnit(0.3, METERS_PER_MILE)).toBeCloseTo(482.8032, 9);
    expect(pacePerUnit(null, METERS_PER_KM)).toBeNull();
  });
});

describe('standing still', () => {
  const pt = (east: number, sec: number, accuracy = 5) => at(east, 0, sec, accuracy) as GpsPoint;
  const window = (pts: GpsPoint[]) => pts.reduce<GpsPoint[]>((w, p) => pushRecent(w, p), []);

  it('needs 8 full seconds inside the standing circle', () => {
    expect(isStill([])).toBe(false);
    expect(isStill(window([0, 1, 2, 3, 4, 5, 6, 7].map((s) => pt(0, s))))).toBe(false);
    expect(isStill(window([0, 1, 2, 3, 4, 5, 6, 7, 8].map((s) => pt(0, s))))).toBe(true);
  });

  it('is not standing while any point of the last 8 seconds is outside the circle', () => {
    // A slow walk at 0.6 m/s covers 4.8 m in 8 s.
    expect(isStill(window([0, 1, 2, 3, 4, 5, 6, 7, 8].map((s) => pt(0.6 * s, s))))).toBe(false);
    // Under 0.5 m/s it is standing.
    expect(isStill(window([0, 1, 2, 3, 4, 5, 6, 7, 8].map((s) => pt(0.4 * s, s))))).toBe(true);
    // Out 6 m and back within the window: not standing.
    expect(isStill(window([pt(0, 0), pt(0, 2), pt(6, 4), pt(0, 6), pt(0, 8)]))).toBe(false);
  });

  it('forgets what is older than needed', () => {
    const w = window(Array.from({ length: 30 }, (_, s) => pt(0, s)));
    expect(w.map((p) => (p.t - w[0]!.t) / 1000)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('moving again means leaving the spot by more than both accuracy circles', () => {
    expect(resumeRadiusM(pt(0, 0, 5), pt(0, 1, 8))).toBe(13);
    expect(resumeRadiusM(pt(0, 0, 1), pt(0, 1, 1))).toBe(STILL_RADIUS_M);
    expect(leftStill(pt(0, 0, 5), pt(9.9, 1, 5))).toBe(false);
    expect(leftStill(pt(0, 0, 5), pt(10.1, 1, 5))).toBe(true);
  });
});

describe('splits: distance carried across a GPS gap is flagged (PLAN 4.3, 4.4b 14)', () => {
  const step = (distanceM: number, sec: number, timed = true, gap = false): SplitStep => ({ distanceM, ms: sec * 1000, timed, gap });
  const feedAll = (steps: SplitStep[]) => readSplits(steps.reduce((st, x) => addSplitStep(st, x).state, startSplits(1000)));
  it('a split with a bridged gap is flagged; the splits before and after are not', () => {
    const r = feedAll([step(1000, 300), step(400, 120), step(200, 0, false, true), step(400, 120), step(1000, 300)]);
    expect(r.full.map((s) => s.gap)).toEqual([false, true, false]);
    expect(r.full[1]).toMatchObject({ sec: 240, timedM: 800 });
  });
  it('PLAN 4.4b (14): the untimed leg that ends an auto pause is no GPS gap: its split keeps its time from the timed part, and the leg stays out of its pace', () => {
    const r = feedAll([step(600, 180), step(12, 0, false, false), step(500, 150), step(900, 270)]);
    expect(r.full.map((s) => s.gap)).toEqual([false, false]);
    expect(r.full[0]).toMatchObject({ sec: 180 + 150 * (388 / 500), timedM: 988 });
    expect(splitPace(r.full[0]!)).toBeCloseTo(0.3, 9);
    expect(r.partial).toMatchObject({ gap: false });
  });
  it('an untimed resume leg across a boundary flags neither side; a real gap step flags its split even when it ends on the boundary', () => {
    expect(feedAll([step(990, 300), step(20, 0, false, false), step(1000, 300)]).full.map((s) => s.gap)).toEqual([false, false]);
    const exact = feedAll([step(990, 300), step(10, 0, false, true), step(1000, 300)]);
    expect(exact.full.map((s) => s.gap)).toEqual([true, false]);
    const across = feedAll([step(990, 300), step(20, 0, false, true), step(1000, 300)]);
    expect(across.full.map((s) => s.gap)).toEqual([true, true]);
  });
  it('a gap that adds no distance (not bridged) and time while standing flag nothing', () => {
    const r = feedAll([step(500, 150), step(0, 0, false, true), step(0, 40), step(500, 150)]);
    expect(r.full.map((s) => s.gap)).toEqual([false]);
  });
});
