import { describe, expect, it } from 'vitest';
import type { Run, RunPoint } from '../../../db/types';
import { at, T0 } from '../../gps/__tests__/fixtures';
import { haversineM, pathLengthM, toRunPoint } from '../../gps';
import { selectCelebrations } from '../../../ui/celebrate';
import { bestEffortSec, openMeters, timeFromStartSec } from '../efforts';
import { gpxDocument, gpxFileName } from '../gpx';
import { ghostResult, ghostWords } from '../ghost';
import { citiesOf, currentCity, heatmapRoute, runsInCity } from '../heatmap';
import { newCityMoment } from '../city';
import { posterOf } from '../poster';
import { PRIVACY_ZONE_M, trimPrivacy } from '../privacy';
import { HALF_MARATHON_M, LONGEST_STEP_M, recordBoard, recordMoments, titlesHeldBy } from '../records';
import { bestSplitIndexes } from '../summary';

/** East from `fromM` to `toM` at `speed` m/s, one point every `step` meters. Times are seconds from 0. */
function east(fromM: number, toM: number, t0: number, speed = 3, step = 100): RunPoint[] {
  const end = Math.max(fromM, toM);
  const marks = [fromM];
  for (let m = fromM + step; m < end - 1e-6; m += step) marks.push(m);
  if (end - fromM > 1e-6) marks.push(end);
  return marks.map((mm) => {
    const p = at(mm, 0, t0 + (mm - fromM) / speed);
    return toRunPoint({ lat: p.lat!, lng: p.lng!, t: p.t!, accuracy: 5 });
  });
}

function run(patch: Partial<Run> & { id?: string } = {}): Run {
  const pts = patch.points ?? east(0, 1000, 0);
  return {
    id: 'r1',
    startedAt: pts[0]?.[2] ?? T0,
    endedAt: (pts.at(-1)?.[2] ?? T0) + 1,
    type: 'free',
    movingSec: 1000,
    elapsedSec: 1000,
    distanceM: 1000,
    points: pts,
    gaps: [],
    splits: [],
    ...patch,
  };
}

describe('best efforts (PLAN 4.6)', () => {
  it('times a mile and a 5 km from the points, and a short run has neither', () => {
    const five = east(0, 5000, 0, 3, 100);
    expect(bestEffortSec(five, [], 1609.344)).toBeCloseTo(1609.344 / 3, 1);
    expect(bestEffortSec(five, [], 5000)).toBeCloseTo(5000 / 3, 1);
    expect(bestEffortSec(east(0, 1000, 0), [], 5000)).toBeNull();
    expect(bestEffortSec(five, [], 0)).toBeNull();
  });

  it('uses the fastest stretch, not the average of the whole run', () => {
    const slow = east(0, 2000, 0, 3, 100);
    const t = 2000 / 3;
    const fast = east(2000, 8000, t, 4, 100).slice(1);
    expect(bestEffortSec([...slow, ...fast], [], 5000)).toBeCloseTo(5000 / 4, 0);
  });

  it('a GPS gap or an impossible step breaks the effort, so neither side can borrow the other', () => {
    const first = east(0, 3000, 0);
    const lastT = first.at(-1)![2];
    const second = east(3010, 6010, 1000 + 80);
    const gaps: Array<[number, number]> = [[lastT, second[0]![2]]];
    const points = [...first, ...second];
    expect(bestEffortSec(points, gaps, 5000)).toBeNull();
    expect(bestEffortSec(points, gaps, 1609.344)).not.toBeNull();
    const jumpAt = (lastT - T0) / 1000 + 1;
    const before = east(0, 4000, 0);
    const jump = at(6000, 0, jumpAt);
    const after = east(6000, 9000, jumpAt).slice(1);
    expect(bestEffortSec([...before, toRunPoint({ lat: jump.lat!, lng: jump.lng!, t: jump.t!, accuracy: 5 }), ...after], [], 5000)).toBeNull();
  });

  it('time from the start stops at the first gap', () => {
    const first = east(0, 800, 0);
    const second = east(800, 2000, 800 / 3 + 30);
    const gaps: Array<[number, number]> = [[first.at(-1)![2], second[0]![2]]];
    expect(openMeters([...first, ...second], gaps)).toBeCloseTo(800, 0);
    expect(timeFromStartSec([...first, ...second], gaps, 800)).toBeCloseTo(800 / 3, 1);
    expect(timeFromStartSec([...first, ...second], gaps, 1500)).toBeNull();
  });

  it('a half marathon is the full distance, not a rounded 21 km', () => {
    const half = east(0, HALF_MARATHON_M, 0, 3, 200);
    expect(bestEffortSec(half, [], HALF_MARATHON_M)).toBeCloseTo(HALF_MARATHON_M / 3, 0);
    expect(bestEffortSec(half, [], HALF_MARATHON_M + 50)).toBeNull();
  });
});

