import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { T0 } from '../../lib/gps/__tests__/fixtures';
import { DEFAULT_RUN_SETUP } from '../../lib/run';
import { freshApp, phone, report, run, settle, systemReleasesWake } from './enginePhone';

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

  it('a watch started again that hands back the last spot as new is not taken until a different position comes', async () => {
    const { engine } = await freshApp();
    engine.start(DEFAULT_RUN_SETUP, 'km');
    await settle();
    run(0, 20);
    const here = engine.get().live!.here!;
    vi.advanceTimersByTime(20_000);
    report({ lat: here.lat, lng: here.lng, accuracy: 5, t: T0 + 40_000 });
    expect(engine.get().live!.here!.t).toBe(here.t);
    run(41, 45, 60 + 40 * 3);
    expect(engine.get().live!.here!.t).toBe(T0 + 45_000);
    await engine.end();
  });
});

describe('run engine: the replay guard lets go (PLAN 4.6a 4)', () => {
  it('only the first repeat of the last spot is dropped: standing there, the next fix is taken and GPS lost ends', async () => {
    const { engine } = await freshApp();
    engine.start(DEFAULT_RUN_SETUP, 'km');
    await settle();
    run(0, 20);
    const here = engine.get().live!.here!;
    vi.advanceTimersByTime(20_000);
    report({ lat: here.lat, lng: here.lng, accuracy: 5, t: T0 + 40_000 });
    expect(engine.get().live!.here!.t).toBe(here.t);
    // Standing at a light: the phone keeps reporting the very same spot, now as a real new fix.
    report({ lat: here.lat, lng: here.lng, accuracy: 5, t: T0 + 41_000 });
    expect(engine.get().live!.here!.t).toBe(T0 + 41_000);
    await engine.end();
  });
});

describe('run engine: a failed save during the run (PLAN 4.4b 3)', () => {
  it('is said at once, the engine keeps trying every 5 s, and it clears when a save lands', async () => {
    const { engine, db } = await freshApp();
    engine.start(DEFAULT_RUN_SETUP, 'km');
    await settle();
    let broken = true;
    const fail = () => {
      if (broken) throw new Error('disk full');
    };
    db.runs.hook('updating', fail);
    run(0, 10);
    vi.advanceTimersByTime(5000);
    await settle();
    expect(engine.get().autosaveFailed).toBe(true);
    expect(engine.get().saveFailed).toBe(false);
    run(11, 20, 33);
    vi.advanceTimersByTime(5000);
    await settle();
    expect(engine.get().autosaveFailed).toBe(true);
    broken = false;
    vi.advanceTimersByTime(5000);
    await settle();
    expect(engine.get().autosaveFailed).toBe(false);
    expect((await db.runs.toArray())[0]!.distanceM).toBeGreaterThan(50);
    db.runs.hook('updating').unsubscribe(fail);
    await engine.end();
  });
});

describe('run engine: the phone lets go of the screen lock (PLAN 4.4b 4)', () => {
  it('is noticed: asked again at once while in front, or when the app is back; refused, it says so', async () => {
    const { engine } = await freshApp();
    engine.start(DEFAULT_RUN_SETUP, 'km');
    await settle();
    expect(phone.wakeAsks).toBe(1);
    systemReleasesWake();
    await settle();
    expect(phone.wakeAsks).toBe(2);
    expect(engine.get().wake).toBe('on');
    // In the background: nothing to ask for until the app is back.
    phone.visibility = 'hidden';
    systemReleasesWake();
    await settle();
    expect(phone.wakeAsks).toBe(2);
    expect(engine.get().wake).toBe('off');
    phone.visibility = 'visible';
    phone.docEvents.dispatchEvent(new Event('visibilitychange'));
    await settle();
    expect(phone.wakeAsks).toBe(3);
    expect(engine.get().wake).toBe('on');
    // Let go again and refused: the run says it cannot keep the screen on.
    phone.wakeMode = 'refuse';
    systemReleasesWake();
    await settle();
    expect(engine.get().wake).toBe('refused');
    await engine.end();
  });
});
