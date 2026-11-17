// Keeps the screen on while a run is active (SPEC 12.2 pocket mode). Unlike useWakeLock (a hook for
// one screen), this one belongs to the run: it holds while the run goes on, whatever tab shows, is
// asked for again whenever the app comes back, and says whether the phone allowed it.

type Sentinel = { release: () => Promise<void>; released?: boolean; addEventListener?: (type: 'release', fn: () => void) => void };
type WakeLockApi = { request: (type: 'screen') => Promise<Sentinel> };

/** on: the screen stays on. missing: this phone has no way to. refused: it has, and said no. */
export type WakeState = 'off' | 'on' | 'missing' | 'refused';

export function createRunWake(onChange: (state: WakeState) => void) {
  let wanted = false;
  let sentinel: Sentinel | null = null;
  let asking = false;
  const api = (): WakeLockApi | null => {
    const a = (navigator as Navigator & { wakeLock?: WakeLockApi }).wakeLock;
    return a && typeof a.request === 'function' ? a : null;
  };
  const request = () => {
    if (!wanted || asking || document.visibilityState !== 'visible') return;
    if (sentinel && !sentinel.released) return;
    const a = api();
    if (!a) return onChange('missing');
    asking = true;
    a.request('screen').then(
      (s) => {
        asking = false;
        if (!wanted) return void s.release().catch(() => {});
        sentinel = s;
        onChange('on');
      },
      () => {
        asking = false;
        if (wanted) onChange('refused');
      },
    );
  };
  return {
    /** Call when a run starts or comes back, and every time the app becomes visible again. */
    hold() {
      wanted = true;
      request();
    },
    release() {
      wanted = false;
      sentinel?.release().catch(() => {});
      sentinel = null;
      onChange('off');
    },
  };
}
