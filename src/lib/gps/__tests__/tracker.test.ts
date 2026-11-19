// SPEC 12.2 and 12.3: the tracker over synthetic tracks. Every tolerance is stated where it is used.
import { describe, expect, it } from 'vitest';
import { addPoint, GAP_SEC, PACE_MIN_SEC, pathLengthM, pauseRun, processPoints, processTrack, readTracker, resumeRun, startTracker, METERS_PER_MILE, type RawPoint, type TrackInput } from '..';
import { at, loop, LOOP_LENGTH_M, standing, straight, T0 } from './fixtures';

const KM = { splitM: 1000 };
const pts = (points: RawPoint[]): TrackInput[] => points.map((point) => ({ type: 'point', point }));
const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);

describe('a recorded style loop', () => {
  // PLAN 4.4d: the track is the estimate (a constant speed filter), which runs a hair inside a
  // 150 m circle: within 1 m of 942 m (0.1%), was 5 cm with the raw fixes.
  it('without noise: within 1 m of the true length (the estimate cuts the curve a little)', () => {
    const r = processPoints(loop(null), KM);
    expect(Math.abs(r.reading.distanceM - LOOP_LENGTH_M)).toBeLessThan(1);
    expect(r.rejected).toEqual([]);
    expect(r.breaks).toEqual([]);
    expect(r.reading.movingSec).toBeCloseTo(LOOP_LENGTH_M / 3, 6);
    expect(r.reading.elapsedSec).toBe(r.reading.movingSec);
  });

  it('with GPS wander of 2 m: within 3% of the true length, for 20 seeds', () => {
    for (const seed of SEEDS) {
      const r = processPoints(loop({ seed, sigma: 2 }), KM);
      expect(Math.abs(r.reading.distanceM / LOOP_LENGTH_M - 1)).toBeLessThan(0.03);
      expect(r.reading.distanceM).toBeCloseTo(pathLengthM(r.points), 6);
      expect(r.reading.status).toBe('running');
    }
  });
});

describe('a track with spikes', () => {
  const clean = straight({ speed: 3, seconds: 120 });
  const dirty: RawPoint[] = [...clean];
  dirty.splice(100, 0, { lat: 40, lng: -74, accuracy: 5 });
  dirty.splice(80, 0, at(240, 0, 30));
  // PLAN 4.4d keeps fixes up to 65 m (weighted), so the accuracy spike says 99 m (was 40).
  dirty.splice(60, 0, at(178, 0, 59.5, 99));
  dirty.splice(40, 0, at(118.5, 500, 39.5));
  dirty.splice(20, 0, at(58.5, -300, 19.5));

  it('gives exactly the result of the clean track, and says what it dropped', () => {
    const a = processPoints(dirty, KM);
    const b = processPoints(clean, KM);
    expect(a.state).toEqual(b.state);
    expect(a.points).toEqual(b.points);
    expect(a.reading.distanceM).toBeCloseTo(360, 2);
    expect(a.rejected.map((r) => r.reason)).toEqual(['speed', 'speed', 'accuracy', 'time-backwards', 'no-time']);
  });
});

