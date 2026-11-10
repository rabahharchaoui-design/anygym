import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnyGymDB } from '../schema';
import { finishedDetail } from '../history';
import { recoverDeletes, undoDelete } from '../tombstones';
import { deleteSetToken, finishWorkout, logSet, setsOf, startWorkout, updateSet } from '../workouts';
import { barbellLoad, plateMachineLoad, stackLoad, totalLifted } from '../../lib/load';
import type { Load } from '../types';

let db: AnyGymDB;
let seq = 0;
beforeEach(async () => { db = new AnyGymDB(`codex-corrected-load-rollback-${seq++}`); await db.open(); });
afterEach(async () => { await db.delete(); });
async function reload() {
  const name = db.name;
  db.close();
  db = new AnyGymDB(name);
  await db.open();
}
const loads: Load[] = [
  barbellLoad(35, [25, 2.5], 'competition', 'lb', 'womens')!,
  barbellLoad(7.5, [20, 1.25], 'none', 'kg', 'ez_curl')!,
  barbellLoad(0, [45], 'none', 'lb', 'smith')!,
  plateMachineLoad(35, [20, 1.25], 'kg')!,
  stackLoad(100, 'lb', 2.5),
];

// SPEC 0/5.5, completed PLAN 1.7h/2.0c: failed writes must preserve
// the full corrected load, not just its displayed total or original receipt.
describe('corrected load snapshots at failed write boundaries', () => {
  it('a rejected correction preserves every original load after reload, then Retry and Finish keep exactly the correction', async () => {
    const session = await startWorkout('home', db, 1000);
    const expected = [];
    for (const [i, load] of loads.entries()) {
      const id = `set-${i}`;
      const original = await logSet({ id, sessionId: session.id, exerciseId: `lift-${i}`, reps: 8, load }, db);
      const correction = stackLoad(50, 'kg', 1.25);
      const fail = () => { throw new Error('synthetic correction failure'); };
      db.sets.hook('updating', fail);
      try { await expect(updateSet(id, { reps: 11, load: correction }, db)).rejects.toThrow('synthetic correction failure'); }
      finally { db.sets.hook('updating').unsubscribe(fail); }
      await reload();
      expect(await db.sets.get(id)).toEqual(original);
      expected.push(await updateSet(id, { reps: 11, load: correction }, db));
    }
    await finishWorkout(session.id, db, 2000);
    await reload();
    expect((await finishedDetail(session.id, db))!.sets).toEqual(expected);
    expect(totalLifted(expected, 'kg')).toBe(5 * 51.25 * 11);
  });

  it('late Delete failure rolls back removal, and failed accepted Undo recovers corrected snapshots exactly once after reload', async () => {
    const session = await startWorkout('home', db, 1000);
    const expected = [];
    for (const [i, load] of loads.entries()) {
      const id = `set-${i}`;
      await logSet({ id, sessionId: session.id, exerciseId: `lift-${i}`, reps: 8, load: stackLoad(5, 'lb') }, db);
      const corrected = await updateSet(id, { reps: 9, load }, db);
      expected.push(corrected);
      const failDelete = () => { throw new Error('synthetic tombstone failure'); };
      db.tombstones.hook('creating', failDelete);
      try { await expect(deleteSetToken(id, db, 1100)).rejects.toThrow('synthetic tombstone failure'); }
      finally { db.tombstones.hook('creating').unsubscribe(failDelete); }
      await reload();
      expect(await db.sets.get(id)).toEqual(corrected);
      expect(await db.tombstones.get(id)).toBeUndefined();
      const deleted = (await deleteSetToken(id, db, 1200))!;
      const failRestore = () => { throw new Error('synthetic restore failure'); };
      db.sets.hook('creating', failRestore);
      try { await expect(undoDelete(id, db, deleted.token)).rejects.toThrow('synthetic restore failure'); }
      finally { db.sets.hook('creating').unsubscribe(failRestore); }
      await reload();
      expect(await db.sets.get(id)).toBeUndefined();
      expect(await db.tombstones.get(id)).toMatchObject({ undo: true, set: corrected });
      expect((await recoverDeletes(session.id, db)).restored).toEqual([id]);
      expect((await recoverDeletes(session.id, db)).restored).toEqual([]);
      expect(await db.sets.get(id)).toEqual(corrected);
    }
    expect(await setsOf(session.id, db)).toEqual(expected);
    await finishWorkout(session.id, db, 2000);
    await reload();
    expect((await finishedDetail(session.id, db))!.sets).toEqual(expected);
    expect(await db.tombstones.count()).toBe(0);
  });
});
