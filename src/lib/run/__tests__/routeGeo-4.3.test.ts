import { describe, expect, it } from 'vitest';
import type { GpsPoint } from '../../gps';
import { drawRoute, routeGeo } from '../routeGeo';

const p = (lng: number, lat: number, t: number): GpsPoint => ({ lat, lng, t, accuracy: 5 });

describe('routeGeo', () => {
  it('no position: nothing to draw', () => {
    expect(routeGeo([])).toEqual({ solid: [], dashed: [], start: null, end: null, bounds: null });
    expect(routeGeo([{ points: [], dashedFromPrev: false }]).start).toBeNull();
  });
  it('solid pieces in [lng, lat], a dashed join across each break, never a solid line through it', () => {
    const geo = routeGeo([
      { points: [p(1, 10, 0), p(2, 11, 1)], dashedFromPrev: false },
      { points: [p(5, 12, 9), p(6, 13, 10), p(7, 12.5, 11)], dashedFromPrev: true },
      { points: [p(9, 9, 20)], dashedFromPrev: true },
    ]);
    expect(geo.solid).toEqual([[[1, 10], [2, 11]], [[5, 12], [6, 13], [7, 12.5]]]);
    expect(geo.dashed).toEqual([[[2, 11], [5, 12]], [[7, 12.5], [9, 9]]]);
    expect(geo.start).toEqual([1, 10]);
    expect(geo.end).toEqual([9, 9]);
    expect(geo.bounds).toEqual([1, 9, 9, 13]);
  });
  it('one position: a start and bounds, no line', () => {
    expect(routeGeo([{ points: [p(3, 4, 0)], dashedFromPrev: false }])).toEqual({ solid: [], dashed: [], start: [3, 4], end: [3, 4], bounds: [3, 4, 3, 4] });
  });
  it('drawRoute cuts at the stored gaps and keeps the ends where they are', () => {
    const pts = [p(0, 0, 0), p(1, 0.4, 1), p(2, 0, 2), p(3, 0.4, 3), p(10, 0, 50), p(11, 0, 51)];
    const geo = drawRoute(pts, [[3, 50]]);
    expect(geo.solid).toHaveLength(2);
    expect(geo.dashed).toEqual([[[3, 0.4], [10, 0]]]);
    expect(geo.start).toEqual([0, 0]);
    expect(geo.end).toEqual([11, 0]);
    // Smoothed in the middle, for drawing only.
    expect(geo.solid[0]![1]![1]).not.toBe(0.4);
  });
});
