import { describe, expect, it } from 'vitest';
import { cachedFrames, forgetFrames, framesKey, knownFrames, rememberFrames } from '../photoCache';

// Gate s2: offline, a demo photo is drawn only from the cache, preferred candidate first.
describe('cachedFrames', () => {
  const frames = [
    ['/ex/A/0.webp', '/ex/A/0.jpg'],
    ['/ex/A/1.webp', '/ex/A/1.jpg'],
  ];

  it('picks the first kept candidate of each frame', async () => {
    const kept = new Set(['/ex/A/0.webp', '/ex/A/1.jpg']);
    expect(await cachedFrames(frames, async (u) => kept.has(u))).toEqual(['/ex/A/0.webp', '/ex/A/1.jpg']);
  });

  it('is null for a frame the cache does not hold', async () => {
    expect(await cachedFrames(frames, async (u) => u === '/ex/A/0.jpg')).toEqual(['/ex/A/0.jpg', null]);
    expect(await cachedFrames(frames, async () => undefined)).toEqual([null, null]);
  });

  it('treats an unreadable cache as not kept, never throws', async () => {
    expect(
      await cachedFrames(frames, async () => {
        throw new Error('storage gone');
      }),
    ).toEqual([null, null]);
  });

  it('remembers answers per frame set until forgotten', () => {
    const key = framesKey(frames);
    expect(knownFrames(key)).toBeUndefined();
    rememberFrames(key, ['/ex/A/0.webp', null]);
    expect(knownFrames(key)).toEqual(['/ex/A/0.webp', null]);
    expect(framesKey([['/ex/B/0.webp']])).not.toBe(key);
    forgetFrames();
    expect(knownFrames(key)).toBeUndefined();
  });
});
