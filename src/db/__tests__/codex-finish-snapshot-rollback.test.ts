import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnyGymDB } from '../schema';
import { choosePlan, getPlanState } from '../planState';
import { acceptUndo } from '../tombstones';
import { finishedDetail } from '../history';
import { deleteSetToken, FINISH_PENDING_PREFIX, FINISH_PLAN_PREFIX, finishWorkout, getActiveSession, logSet, reopenWorkoutWithPending, setsOf, startPlanDay, startWorkout, UnsavedWritesError } from '../workouts';
import { barbellLoad } from '../../lib/load';
import { createLogQueue } from '../../lib/logQueue';
import { writeDrafts, type Draft } from '../../lib/drafts';
import { slotChanges } from '../../lib/setTable';
import { discardFailed, failedRows, retryFailed, shownRows, type Deps } from '../../screens/workout/rowLog';

// Completed PLAN 1.7h, 2.0c and 3.2c: failures AFTER cleanup must not consume recovery evidence.
let db: AnyGymDB;
let n = 0;
beforeEach(async () => {
  db = new AnyGymDB(`anygym-codex-finish-snapshot-${n++}`);
  await db.open();
});
afterEach(async () => { await db.delete(); });
async function reload() {
  const name = db.name;
  db.close();
  db = new AnyGymDB(name);
  await db.open();
}
const load = barbellLoad(15, [20, 1.25], 'competition', 'kg', 'womens')!; // 15 + 42.5 + 5 = 62.5 kg.
const pending = (id: string) => ({
  drafts: JSON.stringify({ [id]: { 'bench@0': { id: 'next', load, plates: [20, 1.25], reps: 11, rev: 3 } } }),
  extra: JSON.stringify({ sessionId: id, extra: { bench: 2 } }),
  rest: JSON.stringify({ sessionId: id, endsAt: 91234, totalSec: 90 }),
});

