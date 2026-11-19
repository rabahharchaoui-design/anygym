// SPEC 12.2 "honest dashed gaps" and SPEC 12.3 smoothing for drawing only.
import { describe, expect, it } from 'vitest';
import { fromRunPoint, processPoints, processTrack, smoothForDrawing, smoothPoints, toRunGaps, toRunPoint, toSegments, type GpsPoint, type TrackInput } from '..';
import { at, straight, T0 } from './fixtures';

const KM = { splitM: 1000 };
const P = (east: number, north: number, sec: number) => at(east, north, sec) as GpsPoint;
const zigzag = (n: number, startSec = 0, startEast = 0) => Array.from({ length: n }, (_, i) => P(startEast + 3 * i, i % 2 ? 2 : -2, startSec + i));

describe('stored shapes', () => {
  it('a point goes to the stored tuple and back unchanged', () => {
    const p = P(12, 34, 5);
    expect(toRunPoint(p)).toEqual([p.lat, p.lng, T0 + 5000, 5]);
    expect(fromRunPoint(toRunPoint(p))).toEqual(p);
  });

  it('breaks are stored as the timestamps on both sides', () => {
    expect(toRunGaps([{ fromT: 1, toT: 9, kind: 'gap', bridged: true, distanceM: 20 }, { fromT: 20, toT: 30, kind: 'pause', bridged: false, distanceM: 0 }])).toEqual([[1, 9], [20, 30]]);
  });
});

describe('toSegments', () => {
  it('is one solid piece without breaks, and nothing for no points', () => {
    const pts = zigzag(6);
    expect(toSegments(pts, [])).toEqual([{ points: pts, dashedFromPrev: false }]);
    expect(toSegments([], [])).toEqual([]);
  });

  it('cuts at a gap and at a pause by hand, and marks the join as dashed', () => {
    const inputs: TrackInput[] = [
      ...straight({ speed: 3, seconds: 20 }),
      ...straight({ speed: 3, seconds: 20, startSec: 60, startEast: 180 }),
    ].map((point) => ({ type: 'point' as const, point }));
    inputs.push({ type: 'pause' }, { type: 'resume' }, { type: 'point', point: at(300, 50, 90) }, { type: 'point', point: at(303, 50, 91) });
    const r = processTrack(inputs, KM);
    const segments = toSegments(r.points, toRunGaps(r.breaks));
    expect(segments.map((s) => [s.points.length, s.dashedFromPrev])).toEqual([[21, false], [21, true], [2, true]]);
    expect(segments.flatMap((s) => s.points)).toEqual(r.points);
  });

  it('a long auto pause is not a break: the line simply goes on from the spot', () => {
    const stop = Array.from({ length: 60 }, (_, i) => at(60, 0, 21 + i));
    const r = processPoints([...straight({ speed: 3, seconds: 20 }), ...stop, ...straight({ speed: 3, seconds: 20, startSec: 81, startEast: 60 })], KM);
    expect(r.breaks).toEqual([]);
    expect(toSegments(r.points, toRunGaps(r.breaks))).toHaveLength(1);
  });
});

describe('smoothPoints', () => {
  it('keeps the first and the last point exactly, and every timestamp and accuracy', () => {
    const pts = zigzag(9);
    const out = smoothPoints(pts);
    expect(out[0]).toBe(pts[0]);
    expect(out[8]).toBe(pts[8]);
    expect(out.map((p) => [p.t, p.accuracy])).toEqual(pts.map((p) => [p.t, p.accuracy]));
  });

  it('averages 5 points in the middle and 3 next to the ends', () => {
    const pts = zigzag(9);
    const out = smoothPoints(pts, 5);
    const mean = (from: number, to: number) => pts.slice(from, to + 1).reduce((s, p) => s + p.lat, 0) / (to - from + 1);
    expect(out[1]!.lat).toBeCloseTo(mean(0, 2), 12);
    expect(out[4]!.lat).toBeCloseTo(mean(2, 6), 12);
    expect(out[7]!.lat).toBeCloseTo(mean(6, 8), 12);
  });

  it('uses 3 points for a window of 3 or 4 and for anything smaller, 5 for anything larger', () => {
    const pts = zigzag(9);
    expect(smoothPoints(pts, 4)).toEqual(smoothPoints(pts, 3));
    expect(smoothPoints(pts, 1)).toEqual(smoothPoints(pts, 3));
    expect(smoothPoints(pts, 9)).toEqual(smoothPoints(pts, 5));
    expect(smoothPoints(pts, 3)).not.toEqual(smoothPoints(pts, 5));
  });

  it('flattens a zigzag and leaves a straight line where it is', () => {
    const off = (p: GpsPoint) => Math.abs(p.lat - 40);
    const pts = zigzag(9);
    expect(off(smoothPoints(pts)[4]!)).toBeLessThan(off(pts[4]!) / 4);
    const line = Array.from({ length: 7 }, (_, i) => P(3 * i, 0, i));
    smoothPoints(line).forEach((p, i) => {
      expect(p.lat).toBeCloseTo(line[i]!.lat, 12);
      expect(p.lng).toBeCloseTo(line[i]!.lng, 12);
    });
  });

  it('leaves one or two points alone, and works across the date line', () => {
    expect(smoothPoints([])).toEqual([]);
    const two = zigzag(2);
    expect(smoothPoints(two)).toEqual(two);
    const dateLine: GpsPoint[] = [179.9998, 179.9999, -180, -179.9999, -179.9998].map((lng, i) => ({ lat: 0, lng, t: i, accuracy: 5 }));
    const out = smoothPoints(dateLine);
    expect(Math.abs(Math.abs(out[2]!.lng) - 180)).toBeLessThan(1e-9);
    expect(out[1]!.lng).toBeCloseTo(179.9999, 9);
  });
});

describe('smoothForDrawing', () => {
  it('never averages across a gap or a pause: each piece is smoothed on its own', () => {
    const a = zigzag(8);
    const b = zigzag(8, 100, 500);
    const gaps: Array<[number, number]> = [[a[7]!.t, b[0]!.t]];
    const out = smoothForDrawing([...a, ...b], gaps, 5);
    expect(out).toEqual([{ points: smoothPoints(a, 5), dashedFromPrev: false }, { points: smoothPoints(b, 5), dashedFromPrev: true }]);
    // The ends of both pieces sit on real positions.
    expect(out[0]!.points[7]).toBe(a[7]);
    expect(out[1]!.points[0]).toBe(b[0]);
    // Without the break the same points would be pulled toward each other.
    expect(smoothForDrawing([...a, ...b], [])[0]!.points[7]).not.toEqual(a[7]);
  });

  it('does not change the distance: the tracker never sees smoothed points', () => {
    const raw = zigzag(60);
    const r = processPoints(raw, KM);
    const before = r.reading.distanceM;
    // PLAN 4.4d: the track is the tracker's estimate (estimate.ts), no longer the raw fixes; what
    // this protects is that drawing never changes it, nor the distance.
    const track = r.points.map((p) => ({ ...p }));
    smoothForDrawing(r.points, toRunGaps(r.breaks));
    expect(r.points).toEqual(track);
    expect(processPoints(raw, KM).reading.distanceM).toBe(before);
  });
});