describe('records (PLAN 4.6)', () => {
  const mile = (id: string, speed: number, endedAt: number): Run =>
    run({ id, points: east(0, 2000, 0, speed, 100), distanceM: 2000, movingSec: 2000 / speed, endedAt, startedAt: endedAt - 1 });

  it('the board keeps the fastest mile, the fastest 5 km and the longest, and leaves the rest empty', () => {
    const a = mile('a', 3, 100);
    const b = run({ id: 'b', points: east(0, 6000, 0, 4, 100), distanceM: 6000, movingSec: 1500, endedAt: 200, startedAt: 50 });
    const board = recordBoard([b, a]);
    expect(board.map((s) => s.title)).toEqual(['Fastest mile', 'Fastest 5 km', 'Fastest 10 km', 'Fastest half marathon', 'Longest run']);
    expect(board.find((s) => s.id === 'mile')!.hit).toMatchObject({ runId: 'b' });
    expect(board.find((s) => s.id === '5k')!.hit).toMatchObject({ runId: 'b' });
    expect(board.find((s) => s.id === '10k')!.hit).toBeNull();
    expect(board.find((s) => s.id === 'half')!.hit).toBeNull();
    expect(board.find((s) => s.id === 'long')!.hit).toMatchObject({ runId: 'b', value: 6000 });
    expect(titlesHeldBy(b, [a, b])).toEqual(['Fastest mile', 'Fastest 5 km', 'Longest run']);
    expect(titlesHeldBy(a, [a, b])).toEqual([]);
  });

  it('a tie stays with the earlier run, and a short run is not a record', () => {
    const a = mile('a', 3, 100);
    const same = mile('b', 3, 200);
    expect(recordBoard([same, a]).find((s) => s.id === 'mile')!.hit?.runId).toBe('a');
    const tiny = run({ id: 't', distanceM: 20, points: east(0, 20, 0, 2, 5), movingSec: 10, endedAt: 5 });
    expect(recordBoard([tiny]).every((s) => s.hit === null)).toBe(true);
  });

  it('a new record asks for the full screen, a first 5 km outranks the first longest, and a tiny gain stays quiet', () => {
    const first = mile('a', 3, 100);
    const moments = recordMoments(first, [first], 'km');
    expect(moments.every((m) => m.kind === 'run_record' && m.big)).toBe(true);
    expect(moments.map((m) => m.title)).toEqual(['Fastest mile', 'Longest run']);
    expect(moments.find((m) => m.id === 'run:a:mile')!.plus).toBeUndefined();
    expect(selectCelebrations(moments, 'summary').big?.title).toBe('Fastest mile');

    const five = run({ id: 'k', points: east(0, 5000, 0, 4, 100), distanceM: 5000, movingSec: 1250, endedAt: 50, startedAt: 1 });
    const fiveMoments = recordMoments(five, [five], 'km');
    expect(selectCelebrations(fiveMoments, 'summary').big?.title).toBe('Fastest 5 km');

    const faster = mile('c', 3.2, 300);
    const again = recordMoments(faster, [first, faster], 'mi');
    const mileMoment = again.find((m) => m.id === 'run:c:mile')!;
    expect(mileMoment.plus).toMatch(/faster$/);
    expect(mileMoment.hero).not.toContain('km');

    const hair = run({ id: 'h', points: east(0, 2000 + LONGEST_STEP_M - 1, 0, 3, 50), distanceM: 2000 + LONGEST_STEP_M - 1, movingSec: 700, endedAt: 400, startedAt: 300 });
    // Same pace as `first`, a little farther: the mile is not faster, and the extra distance is under the step.
    expect(recordMoments(hair, [first, hair], 'km').map((m) => m.title)).not.toContain('Longest run');
    expect(recordBoard([first, hair]).find((s) => s.id === 'long')!.hit?.runId).toBe('h');
  });

  it('the best split is the fastest timed one, and a GPS gap is never it', () => {
    expect(bestSplitIndexes({ splits: [400, 380, 390], splitGaps: [] })).toEqual([1]);
    expect(bestSplitIndexes({ splits: [300, 300, 310], splitGaps: [1] })).toEqual([1]);
    expect(bestSplitIndexes({ splits: [290, 290], splitGaps: [] })).toEqual([0, 1]);
    expect(bestSplitIndexes({ splits: [100], splitGaps: [1] })).toEqual([]);
  });
});

