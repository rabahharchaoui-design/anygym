// SPEC 12.3: haversine and the filter (accuracy worse than 25 m, more than 8 m/s, time order, gaps).
import { describe, expect, it } from 'vitest';
import { EARTH_RADIUS_M, filterPoints, haversineM, judgePoint, pathLengthM, GAP_BRIDGE_MAX_SEC, GAP_SEC, MAX_ACCURACY_M, POOR_ACCURACY_M, type GpsPoint, type RawPoint } from '..';
import { at, straight, T0 } from './fixtures';

const good = (raw: RawPoint): GpsPoint => {
  const v = judgePoint(null, raw);
  if (!v.ok) throw new Error('fixture point rejected');
  return v.point;
};

describe('haversineM', () => {
  it('is 0 for the same position and symmetric', () => {
    const a = { lat: 48.8566, lng: 2.3522 };
    const b = { lat: 51.5074, lng: -0.1278 };
    expect(haversineM(a, a)).toBe(0);
    expect(haversineM(a, b)).toBe(haversineM(b, a));
  });

  it('matches known distances', () => {
    // One degree of latitude is R × π / 180.
    expect(haversineM({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo((EARTH_RADIUS_M * Math.PI) / 180, 6);
    // Paris to London, about 343.5 km.
    expect(haversineM({ lat: 48.8566, lng: 2.3522 }, { lat: 51.5074, lng: -0.1278 }) / 1000).toBeCloseTo(343.5, 0);
    // Half way round the globe, and never NaN.
    expect(haversineM({ lat: 0, lng: 0 }, { lat: 0, lng: 180 })).toBeCloseTo(Math.PI * EARTH_RADIUS_M, 3);
  });

  it('agrees with the fixture layout to a millimeter over 100 m', () => {
    expect(haversineM(good(at(0, 0, 0)), good(at(100, 0, 1)))).toBeCloseTo(100, 3);
    expect(haversineM(good(at(0, 0, 0)), good(at(0, 100, 1)))).toBeCloseTo(100, 3);
  });

  it('sums a path, and gives 0 for fewer than two points', () => {
    const pts = [at(0, 0, 0), at(30, 0, 10), at(30, 40, 20)].map(good);
    expect(pathLengthM(pts)).toBeCloseTo(70, 3);
    expect(pathLengthM(pts.slice(0, 1))).toBe(0);
    expect(pathLengthM([])).toBe(0);
  });
});

describe('judgePoint: what is dropped', () => {
  const prev = good(at(0, 0, 0));

  it('never trusts a point without a timestamp', () => {
    for (const t of [undefined, null, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(judgePoint(prev, { ...at(3, 0, 1), t })).toEqual({ ok: false, reason: 'no-time' });
    }
  });

  it('drops a position that is missing or off the globe', () => {
    for (const patch of [{ lat: null }, { lng: undefined }, { lat: 90.1 }, { lng: -180.5 }, { lat: Number.NaN }]) {
      expect(judgePoint(prev, { ...at(3, 0, 1), ...patch })).toEqual({ ok: false, reason: 'bad-position' });
    }
  });

  // PLAN 4.4d (3): fixes worse than 25 m are kept up to POOR_ACCURACY_M (65 m), weighted by the
  // estimate; was: dropped above 25 m (that froze the run for minutes at a cold start).
  it('drops accuracy worse than 65 m, and a point that does not say its accuracy', () => {
    expect(judgePoint(prev, at(3, 0, 1, MAX_ACCURACY_M)).ok).toBe(true);
    expect(judgePoint(prev, at(3, 0, 1, 60)).ok).toBe(true);
    expect(judgePoint(prev, at(3, 0, 1, POOR_ACCURACY_M)).ok).toBe(true);
    for (const accuracy of [POOR_ACCURACY_M + 0.1, 99, -1, null, undefined, Number.NaN]) {
      expect(judgePoint(prev, { ...at(3, 0, 1), accuracy })).toEqual({ ok: false, reason: 'accuracy' });
    }
  });

  it('drops a timestamp that goes backwards or stands still', () => {
    expect(judgePoint(prev, at(3, 0, -1))).toEqual({ ok: false, reason: 'time-backwards' });
    expect(judgePoint(prev, at(3, 0, 0))).toEqual({ ok: false, reason: 'time-backwards' });
  });

  // PLAN 4.4d (3): what the two fixes' accuracy allows (5 m + 5 m here) is not speed: the limit is
  // 8 m/s beyond 10 m (was: 8 m/s from the first meter).
  it('drops a jump faster than 8 m/s from the previous good point, beyond both accuracy circles', () => {
    expect(judgePoint(prev, at(17.9, 0, 1))).toMatchObject({ ok: true, link: 'step' });
    expect(judgePoint(prev, at(18.1, 0, 1))).toEqual({ ok: false, reason: 'speed' });
    // 100 m away is fine after 20 s of dropped fixes... and still a spike after 10 s.
    expect(judgePoint(prev, at(100, 0, 10))).toEqual({ ok: false, reason: 'speed' });
  });

  it('accepts the very first point as it is', () => {
    expect(judgePoint(null, at(5, 5, 3))).toMatchObject({ ok: true, link: 'first', point: { t: T0 + 3000, accuracy: 5 } });
  });
});

describe('judgePoint: after a gap', () => {
  const prev = good(at(0, 0, 0));

  it('is not a gap at exactly GAP_SEC, and is one just after', () => {
    expect(judgePoint(prev, at(30, 0, GAP_SEC))).toMatchObject({ ok: true, link: 'step' });
    expect(judgePoint(prev, at(30, 0, GAP_SEC + 0.001))).toMatchObject({ ok: true, link: 'gap', bridged: true });
  });

  it('judges the point against the real time of the gap, not the distance alone', () => {
    // 400 m away: a spike after one second, an ordinary run after two minutes.
    expect(judgePoint(prev, at(400, 0, 1))).toEqual({ ok: false, reason: 'speed' });
    expect(judgePoint(prev, at(400, 0, 120))).toMatchObject({ ok: true, link: 'gap', bridged: true });
  });

  it('includes the exact five minute and 8 m/s boundaries', () => {
    // Zero accuracy on both points: the speed across a gap subtracts both fixes' accuracy (PLAN 4.4d),
    // so only perfect fixes put the 8 m/s line exactly at 480 m in 60 s.
    const origin = good({ lat: 0, lng: 0, t: T0, accuracy: 0 });
    const point = (meters: number, seconds: number) => ({ lat: 0, lng: meters / EARTH_RADIUS_M * 180 / Math.PI, t: T0 + seconds * 1000, accuracy: 0 });
    expect(judgePoint(origin, point(600, 300))).toMatchObject({ link: 'gap', bridged: true });
    expect(judgePoint(origin, point(600, 300.001))).toMatchObject({ link: 'gap', bridged: false });
    expect(judgePoint(origin, point(8 * 60, 60))).toMatchObject({ link: 'gap', bridged: true });
    expect(judgePoint(origin, point(8 * 60 + 0.001, 60))).toMatchObject({ link: 'gap', bridged: false });
  });

  it('keeps an impossible jump after a gap as a fresh start, without counting the line across', () => {
    // 5 km in one minute is 83 m/s.
    expect(judgePoint(prev, at(5000, 0, 60))).toMatchObject({ ok: true, link: 'gap', bridged: false });
  });

  it('does not count the line across a gap longer than five minutes, however slow', () => {
    expect(judgePoint(prev, at(600, 0, GAP_BRIDGE_MAX_SEC))).toMatchObject({ link: 'gap', bridged: true });
    expect(judgePoint(prev, at(600, 0, GAP_BRIDGE_MAX_SEC + 1))).toMatchObject({ link: 'gap', bridged: false });
  });

  it('the first point after a pause by hand is checked for time order only', () => {
    expect(judgePoint(prev, at(5000, 0, 2), true)).toMatchObject({ ok: true, link: 'first' });
    expect(judgePoint(prev, at(5000, 0, 0), true)).toEqual({ ok: false, reason: 'time-backwards' });
    expect(judgePoint(prev, { ...at(1, 0, 2), accuracy: 80 }, true)).toEqual({ ok: false, reason: 'accuracy' });
  });
});

describe('filterPoints: a track with spikes', () => {
  const clean = straight({ speed: 3, seconds: 60 });
  const dirty: RawPoint[] = [...clean];
  dirty.splice(50, 0, { ...at(150, 0, 49.5), t: null }); // no time
  dirty.splice(40, 0, at(118, 0, 20)); // time going backwards
  dirty.splice(30, 0, at(88, 0, 29.5, 70)); // poor accuracy
  dirty.splice(20, 0, at(58.5, 300, 19.5)); // a 300 m spike
  dirty.splice(10, 0, at(28.5, -900, 9.5)); // a 900 m spike

  it('drops every bad point with its reason and keeps the clean track exactly', () => {
    const out = filterPoints(dirty);
    expect(out.good).toEqual(clean);
    expect(out.rejected).toEqual([
      { index: 10, reason: 'speed' },
      { index: 21, reason: 'speed' },
      { index: 32, reason: 'accuracy' },
      { index: 43, reason: 'time-backwards' },
      { index: 54, reason: 'no-time' },
    ]);
  });

  it('a wrong first point cannot block the track for longer than GAP_SEC', () => {
    // The first fix is 2 km off. The real points look like spikes until the gap rule lets one in.
    const out = filterPoints([at(2000, 0, 0), ...clean.slice(1)]);
    expect(out.rejected.every((r) => r.reason === 'speed')).toBe(true);
    expect(out.rejected).toHaveLength(GAP_SEC);
    expect(out.good[1]).toEqual(clean[GAP_SEC + 1]);
    expect(out.good).toHaveLength(1 + clean.length - 1 - GAP_SEC);
  });

  it('gives nothing for nothing', () => {
    expect(filterPoints([])).toEqual({ good: [], rejected: [] });
  });
});
