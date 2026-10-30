// Finish → Undo on Today (PLAN 2.0c, SPEC 13.1): the rows still pending on the workout's tables
// (their weights, reps and holds) and the rows added with "+ Add set" are kept with the plan state
// when Finish clears them (db/workouts.ts finishWorkout), and put back exactly by Undo. Rows whose
// write committed are used up again by the exercise view's reconciliation (screens/workout/rowLog.ts),
// so nothing comes back that was already logged.
import type { FinishPending } from '../db/workouts';
import { draftsValue, replaceDrafts, sessionDrafts, type DraftsBlob } from './drafts';
import { extraSetsValue, restoreExtraSets } from './extraSets';
import { loadRest, parseRest, saveRest } from './rest';

/** What Finish keeps for its Undo: this workout's drafts, added rows and running rest. */
export function snapshotPending(sessionId: string): FinishPending {
  const drafts = sessionDrafts(sessionId);
  const rest = loadRest(sessionId);
  return {
    drafts: drafts.size ? draftsValue({ [sessionId]: Object.fromEntries(drafts) }) : null,
    extra: extraSetsValue(sessionId),
    rest: rest ? JSON.stringify(rest) : null,
  };
}

/** Undo: the kept drafts and added rows are the live ones again. */
export function restorePending(p: FinishPending): void {
  if (p.drafts !== null) {
    try {
      replaceDrafts(JSON.parse(p.drafts) as DraftsBlob);
    } catch {
      /* corrupt copy: nothing to put back */
    }
  }
  if (p.extra !== null) restoreExtraSets(p.extra);
  // The countdown goes on from its original end time (time that passed is not given back).
  const rest = parseRest(p.rest ?? null);
  if (rest) saveRest(rest);
}
