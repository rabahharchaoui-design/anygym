// A phone for run engine tests (PLAN 4.3, 4.4b): positions when the test says so, a wake lock that
// can refuse, be missing or be released by the system, visibility the test sets, and a clock the
// test moves. Each test loads a fresh engine with freshApp, like a fresh app start.
import { vi } from 'vitest';
import type { RawPoint } from '../../lib/gps';
import { at } from '../../lib/gps/__tests__/fixtures';

type Watch = { ok: (p: GeolocationPosition) => void; fail: (e: GeolocationPositionError) => void; options: PositionOptions };
type Sentinel = EventTarget & { released: boolean; release: () => Promise<void> };

export const phone = {
  watches: new Map<number, Watch>(),
  wakeAsks: 0,
  wakeReleases: 0,
  wakeMode: 'ok' as 'ok' | 'refuse' | 'missing',
  visibility: 'visible' as 'visible' | 'hidden',
  docEvents: new EventTarget(),
  winEvents: new EventTarget(),
  /** Every lock the phone handed out, newest last. */
  sentinels: [] as Sentinel[],
};

function sentinel(): Sentinel {
  const s = Object.assign(new EventTarget(), { released: false }) as Sentinel;
  s.release = () => {
    phone.wakeReleases++;
    s.released = true;
    return Promise.resolve();
  };
  return s;
}

/** The phone itself lets go of the newest lock (low battery, the app went to the background). */
export function systemReleasesWake(): void {
  const s = phone.sentinels[phone.sentinels.length - 1];
  if (!s) return;
  s.released = true;
  s.dispatchEvent(new Event('release'));
}

export function stubPhone(): void {
  phone.watches = new Map();
  phone.wakeAsks = 0;
  phone.wakeReleases = 0;
  phone.visibility = 'visible';
  phone.docEvents = new EventTarget();
  phone.winEvents = new EventTarget();
  phone.sentinels = [];
  let nextId = 1;
  const geolocation = {
    watchPosition: (ok: Watch['ok'], fail: Watch['fail'], options: PositionOptions) => {
      phone.watches.set(nextId, { ok, fail, options });
      return nextId++;
    },
    clearWatch: (id: number) => void phone.watches.delete(id),
  };
  const wakeLock = {
    request: () => {
      phone.wakeAsks++;
      if (phone.wakeMode === 'refuse') return Promise.reject(new Error('no'));
      const s = sentinel();
      phone.sentinels.push(s);
      return Promise.resolve(s);
    },
  };
  const { docEvents, winEvents } = phone;
  vi.stubGlobal('navigator', { geolocation, ...(phone.wakeMode === 'missing' ? {} : { wakeLock }) });
  vi.stubGlobal('document', { get visibilityState() { return phone.visibility; }, addEventListener: docEvents.addEventListener.bind(docEvents), removeEventListener: docEvents.removeEventListener.bind(docEvents) });
  vi.stubGlobal('window', { setInterval: globalThis.setInterval.bind(globalThis), clearInterval: globalThis.clearInterval.bind(globalThis), setTimeout: globalThis.setTimeout.bind(globalThis), clearTimeout: globalThis.clearTimeout.bind(globalThis), addEventListener: winEvents.addEventListener.bind(winEvents), removeEventListener: winEvents.removeEventListener.bind(winEvents) });
}

/** The phone reports a position now (its own timestamp is the clock's). */
export function report(p: RawPoint): void {
  vi.setSystemTime(p.t!);
  for (const w of [...phone.watches.values()]) w.ok({ coords: { latitude: p.lat, longitude: p.lng, accuracy: p.accuracy }, timestamp: p.t } as GeolocationPosition);
}

/** East at 3 m/s, one position a second, from second `from` to `to`. */
export const run = (from: number, to: number, x0 = 0): void => {
  for (let s = from; s <= to; s++) report(at(x0 + (s - from) * 3, 0, s));
};

export const settle = async (): Promise<void> => {
  for (let i = 0; i < 30; i++) await new Promise<void>((r) => setImmediate(r));
};

export async function freshApp() {
  vi.resetModules();
  stubPhone();
  const engine = (await import('../runEngine')).runEngine;
  const dbm = await import('../../db/schema');
  return { engine, db: dbm.db };
}
