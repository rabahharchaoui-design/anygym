import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { T0 } from '../../lib/gps/__tests__/fixtures';
import { DEFAULT_RUN_SETUP } from '../../lib/run';
import { settle, stubPhone } from './enginePhone';

// PLAN 4.6c (1): the first save of a new run failed, so the run lives only in the engine's memory.
// An app update must wait for it: a reload now would lose the run.

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
  vi.setSystemTime(T0);
});
afterEach(async () => {
  const { db } = await import('../../db/schema');
  await db.delete();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.doUnmock('../../db/runs');
  vi.doUnmock('virtual:pwa-register');
});

async function freshApp(firstSaveFails: boolean) {
  vi.resetModules();
  stubPhone();
  vi.doMock('virtual:pwa-register', () => ({ registerSW: () => () => Promise.resolve() }));
  vi.doMock('../../db/runs', async (importOriginal) => {
    const real = await importOriginal<typeof import('../../db/runs')>();
    return { ...real, startRunRow: firstSaveFails ? () => Promise.reject(new Error('quota')) : real.startRunRow };
  });
  const { runEngine } = await import('../useRunEngine');
  const { appActivity } = await import('../../pwa');
  return { engine: runEngine, appActivity };
}

describe('app update while a run lives only in memory', () => {
  it('reports a run when the first save failed, so the update waits', async () => {
    const { engine, appActivity } = await freshApp(true);
    expect(await appActivity()).toEqual({ workout: false, run: false });
    engine.start(DEFAULT_RUN_SETUP, 'km');
    await settle();
    const { getActiveRun } = await import('../../db/runs');
    expect(await getActiveRun()).toBeUndefined();
    expect(await appActivity()).toEqual({ workout: false, run: true });
  });

  it('a run that was saved still counts, and nothing counts once it ended', async () => {
    const { engine, appActivity } = await freshApp(false);
    engine.start(DEFAULT_RUN_SETUP, 'km');
    await settle();
    expect((await appActivity()).run).toBe(true);
    await engine.end();
    engine.closeFinished();
    expect((await appActivity()).run).toBe(false);
  });
});
