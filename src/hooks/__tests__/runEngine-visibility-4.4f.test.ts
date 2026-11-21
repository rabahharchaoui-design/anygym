import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { at, T0 } from '../../lib/gps/__tests__/fixtures';
import { freshApp, phone, report, run } from './enginePhone';
import { DEFAULT_RUN_SETUP, readLive } from '../../lib/run';

// PLAN 4.4f (1): the phone was locked (or the app switched away) and comes back. The watch started
// again first hands back the last position from before, as if new. It must not start a new piece of
// line there, or the real positions after it are dropped as faster than 8 m/s and that stretch is lost.

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
  vi.setSystemTime(T0);
});
afterEach(async () => {
  const { db } = await import('../../db/schema');
  await db.delete();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const hide = () => {
  phone.visibility = 'hidden';
  phone.docEvents.dispatchEvent(new Event('visibilitychange'));
};
const show = () => {
  phone.visibility = 'visible';
  phone.docEvents.dispatchEvent(new Event('visibilitychange'));
};

describe('run engine: back from a locked phone (PLAN 4.4f 1)', () => {
  it('moving 150 m while hidden: the replayed old spot is skipped and the real positions count', async () => {
    const app = await freshApp();
    app.engine.start(DEFAULT_RUN_SETUP, 'km');
    run(0, 60);
    hide();
    vi.advanceTimersByTime(60_000);
    const before = readLive(app.engine.get().live!).distanceM;
    show();
    // The first callback repeats the last spot from before the lock, with a new time...
    report(at(180, 0, 120));
    // ...then the real positions, 150 m on, 3 m/s.
    run(121, 150, 330);
    const live = app.engine.get().live!;
    expect(live.here!.t, 'the last position reached the run').toBe(T0 + 150_000);
    // 29 s at 3 m/s after the first real position, at least; never the stretch dropped.
    expect(readLive(live).distanceM - before).toBeGreaterThan(80);
    await app.engine.end();
  });

  it('standing still while hidden: nothing is added', async () => {
    const app = await freshApp();
    app.engine.start(DEFAULT_RUN_SETUP, 'km');
    run(0, 60);
    hide();
    vi.advanceTimersByTime(60_000);
    const before = readLive(app.engine.get().live!).distanceM;
    show();
    report(at(180, 0, 120));
    for (let s = 121; s <= 150; s++) report(at(180, 0, s));
    expect(readLive(app.engine.get().live!).distanceM - before).toBeLessThan(3);
    await app.engine.end();
  });

  it('paused while hidden: nothing is added while paused, and the run goes on after Resume', async () => {
    const app = await freshApp();
    app.engine.start(DEFAULT_RUN_SETUP, 'km');
    run(0, 60);
    app.engine.pause();
    const before = readLive(app.engine.get().live!).distanceM;
    hide();
    vi.advanceTimersByTime(60_000);
    show();
    report(at(180, 0, 120));
    run(121, 130, 330);
    expect(readLive(app.engine.get().live!).distanceM).toBe(before);
    app.engine.resume();
    run(131, 160, 360);
    const live = app.engine.get().live!;
    expect(live.here!.t).toBe(T0 + 160_000);
    expect(readLive(live).distanceM - before).toBeGreaterThan(70);
    await app.engine.end();
  });
});
