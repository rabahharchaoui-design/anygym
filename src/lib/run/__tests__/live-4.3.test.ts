import { describe, expect, it } from 'vitest';
import { at, T0 } from '../../gps/__tests__/fixtures';
import { METERS_PER_MILE, processTrack, readTracker, type RawPoint, type TrackInput } from '../../gps';
import { DEFAULT_RUN_SETUP, type RunSetup } from '../goal';
import { fixTime, goalOf, liveStep, readLive, startLive, type LiveAction, type LiveRun } from '../live';
import { liveRow, parseSnapshot, restoreLive, toSnapshot } from '../snapshot';
import { finishRun, MIN_RUN_M, routeOf, rowPace, runVerdict, SPLIT_GAP, summaryOf } from '../summary';
import { goalProgress, GOAL_REACHED } from '../progress';
import { formatElapsed } from '../../timer';

const setup = (patch: Partial<RunSetup> = {}): RunSetup => ({ ...DEFAULT_RUN_SETUP, ...patch });
const start = (patch: Partial<RunSetup> = {}, unit: 'km' | 'mi' = 'km', autoPause = true) => startLive({ id: 'r1', now: T0, setup: setup(patch), unit, autoPause });
const fix = (point: RawPoint): LiveAction => ({ type: 'fix', point });
const feed = (run: LiveRun, actions: LiveAction[]) => actions.reduce(liveStep, run);
/** East at 3 m/s, one point a second, from second `from` to `to`. */
const east = (from: number, to: number, speed = 3, x0 = 0): LiveAction[] => Array.from({ length: to - from + 1 }, (_, i) => fix(at(x0 + i * speed, 0, from + i)));

describe('startLive', () => {
  it('a free run has no goal, a distance and a time run carry theirs, intervals store the preset and run free', () => {
    expect(start().goal).toBeNull();
    expect(start({ type: 'distance', distance: { value: 3, unit: 'mi' } }).goal).toEqual({ kind: 'distance', meters: 3 * METERS_PER_MILE, label: '3 mi' });
    expect(start({ type: 'time', timeMin: 45 }).goal).toEqual({ kind: 'time', seconds: 2700, label: '45 min' });
    const iv = start({ type: 'intervals', interval: 'speed' });
    expect(iv.goal).toBeNull();
    expect(iv.intervalPreset).toBe('speed');
    expect(start().intervalPreset).toBeNull();
    expect(goalOf(setup({ type: 'intervals' }))).toBeNull();
  });
  it('splits follow the unit, auto pause follows the setting', () => {
    expect(start({}, 'mi').tracker.splitM).toBe(METERS_PER_MILE);
    expect(start({}, 'km', false).tracker.autoPause).toBe(false);
    expect(readLive(start()).status).toBe('waiting');
  });
});

