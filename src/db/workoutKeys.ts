// The kv row keys and the finish pending shape of the workout writes (split from workouts.ts, PLAN 3.6x).

/** kv row Finish writes (one at a time): the plan state just before that Finish, for its Undo. */
export const FINISH_PLAN_PREFIX = 'anygym-finish-plan:';
/** PLAN 2.0c: the pending rows (drafts) and added rows a Finish cleared, kept for its Undo. */
export const FINISH_PENDING_PREFIX = 'anygym-finish-pending:';

/**
 * What was still on the workout's tables when it was finished (PLAN 2.0c): the anygym-drafts and
 * anygym-extra-sets values of that workout (null: none). Undo on Today puts them back exactly.
 */
export type FinishPending = { drafts: string | null; extra: string | null; rest?: string | null };

export const RESTORED_PREFIX = 'anygym-restored:';
/** kv row: the token of the deletion a set was last put back from (db/tombstones.ts cancelUndo). */
export const restoredKey = (sessionId: string, setId: string) => `${RESTORED_PREFIX}${sessionId}:${setId}`;

/** kv rows of the change revision counters (db/mutations.ts), one per workout, set and kind. */
export const MUTATION_REV_PREFIX = 'anygym-mutrev:';
/** kv rows of the supersession markers (db/mutations.ts), one per workout, set and kind. */
export const MUTATION_DONE_PREFIX = 'anygym-mutdone:';
/** kv rows of the corrections a restore stored durably (db/mutations.ts, PLAN 2.0i), one per held change. */
export const MUTATION_HELD_PREFIX = 'anygym-mutheld:';
/**
 * kv rows of the held corrections a save that landed has superseded (db/mutations.ts, PLAN 2.0j),
 * written in that save's own transaction: `anygym-mutsup:<sessionId>:<held id>`. The order of two
 * corrections is "registered before it landed", never a comparison of clocks.
 */
export const MUTATION_SUP_PREFIX = 'anygym-mutsup:';
/**
 * kv rows of the failed Logs the user gave up (PLAN 3.2b), written in the transaction that deletes
 * their journal entry: `anygym-logcancel:<sessionId>:<draft id>`. A tab holding the old marked
 * draft, also after a restart or Finish then Undo, never retries it.
 */
export const LOG_CANCEL_PREFIX = 'anygym-logcancel:';
