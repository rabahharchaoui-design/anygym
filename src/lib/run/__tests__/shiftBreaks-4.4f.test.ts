// PLAN 4.4f (5): a drift relocation (or the estimate starting again at a fix) was stored as a GPS
// gap, so the summary drew a dashed join and said "GPS was lost" where no GPS was lost. It is its own
// kind now: still a break for distance and pace, drawn as part of the line, never dashed or noted.
import { describe, expect, it } from 'vitest';
import { at, T0 } from '../../gps/__tests__/fixtures';
import { processTrack, type RawPoint, type TrackInput } from '../../gps';
import { DEFAULT_RUN_SETUP } from '../goal';
import { liveStep, startLive, type LiveRun } from '../live';
import { drawRunRoute } from '../routeGeo';
import { finishRun, rowPace } from '../summary';
import { posterOf } from '../poster';

/** Ran 30 s at 3 m/s, then the phone lies still while its unsure fixes (30 m) drift 0.6 m/s. */
function drifting(): RawPoint[] {
  const out: RawPoint[] = [];
  for (let t = 0; t <= 30; t++) out.push(at(t * 3, 0, t));
  for (let t = 31; t <= 120; t++) out.push(at(90 + (t - 30) * 0.6, 0, t, 30));
  return out;
}

const live = (points: RawPoint[]): LiveRun => points.reduce<LiveRun>((run, point) => liveStep(run, { type: 'fix', point }), startLive({ id: 's', now: T0, setup: DEFAULT_RUN_SETUP, unit: 'km', autoPause: true }));

describe('a shift of the estimate is not a GPS gap (PLAN 4.4f 5)', () => {
  it('the tracker gives it its own kind; nothing is counted as an unbridged gap', () => {
    const out = processTrack(drifting().map((point): TrackInput => ({ type: 'point', point })), { splitM: 1000, autoPause: true });
    expect(out.breaks.length).toBeGreaterThan(0);
    expect(out.breaks.every((b) => b.kind === 'shift')).toBe(true);
    expect(out.unbridgedGaps).toBe(0);
  });

  it('the finished run keeps it as a break (stored in gaps and shifts) but draws no dashed join', () => {
    const run = finishRun(live(drifting()), T0 + 121_000);
    expect(run.gaps.length).toBeGreaterThan(0);
    expect(run.shifts).toEqual(run.gaps);
    const route = drawRunRoute(run);
    expect(route.dashed).toEqual([]);
    expect(route.solid.length).toBe(1);
    // Distance and pace still read every break: the same as with the breaks as gaps.
    const { shifts: _drop, ...asGaps } = run;
    expect(rowPace(run)).toBe(rowPace(asGaps));
    // The share card draws one piece of line too.
    expect(posterOf(run, 'km', false).lines.length).toBe(1);
  });

  it('a cold start correction (the first sure fix 40 m off the unsure ones) is a shift, not a gap', () => {
    const points = Array.from({ length: 41 }, (_, t) => (t < 20 ? at(t * 3, 0, t, 40) : at(t * 3, 40, t, 5)));
    const out = processTrack(points.map((point): TrackInput => ({ type: 'point', point })), { splitM: 1000, autoPause: true });
    expect(out.breaks.map((b) => b.kind)).toEqual(['shift']);
    const run = finishRun(live(points), T0 + 41_000);
    expect(drawRunRoute(run).dashed).toEqual([]);
  });

  it('a real loss of GPS is still a gap, drawn dashed', () => {
    const points = [...Array.from({ length: 31 }, (_, t) => at(t * 3, 0, t)), ...Array.from({ length: 31 }, (_, i) => at(270 + i * 3, 0, 90 + i))];
    const run = finishRun(live(points), T0 + 121_000);
    expect(run.shifts).toBeUndefined();
    expect(drawRunRoute(run).dashed.length).toBe(1);
  });

  it('a stored run from before (no shifts field) draws as it did', () => {
    const run = finishRun(live(drifting()), T0 + 121_000);
    const old = { ...run, shifts: undefined };
    expect(drawRunRoute(old).dashed.length).toBe(run.gaps.length);
  });
});