describe('new city and ghost (PLAN 4.6)', () => {
  it('the first stored city is a stamp, a repeat is not, and a blank city is nothing', () => {
    const a = run({ id: 'a', city: 'Tempe', country: 'US', endedAt: 10, startedAt: 1 });
    const stamp = newCityMoment(a, [a]);
    expect(stamp).toMatchObject({ kind: 'city_stamp', big: false, title: 'New city', hero: 'Tempe', detail: 'Tempe, US' });
    const again = run({ id: 'b', city: ' Tempe ', endedAt: 20, startedAt: 11 });
    expect(newCityMoment(again, [a, again])).toBeNull();
    const other = run({ id: 'c', city: 'Austin', endedAt: 30, startedAt: 21 });
    expect(newCityMoment(other, [a, other])?.hero).toBe('Austin');
    expect(newCityMoment(run({ id: 'd', city: '  ', endedAt: 40 }), [a])).toBeNull();
    // A run still going does not count as an earlier visit.
    expect(newCityMoment(a, [{ ...a, id: 'open', endedAt: undefined }])).toMatchObject({ hero: 'Tempe' });
  });

  it('says how the run compared, and says nothing when the other run is missing or a gap ate the start', () => {
    const ghost = run({ id: 'g', points: east(0, 1000, 0, 3, 50), distanceM: 1000, movingSec: 1000 / 3 });
    const faster = run({ id: 'f', ghostOfRunId: 'g', points: east(0, 1000, 0, 4, 50), distanceM: 1000, movingSec: 250 });
    const result = ghostResult(faster, [ghost, faster]);
    expect(result!.seconds).toBeGreaterThan(70);
    expect(result!.full).toBe(true);
    expect(ghostWords(result, 'km')).toMatch(/ahead of your earlier run$/);
    const slower = run({ id: 's', ghostOfRunId: 'g', points: east(0, 1000, 0, 2.5, 50), distanceM: 1000, movingSec: 400 });
    expect(ghostWords(ghostResult(slower, [ghost, slower]), 'km')).toMatch(/behind your earlier run$/);
    expect(ghostResult(run({ id: 'x', ghostOfRunId: 'missing' }), [ghost])).toBeNull();
    expect(ghostResult(run({ id: 'y' }), [ghost])).toBeNull();
    const broken = east(0, 40, 0, 2, 10);
    const rest = east(40, 1000, 40 / 2 + 40, 3, 50);
    const gapped = run({ id: 'gap', ghostOfRunId: 'g', points: [...broken, ...rest], gaps: [[broken.at(-1)![2], rest[0]![2]]], distanceM: 1000 });
    expect(ghostResult(gapped, [ghost, gapped])).toBeNull();
  });
});

