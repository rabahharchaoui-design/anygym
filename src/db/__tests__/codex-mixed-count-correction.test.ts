import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { AnyGymDB } from '../schema';
import { saveLoadType } from '../exerciseSettings';
import { pendingMutations, retryMutations, saveMutation } from '../mutations';
import { finishedDetail } from '../history';
import { acceptUndo } from '../tombstones';
import { deleteSetToken, finishWorkout, logSet, reopenWorkout, setsOf, startWorkout, UnsavedWritesError } from '../workouts';
import { dumbbellLoad, timedLoad, totalLifted } from '../../lib/load';

let db: AnyGymDB;
let seq = 0;
beforeEach(async () => { db = new AnyGymDB(`codex-mixed-count-correction-${seq++}`); await db.open(); });
afterEach(async () => { await db.delete(); });
async function reload() {
  const name = db.name;
  db.close();
  db = new AnyGymDB(name);
  await db.open();
}

// SPEC 0/5/13/20, completed PLAN 1.7h/2.0c. A later load-type answer
// must not reinterpret an earlier hold or its pending seconds correction.
it('retries a timed correction beside a newer rep set of the same exercise, then Delete Undo and Finish retain both count modes', async () => {
  const s = await startWorkout('g', db, 1000);
  const held = await logSet({ id: 'hold', sessionId: s.id, exerciseId: 'carry', seconds: 37, load: timedLoad('lb') }, db);
  const change = { seconds: 53, load: timedLoad('lb') };
  const fail = () => { throw new Error('synthetic seconds correction failure'); };
  db.sets.hook('updating', fail);
  try {
    await expect(saveMutation(s.id, 'carry', { kind: 'edit', setId: held.id, change }, db, 1200, null))
      .rejects.toThrow('synthetic seconds correction failure');
  } finally { db.sets.hook('updating').unsubscribe(fail); }
  await saveLoadType('carry', 'g', 'dumbbell_each', db);
  const reps = await logSet({ id: 'reps', sessionId: s.id, exerciseId: 'carry', reps: 11, load: dumbbellLoad(22.5, 'lb') }, db);
  await reload();
  expect(await setsOf(s.id, db)).toEqual([held, reps]);
  expect((await pendingMutations(s.id, db, null)).map((e) => e.mutation))
    .toEqual([{ kind: 'edit', setId: held.id, change }]);
  await expect(finishWorkout(s.id, db, 1500, undefined, undefined, null)).rejects.toBeInstanceOf(UnsavedWritesError);
  expect(await retryMutations(s.id, db, null)).toBe(true);
  expect(await retryMutations(s.id, db, null)).toBe(true);
  const corrected = { ...held, seconds: 53 };
  expect(await setsOf(s.id, db)).toEqual([corrected, reps]);
  const deletion = (await deleteSetToken(held.id, db, 1600))!;
  expect(await acceptUndo(held.id, db, deletion.token)).toBe(true);
  await reload();
  expect(await finishWorkout(s.id, db, 2000)).toEqual({ saved: true, sets: 2 });
  await reload();
  expect((await finishedDetail(s.id, db))!.sets).toEqual([corrected, reps]);
  expect(totalLifted([corrected, reps], 'lb')).toBe(495); // both 22.5 lb dumbbells × 11; hold adds zero.
  expect(await reopenWorkout(s.id, undefined, db)).toBe(true);
  await finishWorkout(s.id, db, 3000);
  await reload();
  expect((await finishedDetail(s.id, db))!.sets).toEqual([corrected, reps]);
  expect(await db.journal.count()).toBe(0);
  expect(await db.tombstones.count()).toBe(0);
});
