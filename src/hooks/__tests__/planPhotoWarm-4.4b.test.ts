// PLAN 4.4b (16): the plan photo save stopped by pagehide goes on at pageshow.
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.doUnmock('../../lib/photoWarm');
});

describe('plan photo warm (PLAN 4.4b 16)', () => {
  it('starts again on pageshow after a pagehide cut it short, with the same photos', async () => {
    vi.resetModules();
    vi.stubGlobal('document', { readyState: 'complete' });
    const calls: Array<{ urls: string[]; signal: AbortSignal }> = [];
    vi.doMock('../../lib/photoWarm', () => ({
      browserWarmDeps: () => null,
      warmPhotos: (urls: string[], _d: unknown, signal: AbortSignal) =>
        new Promise((done) => {
          calls.push({ urls, signal });
          signal.addEventListener('abort', () => done({ stopped: true }));
        }),
    }));
    const { startPlanPhotoWarm } = await import('../useWarmPlanPhotos');
    const win = new EventTarget() as unknown as Window;
    const stop = startPlanPhotoWarm('a.webp\nb.webp', { online: () => true } as never, win);
    await new Promise((r) => setTimeout(r, 0));
    expect(calls).toHaveLength(1);
    win.dispatchEvent(new Event('pagehide'));
    expect(calls[0]!.signal.aborted).toBe(true);
    await new Promise((r) => setTimeout(r, 0));
    win.dispatchEvent(new Event('pageshow'));
    await new Promise((r) => setTimeout(r, 0));
    expect(calls).toHaveLength(2);
    expect(calls[1]!.urls).toEqual(['a.webp', 'b.webp']);
    stop();
    expect(calls[1]!.signal.aborted).toBe(true);
  });
});
