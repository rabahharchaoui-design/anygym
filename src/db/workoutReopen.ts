// Undo for Finish: reopening a finished workout with its plan and pending rows (split from workouts.ts, PLAN 3.6x).
import { durableRow } from '../lib/durable';
import { db as defaultDb, type AnyGymDB } from './schema';
import type { PlanState } from './types';
import { FINISH_PENDING_PREFIX, FINISH_PLAN_PREFIX, type FinishPending } from './workoutKeys';
import { getActiveSession } from './workoutStart';

// The localStorage keys of the live tables (lib/drafts.ts, lib/extraSets.ts), mirrored in db.kv.
const DRAFTS_KEY = 'anygym-drafts';
const EXTRA_SETS_KEY = 'anygym-extra-sets';
const REST_KEY = 'anygym-rest';

/**
 * Undo for "Workout saved" (SPEC 13.1: undo, never a confirm): the finished workout is active
 * again, and the plan pointer goes back exactly to `planBefore` (day position, done days, week),
 * taken just before Finish. Refused (false) when the workout is gone, still active, or another
 * workout has started since; the plan is only restored when it is still the same plan.
 */
export async function reopenWorkout(sessionId: string, given?: PlanState, db: AnyGymDB = defaultDb): Promise<boolean> {
  return (await reopenWorkoutWithPending(sessionId, given, db)).ok;
}

/**
 * reopenWorkout, also handing back the pending and added rows Finish kept (PLAN 2.0c), taken out
 * in the same transaction. Their durable copies (db.kv anygym-drafts, anygym-extra-sets) are
 * written there too, so they survive a kill right after Undo even when localStorage refuses them;
 * the caller puts them into the runtime stores (lib/finishPending.ts restorePending).
 */
export async function reopenWorkoutWithPending(sessionId: string, given?: PlanState, db: AnyGymDB = defaultDb): Promise<{ ok: boolean; pending: FinishPending | null }> {
  return db.transaction('rw', db.sessions, db.planState, db.kv, async () => {
    const s = await db.sessions.get(sessionId);
    if (!s || s.endedAt === undefined || s.imported) return { ok: false, pending: null };
    if (await getActiveSession(db)) return { ok: false, pending: null };
    const { endedAt: _ended, ...open } = s;
    await db.sessions.put(open);
    // The copy Finish kept in its own transaction wins; `given` only for a Finish from before it existed.
    const kept = await db.kv.get(FINISH_PLAN_PREFIX + sessionId);
    await db.kv.delete(FINISH_PLAN_PREFIX + sessionId);
    const planBefore = kept?.value ? (JSON.parse(kept.value) as PlanState) : given;
    const now = await db.planState.get('active');
    if (planBefore && now && now.planId === planBefore.planId && s.planId === planBefore.planId) await db.planState.put(planBefore);
    const row = await db.kv.get(FINISH_PENDING_PREFIX + sessionId);
    await db.kv.delete(FINISH_PENDING_PREFIX + sessionId);
    const pending = parsePending(row?.value ?? null);
    if (pending) {
      if (pending.drafts !== null) await db.kv.put(durableRow(DRAFTS_KEY, pending.drafts));
      if (pending.extra !== null) await db.kv.put(durableRow(EXTRA_SETS_KEY, pending.extra));
      // The running rest with its original deadline (PLAN 2.0c), never a fresh countdown.
      if (pending.rest) await db.kv.put(durableRow(REST_KEY, pending.rest));
    }
    return { ok: true, pending };
  });
}

function parsePending(value: string | null): FinishPending | null {
  if (!value) return null;
  try {
    const v = JSON.parse(value) as Partial<FinishPending>;
    const str = (x: unknown) => (typeof x === 'string' ? x : null);
    const p = { drafts: str(v.drafts), extra: str(v.extra), rest: str(v.rest) };
    return p.drafts === null && p.extra === null && p.rest === null ? null : p;
  } catch {
    return null;
  }
}