describe('liveStep', () => {
  it('records points and reads the same as lib/gps over the same inputs', () => {
    const actions = east(0, 120);
    const run = feed(start(), actions);
    const batch = processTrack(actions.map((a) => ({ type: 'point', point: (a as { point: RawPoint }).point })) as TrackInput[], { splitM: 1000, autoPause: true });
    expect(run.points).toEqual(batch.points);
    expect(readLive(run)).toEqual(batch.reading);
    expect(readLive(run).distanceM).toBeCloseTo(360, 0);
    expect(run.here).toEqual(run.points[run.points.length - 1]);
  });
  it('a rejected point changes nothing (same object)', () => {
    const run = feed(start(), east(0, 5));
    expect(liveStep(run, fix(at(15, 0, 6, 80)))).toBe(run);
    expect(liveStep(run, fix({ lat: null, lng: 1, t: T0, accuracy: 5 }))).toBe(run);
  });
  it('pause by hand: nothing is recorded, the dot still follows, resume breaks the line with no distance', () => {
    let run = feed(start(), east(0, 30));
    const before = readLive(run);
    run = liveStep(run, { type: 'pause' });
    expect(liveStep(run, { type: 'pause' })).toBe(run);
    expect(readLive(run).status).toBe('paused');
    run = feed(run, [fix(at(120, 0, 40)), fix(at(150, 0, 50))]);
    expect(run.points).toHaveLength(31);
    expect(run.here?.t).toBe(T0 + 50_000);
    expect(readLive(run).distanceM).toBe(before.distanceM);
    run = feed(run, [{ type: 'resume' }, ...east(60, 70, 3, 200)]);
    expect(run.breaks).toEqual([{ fromT: T0 + 30_000, toT: T0 + 60_000, kind: 'pause', bridged: false, distanceM: 0 }]);
    expect(readLive(run).distanceM).toBeCloseTo(before.distanceM + 30, 0);
    expect(readLive(run).movingSec).toBeCloseTo(before.movingSec + 10, 5);
  });
  it('auto pause when the position stops, running again when it moves; a manual pause is never overridden', () => {
    let run = feed(start(), east(0, 30));
    const still = Array.from({ length: 20 }, (_, i) => fix(at(90, 0, 31 + i)));
    run = feed(run, still);
    expect(readLive(run).status).toBe('auto-paused');
    const moving = readLive(run).movingSec;
    expect(moving).toBeLessThan(45);
    run = feed(run, east(51, 60, 3, 93));
    expect(readLive(run).status).toBe('running');
    // By hand, then standing: it stays a pause by hand, and moving does not resume it.
    run = feed(liveStep(run, { type: 'pause' }), [...Array.from({ length: 20 }, (_, i) => fix(at(120, 0, 61 + i))), ...east(81, 90, 3, 123)]);
    expect(readLive(run).status).toBe('paused');
  });
  it('the auto pause switch: off keeps the clock running while standing, and can be flipped mid run', () => {
    let run = feed(start({}, 'km', false), east(0, 30));
    run = feed(run, Array.from({ length: 20 }, (_, i) => fix(at(90, 0, 31 + i))));
    expect(readLive(run).status).toBe('running');
    expect(readLive(run).standing).toBe(true);
    expect(readLive(run).movingSec).toBeCloseTo(50, 5);
    const on = liveStep(run, { type: 'auto-pause', on: true });
    expect(readLive(on).status).toBe('auto-paused');
    expect(liveStep(on, { type: 'auto-pause', on: true })).toBe(on);
  });
  it('a gap in the fixes breaks the line; its time is not moving time beyond the first GAP_SEC (PLAN 4.4a)', () => {
    let run = feed(start(), east(0, 30));
    run = feed(run, east(130, 140, 3, 200));
    expect(run.breaks).toHaveLength(1);
    expect(run.breaks[0]).toMatchObject({ kind: 'gap', fromT: T0 + 30_000, toT: T0 + 130_000 });
    expect(readLive(run).movingSec).toBeCloseTo(40 + 15, 5);
  });
  it('GPS trouble is kept until the next good position', () => {
    let run = liveStep(start(), { type: 'gps', trouble: 'denied' });
    expect(run.gps).toBe('denied');
    expect(liveStep(run, { type: 'gps', trouble: 'denied' })).toBe(run);
    run = liveStep(run, fix(at(0, 0, 0)));
    expect(run.gps).toBeNull();
  });
});

describe('fixTime', () => {
  it('uses the phone timestamp when it is close to the clock, else the arrival time', () => {
    expect(fixTime(T0 - 800, T0)).toBe(T0 - 800);
    expect(fixTime(T0 + 300, T0)).toBe(T0 + 300);
    expect(fixTime(T0 - 5000, T0)).toBe(T0);
    expect(fixTime(T0 + 5000, T0)).toBe(T0);
    expect(fixTime(12345, T0)).toBe(T0);
    expect(fixTime(undefined, T0)).toBe(T0);
    expect(fixTime(NaN, T0)).toBe(T0);
  });
});

