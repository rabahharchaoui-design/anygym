// The run engine (PLAN 4.3, SPEC 12.2, 12.3): the one live run of the app. It lives outside React,
// so the run goes on whatever tab shows: it listens to the phone's positions, moves the pure state
// of lib/run forward, saves it every few seconds and whenever the app may be about to close, and
// keeps the screen on. Screens read it through useRunEngine and never touch the database.
import { deleteRun, finishRunRow, readLiveRun, saveLiveRun, startRunRow } from '../db/runs';
import { readRunSetup } from '../db/runSetup';
import { newId } from '../db/ids';
import type { Run } from '../db/types';
import type { DistanceUnit } from '../lib/intake/answers';
import { unitMeters } from '../lib/gps';
import {
  DEFAULT_VOICE, finishRun, fixTime, liveRow, liveStep, parseSnapshot, restoreLive, rowPace, runCues, runVerdict, startLive, toSnapshot,
  type LiveAction, type LiveRun, type RunSetup, type VoiceSettings,
} from '../lib/run';
import { createRunWake, type WakeState } from './runWake';
import { say, unlockVoice } from './voicePlayer';

/** How often a going run is written to the phone. A crash loses at most this much. */
export const SAVE_EVERY_MS = 5000;

/** How often the interval clock moves (PLAN 4.4). Only an interval run ticks. */
export const TICK_EVERY_MS = 250;

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
let tickTimer: number | null = null;
/** The voice coach's settings for the run that is going on (SPEC 12.4). */
let voice: VoiceSettings = DEFAULT_VOICE;
let dirty = false;
let writes: Promise<void> = Promise.resolve();
let restoring: Promise<void> | null = null;
/** What the watch said before the run existed (it starts at the countdown): told to the run at GO. */
let earlyTrouble: 'denied' | 'unavailable' | null = null;

const set = (patch: Partial<EngineState>) => {
  state = { ...state, ...patch };
  for (const l of listeners) l();
};

const wake = createRunWake((w) => state.wake !== w && set({ wake: w }));

function dispatch(action: LiveAction) {
  if (!state.live) return;
  const before = state.live;
  const live = liveStep(before, action);
  if (live === before) return;
  dirty = true;
  set({ live });
  // The voice coach (PLAN 4.4): whatever this step brought about is said, in its turn, never held up.
  for (const event of runCues(before, live)) say(event, voice);
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
      earlyTrouble = null;
      const { latitude, longitude, accuracy } = pos.coords;
      // Before GO (the countdown) there is no run yet: the position only wakes the GPS up.
      dispatch({ type: 'fix', point: { lat: latitude, lng: longitude, accuracy, t: fixTime(pos.timestamp, Date.now()) } });
    },
    (err) => {
      earlyTrouble = err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable';
      dispatch({ type: 'gps', trouble: earlyTrouble });
    },
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
  // Started at the countdown already (warmGps): kept, so the first position is not delayed.
  if (watchId === null) startWatch();
  wake.hold();
  saveTimer = window.setInterval(save, SAVE_EVERY_MS);
  if (state.live?.intervals) tickTimer = window.setInterval(() => dispatch({ type: 'tick', now: Date.now() }), TICK_EVERY_MS);
  // Any touch during a run keeps the phone willing to play the voice (it may fall asleep in the background).
  document.addEventListener('pointerdown', unlockVoice, { passive: true });
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', save);
}

function detach() {
  stopWatch();
  wake.release();
  if (saveTimer !== null) window.clearInterval(saveTimer);
  saveTimer = null;
  if (tickTimer !== null) window.clearInterval(tickTimer);
  tickTimer = null;
  document.removeEventListener('pointerdown', unlockVoice);
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
          voice = setup.voice;
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

  /**
   * The countdown started (PLAN 4.4a): the phone starts looking for its position now, so the first
   * one is there at GO. Positions before the run exists are not part of it.
   */
  warmGps(): void {
    if (state.live || watchId !== null) return;
    earlyTrouble = null;
    startWatch();
  },
  /** The countdown was cancelled: stop looking. */
  coolGps(): void {
    if (!state.live) stopWatch();
  },

  /** Starts a run now (after the countdown). The row exists from the first moment. */
  start(setup: RunSetup, unit: DistanceUnit): void {
    if (state.live) return;
    const live = startLive({ id: newId(), now: Date.now(), setup, unit, autoPause: setup.autoPause });
    dirty = false;
    voice = setup.voice;
    set({ live, finished: null, saveFailed: false, ready: true });
    say({ type: 'start', first: live.intervals?.plan.blocks[0]?.name ?? null }, voice);
    void queue(() => startRunRow(liveRow(live), JSON.stringify(toSnapshot(live)))).catch(() => {
      dirty = true;
    });
    attach();
    if (earlyTrouble) dispatch({ type: 'gps', trouble: earlyTrouble });
  },

  pause(): void {
    dispatch({ type: 'pause', now: Date.now() });
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

  /** The voice coach's settings changed (run settings): they count from the next cue. */
  setVoice(settings: VoiceSettings): void {
    voice = settings;
  },

  /** Ends the run: stops listening, writes the finished row, hands it to the summary. */
  async end(): Promise<void> {
    const live = state.live;
    if (!live) return;
    const now = Date.now();
    // The time since the last position counts, as the screen showed it (PLAN 4.4a).
    const paused = liveStep(live, { type: 'pause', now });
    const run = finishRun(paused, now) as Run & { endedAt: number };
    detach();
    dirty = false;
    try {
      await queue(() => finishRunRow(run));
      set({ live: null, finished: { run, unit: live.unit }, saveFailed: false });
      const pace = rowPace(run);
      // A run with nothing to show gets no numbers, spoken or printed.
      say({ type: 'finished', summary: runVerdict(run) === 'ok' ? { meters: run.distanceM, unit: live.unit, movingSec: run.movingSec, paceSec: pace === null ? null : pace * unitMeters(live.unit) } : null }, voice);
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
