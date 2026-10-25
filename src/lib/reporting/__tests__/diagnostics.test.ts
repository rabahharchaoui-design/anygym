import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearErrors, currentRoute, describeValue, deviceInfo, installConsoleRing, noteRoute, parseDevice, pushError, recentErrors, reportRoute, RING_SIZE, sanitizeRoute, sanitizeText } from '../diagnostics';
import { IPHONE_UA, stubBrowser } from './env';

afterEach(() => {
  vi.unstubAllGlobals();
  clearErrors();
});

describe('sanitizeText', () => {
  it('removes emails, ids, long numbers, query strings, origins and home folders', () => {
    const out = sanitizeText(
      'Failed for jane.doe+gym@example.com on session 0f8c2a4e-1b2c-4d5e-8f90-123456789abc at https://rabahharchaoui-design.github.io/anygym/assets/index-Ab12Cd34.js?token=SECRET#frag:12:5 file:///Users/jane/notes.txt phone 5551234567 key A1b2C3d4E5f6G7h8I9j0K1l2M3',
    );
    expect(out).not.toMatch(/jane|example\.com|0f8c2a4e|SECRET|frag|5551234567|A1b2C3d4|github/);
    expect(out).toContain('[email]');
    expect(out).toContain('[id]');
    expect(out).toContain(' index-Ab12Cd34.js:12:5 ');
    expect(out).toContain('[phone]');
  });

  it('bounds the length and collapses whitespace', () => {
    expect(sanitizeText('a   b\n\nc')).toBe('a b c');
    expect(sanitizeText('x'.repeat(500), 50)).toHaveLength(50);
    expect(sanitizeText('y'.repeat(500))).toHaveLength(160);
  });

  it('names, phone numbers, emails and digit runs of 6 or more never survive', () => {
    expect(sanitizeText('Quentin Privateperson, phone 602-555-1234, mail a@b.co')).toBe('[name] [name], phone [phone], mail [email]');
    expect(sanitizeText('code 123456 and +1 (602) 555 1234 and 12345')).toBe('code [n] and [phone] and 12345');
    expect(sanitizeText("TypeError: Cannot read properties of undefined (reading 'gymName')")).toBe("TypeError: Cannot read properties of undefined (reading 'gymName')");
    expect(sanitizeText('see https://maps.example/Quentin/home?x=1 now')).toBe('see [url] now');
  });
});

describe('sanitizeRoute', () => {
  it.each([
    ['#/', '/'],
    ['#/workout/0f8c2a4e-1b2c-4d5e-8f90-123456789abc', '/workout/:id'],
    ['#/workout/abc/done', '/workout/:id/done'],
    ['#/workout/abc/barbell-incline-bench-press', '/workout/:id/:exercise'],
    ['#/dev/viewport', '/dev/viewport'],
    ['#/alice smith/14 oak street', '/unknown'],
    ['#/settings/jane-doe', '/unknown'],
    ['#/run', '/run'],
    ['#/history/sess-1?x=1', '/history/:id'],
    ['#/plans/five-day-split', '/plans/:id'],
    ['#/settings/import', '/settings/import'],
    ['/dev/Viewport123', '/unknown'],
    ['', '/'],
  ])('%s → %s', (input, out) => expect(sanitizeRoute(input)).toBe(out));
});

describe('describeValue', () => {
  it('never stringifies objects', () => {
    expect(describeValue(new TypeError('bad'))).toBe('TypeError: bad');
    expect(describeValue({ name: 'Secret Gym', notes: 'private' })).toBe('[object]');
    expect(describeValue({ message: 'has a message' })).toBe('has a message');
    expect(describeValue(42)).toBe('42');
    expect(describeValue(undefined)).toBe('undefined');
  });
});

describe('the error ring', () => {
  it('keeps the last 20, allowlisted: code, fixed text, script location', () => {
    for (let i = 0; i < 25; i++) pushError(i % 2 ? `TypeError: error ${i} for a@b.co` : `error ${i} for a@b.co`, i === 24 ? 'index-Ab12Cd34.js:1:2' : null);
    const ring = recentErrors();
    expect(ring).toHaveLength(RING_SIZE);
    expect(ring[0]).toBe('TypeError: details hidden');
    expect(ring[1]).toBe('Error: details hidden');
    expect(ring.at(-1)).toBe('Error: details hidden at index-Ab12Cd34.js:1:2');
    pushError('account alice smith at 14 oak street failed', 'alice smith.js');
    expect(recentErrors().at(-1)).toBe('Error: details hidden');
  });

  it('wraps console.error once, keeps its behavior and return value, and copies the text', () => {
    const calls: unknown[][] = [];
    const target = { error: (...a: unknown[]) => (calls.push(a), 'ret') as unknown as void };
    installConsoleRing(target);
    installConsoleRing(target);
    const obj = { secret: 'Zeta Gym' };
    expect(target.error('Boom', new Error('inner'), obj)).toBe('ret');
    expect(calls).toEqual([['Boom', expect.any(Error), obj]]);
    expect(recentErrors()).toEqual(['Error: details hidden']);
    target.error('workout for jane doe at 12 oak road failed', new RangeError('jane doe'));
    expect(recentErrors().at(-1)).toBe('RangeError: details hidden');
  });
});

describe('screens and the phone', () => {
  beforeEach(() => stubBrowser('#/workout/abc123'));

  it('remembers the last screen before Settings', () => {
    noteRoute('#/workout/0f8c2a4e-1b2c-4d5e-8f90-123456789abc');
    noteRoute('#/settings');
    expect(reportRoute()).toBe('/workout/:id');
    expect(currentRoute()).toBe('/workout/:id');
  });

  it('reads model and iOS version from the user agent', () => {
    expect(parseDevice(IPHONE_UA)).toEqual({ model: 'iPhone', os: 'iOS 18.2' });
    expect(parseDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit', 5)).toEqual({ model: 'iPad', os: 'iPadOS unknown' });
    expect(parseDevice('Mozilla/5.0 (Linux; Android 14; Pixel 7)')).toEqual({ model: 'Android', os: 'Android 14' });
    expect(parseDevice('Mozilla/5.0 (Windows NT 10.0)')).toEqual({ model: 'Other', os: 'unknown' });
    expect(deviceInfo()).toEqual({ model: 'iPhone', os: 'iOS 18.2', viewport: '393x852', dpr: 3, standalone: true });
  });
});
