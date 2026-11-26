// The run engine (PLAN 4.3, SPEC 12.2, 12.3): the one live run of the app. It lives outside React,
// so the run goes on whatever tab shows: it listens to the phone's positions, moves the pure state
// of lib/run forward, saves it every few seconds and whenever the app may be about to close, and
// keeps the screen on. Screens read it through useRunEngine and never touch the database.
import { deleteRun, finishRunRow, readLiveRun, saveLiveRun, startRunRow } from '../db/runs';
import { readRunSetup } from '../db/runSetup';
import { newId } from '../db/ids';
import type { Run } from '../db/types';
import type { DistanceUnit } from '../lib/intake/answers';
import { haversineM, unitMeters } from '../lib/gps';
import {
  DEFAULT_VOICE, finishRun, fixFate, fixTime, liveMovingMs, liveRow, rewatchDue, liveStep, parseSnapshot, restoreLive, rowPace, runCues, runVerdict, startLive, toSnapshot,
  type LiveAction, type LiveRun, type RunSetup, type VoiceSettings,
} from '../lib/run';
import { runDiagLog } from './runDiagLog';
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
  /** PLAN 4.4b (3): the last save during the run failed; it is tried again every 5 s until one lands. */
  autosaveFailed: boolean;
};

let state: EngineState = { ready: false, live: null, finished: null, wake: 'off', saveFailed: false, autosaveFailed: false };
const listeners = new Set<() => void>();
let watchId: number | null = null;
/** When the watch last started: a lost signal is asked for again from here (PLAN 4.4b 6). */
let watchedAt = 0;
/**
 * A watch started again in a gap may first hand back the last position it had, as if new: that
 * exact spot (where the dot is) is not taken as a position again: only that first callback is dropped.
 */
let replayOf: { lat: number; lng: number; near: boolean } | null = null;
/**
 * After a reload the phone's last raw position is not known (it lived in memory): the dot (the
 * estimate, saved with the run) stands in for it, and a position within REPLAY_NEAR_M of it counts as
 * the replay (PLAN 4.4d: the cached position from before the reload started the line again there and
 * every real position after it was dropped as an impossible jump).
 */
const REPLAY_NEAR_M = 2;
/**
 * The last position exactly as the phone gave it (PLAN 4.4d): the dot (`here`) is the estimate now,
 * not the phone's position, so a replayed position is recognised against this one.
 */
let lastRaw: { lat: number; lng: number } | null = null;
let saveTimer: number | null = null;
let tickTimer: number | null = null;
/** The voice coach's settings for the run that is going on (SPEC 12.4). */
let voice: VoiceSettings = DEFAULT_VOICE;
let dirty = false;
/** The clock as it stood at the last save: in a GPS hole it still counts (up to GAP_SEC) with nothing dirty. */
let savedFace = -1;
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
  if (!live) return;
  runDiagLog.flush();
  const now = Date.now();
  const face = liveMovingMs(live.tracker, now);
  if (!dirty && face === savedFace) return;
  dirty = false;
  savedFace = face;
  void queue(() => saveLiveRun(liveRow(live), JSON.stringify(toSnapshot(live, now)))).then(
    () => {
      if (state.autosaveFailed) set({ autosaveFailed: false });
    },
    () => {
      dirty = true;
      if (!state.autosaveFailed && state.live) set({ autosaveFailed: true });
    },
  );
}

function stopWatch() {
  if (watchId !== null) navigator.geolocation?.clearWatch(watchId);
  watchId = null;
}

