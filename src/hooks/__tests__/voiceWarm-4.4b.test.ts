// PLAN 4.4b (7): the voice pack save stopped by pagehide goes on at pageshow.
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.doUnmock('../../lib/photoWarm');
  vi.doUnmock('../../ui/icon3d/icons');
});

describe('warmVoicePack (PLAN 4.4b 7)', () => {
  it('starts again on pageshow after a pagehide cut it short', async () => {
    vi.resetModules();
    const win = new EventTarget();
    vi.stubGlobal('window', win);
    vi.stubGlobal('document', { readyState: 'complete' });
    vi.stubGlobal('navigator', {});
    const signals: AbortSignal[] = [];
    vi.doMock('../../lib/photoWarm', () => ({
      browserWarmDeps: () => ({ online: () => true }),
      warmPhotos: (_u: unknown, _d: unknown, signal: AbortSignal) =>
        new Promise((done) => {
          signals.push(signal);
          signal.addEventListener('abort', () => done({ stopped: true }));
        }),
    }));
    vi.doMock('../../ui/icon3d/icons', () => ({ wantsLessData: () => false }));
    const { warmVoicePack } = await import('../voiceWarm');
    warmVoicePack();
    expect(signals).toHaveLength(1);
    win.dispatchEvent(new Event('pagehide'));
    expect(signals[0]!.aborted).toBe(true);
    await new Promise((r) => setTimeout(r, 0));
    win.dispatchEvent(new Event('pageshow'));
    expect(signals).toHaveLength(2);
    expect(signals[1]!.aborted).toBe(false);
  });

  // PLAN R4 (3): opening Run offline saves nothing then, but the save goes once the phone is online.
  it('opened offline starts nothing, then goes once on the online event', async () => {
    vi.resetModules();
    const win = new EventTarget();
    vi.stubGlobal('window', win);
    vi.stubGlobal('document', { readyState: 'complete' });
    vi.stubGlobal('navigator', {});
    let online = false;
    const calls: AbortSignal[] = [];
    vi.doMock('../../lib/photoWarm', async (orig) => ({
      ...(await orig<typeof import('../../lib/photoWarm')>()),
      browserWarmDeps: () => ({ online: () => online }),
      warmPhotos: (_u: unknown, _d: unknown, signal: AbortSignal) => {
        calls.push(signal);
        return Promise.resolve({ stopped: false, failed: 0 });
      },
    }));
    vi.doMock('../../ui/icon3d/icons', () => ({ wantsLessData: () => false }));
    const { warmVoicePack } = await import('../voiceWarm');
    warmVoicePack();
    await new Promise((r) => setTimeout(r, 0));
    expect(calls).toHaveLength(0);
    online = true;
    win.dispatchEvent(new Event('online'));
    expect(calls).toHaveLength(1);
    await new Promise((r) => setTimeout(r, 0));
    // Done: a later event does not go again, and a second open of Run starts nothing new.
    win.dispatchEvent(new Event('pageshow'));
    warmVoicePack();
    expect(calls).toHaveLength(1);
  });
});