describe('persistence and resume', () => {
  const going = () => feed(start({ type: 'distance', distance: { value: 5, unit: 'km' } }), [...east(0, 400), { type: 'pause' }, { type: 'resume' }, ...east(420, 500, 3, 1300)]);

  it('the row carries the SPEC 12.11 fields and no end while the run goes on', () => {
    const run = going();
    const row = liveRow(run);
    const r = readLive(run);
    expect(row).toMatchObject({ id: 'r1', startedAt: T0, type: 'distance', goal: '5 km', movingSec: r.movingSec, elapsedSec: r.elapsedSec, distanceM: r.distanceM });
    expect(row.endedAt).toBeUndefined();
    expect(row.points).toHaveLength(run.points.length);
    expect(row.points[0]).toEqual([run.points[0]!.lat, run.points[0]!.lng, T0, 5]);
    expect(row.gaps).toEqual([[T0 + 400_000, T0 + 420_000]]);
    expect(row.splits).toHaveLength(1);
    expect(row.intervalPreset).toBeUndefined();
    expect(liveRow(start({ type: 'intervals', interval: 'builder' })).intervalPreset).toBe('builder');
    expect('goal' in liveRow(start())).toBe(false);
  });

  it('a run read back from its row and snapshot continues with the very same numbers, paused', () => {
    const run = going();
    const text = JSON.stringify(toSnapshot(run));
    const back = restoreLive(JSON.parse(JSON.stringify(liveRow(run))), parseSnapshot(text, 'r1'), { unit: 'mi', autoPause: false });
    expect(back.closed).toBe(true);
    expect(readLive(back).status).toBe('paused');
    expect({ ...readLive(back), status: 0, currentPace: 0 }).toEqual({ ...readLive(run), status: 0, currentPace: 0 });
    expect(back.points).toEqual(run.points);
    expect(back.breaks).toEqual(run.breaks);
    expect(back.goal).toEqual(run.goal);
    expect(back.unit).toBe('km');
    expect(back.here).toEqual(run.points[run.points.length - 1]);
  });

  it('the time away is a break in the line: no distance, no moving time, however long or short', () => {
    for (const awaySec of [5, 120, 4000]) {
      const run = going();
      const before = readLive(run);
      let back = restoreLive(liveRow(run), parseSnapshot(JSON.stringify(toSnapshot(run)), 'r1'), { unit: 'km', autoPause: true });
      // Positions that arrive before Resume are not recorded.
      back = liveStep(back, fix(at(3000, 0, 500 + awaySec)));
      expect(back.points).toHaveLength(run.points.length);
      back = feed(back, [{ type: 'resume' }, ...east(501 + awaySec, 510 + awaySec, 3, 3000)]);
      expect(back.closed).toBe(false);
      const brk = back.breaks[back.breaks.length - 1]!;
      expect(brk).toEqual({ fromT: T0 + 500_000, toT: T0 + (501 + awaySec) * 1000, kind: 'pause', bridged: false, distanceM: 0 });
      expect(readLive(back).distanceM).toBeCloseTo(before.distanceM + 27, 0);
      expect(readLive(back).movingSec).toBeCloseTo(before.movingSec + 9, 5);
      const pieces = routeOf(liveRow(back));
      expect(pieces[pieces.length - 1]!.dashedFromPrev).toBe(true);
    }
  });

  it('resume on a restored run with no points at all simply starts it', () => {
    const empty = start();
    const back = restoreLive(liveRow(empty), parseSnapshot(JSON.stringify(toSnapshot(empty)), 'r1'), { unit: 'km', autoPause: true });
    expect(back.here).toBeNull();
    const on = feed(back, [{ type: 'resume' }, ...east(0, 20)]);
    expect(on.breaks).toEqual([]);
    expect(readLive(on).distanceM).toBeCloseTo(60, 0);
  });

  it('a missing, broken or foreign snapshot is refused, and the track is replayed instead', () => {
    const run = going();
    const good = JSON.stringify(toSnapshot(run));
    expect(parseSnapshot(null, 'r1')).toBeNull();
    expect(parseSnapshot('{nope', 'r1')).toBeNull();
    expect(parseSnapshot('null', 'r1')).toBeNull();
    expect(parseSnapshot(good, 'other')).toBeNull();
    expect(parseSnapshot(good.replace('"v":1', '"v":9'), 'r1')).toBeNull();
    expect(parseSnapshot(JSON.stringify({ ...toSnapshot(run), unit: 'yd' }), 'r1')).toBeNull();
    expect(parseSnapshot(JSON.stringify({ ...toSnapshot(run), tracker: { distanceM: 'x' } }), 'r1')).toBeNull();
    expect(parseSnapshot(JSON.stringify({ ...toSnapshot(run), breaks: 3 }), 'r1')).toBeNull();
    expect(parseSnapshot(JSON.stringify({ ...toSnapshot(run), goal: { kind: 'distance', meters: -1, label: 'x' }, intervalPreset: 'zzz' }), 'r1')).toMatchObject({ goal: null, intervalPreset: null });
    expect(parseSnapshot(JSON.stringify({ ...toSnapshot(start({ type: 'time' })) }), 'r1')?.goal).toEqual({ kind: 'time', seconds: 1800, label: '30 min' });

    const row = liveRow(run);
    const back = restoreLive(row, null, { unit: 'km', autoPause: true });
    expect(readLive(back).status).toBe('paused');
    expect(back.type).toBe('distance');
    expect(back.goal).toBeNull();
    expect(back.breaks.map((b) => [b.fromT, b.toT, b.kind, b.distanceM])).toEqual([[T0 + 400_000, T0 + 420_000, 'pause', 0]]);
    expect(readLive(back).distanceM).toBeCloseTo(readLive(run).distanceM, 3);
    // A snapshot that ends somewhere else than the stored track is not trusted either.
    const stale = parseSnapshot(JSON.stringify(toSnapshot(feed(start(), east(0, 10)))), 'r1');
    expect(restoreLive(row, stale, { unit: 'km', autoPause: true }).points).toHaveLength(row.points.length);
    expect(readLive(restoreLive(row, stale, { unit: 'km', autoPause: true })).distanceM).toBeCloseTo(readLive(run).distanceM, 3);
    // A row of an unknown kind comes back as a free run.
    expect(restoreLive({ ...row, type: 'easy', intervalPreset: 'builder' }, null, { unit: 'km', autoPause: true })).toMatchObject({ type: 'free', intervalPreset: 'builder' });
  });
});