function startWatch() {
  stopWatch();
  watchedAt = Date.now();
  if (state.live) runDiagLog.note(watchedAt, 'watch:restarted');
  if (!navigator.geolocation) return dispatch({ type: 'gps', trouble: 'unavailable' });
  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      earlyTrouble = null;
      const { latitude, longitude, accuracy, speed } = pos.coords;
      const now = Date.now();
      const raw0 = lastRaw;
      lastRaw = { lat: latitude, lng: longitude };
      // The diagnostics log keeps every position as the phone gave it (PLAN 4.4d 2).
      const raw = { lat: latitude, lng: longitude, accuracy, speed: speed ?? null, stamp: pos.timestamp };
      // Only the first callback after the restart can be the replay (PLAN 4.6a 4): a runner standing
      // on that spot keeps reporting it, and those fixes must end GPS lost.
      const replay = replayOf !== null && (replayOf.near ? haversineM(replayOf, { lat: latitude, lng: longitude }) <= REPLAY_NEAR_M : replayOf.lat === latitude && replayOf.lng === longitude);
      replayOf = null;
      if (replay) {
        lastRaw = raw0;
        return runDiagLog.fix(now, raw, 'watch:replay-dropped', false);
      }
      // Before GO (the countdown) there is no run yet: the position only wakes the GPS up.
      if (!state.live) return runDiagLog.early(now, raw);
      const point = { lat: latitude, lng: longitude, accuracy, speed, t: fixTime(pos.timestamp, now) };
      const fate = fixFate(state.live.tracker, point);
      dispatch({ type: 'fix', point, now });
      runDiagLog.fix(now, raw, fate, state.live?.tracker.still ?? false);
    },
    (err) => {
      earlyTrouble = err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable';
      runDiagLog.note(Date.now(), `error:${earlyTrouble}`);
      dispatch({ type: 'gps', trouble: earlyTrouble });
    },
    WATCH,
  );
}

/** The 5 s beat: save, and start the watch again while GPS is lost (PLAN 4.4b 6). */
function every5s() {
  save();
  if (state.live && navigator.geolocation && document.visibilityState === 'visible' && rewatchDue(state.live, Date.now(), watchedAt)) {
    rewatch();
  }
}

/**
 * Starts the watch again with the replay guard set: its first callback may be the phone's last
 * position handed back as new (PLAN 4.4b 6, 4.4f 1). Without the phone's last raw position (after a
 * reload) the dot stands in for it.
 */
function rewatch() {
  startWatch();
  guardReplay();
}

/** The replay guard for a watch just started: the phone's last raw position, else the dot (after a reload). */
function guardReplay() {
  const here = state.live?.here;
  replayOf = lastRaw ? { ...lastRaw, near: false } : here ? { lat: here.lat, lng: here.lng, near: true } : null;
}

const onVisibility = () => {
  if (document.visibilityState === 'hidden') return save();
  // Back in front: the screen lock is asked for again, and the watch starts fresh (phones stop
  // reporting in the background and do not always pick up by themselves).
  wake.hold();
  rewatch();
};

function attach() {
  // Started at the countdown already (warmGps): kept, so the first position is not delayed.
  if (watchId === null) startWatch();
  wake.hold();
  saveTimer = window.setInterval(every5s, SAVE_EVERY_MS);
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
          const live = restoreLive(found.row, parseSnapshot(found.snapshot, found.row.id), { unit, autoPause: setup.autoPause }, Date.now());
          voice = setup.voice;
          dirty = true;
          runDiagLog.begin(live.id, live.startedAt, false);
          set({ live, ready: true });
          attach();
          // The new watch's first callback may be the phone's old position handed back as new
          // (PLAN R1 7): guarded like rewatch(), with the saved dot standing in for it.
          replayOf = live.here ? { lat: live.here.lat, lng: live.here.lng, near: true } : null;
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
    runDiagLog.begin(live.id, live.startedAt, true);
    set({ live, finished: null, saveFailed: false, autosaveFailed: false, ready: true });
    say({ type: 'start', first: live.intervals?.plan.blocks[0]?.name ?? null }, voice);
    void queue(() => startRunRow(liveRow(live), JSON.stringify(toSnapshot(live, Date.now())))).catch(() => {
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
    runDiagLog.flush();
    try {
      await queue(() => finishRunRow(run));
      runDiagLog.flush(true);
      set({ live: null, finished: { run, unit: live.unit }, saveFailed: false, autosaveFailed: false });
      const pace = rowPace(run);
      // A run with nothing to show gets no numbers, spoken or printed.
      say({ type: 'finished', summary: runVerdict(run) === 'ok' ? { meters: run.distanceM, unit: live.unit, movingSec: run.movingSec, paceSec: pace === null ? null : pace * unitMeters(live.unit) } : null }, voice);
    } catch {
      // Not saved: the run stays, paused, and can be ended again.
      dirty = true;
      set({ live: paused, saveFailed: true });
      attach();
      // PLAN R3 (3): the new watch's first callback may be the last position handed back as new.
      guardReplay();
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
    runDiagLog.discard(f.run.id);
    await queue(() => deleteRun(f.run.id)).catch(() => undefined);
  },
};
