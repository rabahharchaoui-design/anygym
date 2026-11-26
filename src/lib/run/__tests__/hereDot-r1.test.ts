// PLAN R1 (8): the start map kept the old dot as "you are here" after the signal was lost (it
// cleared only on denied). The dot shows only while the fix is fresh: good or weak.
import { describe, expect, it } from 'vitest';
import { FIX_FRESH_MS, GEO_START, gpsStatus, hereDot, type GeoState } from '../gpsStatus';

const T = 1_700_000_000_000;
const fix = { lat: 48, lng: 2, accuracy: 8, t: T };
const geo = (s: Partial<GeoState>): GeoState => ({ ...GEO_START, permission: 'granted', watching: true, fix, ...s });
const dot = (s: GeoState, now: number) => hereDot(s.fix, gpsStatus(s, now));

describe('R1 (8) the start map dot', () => {
  it('good and weak: the dot is where the phone is', () => {
    expect(dot(geo({}), T + 1000)).toBe(fix);
    expect(dot(geo({ fix: { ...fix, accuracy: 500 } }), T + 1000)).toEqual({ ...fix, accuracy: 500 });
  });
  it('signal lost (the fix went stale): no dot, even with the old fix kept', () => {
    expect(gpsStatus(geo({ problem: 'unavailable' }), T + FIX_FRESH_MS + 1)).toBe('no-signal');
    expect(dot(geo({ problem: 'unavailable' }), T + FIX_FRESH_MS + 1)).toBeNull();
    expect(dot(geo({}), T + FIX_FRESH_MS + 1)).toBeNull();
  });
  it('denied or not watching: no dot', () => {
    expect(dot(geo({ permission: 'denied' }), T + 1000)).toBeNull();
    expect(dot(geo({ watching: false }), T + FIX_FRESH_MS + 1)).toBeNull();
  });
});
