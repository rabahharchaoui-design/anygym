// PLAN R5 (2): Run.gaps also holds the moves of the estimate (PLAN 4.4f 5, Run.shifts). The GPX file
// cut its track at those as if GPS was lost there, while the app draws one solid line. Only a real
// gap (or a pause) splits the file, as on the finish map (dashedGaps).
import { describe, expect, it } from 'vitest';
import type { Run, RunPoint } from '../../../db/types';
import { gpxDocument } from '../gpx';

const T0 = 1_700_000_000_000;
/** Twelve points 5 s apart, heading north. */
const points: RunPoint[] = Array.from({ length: 12 }, (_, i) => [48 + i * 0.0001, 2, T0 + i * 5000, 5]);
const pair = (i: number): [number, number] => [points[i]![2], points[i + 1]![2]];

const run = (patch: Partial<Run>): Run => ({
  id: 'r5',
  startedAt: T0,
  endedAt: T0 + 60_000,
  type: 'free',
  movingSec: 55,
  elapsedSec: 60,
  distanceM: 120,
  points,
  gaps: [],
  splits: [],
  ...patch,
});
const segments = (r: Run) => gpxDocument(r).match(/<trkseg>/g)?.length ?? 0;

describe('GPX segments and estimate shifts (PLAN R5 2)', () => {
  it('one real gap and one shift: two segments, split only at the real gap', () => {
    const gap = pair(3);
    const shift = pair(7);
    const gpx = gpxDocument(run({ gaps: [gap, shift], shifts: [shift] }));
    const segs = gpx.split('<trkseg>').slice(1);
    expect(segs).toHaveLength(2);
    expect(segs[0]!.match(/<trkpt/g)).toHaveLength(4);
    expect(segs[1]!.match(/<trkpt/g)).toHaveLength(8);
  });

  it('only a shift: one segment', () => {
    expect(segments(run({ gaps: [pair(5)], shifts: [pair(5)] }))).toBe(1);
  });

  it('an old run without shifts exports as before: every gap splits', () => {
    expect(segments(run({ gaps: [pair(3), pair(7)] }))).toBe(3);
    expect(segments(run({}))).toBe(1);
  });
});
