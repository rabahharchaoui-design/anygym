// The run engine (PLAN 4.3, SPEC 12.2, 12.3): the one live run of the app. It lives outside React,
// so the run goes on whatever tab shows: it listens to the phone's positions, moves the pure state
// of lib/run forward, saves it every few seconds and whenever the app may be about to close, and
// keeps the screen on. Screens read it through useRunEngine and never touch the database.
import { deleteRun, finishRunRow, readLiveRun, saveLiveRun, startRunRow } from '../db/runs';
import { readRunSetup } from '../db/runSetup';
import { newId } from '../db/ids';
import type { Run } from '../db/types';
import type { DistanceUnit } from '../lib/intake/answers';
import { finishRun, fixTime, liveRow, liveStep, parseSnapshot, restoreLive, startLive, toSnapshot, type LiveAction, type LiveRun, type RunSetup } from '../lib/run';
import { createRunWake, type WakeState } from './runWake';

/** How often a going run is written to the phone. A crash loses at most this much. */
export const SAVE_EVERY_MS = 5000;

const WATCH: PositionOptions = { enableHighAccuracy: true, maximumAge: 0 };

export type FinishedRun = { run: Run; unit: DistanceUnit };

export type EngineState = {
  /** False until the phone was asked once whether a run was still going. */
  ready: boolean;
  live: LiveRun | null;
  /** The run that just ended, for the summary, until it is dismissed. */
  finished: FinishedRun | null;
  wake: WakeState;
  /** The end could not be saved: the run is still there, paused, to try again. */
  saveFailed: boolean;
};

let state: EngineState = { ready: false, live: null, finished: null, wake: 'off', saveFailed: false };
const listeners = new Set<() => void>();
let watchId: number | null = null;
let saveTimer: number | null = null;
let dirty = false;
let writes: Promise<void> = Promise.resolve();
let restoring: Promise<void> | null = null;

const set = (patch: Partial<EngineState>) => {
  state = { ...state, ...patch };
  for (const l of listeners) l();
};

const wake = createRunWake((w) => state.wake !== w && set({ wake: w }));

function dispatch(action: LiveAction) {
  if (!state.live) return;
  const live = liveStep(state.live, action);
  if (live === state.live) return;
  dirty = true;
  set({ live });
}

/** Writes are queued one after the other, so an older save never lands on top of a newer one. */
function queue(job: () => Promise<void>): Promise<void> {
  const next = writes.then(job);
  writes = next.catch(() => undefined);
  return next;
}

function save() {
  const live = state.live;
  if (!live || !dirty) return;
  dirty = false;
  void queue(() => saveLiveRun(liveRow(live), JSON.stringify(toSnapshot(live)))).catch(() => {
    dirty = true;
  });
}

function stopWatch() {
  if (watchId !== null) navigator.geolocation?.clearWatch(watchId);
  watchId = null;
}

function startWatch() {
  stopWatch();
  if (!navigator.geolocation) return dispatch({ type: 'gps', trouble: 'unavailable' });
  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const { latitude, longitude, accuracy } = pos.coords;
      dispatch({ type: 'fix', point: { lat: latitude, lng: longitude, accuracy, t: fixTime(pos.timestamp, Date.now()) } });
    },
    (err) => dispatch({ type: 'gps', trouble: err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable' }),
    WATCH,
  );
}

const onVisibility = () => {
  if (document.visibilityState === 'hidden') return save();
  // Back in front: the screen lock is asked for again, and the watch starts fresh (phones stop
  // reporting in the background and do not always pick up by themselves).
  wake.hold();
  startWatch();
};

function attach() {
  startWatch();
  wake.hold();
  saveTimer = window.setInterval(save, SAVE_EVERY_MS);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', save);
}

function detach() {
  stopWatch();
  wake.release();
  if (saveTimer !== null) window.clearInterval(saveTimer);
  saveTimer = null;
  document.removeEventListener('visibilitychange', onVisibility);
  window.removeEventListener('pagehide', save);
}

export const runEngine = {
  get: (): EngineState => state,
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  /**
   * Asks the phone once whether a run was still going when the app closed. If so it comes back
   * paused (the time away is a pause in the line, never moving time).
   */
  restore(): Promise<void> {
    restoring ??= (async () => {
      try {
        const found = state.live ? null : await readLiveRun();
        if (found && !state.live) {
          const { setup, unit } = await readRunSetup();
          const live = restoreLive(found.row, parseSnapshot(found.snapshot, found.row.id), { unit, autoPause: setup.autoPause });
          dirty = true;
          set({ live, ready: true });
          attach();
          save();
          return;
        }
      } catch {
        // Storage unreadable: nothing to bring back; a new run can still start.
      }
      set({ ready: true });
    })();
    return restoring;
  },

  /** Starts a run now (after the countdown). The row exists from the first moment. */
  start(setup: RunSetup, unit: DistanceUnit): void {
    if (state.live) return;
    const live = startLive({ id: newId(), now: Date.now(), setup, unit, autoPause: setup.autoPause });
    dirty = false;
    set({ live, finished: null, saveFailed: false, ready: true });
    void queue(() => startRunRow(liveRow(live), JSON.stringify(toSnapshot(live)))).catch(() => {
      dirty = true;
    });
    attach();
  },

  pause(): void {
    dispatch({ type: 'pause' });
    save();
  },
  resume(): void {
    dispatch({ type: 'resume' });
    save();
  },
  setAutoPause(on: boolean): void {
    dispatch({ type: 'auto-pause', on });
    save();
  },

  /** Ends the run: stops listening, writes the finished row, hands it to the summary. */
  async end(): Promise<void> {
    const live = state.live;
    if (!live) return;
    const paused = liveStep(live, { type: 'pause' });
    const run = finishRun(paused, Date.now()) as Run & { endedAt: number };
    detach();
    dirty = false;
    try {
      await queue(() => finishRunRow(run));
      set({ live: null, finished: { run, unit: live.unit }, saveFailed: false });
    } catch {
      // Not saved: the run stays, paused, and can be ended again.
      dirty = true;
      set({ live: paused, saveFailed: true });
      attach();
    }
  },

  /** Done on the summary. */
  closeFinished(): void {
    if (state.finished) set({ finished: null });
  },
  /** Discard on a run with nothing to show: the row is removed. */
  async discardFinished(): Promise<void> {
    const f = state.finished;
    if (!f) return;
    set({ finished: null });
    await queue(() => deleteRun(f.run.id)).catch(() => undefined);
  },
};
