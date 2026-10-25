import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnyGymDB } from '../schema';
import { finishedDetail } from '../history';
import { acceptUndo } from '../tombstones';
import { deleteSet, finishWorkout, getActiveSession, logSet, setsOf, startWorkout, updateSet } from '../workouts';
import { barbellLoad } from '../../lib/load';

let db: AnyGymDB;
let n = 0;
beforeEach(async () => {
  db = new AnyGymDB(`anygym-codex-submission-atomicity-${n++}`);
  await db.open();
});
afterEach(async () => { await db.delete(); });
async function reopen() {
  const name = db.name;
  db.close();
  db = new AnyGymDB(name);
  await db.open();
}
const load = barbellLoad(35, [25, 2.5], 'none', 'lb', 'womens')!;

describe('PLAN 1.7h submission and Undo transactions survive reopen', () => {
  it('rolls back the set, order and exercise insertion if its submission marker cannot be stored', async () => {
    const s = await startWorkout('g', db, 1000);
    const first = await logSet({ id: 'first', sessionId: s.id, exerciseId: 'bench', reps: 8, load }, db);
    const session = await db.sessions.get(s.id);
    const counter = await db.orderCounters.get(s.id);
    const submissions = await db.submissions.toArray();
    const input = { id: 'retry', sessionId: s.id, exerciseId: 'squat', reps: 12, load, rev: 7 };
    const fail = () => { throw new Error('synthetic submission marker failure'); };
    db.submissions.hook('creating', fail);
    try {
      await expect(logSet(input, db)).rejects.toThrow('synthetic submission marker failure');
    } finally {
      db.submissions.hook('creating').unsubscribe(fail);
    }
    await reopen();
    expect(await setsOf(s.id, db)).toEqual([first]);
    expect(await db.sessions.get(s.id)).toEqual(session);
    expect(await db.orderCounters.get(s.id)).toEqual(counter);
    expect(await db.submissions.toArray()).toEqual(submissions);
    const saved = await logSet(input, db);
    expect(saved.order).toBe(1);
    expect(await logSet(input, db)).toEqual(saved);
    await reopen();
    expect(await setsOf(s.id, db)).toEqual([first, saved]);
    expect(await db.submissions.get(input.id)).toEqual({ id: input.id, sessionId: s.id, exerciseId: 'squat', rev: 7 });
  });

  it('a failed Finish cleanup rolls back accepted Undo restoration and preserves its edited set for retry', async () => {
    const s = await startWorkout('g', db, 1000);
    await logSet({ id: 'undo', sessionId: s.id, exerciseId: 'bench', reps: 8, load, rev: 2 }, db);
    const edited = await updateSet('undo', { reps: 12, load }, db);
    const keep = await logSet({ id: 'keep', sessionId: s.id, exerciseId: 'bench', reps: 9, load }, db);
    await deleteSet('undo', db, 1500);
    expect(await acceptUndo('undo', db)).toBe(true);
    const tombstone = await db.tombstones.get('undo');
    const submissions = await db.submissions.toArray();
    const fail = () => { throw new Error('synthetic Finish submission cleanup failure'); };
    db.submissions.hook('deleting', fail);
    try {
      await expect(finishWorkout(s.id, db, 2000)).rejects.toThrow('synthetic Finish submission cleanup failure');
    } finally {
      db.submissions.hook('deleting').unsubscribe(fail);
    }
    await reopen();
    expect(await getActiveSession(db)).toMatchObject({ id: s.id });
    expect(await setsOf(s.id, db)).toEqual([keep]);
    expect(await db.tombstones.get('undo')).toEqual(tombstone);
    expect(await db.submissions.toArray()).toEqual(submissions);
    expect(await finishWorkout(s.id, db, 3000)).toEqual({ saved: true, sets: 2 });
    await reopen();
    expect((await finishedDetail(s.id, db))?.sets).toEqual([edited, keep]);
    expect(await db.tombstones.count()).toBe(0);
    expect(await db.submissions.count()).toBe(0);
    expect(await getActiveSession(db)).toBeUndefined();
  });
});
