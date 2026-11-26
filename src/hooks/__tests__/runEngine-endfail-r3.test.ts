import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { at, T0 } from '../../lib/gps/__tests__/fixtures';
import { freshApp, report, run, settle } from './enginePhone';
import { DEFAULT_RUN_SETUP, readLive } from '../../lib/run';

// PLAN R3 (3): when End could not be saved, the watch started again without the replay guard (only
// rewatch() and restore() set it). Its first callback can be the phone's last position handed back
// as new: the line went on from there and the real positions after it were dropped as too fast.

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

describe('run engine: End not saved, the first callback of the new watch is the old position (PLAN R3 3)', () => {
  it('the old position is dropped and the real positions after it count', async () => {
    const { engine, db } = await freshApp();
    engine.start(DEFAULT_RUN_SETUP, 'km');
    run(0, 60);
    await settle();
    const put = vi.spyOn(db.runs, 'put').mockRejectedValueOnce(new Error('full'));
    await engine.end();
    put.mockRestore();
    expect(engine.get().saveFailed).toBe(true);
    const before = readLive(engine.get().live!).distanceM;

    // Two minutes on, Resume: no 5 s beat has started the watch again since End.
    vi.setSystemTime(T0 + 180_000);
    engine.resume();
    // The watch's first callback hands back the last spot from before End, stamped as new...
    report({ ...at(180, 0, 180), t: T0 + 180_000 });
    // ...then the real positions, 300 m on, 15 m every 5 s.
    for (let i = 1; i <= 5; i++) report({ ...at(480 + 15 * i, 0, 180 + i * 5), t: T0 + 180_000 + i * 5000 });
    const live = engine.get().live!;
    expect(live.here!.t, 'the last position reached the run').toBe(T0 + 205_000);
    expect(readLive(live).distanceM, 'four legs of 15 m after the first').toBeGreaterThan(before + 50);
    await engine.end();
  });
});
