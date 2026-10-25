import { describe, expect, it } from 'vitest';
import { formatPush, maskRoute, maskStack, maskText } from '../mask';

describe('mask', () => {
  it('keeps code words and our script locations, masks names', () => {
    expect(maskText('QuotaExceededError: The quota has been exceeded.')).toBe('QuotaExceededError: The quota has been exceeded.');
    expect(maskText('Error: Hello Quentin at http://localhost:4173/anygym/assets/index-A1.js:3:9')).toBe('Error: [name] [name] at index-A1.js:3:9');
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
    expect(maskStack('a@http://x/anygym/assets/i.js:1:2\nb@http://y/other.js:3:4\n    at c (http://x/anygym/assets/i.js:5:6)', own)).toBe('a@i.js:1:2\nc@i.js:5:6');
  });

  it('routes', () => {
    expect(maskRoute('/Quentin/602-555-1234')).toBe('/:id/:id');
    expect(maskRoute('#/history/abc')).toBe('/history/:id');
  });

  it('push texts: masked first line at most 80 characters, plus the screen; fixed: id and screen only', () => {
    const p = formatPush('feedback', { message: `Mail jane@x.io ${'word '.repeat(40)}\nline two`, route: '/Quentin' });
    expect(p.body.split('\n')[0]!.length).toBeLessThanOrEqual(80);
    expect(p.body).not.toMatch(/jane|Quentin|line two/);
    expect(p.body.endsWith('Screen: /:id')).toBe(true);
    expect(formatPush('fixed', { id: 7, message: 'Quentin', route: '/' })).toEqual({ title: 'AnyGym: bug fixed', body: 'Report #7 · Screen: /\nClose and reopen the app to get it.' });
    expect(formatPush('crash', { message: '', route: '/' }).body).toBe('No text\nScreen: /');
  });
});
