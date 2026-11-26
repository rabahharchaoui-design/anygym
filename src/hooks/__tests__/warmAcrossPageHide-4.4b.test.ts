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

// PLAN R2: a save that ends with files that failed is not done; it is tried again once on the next
// pageshow or online event (never in a loop, never twice at once). One with no failures is done.
describe('warmAcrossPageHide retries failed files (PLAN R2)', () => {
  /** A save whose first `failing` goes report failed files; each go resolves when `finish` is called. */
  function flaky(failing: number) {
    let starts = 0;
    const finishers: Array<() => void> = [];
    const go = (_signal: AbortSignal) =>
      new Promise<{ stopped: boolean; failed: number }>((resolve) => {
        const n = ++starts;
        finishers.push(() => resolve({ stopped: false, failed: n <= failing ? 2 : 0 }));
      });
    return { go, starts: () => starts, finish: () => finishers.shift()?.() };
  }

  for (const event of ['pageshow', 'online']) {
    it(`a save with failed files is tried again on the next ${event}, once`, async () => {
      const win = new EventTarget() as unknown as Window;
      const s = flaky(1);
      warmAcrossPageHide(s.go, win);
      s.finish();
      await flush();
      // Nothing retries by itself (no loop).
      for (let i = 0; i < 10; i++) await flush();
      expect(s.starts()).toBe(1);
      win.dispatchEvent(new Event(event));
      win.dispatchEvent(new Event(event));
      expect(s.starts()).toBe(2);
      s.finish();
      await flush();
      // That one had no failures: done, nothing more starts.
      win.dispatchEvent(new Event('pageshow'));
      win.dispatchEvent(new Event('online'));
      await flush();
      expect(s.starts()).toBe(2);
    });
  }

  it('a save with no failed files is not tried again', async () => {
    const win = new EventTarget() as unknown as Window;
    const s = flaky(0);
    warmAcrossPageHide(s.go, win);
    s.finish();
    await flush();
    win.dispatchEvent(new Event('pageshow'));
    win.dispatchEvent(new Event('online'));
    await flush();
    expect(s.starts()).toBe(1);
  });

  it('a save cut short offline goes on when the phone is back online', async () => {
    const win = new EventTarget() as unknown as Window;
    let starts = 0;
    const go = async () => (++starts === 1 ? { stopped: true } : { stopped: false, failed: 0 });
    warmAcrossPageHide(go, win);
    await flush();
    win.dispatchEvent(new Event('online'));
    await flush();
    expect(starts).toBe(2);
    win.dispatchEvent(new Event('online'));
    await flush();
    expect(starts).toBe(2);
  });

  it('the cleanup removes the online listener', async () => {
    const win = new EventTarget() as unknown as Window;
    const s = flaky(5);
    const stop = warmAcrossPageHide(s.go, win);
    s.finish();
    await flush();
    stop();
    win.dispatchEvent(new Event('online'));
    expect(s.starts()).toBe(1);
  });
});
