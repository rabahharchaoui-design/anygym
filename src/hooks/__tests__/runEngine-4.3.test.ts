import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { at, T0 } from '../../lib/gps/__tests__/fixtures';
import { freshApp, phone, report, run, settle } from './enginePhone';
import { DEFAULT_RUN_SETUP, readLive } from '../../lib/run';

// The run engine against a real (in memory) database and the test phone of enginePhone.ts.

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

describe('run engine', () => {
  it('start creates the run row at once, watches with high accuracy and no cached positions, and asks for the wake lock', async () => {
    const { engine, db } = await freshApp();
    engine.start({ ...DEFAULT_RUN_SETUP, type: 'distance' }, 'km');
    await settle();
    const rows = await db.runs.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ startedAt: T0, type: 'distance', goal: '5 km', distanceM: 0, points: [] });
    expect(rows[0]!.endedAt).toBeUndefined();
    expect([...phone.watches.values()].map((w) => w.options)).toEqual([{ enableHighAccuracy: true, maximumAge: 0 }]);
    expect(phone.wakeAsks).toBe(1);
    expect(engine.get().wake).toBe('on');
    // A second Start while a run goes on does nothing.
    engine.start(DEFAULT_RUN_SETUP, 'km');
    await settle();
    expect(await db.runs.count()).toBe(1);
  });

  it('positions move the numbers; the state is written every few seconds, on pause, when hidden and on pagehide', async () => {
    const { engine, db } = await freshApp();
    engine.start(DEFAULT_RUN_SETUP, 'km');
    run(0, 20);
    expect(readLive(engine.get().live!).distanceM).toBeCloseTo(60, 0);
    await settle();
    expect((await db.runs.toArray())[0]!.points).toHaveLength(0);
    vi.advanceTimersByTime(5000);
    await settle();
    expect((await db.runs.toArray())[0]!.points).toHaveLength(21);
    run(26, 30, 78);
    engine.pause();
    await settle();
    expect((await db.runs.toArray())[0]!.points).toHaveLength(26);
    engine.resume();
    run(40, 44, 120);
    phone.visibility = 'hidden';
    phone.docEvents.dispatchEvent(new Event('visibilitychange'));
    await settle();
    expect((await db.runs.toArray())[0]!.points).toHaveLength(31);
    run(45, 46, 135);
    phone.winEvents.dispatchEvent(new Event('pagehide'));
    await settle();
    const row = (await db.runs.toArray())[0]!;
    expect(row.points).toHaveLength(33);
    expect(row.gaps).toEqual([[T0 + 30_000, T0 + 40_000]]);
    expect(row.distanceM).toBeCloseTo(readLive(engine.get().live!).distanceM, 6);
  });

  it('coming back to the front asks for the wake lock again and starts a fresh watch', async () => {
    const { engine } = await freshApp();
    engine.start(DEFAULT_RUN_SETUP, 'km');
    await settle();
    const first = [...phone.watches.keys()];
    phone.visibility = 'hidden';
    phone.docEvents.dispatchEvent(new Event('visibilitychange'));
    phone.visibility = 'visible';
    phone.docEvents.dispatchEvent(new Event('visibilitychange'));
    await settle();
    expect([...phone.watches.keys()]).toHaveLength(1);
    expect([...phone.watches.keys()]).not.toEqual(first);
    expect(phone.wakeAsks).toBe(1);
  });

  it('a run that was going when the app closed comes back paused, and the time away is a break with no distance', async () => {
    let app = await freshApp();
    app.engine.start({ ...DEFAULT_RUN_SETUP, type: 'time', timeMin: 20 }, 'mi');
    run(0, 60);
    phone.winEvents.dispatchEvent(new Event('pagehide'));
    await settle();
    const before = readLive(app.engine.get().live!);

    // The app is closed for ten minutes and opened again.
    vi.setSystemTime(T0 + 660_000);
    app = await freshApp();
    expect(app.engine.get().ready).toBe(false);
    await app.engine.restore();
    const live = app.engine.get().live!;
    expect(app.engine.get().ready).toBe(true);
    expect(live.closed).toBe(true);
    expect(live.unit).toBe('mi');
    expect(live.goal).toEqual({ kind: 'time', seconds: 1200, label: '20 min' });
    expect(readLive(live)).toMatchObject({ status: 'paused', distanceM: before.distanceM, movingSec: before.movingSec });
    expect(phone.watches.size).toBe(1);
    expect(phone.wakeAsks).toBe(1);
    // Asking twice brings back one run, not two phone.watches.
    await app.engine.restore();
    expect(phone.watches.size).toBe(1);

    run(661, 665, 5000);
    expect(app.engine.get().live!.points).toHaveLength(61);
    app.engine.resume();
    run(670, 680, 5000);
    const after = app.engine.get().live!;
    expect(after.closed).toBe(false);
    expect(after.breaks).toEqual([{ fromT: T0 + 60_000, toT: T0 + 670_000, kind: 'pause', bridged: false, distanceM: 0 }]);
    expect(readLive(after).distanceM).toBeCloseTo(before.distanceM + 30, 0);
    expect(readLive(after).movingSec).toBeCloseTo(before.movingSec + 10, 5);
    await settle();
    expect(await app.db.runs.count()).toBe(1);
  });

  it('nothing to bring back: ready, no run', async () => {
    const { engine } = await freshApp();
    await engine.restore();
    expect(engine.get()).toMatchObject({ ready: true, live: null, finished: null });
    expect(phone.watches.size).toBe(0);
  });

  it('end writes the finished row, stops the watch, releases the screen and hands over the summary', async () => {
    const { engine, db } = await freshApp();
    engine.start(DEFAULT_RUN_SETUP, 'km');
    run(0, 400);
    vi.setSystemTime(T0 + 405_000);
    await engine.end();
    const { live, finished } = engine.get();
    expect(live).toBeNull();
    expect(phone.watches.size).toBe(0);
    expect(phone.wakeReleases).toBe(1);
    const row = (await db.runs.toArray())[0]!;
    expect(row).toEqual(finished!.run);
    // PLAN 4.4a: the 5 s since the last position (still running, under GAP_SEC) count, as the face showed them.
    expect(row).toMatchObject({ endedAt: T0 + 405_000, movingSec: 405, splits: [expect.closeTo(333.3, 0)] });
    expect(row.distanceM).toBeCloseTo(1200, 0);
    expect(row.points).toHaveLength(401);
    expect(await db.kv.get('anygym-run-live')).toBeUndefined();
    // The timer is gone: nothing writes the run again.
    vi.advanceTimersByTime(20_000);
    await settle();
    expect((await db.runs.toArray())[0]).toEqual(row);
    engine.closeFinished();
    expect(engine.get().finished).toBeNull();
    // A new start of the app finds no run in progress (updates may apply).
    const next = await freshApp();
    await next.engine.restore();
    expect(next.engine.get().live).toBeNull();
  });

  it('discard removes the row of a run with nothing to show', async () => {
    const { engine, db } = await freshApp();
    engine.start(DEFAULT_RUN_SETUP, 'km');
    await engine.end();
    expect(engine.get().finished!.run.points).toEqual([]);
    await engine.discardFinished();
    expect(engine.get().finished).toBeNull();
    expect(await db.runs.count()).toBe(0);
  });

  it('an end that cannot be saved keeps the run, paused, to try again', async () => {
    const { engine, db } = await freshApp();
    engine.start(DEFAULT_RUN_SETUP, 'km');
    run(0, 30);
    await settle();
    const put = vi.spyOn(db.runs, 'put').mockRejectedValueOnce(new Error('full'));
    await engine.end();
    expect(engine.get()).toMatchObject({ saveFailed: true, finished: null });
    expect(readLive(engine.get().live!).status).toBe('paused');
    expect(phone.watches.size).toBe(1);
    put.mockRestore();
    await engine.end();
    expect(engine.get()).toMatchObject({ saveFailed: false, live: null });
    expect((await db.runs.toArray())[0]!.endedAt).toBeDefined();
  });

  it('the auto pause switch and GPS trouble reach the live run', async () => {
    const { engine } = await freshApp();
    engine.start(DEFAULT_RUN_SETUP, 'km');
    expect(engine.get().live!.tracker.autoPause).toBe(true);
    engine.setAutoPause(false);
    expect(engine.get().live!.tracker.autoPause).toBe(false);
    [...phone.watches.values()][0]!.fail({ code: 1, PERMISSION_DENIED: 1 } as GeolocationPositionError);
    expect(engine.get().live!.gps).toBe('denied');
    [...phone.watches.values()][0]!.fail({ code: 2, PERMISSION_DENIED: 1 } as GeolocationPositionError);
    expect(engine.get().live!.gps).toBe('unavailable');
  });

  it('a phone with no wake lock, or one that refuses, is reported and the run goes on', async () => {
    phone.wakeMode = 'missing';
    let app = await freshApp();
    app.engine.start(DEFAULT_RUN_SETUP, 'km');
    await settle();
    expect(app.engine.get().wake).toBe('missing');
    run(0, 10);
    expect(readLive(app.engine.get().live!).distanceM).toBeGreaterThan(20);
    await app.engine.end();
    await app.db.delete();
    phone.wakeMode = 'refuse';
    app = await freshApp();
    app.engine.start(DEFAULT_RUN_SETUP, 'km');
    await settle();
    expect(app.engine.get().wake).toBe('refused');
  });
});

