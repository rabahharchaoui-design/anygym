// The one tick of the live run's time face (PLAN 4.4a). It wakes exactly when the shown time reaches
// its next whole second (lib/run msToNextFace), so the face never skips or repeats a number, and
// not at all while the face stands still (paused, auto paused, waiting for GPS, in a gap) or the app
// is in the background. Paused by hand it wakes once more, when the map dot's position goes stale
// (PLAN R5 1). A new position or a pause calls poke: the next wake is worked out again.
import type { TrackerState } from '../lib/gps';
import { msToNextFace } from '../lib/run';

/** What the tick reads: the tracker, and the position the map dot shows (LiveRun here). */
export type FaceInput = { tracker: TrackerState; here: { t: number } | null };

export type FaceTickDeps = {
  now: () => number;
  later: (fn: () => void, ms: number) => number;
  cancel: (id: number) => void;
  visible: () => boolean;
};

const browser: FaceTickDeps = {
  now: () => Date.now(),
  later: (fn, ms) => window.setTimeout(fn, ms),
  cancel: (id) => window.clearTimeout(id),
  visible: () => document.visibilityState !== 'hidden',
};

export type FaceTick = { start: () => void; stop: () => void; poke: () => void };

/** `read` gives the tracker and the dot as they are now; `onTick` gets the clock each time the face may have changed. */
export function createFaceTick(read: () => FaceInput, onTick: (now: number) => void, deps: FaceTickDeps = browser): FaceTick {
  let timer: number | null = null;
  let running = false;
  const clear = () => {
    if (timer !== null) deps.cancel(timer);
    timer = null;
  };
  const arm = () => {
    clear();
    if (!running || !deps.visible()) return;
    const now = deps.now();
    onTick(now);
    const { tracker, here } = read();
    const wait = msToNextFace(tracker, now, here?.t ?? null);
    if (wait !== null) timer = deps.later(arm, wait);
  };
  return {
    start() {
      running = true;
      arm();
    },
    stop() {
      running = false;
      clear();
    },
    poke: arm,
  };
}
