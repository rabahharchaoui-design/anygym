import { describe, expect, it } from 'vitest';
import { autoMessage, autoSignature, formatPush, maskRoute, maskStack, maskText, stackRefs } from '../mask';

describe('mask', () => {
  it('keeps code words and our script locations, masks names', () => {
    expect(maskText('QuotaExceededError: The quota has been exceeded.')).toBe('QuotaExceededError: The quota has been exceeded.');
    expect(maskText('Error: Hello Quentin at http://localhost:4173/anygym/assets/index-A1b2C3d4.js:3:9')).toBe('Error: [name] [name] at index-A1b2C3d4.js:3:9');
  });

  it('names are runs of capitalized words or follow a title; single capitalized words stay', () => {
    expect(maskText('Quentin Privateperson, phone 602-555-1234, mail a@b.co')).toBe('[name] [name], phone [phone], mail [email]');
    expect(maskText('Bench press froze')).toBe('Bench press froze');
    expect(maskText('Smith machine stuck')).toBe('Smith machine stuck');
    expect(maskText('The Smith machine stuck at Gold Coast Gym')).toBe('The Smith machine stuck at [name] [name] Gym');
    expect(maskText('Coach Carter and Dr. Who')).toBe('Coach [name] and Dr. [name]');
  });

  it('stack frames only from our own scripts', () => {
    const own = (u: string) => u.includes('/anygym/');
    expect(maskStack('a@http://x/anygym/assets/index-I1j2K3l4.js:1:2\nb@http://y/other.js:3:4\n    at c (http://x/anygym/assets/index-I1j2K3l4.js:5:6)', own)).toBe('index-I1j2K3l4.js:1:2\nindex-I1j2K3l4.js:5:6');
    // Function names never pass: they can be anything.
    expect(maskStack('aliceSmith@http://x/anygym/assets/index-I1j2K3l4.js:1:2', own)).toBe('index-I1j2K3l4.js:1:2');
  });

  it('1.7k review: only shipped script names are locations; an error header is never a stack frame', () => {
    expect(stackRefs('Error: alice-smith.js')).toBe('');
    expect(stackRefs('Error: alice-smith.js:1:2\nf@https://h/anygym/assets/index-Ab12Cd34.js:4:5')).toBe('index-Ab12Cd34.js:4:5');
    expect(stackRefs('f@https://h/anygym/assets/alice-smith.js:1:2\nat g (https://h/x/jane-doe.js:3:4)')).toBe('');
    expect(stackRefs('f@https://h/anygym/sw.js:9:1\nworkbox-2fbc6a65.js:3:4')).toBe('sw.js:9:1\nworkbox-2fbc6a65.js:3:4');
    expect(stackRefs('index-Ab12Cd34.js')).toBe('');
    expect(autoMessage('Error: alice-smith.js')).toBe('Error: details hidden');
    expect(autoMessage('Error: details hidden at alice-smith.js:1:2')).toBe('Error: details hidden');
    expect(autoMessage('Error: details hidden', 'alice-smith.js:1:2')).toBe('Error: details hidden');
    expect(autoMessage('TypeError: details hidden at index-Ab12Cd34.js:1:2')).toBe('TypeError: details hidden at index-Ab12Cd34.js:1:2');
    expect(autoSignature('Error: alice-smith.js', 'Error: alice-smith.js')).toBe('Error: details hidden @ no-stack');
  });

  it('routes', () => {
    expect(maskRoute('/Quentin/602-555-1234')).toBe('/unknown');
    expect(maskRoute('/alice-smith')).toBe('/unknown');
    expect(maskRoute('#/workout/abc/done')).toBe('/workout/:id/done');
    expect(maskRoute('#/history/abc')).toBe('/history/:id');
  });

  it('push texts: masked first line at most 80 characters, plus the screen; fixed: id and screen only', () => {
    const p = formatPush('feedback', { message: `Mail jane@x.io ${'word '.repeat(40)}\nline two`, route: '/Quentin' });
    expect(p.body.split('\n')[0]!.length).toBeLessThanOrEqual(80);
    expect(p.body).not.toMatch(/jane|Quentin|line two/);
    expect(p.body.endsWith('Report #? · Screen: /unknown')).toBe(true);
    expect(formatPush('fixed', { id: 7, message: 'Quentin', route: '/' })).toEqual({ title: 'AnyGym: bug fixed', body: 'Report #7 · Screen: /\nClose and reopen the app to get it.' });
    expect(formatPush('crash', { id: 3, message: '', route: '/' }).body).toBe('Error: details hidden\nReport #3 · Screen: /');
  });

  it('1.7k: automatic text is allowlisted: lower case names and addresses never pass', () => {
    for (const raw of ['Error: account alice smith at 14 oak street failed', 'workout for jane doe at 12 oak road failed', 'Uncaught TypeError: jane doe']) {
      const out = [autoMessage(raw), autoMessage(raw, 'index-A1b2C3d4.js:3:9'), autoSignature(raw, 'index-A1b2C3d4.js:3:9'), formatPush('crash', { id: 1, message: raw, route: '/workout/jane doe' }).body];
      for (const s of out) for (const w of ['alice', 'smith', 'jane', 'doe', 'oak', 'street', 'road']) expect(s.toLowerCase(), `${w} in ${s}`).not.toContain(w);
    }
    expect(autoMessage('Uncaught TypeError: jane doe', 'index-A1b2C3d4.js:3:9')).toBe('TypeError: details hidden at index-A1b2C3d4.js:3:9');
    expect(autoMessage('QuotaExceededError: The quota has been exceeded.')).toBe('QuotaExceededError: The quota has been exceeded.');
    expect(autoMessage('AliceError: x')).toBe('Error: details hidden');
    expect(autoMessage('Error: details hidden at alice smith.js')).toBe('Error: details hidden');
    // Idempotent: the server can normalize again what the app already normalized.
    const once = autoMessage('RangeError: bad 14 oak street', 'index-A1b2C3d4.js:3:9');
    expect(autoMessage(once)).toBe(once);
    expect(stackRefs('fn@https://h/anygym/index-Aa11Bb22.js?token=x:1:2\njane doe 12 oak road\n    at f (index-A1b2C3d4.js:3:9)')).toBe('index-Aa11Bb22.js:1:2\nindex-A1b2C3d4.js:3:9');
  });
});
