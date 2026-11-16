// PLAN 3.6k (audit A4): save the current plan's exercise photos for offline, in the background. They
// go into the same cache, under the same URLs, that the service worker's CacheFirst rule for ex/
// reads (vite.config.ts), so a first workout in a basement shows its pictures. Gentle by design: a
// few at a time, each batch in idle time, stops when the phone goes offline or the plan changes,
// never refetches a kept photo, never throws (a photo that fails is tried again next launch).

/** The runtime cache of exercise photos. vite.config.ts names the same cache (a test checks it). */
export const PHOTO_CACHE = 'exercise-photos';

export interface CacheLike {
  match(url: string): Promise<unknown>;
  put(url: string, res: Response): Promise<void>;
}

export interface WarmDeps {
  open: () => Promise<CacheLike>;
  fetch: (url: string, signal?: AbortSignal) => Promise<Response>;
  /** Resolves when the phone is idle enough for the next batch. */
  idle: () => Promise<void>;
  online: () => boolean;
}

export type WarmResult = { saved: number; kept: number; failed: number; stopped: boolean };

/** Fetch and keep each URL the cache does not hold yet, `batch` at a time. */
export async function warmPhotos(urls: readonly string[], deps: WarmDeps, signal?: AbortSignal, batch = 3): Promise<WarmResult> {
  const result: WarmResult = { saved: 0, kept: 0, failed: 0, stopped: false };
  let cache: CacheLike;
  try {
    cache = await deps.open();
  } catch {
    return { ...result, stopped: true };
  }
  const one = async (url: string) => {
    try {
      if (await cache.match(url)) {
        result.kept++;
        return;
      }
      const res = await deps.fetch(url, signal);
      // Only a whole, same origin picture is kept (never an error page or a partial answer).
      if (!res.ok || res.status !== 200 || res.type === 'opaque') {
        result.failed++;
        return;
      }
      await cache.put(url, res);
      result.saved++;
    } catch {
      result.failed++;
    }
  };
  for (let i = 0; i < urls.length; i += batch) {
    await deps.idle();
    if (signal?.aborted || !deps.online()) return { ...result, stopped: true };
    await Promise.all(urls.slice(i, i + batch).map(one));
  }
  return result;
}

/** The phone's own deps: Cache Storage, fetch and idle time (Safari has no requestIdleCallback). */
export function browserWarmDeps(): WarmDeps | null {
  if (typeof caches === 'undefined' || typeof fetch === 'undefined') return null;
  type IdleWindow = { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number };
  const ric = (globalThis as IdleWindow).requestIdleCallback;
  return {
    open: () => caches.open(PHOTO_CACHE),
    fetch: (url, signal) => fetch(url, { credentials: 'same-origin', signal }),
    idle: () => new Promise<void>((done) => (ric ? ric(() => done(), { timeout: 2000 }) : setTimeout(done, 300))),
    online: () => navigator.onLine !== false,
  };
}
