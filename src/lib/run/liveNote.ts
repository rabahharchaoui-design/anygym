// The one line under the live run's big number (SPEC 12.2, PLAN 4.4a, 4.4f 2): what the run is doing
// when it is not simply running. Pure: the run, its status and the clock come in.
import { GAP_SEC, type RunStatus } from '../gps';
import type { LiveRun } from './live';
import { inGap } from './liveClock';

export type LiveNoteTone = 'paused' | 'auto' | 'wait';
export type LiveNoteWords = { tone: LiveNoteTone; text: string } | null;

/** The last good position is older than GAP_SEC: the phone has stopped giving positions. */
const gpsStale = (run: LiveRun, nowMs: number): boolean => run.tracker.lastGood !== null && nowMs - run.tracker.lastGood.t > GAP_SEC * 1000;

export function liveNote(run: LiveRun, status: RunStatus, nowMs: number): LiveNoteWords {
  if (status === 'paused') return { tone: 'paused', text: run.closed ? 'Paused while the app was closed' : 'Paused' };
  if (run.gps === 'denied') return { tone: 'wait', text: 'Location is off for AnyGym' };
  if (status === 'waiting') return { tone: 'wait', text: 'Looking for GPS' };
  // Auto paused, but no position for a while: it is not known that the runner stands (PLAN 4.4f 2).
  if (status === 'auto-paused') return gpsStale(run, nowMs) ? { tone: 'wait', text: 'GPS lost · time on hold' } : { tone: 'auto', text: 'Auto paused · move to go on' };
  // PLAN 4.4a: no position for a while: the time holds (it never goes back) until GPS returns.
  if (inGap(run.tracker, nowMs)) return { tone: 'wait', text: 'GPS lost · time on hold' };
  return null;
}