describe('a track with a gap', () => {
  // 3 m/s for 60 s, nothing for 60 s (the phone was locked, the runner kept going), then 80 s more.
  const before = straight({ speed: 3, seconds: 60 });
  const after = straight({ speed: 3, seconds: 80, startSec: 120, startEast: 360 });

  it('breaks the line, counts the straight line across when the speed is plausible, and only the first GAP_SEC of its time', () => {
    const r = processPoints([...before, ...after], KM);
    expect(r.breaks).toHaveLength(1);
    expect(r.breaks[0]).toMatchObject({ fromT: T0 + 60_000, toT: T0 + 120_000, kind: 'gap', bridged: true });
    expect(r.breaks[0]!.distanceM).toBeCloseTo(180, 2);
    expect(r.unbridgedGaps).toBe(0);
    expect(r.reading.distanceM).toBeCloseTo(600, 2);
    // SPEC 12.2: the time in the gap is not moving time, but for its first GAP_SEC, which the clock
    // on the screen had already counted while it waited (PLAN 4.4a: the clock never goes back).
    expect(r.reading.movingSec).toBe(140 + GAP_SEC);
    expect(r.reading.elapsedSec).toBe(200);
    // Pace is over the 420 m that have time and leaves those held seconds out: 140 s / 420 m, not 140 s / 600 m.
    expect(r.reading.averagePace).toBeCloseTo(1 / 3, 4);
    expect(r.reading.splits.partial).toMatchObject({ gap: true });
    expect(r.reading.splits.partial!.timedM).toBeCloseTo(420, 2);
  });

  // PLAN 4.4d: PACE_MIN_SEC is 6 s (was 10); the first pace after it is within 1% (the estimate
  // starts again at the gap with no speed and needs a fix or two to take it).
  it('has no current pace right after the gap, and one again PACE_MIN_SEC later', () => {
    const s = processPoints([...before, ...after.slice(0, PACE_MIN_SEC)], KM);
    expect(s.reading.currentPace).toBeNull();
    const t = processPoints([...before, ...after.slice(0, PACE_MIN_SEC + 1)], KM);
    expect(Math.abs(t.reading.currentPace! * 3 - 1)).toBeLessThan(0.01);
  });

  it('does not count a jump no runner could make, and says so', () => {
    const far = straight({ speed: 3, seconds: 80, startSec: 120, startEast: 5000 });
    const r = processPoints([...before, ...far], KM);
    expect(r.breaks).toEqual([{ fromT: T0 + 60_000, toT: T0 + 120_000, kind: 'gap', bridged: false, distanceM: 0 }]);
    expect(r.unbridgedGaps).toBe(1);
    expect(r.reading.distanceM).toBeCloseTo(180 + 240, 2);
    expect(r.reading.movingSec).toBe(140 + GAP_SEC);
    // The split holds the gap's held seconds: no split time is claimed for it.
    expect(r.reading.splits.partial).toMatchObject({ gap: true });
    expect(r.points).toHaveLength(before.length + far.length);
  });

  it('does not count the line across a gap longer than five minutes', () => {
    const late = straight({ speed: 3, seconds: 30, startSec: 500, startEast: 700 });
    const r = processPoints([...before, ...late], KM);
    expect(r.unbridgedGaps).toBe(1);
    expect(r.reading.distanceM).toBeCloseTo(180 + 90, 2);
  });

  it('a gap ends standing still: the runner is running again', () => {
    const waiting = Array.from({ length: 20 }, (_, i) => at(180, 0, 61 + i));
    const r = processPoints([...before, ...waiting, ...after], KM);
    expect(r.reading.status).toBe('running');
    // PLAN 4.4d: standing on the spot records no point (a step under the estimate's wobble waits),
    // so the gap starts at the last recorded point, the stop itself (was 1:07).
    expect(r.breaks[0]).toMatchObject({ kind: 'gap', bridged: true, fromT: T0 + 60_000 });
    expect(r.reading.distanceM).toBeCloseTo(600, 2);
  });
});

describe('standing still', () => {
  // GPS wander of 2 m per axis around one spot, the phone saying 8 m accuracy, for five minutes.
  it('adds at most 10 m in five minutes, with auto pause on or off, for 20 seeds', () => {
    for (const seed of SEEDS) {
      const points = standing({ seed, sigma: 2, seconds: 300 });
      const on = processPoints(points, KM);
      expect(on.reading.distanceM).toBeLessThan(10);
      expect(on.reading.status).toBe('auto-paused');
      expect(on.reading.movingSec).toBeLessThan(10);
      expect(on.reading.elapsedSec).toBe(300);
      expect(on.reading.currentPace).toBeNull();
      expect(on.reading.averagePace).toBeNull();

      const off = processPoints(points, { ...KM, autoPause: false });
      expect(off.reading.distanceM).toBe(on.reading.distanceM);
      expect(off.reading.status).toBe('running');
      expect(off.reading.standing).toBe(true);
      expect(off.reading.movingSec).toBe(300);
    }
  });
});

