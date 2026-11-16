import { describe, expect, it } from 'vitest';
import { MAX_ACCURACY_M } from '../../gps';
import { FIX_FRESH_MS, GEO_START, LOCATION_REASON, accuracyWords, gpsStatus, gpsWords, platformOf, turnOnSteps, type GeoState, type GpsStatus } from '../gpsStatus';
import { MUSIC_APPS } from '../music';

const NOW = 1_000_000;
const fix = (accuracy: number, age = 0) => ({ lat: 40, lng: -74, accuracy, t: NOW - age });
const st = (patch: Partial<GeoState>): GeoState => ({ ...GEO_START, ...patch });

describe('gps status', () => {
  it('asks before anything is known', () => {
    expect(gpsStatus(GEO_START, NOW)).toBe('ask');
    expect(gpsStatus(st({ permission: 'prompt' }), NOW)).toBe('ask');
  });
  it('searches while listening without a fix', () => {
    expect(gpsStatus(st({ permission: 'granted', watching: true }), NOW)).toBe('searching');
  });
  it('is good at the accuracy the run tracker trusts, weak past it', () => {
    expect(gpsStatus(st({ watching: true, fix: fix(MAX_ACCURACY_M) }), NOW)).toBe('good');
    expect(gpsStatus(st({ watching: true, fix: fix(MAX_ACCURACY_M + 0.1) }), NOW)).toBe('weak');
  });
  it('a stale fix goes back to searching', () => {
    expect(gpsStatus(st({ watching: true, fix: fix(5, FIX_FRESH_MS) }), NOW)).toBe('good');
    expect(gpsStatus(st({ watching: true, fix: fix(5, FIX_FRESH_MS + 1) }), NOW)).toBe('searching');
  });
  it('denied wins over everything, by permission or by error', () => {
    expect(gpsStatus(st({ permission: 'denied', watching: true, fix: fix(5) }), NOW)).toBe('denied');
    expect(gpsStatus(st({ problem: 'denied' }), NOW)).toBe('denied');
  });
  it('no signal when the phone gives up, until a fix arrives', () => {
    expect(gpsStatus(st({ watching: true, problem: 'unavailable' }), NOW)).toBe('no-signal');
    expect(gpsStatus(st({ watching: true, problem: 'timeout' }), NOW)).toBe('no-signal');
    expect(gpsStatus(st({ watching: true, problem: 'timeout', fix: fix(9) }), NOW)).toBe('good');
  });
  it('says so when there is no location API', () => {
    expect(gpsStatus(st({ supported: false }), NOW)).toBe('none');
  });
});

describe('gps words', () => {
  it('rounds accuracy so it never looks exact', () => {
    expect(accuracyWords(42, 'km')).toBe('about 40 m');
    expect(accuracyWords(3, 'km')).toBe('about 5 m');
    expect(accuracyWords(42, 'mi')).toBe('about 140 ft');
    expect(accuracyWords(1, 'mi')).toBe('about 10 ft');
  });
  it('the weak chip carries the accuracy in plain words', () => {
    expect(gpsWords('weak', fix(60), 'km', 'ios').chip).toBe('GPS weak · about 60 m');
    expect(gpsWords('weak', fix(60), 'mi', 'ios').chip).toBe('GPS weak · about 200 ft');
  });
  it('every status has a chip, a title and at least one line, and none tells the user to wait', () => {
    const all: GpsStatus[] = ['none', 'ask', 'searching', 'good', 'weak', 'denied', 'no-signal'];
    for (const s of all) {
      const w = gpsWords(s, fix(30), 'km', 'ios');
      expect(w.chip.length).toBeGreaterThan(0);
      expect(w.chip.length).toBeLessThanOrEqual(24);
      expect(w.title.length).toBeGreaterThan(0);
      expect(w.lines.length).toBeGreaterThan(0);
      expect(w.lines.join(' ')).not.toMatch(/wait (for|until)|before you start/i);
    }
  });
  it('searching, weak and no signal all say Start still works', () => {
    for (const s of ['searching', 'weak', 'no-signal'] as const) expect(gpsWords(s, fix(60), 'km', 'ios').lines.join(' ')).toMatch(/start/i);
  });
  it('denied says how to turn it on, by phone', () => {
    expect(gpsWords('denied', null, 'km', 'ios').lines).toEqual(turnOnSteps('ios'));
    expect(turnOnSteps('ios')[0]).toContain('Location Services');
    expect(turnOnSteps('android').join(' ')).toContain('Permissions');
    expect(turnOnSteps('other')).toHaveLength(2);
  });
  it('asking carries the one line reason', () => {
    expect(gpsWords('ask', null, 'km', 'other').lines).toEqual([LOCATION_REASON]);
    expect(LOCATION_REASON).toContain('never leaves your phone');
  });
  it('reads the phone from its user agent', () => {
    expect(platformOf('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe('ios');
    expect(platformOf('Mozilla/5.0 (Linux; Android 14; Pixel 7)')).toBe('android');
    expect(platformOf('Mozilla/5.0 (Macintosh)')).toBe('other');
  });
});

describe('music links', () => {
  it('are plain https links to the two music apps, nothing that claims control', () => {
    expect(MUSIC_APPS.map((m) => m.label)).toEqual(['Spotify', 'Apple Music']);
    for (const m of MUSIC_APPS) {
      expect(new URL(m.href).protocol).toBe('https:');
      expect(m.say).toMatch(/^Open /);
    }
  });
});
