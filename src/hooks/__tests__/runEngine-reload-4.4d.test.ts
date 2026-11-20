import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { at, T0 } from '../../lib/gps/__tests__/fixtures';
import { freshApp, phone, report, run, settle } from './enginePhone';
import { DEFAULT_RUN_SETUP, readLive } from '../../lib/run';

// PLAN 4.4d, the verify-4.3 "reload mid run" regression: after the app reloads mid run and the run is
// resumed, the watch started again hands back the last position from before the reload (a cached
// one). It must not start the new piece of line there, or every real position after it (300 m away,
// the runner moved while the app was closed) is dropped as a jump faster than 8 m/s.

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

describe('run engine: a reload mid run, then Resume (PLAN 4.4d)', () => {
  for (const speed of [undefined, 3]) {
    it(`new positions after Resume are taken and the distance grows (phone speed ${speed ?? 'none'})`, async () => {
      let app = await freshApp();
      app.engine.start(DEFAULT_RUN_SETUP, 'km');
      run(0, 60);
      phone.winEvents.dispatchEvent(new Event('pagehide'));
      await settle();
      const before = readLive(app.engine.get().live!).distanceM;

      vi.setSystemTime(T0 + 66_000);
      app = await freshApp();
      await app.engine.restore();
      vi.advanceTimersByTime(120_000);
      app.engine.resume();
      // The watch started again gives back the last spot from before the reload, as if new...
      vi.advanceTimersByTime(5000);
      report({ ...at(180, 0, 191), t: T0 + 191_000 });
      // ...then the real positions, 300 m on, 15 m every 5 s.
      for (let i = 1; i <= 5; i++) {
        vi.setSystemTime(T0 + 191_000 + i * 5000);
        for (const w of [...phone.watches.values()]) {
          const p = at(480 + 15 * i, 0, 191 + i * 5);
          w.ok({ coords: { latitude: p.lat, longitude: p.lng, accuracy: 5, speed: speed ?? null }, timestamp: p.t } as unknown as GeolocationPosition);
        }
      }
      const live = app.engine.get().live!;
      expect(live.here!.t, 'the last position reached the run').toBe(T0 + 216_000);
      expect(readLive(live).distanceM, 'four legs of 15 m after the first').toBeGreaterThan(before + 50);
      await app.engine.end();
    });
  }
});