describe('auto pause and resume', () => {
  // Run 180 m in 60 s, stand until 0:90, run 180 m more until 2:30. Accuracy 5 m everywhere.
  const stop = Array.from({ length: 29 }, (_, i) => at(180, 0, 61 + i));
  const points = [...straight({ speed: 3, seconds: 60 }), ...stop, ...straight({ speed: 3, seconds: 60, startSec: 90, startEast: 180 })];
  const statusAt = (sec: number, autoPause = true) => processPoints(points.slice(0, sec + 1), { ...KM, autoPause }).reading;

  it('pauses once the last 8 seconds stayed inside 4 m, and stops the moving clock there', () => {
    // At 1:07 the point of 0:59 (3 m before the stop) is the oldest of the last 8 seconds.
    expect(statusAt(66).status).toBe('running');
    expect(statusAt(67)).toMatchObject({ status: 'auto-paused', standing: true, movingSec: 67, currentPace: null });
    expect(statusAt(89)).toMatchObject({ status: 'auto-paused', movingSec: 67, elapsedSec: 89 });
    expect(statusAt(89).distanceM).toBeCloseTo(180, 2);
  });

  it('resumes once the runner is more than 10 m from the spot (both 5 m accuracy circles)', () => {
    expect(statusAt(93)).toMatchObject({ status: 'auto-paused', movingSec: 67 });
    expect(statusAt(93).distanceM).toBeCloseTo(180, 2);
    const back = statusAt(94);
    expect(back).toMatchObject({ status: 'running', standing: false, movingSec: 67 });
    // The way from the spot counts at once: the estimate trails the fix by under 3 m as it takes up
    // the speed again (PLAN 4.4d; was exactly 12 m with raw fixes), and the total is exact (below).
    expect(Math.abs(back.distanceM - 192)).toBeLessThan(3);
  });

  it('counts all the distance, and as moving time everything but the pause', () => {
    const r = processPoints(points, KM);
    expect(r.reading.distanceM).toBeCloseTo(360, 2);
    expect(r.reading.movingSec).toBe(67 + (150 - 94));
    expect(r.reading.elapsedSec).toBe(150);
    // 26 standing + 6 short steps while the estimate slows to the spot (PLAN 4.4d, was 26).
    expect(r.heldCount).toBe(32);
    expect(r.breaks).toEqual([]);
    // Pace leaves out the leg that ended the pause (nobody timed it): about 12 m (9.7 m: the
    // estimate trails the fix, PLAN 4.4d), so 123 s over about 348 m.
    const timedM = r.reading.splits.partial!.timedM;
    expect(Math.abs(timedM - 348)).toBeLessThan(3);
    expect(r.reading.averagePace).toBeCloseTo(123 / timedM, 6);
    expect(r.reading.currentPace).toBeCloseTo(1 / 3, 4);
  });

  // PLAN 4.4d: PACE_MIN_SEC is 6 s (was 10). The first pace after resuming is within 15% (the
  // estimate still catches up the 2 m it trailed by), and exact once the 15 s window turned over.
  it('has no current pace for the first PACE_MIN_SEC after resuming', () => {
    expect(statusAt(99).currentPace).toBeNull();
    expect(Math.abs(statusAt(100).currentPace! * 3 - 1)).toBeLessThan(0.15);
    expect(statusAt(112).currentPace).toBeCloseTo(1 / 3, 1);
  });

  it('with the switch off the clock never stops, and the distance is the same', () => {
    const r = processPoints(points, { ...KM, autoPause: false });
    expect(statusAt(80, false)).toMatchObject({ status: 'running', standing: true, movingSec: 80, currentPace: null });
    expect(r.reading.movingSec).toBe(150);
    expect(r.reading.distanceM).toBeCloseTo(360, 2);
    expect(r.reading.averagePace).toBeCloseTo(150 / 360, 4);
  });

  it('a GPS hole while auto paused, ending on the same spot, keeps the run still (PLAN 4.4c)', () => {
    // Auto paused at 1:07; no position from 1:29 until 2:00, which lands back on the standing spot.
    const holed = [...points.slice(0, 90), at(181, 0, 120), at(180, 1, 121)];
    const r = processPoints(holed, KM);
    expect(r.reading).toMatchObject({ status: 'auto-paused', standing: true, movingSec: 67 });
    expect(r.reading.distanceM).toBeCloseTo(180, 2);
    expect(r.breaks).toEqual([]);
    expect(r.state.heldMs).toBe(0);
    expect(r.reading.splits.partial).toMatchObject({ gap: false });
    // Moving again afterwards behaves as any end of an auto pause: the leg from the spot counts, no time.
    // PLAN 4.4d: standing, a fix that surprises waits for the next to confirm it (one wild fix is no
    // walk off), so it takes two fixes off the spot; the leg counts once, with no time.
    const on = processPoints([...holed, at(192, 0, 125), at(195, 0, 126)], KM);
    expect(on.reading).toMatchObject({ status: 'running', movingSec: 67 });
    expect(Math.abs(on.reading.distanceM - 195)).toBeLessThan(3);
  });

  it('a GPS hole while auto paused that ends away from the spot is a gap as before', () => {
    const r = processPoints([...points.slice(0, 90), at(270, 0, 120)], KM);
    // PLAN 4.4d: from the stop itself, the last recorded point (no point is recorded on the spot).
    expect(r.breaks).toEqual([{ fromT: T0 + 60_000, toT: T0 + 120_000, kind: 'gap', bridged: true, distanceM: expect.closeTo(90, 2) }]);
    expect(r.reading).toMatchObject({ status: 'running', movingSec: 67 });
    expect(r.reading.distanceM).toBeCloseTo(270, 2);
  });

  it('a tap on resume while auto paused ends the pause at once', () => {
    const paused = processPoints(points.slice(0, 80), KM).state;
    const resumed = resumeRun(paused);
    expect(readTracker(resumed).status).toBe('running');
    // Still standing: it pauses again after 8 more seconds.
    let state = resumed;
    for (let s = 80; s <= 88; s++) state = addPoint(state, points[s]!).state;
    expect(readTracker(state)).toMatchObject({ status: 'auto-paused', movingSec: 67 + 9 });
  });
});