describe('Finish and its Undo retain snapshots across transaction failures', () => {
  it('a failed plan write rolls back Finish, its accepted set Undo, and both recovery snapshots', async () => {
    await choosePlan('five-day-split', db, 500);
    const before = await getPlanState(db);
    const s = await startPlanDay('g', 'five-day-split', 0, db, 1000);
    const set = await logSet({ id: 'lift', sessionId: s.id, exerciseId: 'barbell-back-squat', reps: 12, load }, db);
    const deletion = (await deleteSetToken(set.id, db, 1500))!;
    await acceptUndo(set.id, db, deletion.token);
    const tomb = await db.tombstones.get(set.id);
    const fail = () => { throw new Error('synthetic plan write failure'); };
    db.planState.hook('updating', fail);
    try {
      await expect(finishWorkout(s.id, db, 2000, pending(s.id), undefined, null)).rejects.toThrow('synthetic plan write failure');
    } finally { db.planState.hook('updating').unsubscribe(fail); }
    await reload();
    expect(await getActiveSession(db)).toEqual(s);
    expect(await setsOf(s.id, db)).toEqual([]);
    expect(await db.tombstones.get(set.id)).toEqual(tomb);
    expect(await getPlanState(db)).toEqual(before);
    expect(await db.kv.get(FINISH_PLAN_PREFIX + s.id)).toBeUndefined();
    expect(await db.kv.get(FINISH_PENDING_PREFIX + s.id)).toBeUndefined();
    await expect(finishWorkout(s.id, db, 3000, pending(s.id), undefined, null)).resolves.toMatchObject({ saved: true, sets: 1 });
    await reload();
    expect((await finishedDetail(s.id, db))!.sets).toEqual([set]);
    expect(await db.tombstones.count()).toBe(0);
    expect(await reopenWorkoutWithPending(s.id, undefined, db)).toEqual({ ok: true, pending: pending(s.id) });
    expect(await getPlanState(db)).toEqual(before);
  });

  it('a failed draft mirror write during Undo Finish leaves the workout finished and every snapshot available for retry', async () => {
    await choosePlan('five-day-split', db, 500);
    const before = await getPlanState(db);
    const s = await startPlanDay('g', 'five-day-split', 0, db, 1000);
    const set = await logSet({ id: 'lift', sessionId: s.id, exerciseId: 'barbell-back-squat', reps: 9, load }, db);
    await finishWorkout(s.id, db, 2000, pending(s.id), undefined, null);
    const finished = await finishedDetail(s.id, db);
    const advanced = await getPlanState(db);
    const snapshots = await db.kv.toArray();
    const fail = (_key: unknown, row: { key: string }) => {
      if (row.key === 'anygym-drafts') throw new Error('synthetic draft mirror failure');
    };
    db.kv.hook('creating', fail);
    try {
      await expect(reopenWorkoutWithPending(s.id, undefined, db)).rejects.toThrow('synthetic draft mirror failure');
    } finally { db.kv.hook('creating').unsubscribe(fail); }
    await reload();
    expect(await getActiveSession(db)).toBeUndefined();
    expect(await finishedDetail(s.id, db)).toEqual(finished);
    expect(await getPlanState(db)).toEqual(advanced);
    expect(await db.kv.toArray()).toEqual(snapshots);
    expect(await reopenWorkoutWithPending(s.id, undefined, db)).toEqual({ ok: true, pending: pending(s.id) });
    await reload();
    expect(await getPlanState(db)).toEqual(before);
    expect(await setsOf(s.id, db)).toEqual([set]);
    for (const [key, value] of [['anygym-drafts', pending(s.id).drafts], ['anygym-extra-sets', pending(s.id).extra], ['anygym-rest', pending(s.id).rest]]) {
      expect((await db.kv.get(key!))!.value).toBe(value);
    }
  });

  it('a failed Log cancellation receipt rolls back journal deletion and leaves the literal input retryable after reopen', async () => {
    const s = await startWorkout('g', db, 1000);
    const values = new Map<string, string>();
    const storage = { getItem: (k: string) => values.get(k) ?? null,
      setItem: (k: string, v: string) => void values.set(k, v), removeItem: (k: string) => void values.delete(k) };
    const draft: Draft = { id: 'failed', load, plates: [20, 1.25], reps: 19, rev: 2, submitted: 2, op: 'log-attempt' };
    writeDrafts(s.id, slotChanges('bench', [], [draft]), storage);
    const journal = { id: draft.id, sessionId: s.id, exerciseId: 'bench', key: 'bench@0', rev: 2, draft: { ...draft }, at: 1500 };
    await db.journal.put(journal);
    const deps: Deps = { db, storage, queue: createLogQueue(), makeId: () => 'replacement' };
    const shown = shownRows(await failedRows(s.id, deps));
    const fail = (_key: unknown, row: { key: string }) => {
      if (row.key.startsWith('anygym-logcancel:')) throw new Error('synthetic cancellation receipt failure');
    };
    db.kv.hook('creating', fail);
    try {
      await expect(discardFailed(s.id, deps, shown)).rejects.toThrow('synthetic cancellation receipt failure');
    } finally { db.kv.hook('creating').unsubscribe(fail); }
    await reload();
    const restarted: Deps = { ...deps, db, queue: createLogQueue() };
    expect(await db.journal.get(draft.id)).toEqual(journal);
    expect((await failedRows(s.id, restarted)).map((f) => f.draft)).toEqual([draft]);
    await expect(finishWorkout(s.id, db, 2000, undefined, undefined, storage)).rejects.toBeInstanceOf(UnsavedWritesError);
    expect(await retryFailed(s.id, restarted)).toBe(true);
    expect(await retryFailed(s.id, restarted)).toBe(true);
    await finishWorkout(s.id, db, 3000, undefined, undefined, storage);
    await reload();
    expect((await finishedDetail(s.id, db))!.sets).toMatchObject([{ id: 'failed', order: 0, reps: 19, load }]);
    expect(await db.sets.count()).toBe(1);
    expect(await db.journal.count()).toBe(0);
  });
});
