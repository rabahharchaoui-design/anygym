import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { AnyGymDB } from '../schema';
import { discardEmptyWorkout, undoDiscard } from '../discard';
import { pendingMutations, retryMutations, saveMutation } from '../mutations';
import { finishedDetail } from '../history';
import { undoDelete } from '../tombstones';
import { deleteSetToken, finishWorkout, logSet, setsOf, startWorkout, UnsavedWritesError } from '../workouts';
import { barbellLoad, stackLoad, totalLifted } from '../../lib/load';

let db: AnyGymDB;
let seq = 0;
beforeEach(async () => { db = new AnyGymDB(`codex-discard-independent-${seq++}`); await db.open(); });
afterEach(async () => { await db.delete(); });
async function reload() {
  const name = db.name;
  db.close();
  db = new AnyGymDB(name);
  await db.open();
}

// SPEC 0/2/13; completed PLAN 3.5g. The existing Discard tests cover
// ordinary Undo, but not failure after the session write inside either transaction.
it('a failed Discard counter delete rolls back the session, then retry and Undo preserve its prescription after reload', async () => {
  const s = await startWorkout('g', db, 1000);
  // A migrated empty workout can retain a counter without submission receipts.
  await db.orderCounters.put({ sessionId: s.id, next: 4 });
  const session = { ...s, exerciseIds: ['curl'], rowAdjust: { curl: 2 }, suggestedRest: { curl: 120 } };
  await db.sessions.put(session);
  const counter = await db.orderCounters.get(s.id);
  expect(counter).toBeDefined();
  const fail = () => { throw new Error('synthetic discard counter failure'); };
  db.orderCounters.hook('deleting', fail);
  try { await expect(discardEmptyWorkout(s.id, db)).rejects.toThrow('synthetic discard counter failure'); }
  finally { db.orderCounters.hook('deleting').unsubscribe(fail); }
  await reload();
  expect(await db.sessions.get(s.id)).toEqual(session);
  expect(await db.orderCounters.get(s.id)).toEqual(counter);
  const discarded = (await discardEmptyWorkout(s.id, db))!;
  expect(discarded).toEqual({ session, counter });
  await reload();
  expect(await db.sessions.get(s.id)).toBeUndefined();
  expect(await db.orderCounters.get(s.id)).toBeUndefined();
  expect(await undoDiscard(discarded, db)).toBe(true);
  await reload();
  expect(await db.sessions.get(s.id)).toEqual(session);
  expect(await db.orderCounters.get(s.id)).toEqual(counter);
});

it('a failed Undo counter insert leaves Discard committed and retryable, then the restored workout logs and finishes once', async () => {
  const s = await startWorkout('g', db, 1000);
  await db.orderCounters.put({ sessionId: s.id, next: 4 });
  const discarded = (await discardEmptyWorkout(s.id, db))!;
  expect(discarded.counter).toBeDefined();
  const fail = () => { throw new Error('synthetic undo counter failure'); };
  db.orderCounters.hook('creating', fail);
  try { await expect(undoDiscard(discarded, db)).rejects.toThrow('synthetic undo counter failure'); }
  finally { db.orderCounters.hook('creating').unsubscribe(fail); }
  await reload();
  expect(await db.sessions.get(s.id)).toBeUndefined();
  expect(await db.orderCounters.get(s.id)).toBeUndefined();
  expect(await undoDiscard(discarded, db)).toBe(true);
  const input = { id: 'lift', sessionId: s.id, exerciseId: 'curl', reps: 9, load: stackLoad(25, 'kg', 1.25) };
  const set = await logSet(input, db);
  expect(set.order).toBe(discarded.counter!.next);
  expect(await logSet(input, db)).toEqual(set);
  await finishWorkout(s.id, db, 2000);
  await reload();
  expect((await finishedDetail(s.id, db))!.sets).toEqual([set]);
  expect(totalLifted([set], 'kg')).toBe(236.25);
});

// SPEC 5/6/13; completed PLAN 1.7c/2.0c/2.0e. Edit and type have
// separate recovery identities: successfully saving one must not consume the other.
it('a successful type change leaves a failed weight edit pending; retry preserves both through Delete Undo and Finish', async () => {
  const s = await startWorkout('g', db, 1000);
  const oldLoad = barbellLoad(15, [20], 'competition', 'kg', 'womens')!;
  const newLoad = barbellLoad(15, [20, 1.25], 'competition', 'kg', 'womens')!;
  const original = await logSet({ id: 'lift', sessionId: s.id, exerciseId: 'squat', reps: 8, kind: 'warmup', load: oldLoad }, db);
  const change = { reps: 11, load: newLoad };
  const edit = { kind: 'edit' as const, setId: original.id, change };
  const fail = () => { throw new Error('synthetic edit write failure'); };
  db.sets.hook('updating', fail);
  try { await expect(saveMutation(s.id, 'squat', edit, db, 1200, null)).rejects.toThrow('synthetic edit write failure'); }
  finally { db.sets.hook('updating').unsubscribe(fail); }
  await saveMutation(s.id, 'squat', { kind: 'type', setId: original.id, setKind: 'work', failure: true }, db, 1300, null);
  await reload();
  expect(await setsOf(s.id, db)).toEqual([{ ...original, kind: 'work', failure: true }]);
  expect((await pendingMutations(s.id, db, null)).map((j) => j.mutation)).toEqual([edit]);
  await expect(finishWorkout(s.id, db, 1400, undefined, undefined, null)).rejects.toBeInstanceOf(UnsavedWritesError);
  expect(await retryMutations(s.id, db, null)).toBe(true);
  expect(await retryMutations(s.id, db, null)).toBe(true);
  const expected = { ...original, ...change, kind: 'work' as const, failure: true };
  expect(await setsOf(s.id, db)).toEqual([expected]);
  const deletion = (await deleteSetToken(original.id, db, 1500))!;
  await undoDelete(original.id, db, deletion.token);
  await finishWorkout(s.id, db, 2000);
  await reload();
  expect((await finishedDetail(s.id, db))!.sets).toEqual([expected]);
  expect(totalLifted([expected], 'kg')).toBe(687.5);
  expect(await db.journal.count()).toBe(0);
  expect(await db.tombstones.count()).toBe(0);
});