describe('pause by hand', () => {
  const first = straight({ speed: 3, seconds: 60 });
  // While paused the runner walks 100 m north and stands there.
  const walk = Array.from({ length: 50 }, (_, i) => at(180, Math.min(100, 4 * (i + 1)), 61 + i));
  const second = Array.from({ length: 61 }, (_, i) => at(180 + 3 * i, 100, 111 + i));
  const inputs: TrackInput[] = [...pts(first), { type: 'pause' }, ...pts(walk), { type: 'resume' }, ...pts(second)];

  it('records nothing while paused, and auto pause never takes over', () => {
    const r = processTrack(inputs.slice(0, first.length + 1 + walk.length), KM);
    expect(r.reading).toMatchObject({ status: 'paused', movingSec: 60, currentPace: null });
    expect(r.reading.distanceM).toBeCloseTo(180, 2);
    expect(r.heldCount).toBe(walk.length);
    expect(r.points).toHaveLength(first.length);
  });

  it('starts a new piece of line after resume: no distance and no time across the pause', () => {
    const r = processTrack(inputs, KM);
    expect(r.breaks).toEqual([{ fromT: T0 + 60_000, toT: T0 + 111_000, kind: 'pause', bridged: false, distanceM: 0 }]);
    expect(r.unbridgedGaps).toBe(0);
    expect(r.reading.distanceM).toBeCloseTo(360, 2);
    expect(r.reading.movingSec).toBe(120);
    expect(r.reading.elapsedSec).toBe(171);
    expect(r.reading.status).toBe('running');
  });

  it('wins over an auto pause that was already on', () => {
    const stop = Array.from({ length: 20 }, (_, i) => at(180, 0, 61 + i));
    let state = processPoints([...first, ...stop], KM).state;
    expect(readTracker(state).status).toBe('auto-paused');
    state = pauseRun(state);
    expect(readTracker(state).status).toBe('paused');
    state = addPoint(state, at(300, 0, 100)).state;
    expect(readTracker(state).status).toBe('paused');
    state = resumeRun(state);
    expect(readTracker(state)).toMatchObject({ status: 'running', standing: false });
  });

  it('still drops bad points while paused and after resume', () => {
    const paused = pauseRun(processPoints(first, KM).state);
    expect(addPoint(paused, { ...at(180, 0, 61), accuracy: 99 }).event).toEqual({ type: 'rejected', reason: 'accuracy' });
    expect(addPoint(paused, at(180, 0, 61)).event).toEqual({ type: 'held', reason: 'paused' });
    const resumed = resumeRun(paused);
    expect(addPoint(resumed, at(900, 0, 60)).event).toEqual({ type: 'rejected', reason: 'time-backwards' });
    expect(addPoint(resumed, at(900, 0, 61)).event).toMatchObject({ type: 'recorded', brk: { kind: 'pause' } });
  });

  it('pause twice and resume while running change nothing', () => {
    const running = processPoints(first, KM).state;
    expect(resumeRun(running)).toBe(running);
    const paused = pauseRun(running);
    expect(pauseRun(paused)).toBe(paused);
  });

  it('paused before the first point: the first point after resume simply starts the run', () => {
    let state = pauseRun(startTracker(KM));
    expect(readTracker(state).status).toBe('paused');
    expect(addPoint(state, at(0, 0, 0)).event).toEqual({ type: 'held', reason: 'paused' });
    state = resumeRun(state);
    expect(readTracker(state)).toMatchObject({ status: 'waiting', distanceM: 0, movingSec: 0, elapsedSec: 0, averagePace: null });
    expect(addPoint(state, at(0, 0, 5)).event).toMatchObject({ type: 'recorded', brk: null, splits: [] });
  });
});

