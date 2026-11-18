import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { T0 } from '../../lib/gps/__tests__/fixtures';
import { DEFAULT_RUN_SETUP } from '../../lib/run';
import { freshApp, phone, run, settle } from './enginePhone';

// PLAN 4.4b: the run engine when things go wrong during a run (GPS lost, a save fails, the screen lock is let go).

beforeEach(() => {
  phone.wakeMode = 'ok';
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
  vi.setSystemTime(T0);
});
afterEach(async () => {
  const { db } = await import('../../db/schema');
  await db.delete();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('run engine: GPS lost (PLAN 4.4b 6)', () => {
  it('starts watching again after the gap threshold, and keeps trying while it lasts', async () => {
    const { engine } = await freshApp();
    engine.start(DEFAULT_RUN_SETUP, 'km');
    await settle();
    run(0, 20);
    const first = [...phone.watches.keys()];
    vi.advanceTimersByTime(10_000);
    expect([...phone.watches.keys()]).toEqual(first);
    vi.advanceTimersByTime(10_000);
    const second = [...phone.watches.keys()];
    expect(second).toHaveLength(1);
    expect(second).not.toEqual(first);
    vi.advanceTimersByTime(20_000);
    expect([...phone.watches.keys()]).not.toEqual(second);
    expect(phone.watches.size).toBe(1);
    await engine.end();
  });
});
