// The time budget on a live workout (PLAN 3.6, SPEC 7.4). One transaction per change. The plan and
// its JSON are never written: the trim is stored on the session (additive), and the minutes picked
// are remembered per gym. Logged sets are never touched; an exercise with sets is never cut.
import { planById } from '../data/plans';
import { dayIndexOf } from '../lib/plans';
import { slotOf } from '../lib/swap';
import { idsForTrim, type DayTrim } from '../lib/timeBudget';
import { db as defaultDb, type AnyGymDB } from './schema';
import type { Session } from './types';
import { WorkoutFinishedError } from './workouts';

/** A set landed on an exercise the trim would cut (or one is still saving). Nothing changed. */
export class TrimStaleError extends Error {
  constructor() {
    super('That exercise has sets now');
    this.name = 'TrimStaleError';
  }
}

/** What Undo needs: the workout and the gym as they were, and the order right after. */
export type TrimReceipt = {
  before: Pick<Session, 'timeBudgetMin' | 'trim' | 'exerciseIds'>;
  after: string[];
  gymBefore: number | undefined;
};

const put = (s: Session, v: Pick<Session, 'timeBudgetMin' | 'trim'>, exerciseIds: string[]): Session => {
  const next: Session = { ...s, exerciseIds };
  if (v.timeBudgetMin === undefined) delete next.timeBudgetMin;
  else next.timeBudgetMin = v.timeBudgetMin;
  if (v.trim) next.trim = v.trim;
  else delete next.trim;
  return next;
};

async function rememberAtGym(db: AnyGymDB, gymId: string, minutes: number | undefined): Promise<number | undefined> {
  const gym = await db.gyms.get(gymId);
  if (!gym) return undefined;
  const before = gym.timeBudgetMin;
  const next = { ...gym };
  if (minutes === undefined) delete next.timeBudgetMin;
  else next.timeBudgetMin = minutes;
  await db.gyms.put(next);
  return before;
}

/**
 * This workout fits `minutes` with `trim` (null: the day as planned). Exercises the trim newly cuts
 * leave the workout's order, ones it no longer cuts come back at their plan place. Refused when the
 * workout ended, or when an exercise it cuts has a set (logged, saving, or deleted with Undo open).
 */
export async function setWorkoutTrim(sessionId: string, minutes: number, trim: DayTrim | null, db: AnyGymDB = defaultDb): Promise<TrimReceipt> {
  return db.transaction('rw', [db.sessions, db.sets, db.journal, db.tombstones, db.gyms], async () => {
    const s = await db.sessions.get(sessionId);
    if (!s || s.endedAt !== undefined) throw new WorkoutFinishedError();
    const plan = planById(s.planId);
    const day = plan?.days[dayIndexOf(plan, s.dayId)];
    if (!day) throw new Error('Not a plan workout');
    const swaps = s.swaps ?? [];
    const planIds = day.blocks.flatMap((b) => b.items.map((it) => it.exerciseId));
    const was = new Set(s.trim?.drop ?? []);
    const cut = new Set((trim?.drop ?? []).filter((slot) => !was.has(slot)));
    if (cut.size) {
      const sets = await db.sets.where('sessionId').equals(sessionId).toArray();
      const journal = await db.journal.where('sessionId').equals(sessionId).toArray();
      const deleted = await db.tombstones.where('sessionId').equals(sessionId).toArray();
      const hit = (id: string) => cut.has(slotOf(swaps, id));
      if (sets.some((x) => hit(x.exerciseId)) || journal.some((j) => hit(j.exerciseId)) || deleted.some((t) => hit(t.set.exerciseId))) throw new TrimStaleError();
    }
    const current = s.exerciseIds ?? [];
    const after = idsForTrim(current, planIds, s.trim, trim, (id) => slotOf(swaps, id), (slot) => swaps.find((x) => x.slot === slot)?.current ?? slot);
    await db.sessions.put(put(s, { timeBudgetMin: minutes, ...(trim ? { trim } : {}) }, after));
    const gymBefore = await rememberAtGym(db, s.gymId, minutes);
    const before: TrimReceipt['before'] = { exerciseIds: [...current] };
    if (s.timeBudgetMin !== undefined) before.timeBudgetMin = s.timeBudgetMin;
    if (s.trim) before.trim = s.trim;
    return { before, after, gymBefore };
  });
}

/**
 * Undo: the workout is what it was before the trim. Exercises the trim cut come back in their old
 * places; anything changed since (an exercise added or removed by hand) stays changed.
 */
export async function undoWorkoutTrim(sessionId: string, r: TrimReceipt, db: AnyGymDB = defaultDb): Promise<void> {
  await db.transaction('rw', [db.sessions, db.gyms], async () => {
    const s = await db.sessions.get(sessionId);
    if (!s || s.endedAt !== undefined) throw new WorkoutFinishedError();
    const now = s.exerciseIds ?? [];
    const old = r.before.exerciseIds ?? [];
    const cutByIt = new Set(old.filter((id) => !r.after.includes(id)));
    const ids = [...old.filter((id) => now.includes(id) || cutByIt.has(id)), ...now.filter((id) => !old.includes(id))];
    await db.sessions.put(put(s, r.before, ids));
    await rememberAtGym(db, s.gymId, r.gymBefore);
  });
}

/** "75+ min" (or any pick that changes nothing) on a workout with no trim: only remembered per gym. */
export async function rememberBudget(gymId: string, minutes: number, db: AnyGymDB = defaultDb): Promise<void> {
  await db.transaction('rw', db.gyms, () => rememberAtGym(db, gymId, minutes));
}
