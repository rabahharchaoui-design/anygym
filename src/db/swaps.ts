// Swapping an exercise in a live workout (PLAN 3.4, SPEC 7.2, 21.1). One transaction per change; the
// plan's JSON is never written. The logged sets of the exercise left behind stay exactly as they are.
import { applySwap, revertSwap, slotOf, swapOfRow } from '../lib/swap';
import { db as defaultDb, type AnyGymDB } from './schema';
import { ANY_GYM, type SessionSwap } from './types';
import { WorkoutFinishedError } from './workouts';

/** A set of this exercise has not landed yet: swapping now could hide its failure. Nothing changed. */
export class SwapPendingError extends Error {
  constructor() {
    super('A set of this exercise is not saved yet');
    this.name = 'SwapPendingError';
  }
}

/** A set was logged on the replacement since: the swap stays. Nothing changed. */
export class SwapUndoStaleError extends Error {
  constructor() {
    super('A set was logged on the replacement');
    this.name = 'SwapUndoStaleError';
  }
}

/** What Undo needs: the slot's record before, the override before, and the replacement's sets then. */
export type SwapReceipt = {
  from: string;
  to: string;
  before: SessionSwap | undefined;
  toSets: number;
  always?: { planId: string; slot: string; before: string | undefined };
};

const setsOfExercise = (sessionId: string, exerciseId: string, db: AnyGymDB) =>
  db.sets
    .where('[sessionId+order]')
    .between([sessionId, -Infinity], [sessionId, Infinity])
    .filter((x) => x.exerciseId === exerciseId)
    .count();

async function writeAlways(slot: string, planId: string, to: string | undefined, db: AnyGymDB): Promise<string | undefined> {
  const row = await db.exerciseSettings.get([slot, ANY_GYM]);
  const before = row?.alwaysUse?.[planId];
  const alwaysUse = { ...row?.alwaysUse };
  if (to === undefined) delete alwaysUse[planId];
  else alwaysUse[planId] = to;
  const next = { ...row, exerciseId: slot, gymId: ANY_GYM };
  if (Object.keys(alwaysUse).length) next.alwaysUse = alwaysUse;
  else delete next.alwaysUse;
  await db.exerciseSettings.put(next);
  return before;
}

/**
 * PLAN 3.8 (a plateau's "Try a variation"): `to` becomes the plan's pick for this slot from now on, like
 * "Always use this" (`undefined` clears it). Returns the pick it replaced, for Undo.
 */
export async function setAlwaysUse(slot: string, planId: string, to: string | undefined, db: AnyGymDB = defaultDb): Promise<string | undefined> {
  return db.transaction('rw', db.exerciseSettings, () => writeAlways(slot, planId, to, db));
}

/** This workout does `to` in `from`'s place; `always` also makes it the plan's pick from now on. */
export async function swapExercise(sessionId: string, from: string, to: string, opts: { always?: boolean } = {}, db: AnyGymDB = defaultDb): Promise<SwapReceipt> {
  return db.transaction('rw', [db.sessions, db.sets, db.journal, db.submissions, db.tombstones, db.exerciseSettings], async () => {
    const s = await db.sessions.get(sessionId);
    if (!s || s.endedAt !== undefined) throw new WorkoutFinishedError();
    const ids = s.exerciseIds ?? [];
    if (!ids.includes(from)) throw new Error('Not in this workout');
    if (from === to) throw new Error('Same exercise');
    const before = swapOfRow(s.swaps, from);
    if (ids.includes(to) && !before?.kept?.includes(to) && before?.slot !== to) throw new Error('Already in this workout');
    // A Log set or a change of `from` that has not landed stays in front of the lifter.
    for (const j of await db.journal.where('sessionId').equals(sessionId).toArray()) {
      if (j.exerciseId !== from) continue;
      if (j.mutation || !((await db.sets.get(j.id)) || (await db.submissions.get(j.id)))) throw new SwapPendingError();
    }
    // A deleted set with its Undo still open counts: it may come back, and comes back under `from`.
    const deleted = (await db.tombstones.where('sessionId').equals(sessionId).toArray()).some((t) => t.set.exerciseId === from);
    const fromHasSets = deleted || (await setsOfExercise(sessionId, from, db)) > 0;
    const toSets = await setsOfExercise(sessionId, to, db);
    const next = applySwap({ exerciseIds: ids, swaps: s.swaps ?? [] }, from, to, fromHasSets, opts.always ? { always: true } : {});
    const updated = { ...s, exerciseIds: next.exerciseIds };
    if (next.swaps.length) updated.swaps = next.swaps;
    else delete updated.swaps;
    await db.sessions.put(updated);
    const receipt: SwapReceipt = { from, to, before, toSets };
    if (opts.always && s.planId) {
      const slot = slotOf(next.swaps, to);
      receipt.always = { planId: s.planId, slot, before: await writeAlways(slot, s.planId, to, db) };
    }
    return receipt;
  });
}

/** Undo: the slot is what it was. Refused when the workout ended or the replacement has new sets. */
export async function undoSwap(sessionId: string, r: SwapReceipt, db: AnyGymDB = defaultDb): Promise<void> {
  await db.transaction('rw', [db.sessions, db.sets, db.exerciseSettings], async () => {
    const s = await db.sessions.get(sessionId);
    if (!s || s.endedAt !== undefined) throw new WorkoutFinishedError();
    if ((await setsOfExercise(sessionId, r.to, db)) !== r.toSets) throw new SwapUndoStaleError();
    const next = revertSwap({ exerciseIds: s.exerciseIds ?? [], swaps: s.swaps ?? [] }, r.from, r.to, r.before, r.toSets > 0);
    const updated = { ...s, exerciseIds: next.exerciseIds };
    if (next.swaps.length) updated.swaps = next.swaps;
    else delete updated.swaps;
    await db.sessions.put(updated);
    if (r.always) await writeAlways(r.always.slot, r.always.planId, r.always.before, db);
  });
}

/** "Stop always using this": the plan's own exercise from the next workout on. This workout stays. */
export async function stopAlways(slot: string, planId: string, db: AnyGymDB = defaultDb): Promise<void> {
  await db.transaction('rw', db.exerciseSettings, () => writeAlways(slot, planId, undefined, db));
}
