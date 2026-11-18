// The clock on the live screen (PLAN 4.4a). The engine's moving time only moves when a position
// arrives (every few seconds on an iPhone), so the face adds the time since the last one. Pure:
// the clock comes in as `now`. The rule itself (what the next position would add) is gps pendingMs.
//
// What the face shows, in one place:
// - Running: the counted time plus the time since the last good position, so it reads 1, 2, 3.
//   When the next position lands the engine counts exactly that stretch, so the face never steps back.
// - Paused by hand or auto paused: the counted time, standing still. A pause by hand counts the
//   time since the last position first (gps pauseRun), so the face does not drop at the tap.
// - Right after Resume: it stands until the first position (no time is counted across a pause).
// - No position for longer than GAP_SEC (15 s): that wait has become a GPS gap. The face stops at
//   the counted time plus GAP_SEC and holds there (the screen says GPS is lost); it never goes back.
//   Those GAP_SEC count as moving time (the next position, a pause or End credits them, gps
//   addPoint and pauseRun), the rest of the gap never does. When positions return it goes on from
//   there.
// - Saved time is always the engine's. The face is at most one second ahead of what will be saved.
import { GAP_SEC, pendingMs, type TrackerReading, type TrackerState } from '../gps';
import { readLive, type LiveRun } from './live';

/** Moving time as the face shows it, in ms: counted time plus what the next position would add. */
export const liveMovingMs = (tracker: TrackerState, nowMs: number): number => tracker.movingMs + pendingMs(tracker, nowMs);

/** The same in seconds (not rounded). */
export const liveMovingSec = (tracker: TrackerState, nowMs: number): number => liveMovingMs(tracker, nowMs) / 1000;

/** The live reading with the moving time of the face. Distance and pace still move per position. */
export function readLiveAt(run: LiveRun, nowMs: number): TrackerReading {
  const reading = readLive(run);
  const movingSec = liveMovingSec(run.tracker, nowMs);
  return movingSec === reading.movingSec ? reading : { ...reading, movingSec };
}

/** No position for longer than GAP_SEC while the clock was counting: the face holds and says GPS is lost. */
export function inGap(tracker: TrackerState, nowMs: number): boolean {
  return pendingMs(tracker, nowMs) > 0 && nowMs - tracker.lastGood!.t > GAP_SEC * 1000;
}

/**
 * How long until the face changes by itself: the next whole second of the shown time, or the
 * moment the wait turns into a gap (one more wake, so the screen can say so), whichever comes
 * first. Null while it stands still (paused, auto paused, waiting for GPS, in a gap): then only the
 * engine can change it, and no timer runs.
 */
export function msToNextFace(tracker: TrackerState, nowMs: number): number | null {
  const pending = pendingMs(tracker, nowMs);
  if (pending <= 0) {
    // Not counting. A position stamped a little ahead of the clock starts counting when the clock gets there.
    const ahead = tracker.lastGood && !tracker.manual && !tracker.afterPause && !(tracker.still && tracker.autoPause) ? tracker.lastGood.t - nowMs : -1;
    return ahead >= 0 ? ahead + 1 : null;
  }
  const since = nowMs - tracker.lastGood!.t;
  if (since > GAP_SEC * 1000) return null;
  const toSecond = 1000 - ((tracker.movingMs + pending) % 1000);
  const toGap = GAP_SEC * 1000 - since + 1;
  return Math.max(1, Math.min(toSecond, toGap));
}

/** A step back of at most this many seconds is not shown (see faceSec). */
export const FACE_HOLD_SEC = 1;

/**
 * The whole second the face prints, given the one it printed last (null: none yet). It only steps
 * back when it must: a drop of one second (a position stamped a moment before it arrived, at the
 * start of an auto pause) is held, so a number never repeats backwards; a larger drop (a gap that
 * will not count) is shown, because the face never stays more than a second ahead of the truth.
 */
export function faceSec(prev: number | null, movingMs: number): number {
  const whole = Math.floor(Math.max(0, movingMs) / 1000);
  return prev !== null && whole < prev && prev - whole <= FACE_HOLD_SEC ? prev : whole;
}
