// PLAN 4.6a: review fixes in the run logic (6 records, 7 GPX name, 8 share card label, 9 restore).
import { describe, expect, it } from 'vitest';
import type { Run, RunPoint } from '../../../db/types';
import { at } from '../../gps/__tests__/fixtures';
import { toRunPoint } from '../../gps';
import { formatElapsed } from '../../timer';
import { bestEffortSec } from '../efforts';
import { gpxFileName } from '../gpx';
import { fasterWords, recordMoments } from '../records';

const MILE = 1609.344;

/** 2 km east at `speed` m/s, a point every 50 m, finished at `endedAt`. */
function twoKm(id: string, speed: number, endedAt: number): Run {
  const points: RunPoint[] = [];
  for (let m = 0; m <= 2000; m += 50) {
    const p = at(m, 0, m / speed);
    points.push(toRunPoint({ lat: p.lat!, lng: p.lng!, t: p.t!, accuracy: 5 }));
  }
  return { id, startedAt: points[0]![2], endedAt, type: 'free', movingSec: 2000 / speed, elapsedSec: 2000 / speed, distanceM: 2000, points, gaps: [], splits: [] };
}

describe('a record claim matches the two clocks shown (PLAN 4.6a 6)', () => {
  it('"faster" is the gap between the floored clocks, never a rounded raw gap', () => {
    // 5:01 before, 4:59 now: the clocks say 2 s, a rounded raw gap (1.1 s) said 1 s.
    expect([formatElapsed(301.0), formatElapsed(299.9)]).toEqual(['5:01', '4:59']);
    expect(fasterWords(301.0, 299.9)).toBe('2 s faster');
    expect(fasterWords(300.2, 299.6)).toBe('1 s faster');
    expect(fasterWords(300.9, 300.1)).toBe('');
    expect(fasterWords(400.5, 299.9)).toBe(`${formatElapsed(101)} faster`);
  });

  it('a new fastest mile says the gap between the two mile times as shown', () => {
    const before = twoKm('a', 3, 10_000_000);
    const now = twoKm('b', MILE / 534.95, 20_000_000);
    const prev = bestEffortSec(before.points, before.gaps, MILE)!;
    const mine = bestEffortSec(now.points, now.gaps, MILE)!;
    const shown = Math.floor(prev) - Math.floor(mine);
    // The case where rounding the raw gap disagrees with the clocks.
    expect(Math.round(prev - mine)).not.toBe(shown);
    const mile = recordMoments(now, [before, now], 'mi').find((m) => m.id === 'run:b:mile')!;
    expect(mile.hero).toBe(formatElapsed(mine));
    expect(mile.plus).toBe(`${shown} s faster`);
  });
});

describe('two runs on one day get two GPX files (PLAN 4.6a 7)', () => {
  it('the name has the local start time after the date', () => {
    const morning = new Date(2026, 5, 1, 7, 5).getTime();
    const evening = new Date(2026, 5, 1, 18, 40).getTime();
    expect(gpxFileName({ startedAt: morning })).toBe('AnyGym-run-2026-06-01-0705.gpx');
    expect(gpxFileName({ startedAt: evening })).toBe('AnyGym-run-2026-06-01-1840.gpx');
  });
});
