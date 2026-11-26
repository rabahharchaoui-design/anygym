// PLAN R3 (2): the live map kept the "You are here" dot, the centring and "Back to where I am" on the
// last position after GPS was lost or location was denied. The same rule as the start map (R1 8):
// the dot shows only while GPS is good or weak.
import { describe, expect, it } from 'vitest';
import { FIX_FRESH_MS, liveGpsStatus, liveHere } from '../gpsStatus';

const T = 1_700_000_000_000;
const here = { lat: 48, lng: 2, accuracy: 8, t: T };
const run = (over: Partial<{ here: typeof here | null; gps: 'denied' | 'unavailable' | null }> = {}) => ({ here, gps: null, ...over });

describe('R3 (2) the live map dot', () => {
  it('a fresh position: the dot is there', () => {
    expect(liveGpsStatus(run(), T + 1000)).toBe('good');
    expect(liveHere(run(), T + 1000)).toEqual(here);
  });
  it('GPS lost (no position for a while): no dot, though the last position is kept', () => {
    expect(liveHere(run(), T + FIX_FRESH_MS + 1)).toBeNull();
    expect(liveGpsStatus(run({ gps: 'unavailable' }), T + FIX_FRESH_MS + 1)).toBe('no-signal');
    expect(liveHere(run({ gps: 'unavailable' }), T + FIX_FRESH_MS + 1)).toBeNull();
  });
  it('location denied: no dot, even right after the last position', () => {
    expect(liveGpsStatus(run({ gps: 'denied' }), T + 1000)).toBe('denied');
    expect(liveHere(run({ gps: 'denied' }), T + 1000)).toBeNull();
  });
  it('no position yet: no dot', () => {
    expect(liveHere(run({ here: null }), T)).toBeNull();
  });
});
