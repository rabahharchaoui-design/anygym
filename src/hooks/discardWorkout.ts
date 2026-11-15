// Discard an empty workout from Today, with Undo (PLAN 3.5g). Split from TodayScreen so the whole
// sequence (the database part and the drafts) is tested as one.
import { discardEmptyWorkout, undoDiscard, type Discarded } from '../db/discard';
import type { AnyGymDB } from '../db/schema';
import { clearSessionDrafts, sessionDrafts, writeDrafts } from '../lib/drafts';

export type DiscardDeps = { db?: AnyGymDB };

/**
 * Discards the empty workout; null when it is not empty (or gone). Else its Undo: false when
 * another workout started meanwhile. The workout's pending rows go with it and come back with the
 * Undo exactly as they were (PLAN 3.6w): a Log whose write failed (still marked submitted, so Try
 * again logs it once) and every pick not logged yet.
 */
export async function discardWorkout(sessionId: string, deps: DiscardDeps = {}): Promise<{ undo: () => Promise<boolean> } | null> {
  const d: Discarded | null = await discardEmptyWorkout(sessionId, deps.db);
  if (!d) return null;
  const rows = sessionDrafts(sessionId);
  clearSessionDrafts(sessionId);
  return {
    undo: async () => {
      if (!(await undoDiscard(d, deps.db))) return false;
      if (rows.size) writeDrafts(sessionId, rows);
      return true;
    },
  };
}