describe('ending', () => {
  it('the finished row is the live row with its end, and the summary reads from it', () => {
    const run = feed(start({}, 'km'), east(0, 700));
    const row = finishRun(run, T0 + 705_000);
    expect(row).toEqual({ ...liveRow(run), endedAt: T0 + 705_000 });
    expect(runVerdict(row)).toBe('ok');
    const s = summaryOf(row, 'km');
    expect(s).toEqual({ distance: '2.10', unit: 'km', time: '11:40', pace: '5:33', splitUnit: 'km', anyGap: false, splits: [{ n: 1, time: '5:33' }, { n: 2, time: '5:33' }] });
    expect(row).toMatchObject({ splitGaps: [], splitUnit: 'km', timedM: readTracker(run.tracker).distanceM });
    expect(readTracker(run.tracker).averagePace! * 1000).toBeCloseTo(rowPace(row)! * 1000, 3);
  });
  it('distance bridged across a gap stays out of the pace', () => {
    const run = feed(start(), [...east(0, 100), ...east(140, 240, 3, 420)]);
    const row = finishRun(run, T0 + 240_000);
    expect(row.distanceM).toBeCloseTo(720, 0);
    expect(rowPace(row)! * 1000).toBeCloseTo(1000 / 3, 0);
    expect(routeOf(row).map((p) => p.dashedFromPrev)).toEqual([false, true]);
  });
  it('a split that holds a bridged GPS gap shows no time: it is flagged on the row and reads "GPS gap"', () => {
    // 600 m, a 40 s gap bridged over 120 m, then on to 2.1 km: km 1 holds the gap, km 2 does not.
    const run = feed(start(), [...east(0, 200), ...east(240, 700, 3, 720)]);
    const row = finishRun(run, T0 + 700_000);
    expect(row.splits).toHaveLength(2);
    expect(row.splitGaps).toEqual([1]);
    expect(row.timedM).toBeCloseTo(row.distanceM - 120, 0);
    const s = summaryOf(row, 'km');
    expect(s.splits).toEqual([{ n: 1, time: null }, { n: 2, time: '5:33' }]);
    expect(s.anyGap).toBe(true);
    expect(SPLIT_GAP).toBe('GPS gap');
    // The average pace leaves the bridged meters out: still the true 3 m/s, not faster.
    expect(s.pace).toBe('5:33');
    expect(rowPace(row)).toBe(readTracker(run.tracker).averagePace);
  });
  it('PLAN 4.4b (14): the leg that ends an auto pause is no GPS gap: its split shows its time, and the pace leaves the leg out', () => {
    const stand = Array.from({ length: 30 }, (_, i) => fix(at(900, 0, 301 + i)));
    const run = feed(start(), [...east(0, 300), ...stand, ...east(331, 500, 3, 915)]);
    const row = finishRun(run, T0 + 500_000);
    expect(row.splits).toHaveLength(1);
    expect(row.splitGaps).toEqual([]);
    expect(row.timedM!).toBeLessThan(row.distanceM);
    const time = summaryOf(row, 'km').splits[0]!.time;
    expect(time).toBe(formatElapsed(row.splits[0]!));
    expect(summaryOf(row, 'km').anyGap).toBe(false);
    expect(rowPace(row)).toBe(readTracker(run.tracker).averagePace);
  });
  it('rows without the newer fields: splits read in the given unit, none flagged, pace from the solid pieces', () => {
    const run = feed(start({}, 'mi'), [...east(0, 100), ...east(140, 700, 3, 420)]);
    const { splitGaps: _g, splitUnit: _u, timedM: _t, ...old } = finishRun(run, T0 + 700_000);
    expect(summaryOf(finishRun(run, T0 + 700_000), 'km').splitUnit).toBe('mi');
    const s = summaryOf(old, 'km');
    expect(s.splitUnit).toBe('km');
    expect(s.anyGap).toBe(false);
    expect(rowPace(old)! * 1000).toBeCloseTo(1000 / 3, 0);
  });
  it('no GPS at all, or next to no distance, is said plainly', () => {
    expect(runVerdict(finishRun(start(), T0 + 1))).toBe('no-gps');
    const short = finishRun(feed(start(), east(0, 10)), T0 + 11_000);
    expect(short.distanceM).toBeLessThan(MIN_RUN_M);
    expect(runVerdict(short)).toBe('too-short');
    expect(summaryOf(short, 'km').pace).toBe('--');
  });
});