describe('run engine: GPS from the countdown (PLAN 4.4a)', () => {
  it('warmGps starts one watch before the run; the run keeps it; positions before GO are not part of the run', async () => {
    const { engine } = await freshApp();
    engine.warmGps();
    engine.warmGps();
    expect(phone.watches.size).toBe(1);
    const [id] = [...phone.watches.keys()];
    report(at(0, 0, 0));
    expect(engine.get().live).toBeNull();
    vi.setSystemTime(T0 + 3_000);
    engine.start(DEFAULT_RUN_SETUP, 'km');
    expect([...phone.watches.keys()]).toEqual([id]);
    expect(engine.get().live!.points).toHaveLength(0);
    report(at(0, 0, 4));
    expect(engine.get().live!.points).toHaveLength(1);
    await engine.end();
  });

  it('coolGps stops the early watch; a refusal during the countdown reaches the run at GO', async () => {
    const { engine } = await freshApp();
    engine.warmGps();
    engine.coolGps();
    expect(phone.watches.size).toBe(0);
    engine.warmGps();
    for (const w of phone.watches.values()) w.fail({ code: 1, PERMISSION_DENIED: 1 } as GeolocationPositionError);
    engine.start(DEFAULT_RUN_SETUP, 'km');
    expect(engine.get().live!.gps).toBe('denied');
    engine.coolGps();
    expect(phone.watches.size).toBe(1);
    await engine.end();
  });
});
