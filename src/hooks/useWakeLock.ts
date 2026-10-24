import { useEffect } from 'react';

type Sentinel = { release: () => Promise<void>; released?: boolean };
type WakeLockApi = { request: (type: 'screen') => Promise<Sentinel> };

/** Keeps the screen on while mounted (SPEC 1). Re-requests when the app comes back; silent when unsupported. */
export function useWakeLock(active = true): void {
  useEffect(() => {
    if (!active) return;
    const api = (navigator as Navigator & { wakeLock?: WakeLockApi }).wakeLock;
    if (!api || typeof api.request !== 'function') return;
    let sentinel: Sentinel | null = null;
    let alive = true;

    const request = () => {
      if (document.visibilityState !== 'visible') return;
      if (sentinel && !sentinel.released) return;
      api.request('screen').then(
        (s) => {
          if (alive) sentinel = s;
          else s.release().catch(() => {});
        },
        () => {},
      );
    };
    request();
    document.addEventListener('visibilitychange', request);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', request);
      sentinel?.release().catch(() => {});
      sentinel = null;
    };
  }, [active]);
}
