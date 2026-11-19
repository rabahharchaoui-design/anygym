// PLAN 4.4b (7, 16): a background save stopped by pagehide goes on at pageshow.
import { describe, expect, it } from 'vitest';
import { warmAcrossPageHide } from '../warmAcrossPageHide';

const flush = () => new Promise<void>((r) => setTimeout(r, 0));

/** A save of `n` items, one per tick, that stops when the signal says so. */
function saver(n: number) {
  const kept = new Set<number>();
  let starts = 0;
  const go = async (signal: AbortSignal) => {
    starts++;
    for (let i = 0; i < n; i++) {
      if (signal.aborted) return { stopped: true };
      if (kept.has(i)) continue;
      await flush();
      if (signal.aborted) return { stopped: true };
      kept.add(i);
    }
    return { stopped: false };
  };
  return { go, kept, starts: () => starts };
}

describe('warmAcrossPageHide (PLAN 4.4b 7, 16)', () => {
  it('a pagehide stops the save; the pageshow after it saves the rest', async () => {
    const win = new EventTarget() as unknown as Window;
    const s = saver(10);
    warmAcrossPageHide(s.go, win);
    await flush();
    await flush();
    win.dispatchEvent(new Event('pagehide'));
    await flush();
    expect(s.kept.size).toBeLessThan(10);
    for (let i = 0; i < 20; i++) await flush();
    expect(s.kept.size).toBeLessThan(10);
    win.dispatchEvent(new Event('pageshow'));
    for (let i = 0; i < 20; i++) await flush();
    expect(s.kept.size).toBe(10);
    expect(s.starts()).toBe(2);
    // Done: another visit back starts nothing.
    win.dispatchEvent(new Event('pagehide'));
    win.dispatchEvent(new Event('pageshow'));
    await flush();
    expect(s.starts()).toBe(2);
  });

  it('a pageshow while it is still going starts no second save; the cleanup stops it for good', async () => {
    const win = new EventTarget() as unknown as Window;
    const s = saver(10);
    const stop = warmAcrossPageHide(s.go, win);
    win.dispatchEvent(new Event('pageshow'));
    expect(s.starts()).toBe(1);
    stop();
    win.dispatchEvent(new Event('pageshow'));
    for (let i = 0; i < 20; i++) await flush();
    expect(s.starts()).toBe(1);
    expect(s.kept.size).toBeLessThan(10);
  });
});
