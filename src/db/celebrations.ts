// Celebration moments of a finished workout, read from saved data (PLAN 3.6b), and the one write
// that keeps a full screen moment from ever playing twice.
//   - Moments are derived on every read from sessions and sets (history.ts finishedWins: the same
//     records as the live "New best" chip); nothing about a record is stored a second time.
//   - "First workout": this finished, not imported workout has a working set and no other finished
//     or imported workout has one. Warm ups alone are not a workout; imported history means it is
//     not the first.
//   - claimBig writes one kv row per workout, 'anygym-celebrated:<sessionId>'. It stays on the phone
//     (not in backups) and survives Undo, so Finish → Undo → Finish and a reload never replay it.
import { isMainLift } from '../data/mainLifts';
import { durableRow } from '../lib/durable';
import { firstWorkoutMoment, liftMoments } from '../lib/gymMoments';
import { formatTotalCompact, totalLifted } from '../lib/load';
import { isWorkSet, workSetCount } from '../lib/workSets';
import type { Moment } from '../ui/celebrate/types';
import { finishedWins, listFinished } from './history';
import { db as defaultDb, type AnyGymDB } from './schema';
import type { Unit } from './types';

export const CELEBRATED_PREFIX = 'anygym-celebrated:';

/** Every moment a finished workout earned, in workout order (the first workout first). Empty while it is still going. */
export async function workoutMoments(sessionId: string, nameOf: (exerciseId: string) => string, unit: Unit, db: AnyGymDB = defaultDb): Promise<Moment[]> {
  const won = await finishedWins(sessionId, nameOf, db);
  if (!won || won.session.endedAt === undefined || won.session.imported) return [];
  const { sets, groups } = won;
  const out: Moment[] = [];
  if (workSetCount(sets) > 0 && !(await listFinished(db)).some((f) => f.session.id !== sessionId && f.sets > 0)) {
    // The same number as the finish screen's Total lifted tile (warm ups never count).
    const lifted = totalLifted(sets.filter(isWorkSet), unit);
    out.push(firstWorkoutMoment(sessionId, lifted > 0 ? formatTotalCompact(lifted, unit) : null, workSetCount(sets)));
  }
  // A main lift is a loaded barbell lift by the catalog's data (data/mainLifts.ts), never guessed from a name.
  return [...out, ...liftMoments(groups.map((g) => ({ ...g, main: isMainLift(g.exerciseId) })))];
}

/**
 * Claims this workout's one full screen moment. True only the first time, ever; false when it was
 * already claimed or the write failed (the screen then shows its cards, never a second full screen).
 */
export async function claimBig(sessionId: string, momentId: string, db: AnyGymDB = defaultDb): Promise<boolean> {
  const key = `${CELEBRATED_PREFIX}${sessionId}`;
  try {
    return await db.transaction('rw', db.kv, async () => {
      if (await db.kv.get(key)) return false;
      await db.kv.put(durableRow(key, momentId));
      return true;
    });
  } catch {
    return false;
  }
}
