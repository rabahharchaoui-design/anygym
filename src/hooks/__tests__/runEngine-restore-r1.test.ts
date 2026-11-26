import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { at, T0 } from '../../lib/gps/__tests__/fixtures';
import { freshApp, phone, report, run, settle } from './enginePhone';
import { DEFAULT_RUN_SETUP, readLive } from '../../lib/run';

// PLAN R1 (7): restore() started the watch without the replay guard (only rewatch set it). On a
// restored run, the phone's first callback right after Resume can be its old cached position: the
// new piece of line started there, and the real positions after it were dropped as too fast.

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

describe('run engine: restored run, Resume, the first callback is the old position (PLAN R1 7)', () => {
  it('the old position is dropped and the real positions after it count', async () => {
    let app = await freshApp();
    app.engine.start(DEFAULT_RUN_SETUP, 'km');
    run(0, 60);
    phone.winEvents.dispatchEvent(new Event('pagehide'));
    await settle();
    const before = readLive(app.engine.get().live!).distanceM;

    vi.setSystemTime(T0 + 66_000);
    app = await freshApp();
    await app.engine.restore();
    // Resume at once: no 5 s beat has started the watch again yet.
    vi.setSystemTime(T0 + 186_000);
    app.engine.resume();
    // The watch's first callback hands back the last spot from before the reload, stamped as new...
    report({ ...at(180, 0, 186), t: T0 + 186_000 });
    // ...then the real positions, 300 m on, 15 m every 5 s.
    for (let i = 1; i <= 5; i++) {
      vi.setSystemTime(T0 + 186_000 + i * 5000);
      report({ ...at(480 + 15 * i, 0, 186 + i * 5), t: T0 + 186_000 + i * 5000 });
    }
    const live = app.engine.get().live!;
    expect(live.here!.t, 'the last position reached the run').toBe(T0 + 211_000);
    expect(readLive(live).distanceM, 'four legs of 15 m after the first').toBeGreaterThan(before + 50);
    await app.engine.end();
  });
});
