// What the live screen and the finish screen read from the tracker state (SPEC 12.2, 12.9). Pure;
// split from tracker.ts (PLAN 4.4d), which re-exports it.
import { averagePace, currentPace, speedPace } from './pace';
import { readSplits, type Split } from './splits';
import { clockStopped, type TrackerState } from './tracker';

export type RunStatus = 'waiting' | 'running' | 'auto-paused' | 'paused';

export type TrackerReading = {
  /** waiting: no good point yet. paused: by hand. auto-paused: standing, with auto pause on. */
  status: RunStatus;
  /** Standing still right now (also true with auto pause off, where the status stays running). */
  standing: boolean;
  distanceM: number;
  movingSec: number;
  /** From the first good point to the last one, pauses and gaps included. */
  elapsedSec: number;
  /** Seconds per meter, or null: no pace yet, or not moving. */
  currentPace: number | null;
  /** Seconds per meter, or null: not enough distance yet. */
  averagePace: number | null;
  splits: { full: readonly Split[]; partial: Split | null };
};

/** Everything the live screen and the finish screen show, read from the state. */
export function readTracker(state: TrackerState): TrackerReading {
  const status: RunStatus = state.manual ? 'paused' : !state.lastGood ? 'waiting' : clockStopped(state) ? 'auto-paused' : 'running';
  const movingSec = state.movingMs / 1000;
  return {
    status,
    standing: state.still,
    distanceM: state.distanceM,
    movingSec,
    elapsedSec: state.lastGood && state.firstT !== null ? (state.lastGood.t - state.firstT) / 1000 : 0,
    currentPace: state.manual || state.still ? null : (speedPace(state.speeds ?? [], state.lastGood) ?? currentPace(state.pace)),
    averagePace: averagePace(movingSec - (state.heldMs ?? 0) / 1000, state.timedM),
    splits: readSplits(state.splits),
  };
}