describe('share card and GPX (PLAN 4.6)', () => {
  it('trims the first and last 200 m and hides a run the zone covers', () => {
    const pts = east(0, 1000, 0, 3, 20);
    const trimmed = trimPrivacy(pts, []);
    expect(trimmed.hidden).toBe(false);
    const left = trimmed.pieces.reduce((sum, piece) => sum + pathLengthM(piece), 0);
    expect(left).toBeGreaterThan(580);
    expect(left).toBeLessThan(620);
    const start = { lat: pts[0]![0], lng: pts[0]![1] };
    const end = { lat: pts.at(-1)![0], lng: pts.at(-1)![1] };
    expect(haversineM(start, trimmed.pieces[0]![0]!)).toBeCloseTo(PRIVACY_ZONE_M, 0);
    expect(haversineM(end, trimmed.pieces.at(-1)!.at(-1)!)).toBeCloseTo(PRIVACY_ZONE_M, 0);
    expect(trimPrivacy(east(0, 300, 0, 3, 20), []).hidden).toBe(true);
    expect(trimPrivacy([], []).hidden).toBe(false);
  });

  it('a gap stays a break in the trimmed line', () => {
    const first = east(0, 500, 0, 3, 25);
    const second = east(500, 1000, 500 / 3 + 40, 3, 25);
    const gaps: Array<[number, number]> = [[first.at(-1)![2], second[0]![2]]];
    const trimmed = trimPrivacy([...first, ...second], gaps);
    expect(trimmed.pieces.length).toBe(2);
  });

  it('the poster is the line and the stats, with the zone on by default and no invented city', () => {
    const long = run({ points: east(0, 1000, 0, 3, 25), distanceM: 1000, movingSec: 333, city: ' Tempe ' });
    const on = posterOf(long, 'km', true);
    const off = posterOf(long, 'km', false);
    expect(on.lines.length).toBeGreaterThan(0);
    expect(on.note).toBe('Start and end hidden');
    expect(off.note).toBeNull();
    expect(on.lines[0]!.length).toBeLessThan(off.lines[0]!.length);
    expect(on.city).toBe('Tempe');
    expect(on.distance).toBe('1.00 km');
    expect(on.mark).toBe('AnyGym');
    expect(on.pace).toMatch(/\/km$/);
    // North of the first point sits higher on the card (smaller y).
    const north = east(0, 0, 0);
    const up = at(0, 400, 80);
    const line = posterOf(run({ points: [...north, toRunPoint({ lat: up.lat!, lng: up.lng!, t: up.t!, accuracy: 5 })], distanceM: 400 }), 'km', false);
    expect(line.lines[0]![1]!.y).toBeLessThan(line.lines[0]![0]!.y);
    const hidden = posterOf(run({ points: east(0, 300, 0, 3, 20), distanceM: 300, city: '   ' }), 'km', true);
    expect(hidden.routeHidden).toBe(true);
    expect(hidden.lines).toEqual([]);
    expect(hidden.note).toBe('Route hidden');
    expect(hidden.city).toBeNull();
  });

  it('writes a GPX file a gap splits in two, with no elevation and escaped words', () => {
    const first = east(0, 100, 0, 3, 50);
    const second = east(100, 200, 100 / 3 + 20, 3, 50);
    const row = run({ type: 'distance', goal: '5 km & back', points: [...first, ...second], gaps: [[first.at(-1)![2], second[0]![2]]], distanceM: 200 });
    const gpx = gpxDocument(row);
    expect(gpx).toContain('creator="AnyGym"');
    expect(gpx).toContain('version="1.1"');
    expect(gpx).toContain('<type>running</type>');
    expect(gpx).toContain('5 km &amp; back');
    expect(gpx.match(/<trkseg>/g)).toHaveLength(2);
    expect(gpx).toContain(`lat="${first[0]![0].toFixed(6)}"`);
    expect(gpx).toContain(`lon="${first[0]![1].toFixed(6)}"`);
    expect(gpx).not.toContain('<ele>');
    expect(gpx).toContain(new Date(first[0]![2]).toISOString());
    expect(gpxFileName(row)).toMatch(/^AnyGym-run-\d{4}-\d{2}-\d{2}-\d{6}\.gpx$/);
  });
});

describe('heatmap (PLAN 4.6)', () => {
  it('the current city is the latest run that has one, and only that city is overlaid', () => {
    const tempe = run({ id: 't', city: 'Tempe', endedAt: 10, startedAt: 1, points: east(0, 500, 0, 3, 50) });
    const austin = run({ id: 'a', city: 'Austin', endedAt: 20, startedAt: 11, points: east(0, 800, 0, 3, 50) });
    const bare = run({ id: 'b', endedAt: 30, startedAt: 21 });
    const open = run({ id: 'o', city: 'Tempe', endedAt: undefined, startedAt: 40 });
    expect(currentCity([tempe, austin, bare, open])).toBe('Austin');
    expect(citiesOf([tempe, austin, bare])).toEqual(['Austin', 'Tempe']);
    expect(runsInCity([tempe, austin, bare, open], 'Tempe').map((r) => r.id)).toEqual(['t']);
    const geo = heatmapRoute(runsInCity([tempe, austin], 'Tempe'));
    expect(geo.solid.length).toBeGreaterThan(0);
    expect(geo.start).toBeNull();
    expect(geo.bounds).not.toBeNull();
    expect(heatmapRoute([])).toEqual({ solid: [], dashed: [], start: null, end: null, bounds: null });
  });
});