describe('splits and pace on a track', () => {
  // 2.5 m/s for 1000 s: 2500 m.
  const points = straight({ speed: 2.5, seconds: 1000 });

  it('per km: two splits of 400 s and 500 m left over (within 0.01 s and 1 cm)', () => {
    const r = processPoints(points, KM);
    expect(r.reading.splits.full.map((s) => s.index)).toEqual([1, 2]);
    for (const s of r.reading.splits.full) {
      expect(s.sec).toBeCloseTo(400, 2);
      expect(s).toMatchObject({ distanceM: 1000, gap: false });
      expect(s.timedM).toBeCloseTo(1000, 6);
    }
    expect(r.reading.splits.partial!.distanceM).toBeCloseTo(500, 2);
    expect(r.reading.splits.partial!.sec).toBeCloseTo(200, 2);
    // Spoken at the point that crosses the line.
    expect(r.splitEvents.map((e) => e.split.index)).toEqual([1, 2]);
    expect(Math.abs(r.splitEvents[0]!.index - 400)).toBeLessThanOrEqual(1);
    expect(Math.abs(r.splitEvents[1]!.index - 800)).toBeLessThanOrEqual(1);
  });

  it('per mile: one split of 643.74 s, the boundary between two points interpolated', () => {
    const r = processPoints(points, { splitM: METERS_PER_MILE });
    expect(r.reading.splits.full).toHaveLength(1);
    expect(r.reading.splits.full[0]!.sec).toBeCloseTo(METERS_PER_MILE / 2.5, 2);
    expect(r.reading.splits.partial!.distanceM).toBeCloseTo(2500 - METERS_PER_MILE, 2);
    expect(r.reading.splits.partial!.sec).toBeCloseTo(1000 - METERS_PER_MILE / 2.5, 2);
  });

  it('has no pace before there is enough movement, then the right one', () => {
    // PLAN 4.4d: PACE_MIN_SEC 6 s (was 10); the first pace is within 1% (the estimate's start).
    expect(processPoints(points.slice(0, PACE_MIN_SEC), KM).reading.currentPace).toBeNull();
    expect(Math.abs(processPoints(points.slice(0, PACE_MIN_SEC + 1), KM).reading.currentPace! / 0.4 - 1)).toBeLessThan(0.01);
    // 50 m for an average pace: 20 s at 2.5 m/s.
    expect(processPoints(points.slice(0, 20), KM).reading.averagePace).toBeNull();
    expect(processPoints(points.slice(0, 22), KM).reading.averagePace).toBeCloseTo(0.4, 4);
  });

  it('current pace follows a slowdown within 30 seconds, average pace only slowly', () => {
    const slow = Array.from({ length: 30 }, (_, i) => at(2500 + 1.5 * (i + 1), 0, 1001 + i));
    const r = processPoints([...points, ...slow], KM);
    // PLAN 4.4d: within 10% (was 0.1%). Without the phone's speed the pace is the distance window,
    // and a step shorter than the estimate's wobble (1.5 m here) waits for the next fix, so the
    // window can end one step short: 1.5 m of 22.5 m. With a phone speed it reads that instead.
    expect(Math.abs(r.reading.currentPace! * 1.5 - 1)).toBeLessThan(0.1);
    // Within 0.1% (was 0.01%): the last step, shorter than the estimate's wobble, waits for a next fix.
    expect(r.reading.averagePace).toBeCloseTo(1030 / 2545, 3);
  });
});
