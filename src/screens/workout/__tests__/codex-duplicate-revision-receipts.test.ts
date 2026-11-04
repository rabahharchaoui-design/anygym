import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnyGymDB } from '../../../db/schema';
import { deleteSet, finishWorkout, logSet, restoreSet, setsOf, startWorkout } from '../../../db/workouts';
import { saveDraft, type Draft } from '../../../lib/drafts';
import { createLogQueue } from '../../../lib/logQueue';
import { rowKey } from '../../../lib/setTable';
import { committedOf, reconcileSession, rowsOf, submitRow } from '../rowLog';

let db: AnyGymDB;
let sequence = 0;
beforeEach(async () => {
  db = new AnyGymDB(`anygym-codex-duplicate-receipts-${sequence++}`);
  await db.open();
});
afterEach(async () => { await db.delete(); });

function phone() {
  const disk = new Map<string, string>();
  return () => ({ getItem: (k: string) => disk.get(k) ?? null,
    setItem: (k: string, v: string) => { disk.set(k, v); }, removeItem: (k: string) => { disk.delete(k); } });
}

const load = { kind: 'single' as const, unit: 'lb' as const, total: 53 };

// Built PLAN 1.7h/1.7i: duplicate IDs are legitimate after two tabs submit before
// receiving each other's update. Only the revision actually committed can consume a draft.
describe('duplicate Log uses the durable submission receipt', () => {
  // CODEX FOUND BUG: Duplicate Log reconciles against its requested revision and discards newer reps absent from the committed set.
  it('keeps a newer revision under a successor ID when an older revision of that ID already committed', async () => {
    const session = await startWorkout('synthetic-gym', db, 1000);
    const storage = phone();
    const deps = { db, storage: storage(), queue: createLogQueue(), makeId: () => 'successor' };
    const newer: Draft = { id: 'shared', load, reps: 19, rev: 2, submitted: 2 };
    saveDraft(session.id, rowKey('goblet', 0), newer, deps.storage);
    const saved = await logSet({ id: 'shared', sessionId: session.id, exerciseId: 'goblet', reps: 17, rev: 1, load }, db);
    expect(await submitRow(session.id, 'goblet', newer, deps)).toBe(true);
    expect(await setsOf(session.id, db)).toEqual([saved]);
    expect((await committedOf(session.id, db)).get('shared')).toBe(1);
    expect.soft(rowsOf(session.id, 'goblet', deps)).toMatchObject([{ id: 'shared~1', reps: 19, rev: 2 }]);
    const name = db.name;
    db.close();
    db = new AnyGymDB(name);
    await db.open();
    const restarted = { ...deps, db, storage: storage(), queue: createLogQueue() };
    await reconcileSession(session.id, restarted);
    expect(rowsOf(session.id, 'goblet', restarted)).toMatchObject([{ reps: 19, rev: 2 }]);
    expect(await setsOf(session.id, db)).toEqual([saved]);
  });

  // CODEX FOUND BUG: A duplicate Log of a deleted set clears newer pending reps using a revision that never committed.
  it('keeps newer input when the committed ID was deleted, then Undo and Finish preserve the original set', async () => {
    const session = await startWorkout('synthetic-gym', db, 1000);
    const storage = phone();
    const deps = { db, storage: storage(), queue: createLogQueue() };
    const saved = await logSet({ id: 'deleted-shared', sessionId: session.id, exerciseId: 'goblet', reps: 17, rev: 1, load }, db);
    const undo = await deleteSet(saved.id, db);
    const newer: Draft = { id: saved.id, load, reps: 19, rev: 2, submitted: 2 };
    saveDraft(session.id, rowKey('goblet', 0), newer, deps.storage);
    expect(await submitRow(session.id, 'goblet', newer, deps)).toBe(true);
    expect(await setsOf(session.id, db)).toEqual([]); // A stale submission must not resurrect the deleted set.
    expect.soft(rowsOf(session.id, 'goblet', deps)).toMatchObject([{ reps: 19, rev: 2 }]);
    await restoreSet(undo!, db);
    expect(await finishWorkout(session.id, db, 2000)).toMatchObject({ saved: true, sets: 1 });
    const name = db.name;
    db.close();
    db = new AnyGymDB(name);
    await db.open();
    expect(await setsOf(session.id, db)).toEqual([saved]);
    expect((await db.sessions.get(session.id))?.endedAt).toBe(2000);
  });
});