describe('goal progress', () => {
  const dist = start({ type: 'distance', distance: { value: 5, unit: 'km' } }).goal;
  const time = start({ type: 'time', timeMin: 20 }).goal;
  it('a free run shows none', () => {
    expect(goalProgress(null, { distanceM: 100, movingSec: 100 }, 'km')).toBeNull();
    expect(goalProgress({ kind: 'time', seconds: 0, label: '' }, { distanceM: 0, movingSec: 0 }, 'km')).toBeNull();
  });
  it('distance: what is left, lifted so it never reads zero early, then reached', () => {
    expect(goalProgress(dist, { distanceM: 0, movingSec: 0 }, 'km')).toEqual({ fraction: 0, reached: false, label: 'Goal 5 km', line: '5.00 km to go' });
    expect(goalProgress(dist, { distanceM: 1200, movingSec: 0 }, 'km')).toMatchObject({ fraction: 0.24, line: '3.80 km to go' });
    expect(goalProgress(dist, { distanceM: 4999, movingSec: 0 }, 'km')).toMatchObject({ reached: false, line: '0.01 km to go' });
    expect(goalProgress(dist, { distanceM: 5000, movingSec: 0 }, 'km')).toMatchObject({ fraction: 1, reached: true, line: GOAL_REACHED });
    expect(goalProgress(dist, { distanceM: 7000, movingSec: 0 }, 'km')).toMatchObject({ fraction: 1, reached: true });
    expect(goalProgress(start({ type: 'distance', distance: { value: 3, unit: 'mi' } }).goal, { distanceM: METERS_PER_MILE, movingSec: 0 }, 'mi')!.line).toBe('2.00 mi to go');
  });
  it('time: moving time against the goal', () => {
    expect(goalProgress(time, { distanceM: 0, movingSec: 440.2 }, 'km')).toMatchObject({ reached: false, line: '12:40 to go', label: 'Goal 20 min' });
    expect(goalProgress(time, { distanceM: 0, movingSec: 1199.5 }, 'km')).toMatchObject({ reached: false, line: '0:01 to go' });
    expect(goalProgress(time, { distanceM: 0, movingSec: 1200 }, 'km')).toMatchObject({ reached: true, line: GOAL_REACHED });
  });
});
