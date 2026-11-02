// PLAN 2.0j (2) Review reads, (3) Undo into a removed exercise, (4) legacy Keep deleted, Finish lock, receipts
// instead of clocks, kv fallback. Photo eligibility: src/data/__tests__/catalog-demo-2.0j.test.ts; drafts:
// src/lib/__tests__/drafts-2.0j.test.ts; picker: src/components/muscles/__tests__/MuscleMap.test.tsx.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnyGymDB } from '../schema';
import { readReview, saveReviewDecision } from '../review';
import { REVIEW_KEY } from '../../lib/review';
import { makeGym } from '../gyms';
import { finishWorkout, logSet, restoreSet, startWorkout, updateSet, deleteSetToken, removeExercise, UnsavedWritesError, WorkoutFinishedError } from '../workouts';
import { acceptUndo, cancelUndo, expireDelete, recoverDeletes } from '../tombstones';
import { pendingMutations, retryMutations, saveMutation } from '../mutations';
import type { Load, MutationIntent } from '../types';

const kb: Load = { kind: 'single', unit: 'lb', total: 53 };
const edit = (reps: number): MutationIntent => ({ kind: 'edit', setId: 'a', change: { reps, load: kb } });
const store = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), raw: m };
};
const refusing = () => ({
  getItem: () => null,
  setItem: () => {
    throw new Error('quota');
  },
  removeItem: () => {
    throw new Error('quota');
  },
});
const failJournal = (d: AnyGymDB, gate?: Promise<void>) => {
  const put = d.journal.put.bind(d.journal);
  (d.journal as unknown as { put: unknown }).put = () => (gate ?? Promise.resolve()).then(() => Promise.reject(new Error('journal')));
  return () => void ((d.journal as unknown as { put: unknown }).put = put);
};
const repsOf = (list: { mutation?: MutationIntent }[]) => list.map((e) => (e.mutation as { change: { reps: number } }).change.reps);

let n = 0;
let name = '';
const opened: AnyGymDB[] = [];
const tab = async (suffix = '') => {
  const d = new AnyGymDB(name + suffix);
  await d.open();
  opened.push(d);
  return d;
};
let db: AnyGymDB;
beforeEach(async () => {
  name = `anygym-2.0j-${n++}`;
  db = await tab();
});
afterEach(async () => {
  for (const d of opened.splice(0)) d.close();
  await new AnyGymDB(name).delete();
});
async function oneSet() {
  if (!(await db.gyms.count())) await db.gyms.add({ ...makeGym({ name: 'G', type: 'full', unit: 'lb', isActive: true }, 1), id: 'g' });
  const s = await startWorkout('g', db, 1000);
  await logSet({ id: 'a', sessionId: s.id, exerciseId: 'goblet', reps: 10, load: kb }, db);
  return s;
}

describe('group 2: Review decisions survive a failed read', () => {
  it('a rejected read throws, keeps the stored bytes, and a save is merged not replaced', async () => {
    const db = await tab();
    await saveReviewDecision(db, 'A', 'approved', '', 1);
    const before = (await db.kv.get(REVIEW_KEY))!.value;
    const get = db.kv.get.bind(db.kv);
    (db.kv as unknown as { get: unknown }).get = () => Promise.reject(new Error('read'));
    await expect(readReview(db)).rejects.toThrow('read');
    await expect(saveReviewDecision(db, 'B', 'approved', '', 2)).rejects.toThrow();
    (db.kv as unknown as { get: unknown }).get = get;
    expect((await db.kv.get(REVIEW_KEY))!.value).toBe(before);
    await saveReviewDecision(db, 'B', 'wrong-demo', '', 3);
    expect(Object.keys((await readReview(db)).decisions)).toEqual(['A', 'B']);
  });

  it('two connections saving different verdicts keep both', async () => {
    const a = await tab();
    const b = await tab();
    await Promise.all([saveReviewDecision(a, 'A', 'approved', '', 1), saveReviewDecision(b, 'B', 'wrong-muscles', '', 2)]);
    expect(Object.keys((await readReview(a)).decisions).sort()).toEqual(['A', 'B']);
  });

  it('a stored value that is not JSON is a read error, never an empty review', async () => {
    const db = await tab();
    await db.kv.put({ key: REVIEW_KEY, value: '{broken', at: 1 });
    await expect(readReview(db)).rejects.toThrow();
    await expect(saveReviewDecision(db, 'A', 'approved', '', 2)).rejects.toThrow();
    expect((await db.kv.get(REVIEW_KEY))!.value).toBe('{broken');
  });
});

