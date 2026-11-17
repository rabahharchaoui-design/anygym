import { describe, expect, it } from 'vitest';
import { METERS_PER_MILE } from '../../gps';
import { distanceWithUnit, formatDistance, formatDistanceLeft, formatPace, NO_PACE, paceUnit, spokenPace } from '../format';
import { allowedWhenLocked, controlAllowed, HOLD_MS, HOLD_SLOP_PX, holdDone, holdFraction, holdLeft, releaseHold, startHold, type LockControl } from '../hold';
import { DIM_AFTER_MS, isDimmed, msUntilDim, touch } from '../dim';

describe('formatDistance', () => {
  it('two decimals in the unit, cut, never lifted', () => {
    expect(formatDistance(0, 'km')).toBe('0.00');
    expect(formatDistance(1234, 'km')).toBe('1.23');
    expect(formatDistance(1239.9, 'km')).toBe('1.23');
    expect(formatDistance(4999.9, 'km')).toBe('4.99');
    expect(formatDistance(5000, 'km')).toBe('5.00');
    expect(formatDistance(42195, 'km')).toBe('42.19');
    expect(formatDistance(METERS_PER_MILE, 'mi')).toBe('1.00');
    expect(formatDistance(3 * METERS_PER_MILE, 'mi')).toBe('3.00');
    expect(formatDistance(1600, 'mi')).toBe('0.99');
    expect(distanceWithUnit(5000, 'km')).toBe('5.00 km');
  });
  it('exact tenths survive the float division', () => {
    for (let i = 0; i <= 500; i++) expect(formatDistance(i * 10, 'km')).toBe((i / 100).toFixed(2));
  });
  it('nonsense is zero, never NaN', () => {
    expect(formatDistance(NaN, 'km')).toBe('0.00');
    expect(formatDistance(-5, 'mi')).toBe('0.00');
    expect(formatDistance(Infinity, 'km')).toBe('0.00');
  });
  it('what is left is lifted', () => {
    expect(formatDistanceLeft(0, 'km')).toBe('0.00');
    expect(formatDistanceLeft(1, 'km')).toBe('0.01');
    expect(formatDistanceLeft(3800, 'km')).toBe('3.80');
    expect(formatDistanceLeft(3801, 'km')).toBe('3.81');
    expect(formatDistanceLeft(2 * METERS_PER_MILE, 'mi')).toBe('2.00');
    expect(formatDistanceLeft(NaN, 'km')).toBe('0.00');
  });
});

describe('formatPace', () => {
  it('minutes and seconds per km or mile', () => {
    expect(formatPace(0.312, 'km')).toBe('5:12');
    expect(formatPace(0.3, 'km')).toBe('5:00');
    expect(formatPace(0.3, 'mi')).toBe('8:03');
    expect(formatPace(0.2999, 'km')).toBe('5:00');
    expect(formatPace(0.6594, 'km')).toBe('10:59');
    expect(formatPace(0.0595, 'km')).toBe('1:00');
    expect(paceUnit('km')).toBe('/km');
    expect(paceUnit('mi')).toBe('/mi');
  });
  it('a pace that is not known is "--", never a guess', () => {
    expect(formatPace(null, 'km')).toBe(NO_PACE);
    expect(NO_PACE).toBe('--');
    expect(formatPace(NaN, 'km')).toBe('--');
    expect(formatPace(0, 'km')).toBe('--');
    expect(formatPace(-1, 'km')).toBe('--');
    expect(formatPace(Infinity, 'mi')).toBe('--');
    expect(formatPace(3.6, 'km')).toBe('--');
    expect(formatPace(3.59, 'km')).toBe('59:50');
  });
  it('spoken for screen readers', () => {
    expect(spokenPace(0.312, 'km')).toBe('5 minutes 12 seconds per km');
    expect(spokenPace(null, 'mi')).toBe('no pace yet');
  });
});

describe('hold', () => {
  it('fills over one second', () => {
    const h = startHold(1000, 10, 10);
    expect(HOLD_MS).toBe(1000);
    expect(holdFraction(null, 5000)).toBe(0);
    expect(holdFraction(h, 1000)).toBe(0);
    expect(holdFraction(h, 1500)).toBe(0.5);
    expect(holdFraction(h, 2000)).toBe(1);
    expect(holdFraction(h, 9000)).toBe(1);
    expect(holdFraction(h, 500)).toBe(0);
  });
  it('releasing early cancels; only the full hold acts', () => {
    const h = startHold(1000);
    expect(releaseHold(h, 1999)).toBe('cancel');
    expect(releaseHold(h, 2000)).toBe('done');
    expect(releaseHold(null, 5000)).toBe('cancel');
    expect(holdDone(h, 1999)).toBe(false);
    expect(holdDone(h, 2000)).toBe(true);
    expect(holdDone(null, 2000)).toBe(false);
    expect(releaseHold(h, 1400, 400)).toBe('done');
  });
  it('a finger that slides off cancels', () => {
    const h = startHold(0, 100, 100);
    expect(holdLeft(h, 100 + HOLD_SLOP_PX, 100)).toBe(false);
    expect(holdLeft(h, 100 + HOLD_SLOP_PX + 1, 100)).toBe(true);
    expect(holdLeft(h, 70, 70)).toBe(true);
  });
  it('locked: only the unlock hold answers', () => {
    const all: LockControl[] = ['pause', 'resume', 'end', 'lock', 'unlock', 'cycle', 'page', 'settings', 'hide', 'recentre'];
    expect(all.filter(allowedWhenLocked)).toEqual(['unlock']);
    expect(all.filter((c) => controlAllowed(true, c))).toEqual(['unlock']);
    expect(all.filter((c) => controlAllowed(false, c))).toEqual(all);
  });
});

describe('dim timer', () => {
  it('dims after 10 s with no touch, only where dimming applies', () => {
    expect(DIM_AFTER_MS).toBe(10_000);
    expect(isDimmed({ lastTouchAt: 0, now: 9_999, enabled: true })).toBe(false);
    expect(isDimmed({ lastTouchAt: 0, now: 10_000, enabled: true })).toBe(true);
    expect(isDimmed({ lastTouchAt: 0, now: 60_000, enabled: false })).toBe(false);
    expect(msUntilDim({ lastTouchAt: 1000, now: 4000, enabled: true })).toBe(7000);
    expect(msUntilDim({ lastTouchAt: 1000, now: 40_000, enabled: true })).toBe(0);
    expect(msUntilDim({ lastTouchAt: 1000, now: 4000, enabled: false })).toBeNull();
  });
  it('the first tap on a dimmed screen only wakes; the timer starts again', () => {
    expect(touch(true, 20_000)).toEqual({ lastTouchAt: 20_000, pass: false });
    expect(touch(false, 20_000)).toEqual({ lastTouchAt: 20_000, pass: true });
    expect(isDimmed({ lastTouchAt: touch(true, 20_000).lastTouchAt, now: 29_999, enabled: true })).toBe(false);
  });
});