describe('group 3: Undo recovery never restores a set into an exercise missing from the workout', () => {
  it('restoreSet repairs the membership in the same transaction', async () => {
    const s = await oneSet();
    const d = (await deleteSetToken('a', db))!;
    await acceptUndo('a', db, d.token, true);
    await removeExercise(s.id, 'goblet', db); // no saved set left, so it is allowed
    expect((await db.sessions.get(s.id))!.exerciseIds).toEqual([]);
    expect(await restoreSet(d.set, db, { ifTombstone: true, token: d.token })).toBe(true);
    expect((await db.sessions.get(s.id))!.exerciseIds).toEqual(['goblet']);
  });

  it('recoverDeletes does the same, and keeps the other exercises and their order', async () => {
    const s = await oneSet();
    await logSet({ id: 'z', sessionId: s.id, exerciseId: 'squat', reps: 5, load: kb }, db);
    const d = (await deleteSetToken('a', db))!;
    await acceptUndo('a', db, d.token, true);
    await removeExercise(s.id, 'goblet', db);
    await recoverDeletes(s.id, db);
    expect((await db.sessions.get(s.id))!.exerciseIds).toEqual(['squat', 'goblet']);
  });

  it('Finish puts an accepted Undo back with its exercise, and the ended session keeps it', async () => {
    const s = await oneSet();
    await logSet({ id: 'z', sessionId: s.id, exerciseId: 'squat', reps: 5, load: kb }, db);
    const d = (await deleteSetToken('a', db))!;
    await acceptUndo('a', db, d.token, true);
    await removeExercise(s.id, 'goblet', db);
    await finishWorkout(s.id, db, 5000);
    const done = (await db.sessions.get(s.id))!;
    expect(done.endedAt).toBe(5000);
    expect(done.exerciseIds).toEqual(['squat', 'goblet']);
    expect(await db.sets.get('a')).toBeDefined();
  });
});

describe('group 4a: legacy "Keep deleted" never destroys a newer deletion', () => {
  const legacy = async (sid: string) => {
    const d = (await deleteSetToken('a', db))!;
    await db.tombstones.put({ id: 'a', sessionId: sid, set: d.set, expiresAt: 1 }); // from an older app: no token
    return d;
  };
  it('cancelUndo from the tokenless deletion leaves the newer tombstone and its values', async () => {
    const s = await oneSet();
    const first = await legacy(s.id);
    // another tab: Undo, correct, delete again
    await restoreSet(first.set, db, { ifTombstone: true });
    await updateSet('a', { reps: 17, load: kb }, db);
    const second = (await deleteSetToken('a', db))!;
    await cancelUndo('a', db, s.id, undefined, true); // tab A: its manager holds the legacy deletion (no token)
    const t = await db.tombstones.get('a');
    expect(t?.token).toBe(second.token);
    expect(t?.set.reps).toBe(17);
  });
  it('expireDelete from the tokenless deletion leaves the newer tombstone', async () => {
    const s = await oneSet();
    const first = await legacy(s.id);
    await restoreSet(first.set, db, { ifTombstone: true });
    const second = (await deleteSetToken('a', db))!;
    await expireDelete('a', db, Date.now() + 10 ** 9, undefined, true);
    expect((await db.tombstones.get('a'))?.token).toBe(second.token);
  });
  it('a matching legacy cancel still removes the legacy tombstone', async () => {
    const s = await oneSet();
    await legacy(s.id);
    await cancelUndo('a', db, s.id, undefined, true);
    expect(await db.tombstones.get('a')).toBeUndefined();
    expect(await db.sets.get('a')).toBeUndefined();
  });
});

describe('group 4b: Finish and a failed correction in another tab share one lock', () => {
  it('a correction being registered when Finish starts is seen by Finish (or rejected after it), never lost', async () => {
    const s = await oneSet();
    const ls = store();
    const tabB = await tab();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    failJournal(tabB, gate);
    const pB = saveMutation(s.id, 'goblet', edit(19), tabB, 2000, ls).then(
      () => 'saved',
      (e: unknown) => e,
    );
    await new Promise((r) => setTimeout(r, 20));
    const pA = finishWorkout(s.id, db, 5000, undefined, undefined, ls).then(
      (r) => r,
      (e: unknown) => e,
    );
    await new Promise((r) => setTimeout(r, 20));
    release();
    const [b, a] = await Promise.all([pB, pA]);
    const pending = repsOf(await pendingMutations(s.id, db, ls));
    if ((a as { saved?: boolean }).saved) {
      expect(b).toBeInstanceOf(WorkoutFinishedError);
      expect(pending).toEqual([]);
    } else {
      expect(a).toBeInstanceOf(UnsavedWritesError);
      expect(pending).toEqual([19]);
      expect((await db.sessions.get(s.id))?.endedAt).toBeUndefined();
    }
  });
});

describe('group 4c: equal or reversed timestamps never let Retry overwrite a newer save', () => {
  it.each([
    ['equal', 2000, 2000],
    ['reversed', 2500, 2000],
  ])('older failed 17 (%s clock), newer saved 19, cleanup failed: Retry keeps 19', async (_n, at17, at19) => {
    const s = await oneSet();
    const ls = store();
    const tabB = await tab();
    const fix = failJournal(tabB);
    await expect(saveMutation(s.id, 'goblet', edit(17), tabB, at17, ls)).rejects.toThrow('journal');
    fix();
    const stuck = { ...ls, setItem: () => { throw new Error('quota'); }, removeItem: () => { throw new Error('quota'); } };
    await saveMutation(s.id, 'goblet', edit(19), db, at19, stuck); // lands; the held 17 cannot be removed
    expect((await db.sets.get('a'))!.reps).toBe(19);
    expect(await pendingMutations(s.id, db, ls)).toEqual([]);
    expect(await retryMutations(s.id, db, ls)).toBe(true);
    expect((await db.sets.get('a'))!.reps).toBe(19);
  });

  it('a later failed 19 stays pending after a saved 17, also when its clock is behind', async () => {
    const s = await oneSet();
    const ls = store();
    const tabB = await tab();
    await saveMutation(s.id, 'goblet', edit(17), db, 3000, ls);
    const fix = failJournal(tabB);
    await expect(saveMutation(s.id, 'goblet', edit(19), tabB, 2000, ls)).rejects.toThrow('journal');
    fix();
    expect(repsOf(await pendingMutations(s.id, db, ls))).toEqual([19]);
    expect(await retryMutations(s.id, db, ls)).toBe(true);
    expect((await db.sets.get('a'))!.reps).toBe(19);
  });
});

describe('group 4d: a failed edit survives termination when localStorage refuses it too', () => {
  it('journal and localStorage fail: IndexedDB kv holds it; a fresh runtime finds it, Finish refuses, Retry saves once', async () => {
    const s = await oneSet();
    const fix = failJournal(db);
    await expect(saveMutation(s.id, 'goblet', edit(19), db, 2000, refusing())).rejects.toThrow('journal');
    fix();
    const fresh = await tab(); // a restart: new database object, empty memory, nothing in localStorage
    expect(repsOf(await pendingMutations(s.id, fresh, store()))).toEqual([19]);
    await expect(finishWorkout(s.id, fresh, 5000, undefined, undefined, store())).rejects.toBeInstanceOf(UnsavedWritesError);
    expect(await retryMutations(s.id, fresh, store())).toBe(true);
    expect((await fresh.sets.get('a'))!.reps).toBe(19);
    expect(await pendingMutations(s.id, await tab(), store())).toEqual([]);
  });
});
