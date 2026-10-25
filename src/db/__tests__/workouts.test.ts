import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnyGymDB } from '../schema';
import { ANY_GYM, type Load } from '../types';
import { AlreadyLoggedError, WorkoutFinishedError, addExercise, deleteSet, finishWorkout, getActiveSession, logSet, restoreSet, setsOf, startWorkout, updateSet } from '../workouts';
import { isPerGym, loadTypeFor, pickBar, pickLoadType, saveBarChoice, saveLoadType } from '../exerciseSettings';
import { createDeleteUndo } from '../../lib/deleteUndo';
import type { WorkoutSet } from '../types';

let db: AnyGymDB;
let n = 0;
beforeEach(async () => {
  db = new AnyGymDB(`anygym-workouts-${n++}`);
  await db.open();
});
afterEach(async () => {
  await db.delete();
});

const bar185: Load = { kind: 'barbell', unit: 'lb', total: 185, barWeight: 45, perSide: [45, 25] };
const newSet = (id: string, sessionId: string, extra: Partial<{ reps: number; seconds: number; load: Load; exerciseId: string }> = {}) => ({
  id,
  sessionId,
  exerciseId: 'barbell-back-squat',
  reps: 10,
  load: bar185,
  ...extra,
});

describe('startWorkout / getActiveSession', () => {
  it('creates one active session and returns it again instead of a second', async () => {
    expect(await getActiveSession(db)).toBeUndefined();
    const a = await startWorkout('gym-1', db, 1000);
    expect(a).toMatchObject({ gymId: 'gym-1', startedAt: 1000, imported: false, exerciseIds: [] });
    expect(a.planId).toBeUndefined();
    const [b, c] = await Promise.all([startWorkout('gym-1', db), startWorkout('gym-1', db)]);
    expect(b.id).toBe(a.id);
    expect(c.id).toBe(a.id);
    expect(await db.sessions.count()).toBe(1);
    expect((await getActiveSession(db))!.id).toBe(a.id);
  });

  it('ignores ended and imported sessions', async () => {
    await db.sessions.bulkAdd([
      { id: 'old', gymId: 'g', startedAt: 1, endedAt: 2, imported: false },
      { id: 'imp', gymId: 'g', startedAt: 3, imported: true },
    ]);
    expect(await getActiveSession(db)).toBeUndefined();
  });
});

describe('addExercise', () => {
  it('appends once, in order', async () => {
    const s = await startWorkout('g', db);
    await addExercise(s.id, 'a', db);
    await addExercise(s.id, 'b', db);
    const again = await addExercise(s.id, 'a', db);
    expect(again.exerciseIds).toEqual(['a', 'b']);
    await expect(addExercise('missing', 'a', db)).rejects.toThrow();
  });
});

describe('logSet', () => {
  it('writes a work set with the next order and the load as given', async () => {
    const s = await startWorkout('g', db);
    const first = await logSet(newSet('x1', s.id), db);
    const second = await logSet(newSet('x2', s.id, { reps: 8 }), db);
    expect(first).toEqual({ id: 'x1', sessionId: s.id, exerciseId: 'barbell-back-squat', order: 0, kind: 'work', reps: 10, load: bar185, uncertain: false });
    expect(second.order).toBe(1);
    expect((await db.sessions.get(s.id))!.exerciseIds).toEqual(['barbell-back-squat']);
  });

  it('is idempotent: the same id twice (sequential or a concurrent double tap) writes one set', async () => {
    const s = await startWorkout('g', db);
    const [a, b] = await Promise.all([logSet(newSet('same', s.id), db), logSet(newSet('same', s.id), db)]);
    expect(a).toEqual(b);
    await logSet(newSet('same', s.id, { reps: 3 }), db);
    expect(await db.sets.count()).toBe(1);
    expect((await db.sets.get('same'))!.reps).toBe(10);
  });

  it('stores seconds for timed sets', async () => {
    const s = await startWorkout('g', db);
    const set = await logSet({ id: 't', sessionId: s.id, exerciseId: 'plank', seconds: 45, load: { kind: 'timed', unit: 'lb', total: 0 } }, db);
    expect(set.seconds).toBe(45);
    expect(set.reps).toBeUndefined();
  });

  it('rejects bad input and ended workouts', async () => {
    const s = await startWorkout('g', db);
    await expect(logSet(newSet('a', s.id, { reps: 0 }), db)).rejects.toThrow();
    await expect(logSet(newSet('b', s.id, { reps: 2.5 }), db)).rejects.toThrow();
    await expect(logSet({ id: 'c', sessionId: s.id, exerciseId: 'e', load: bar185 }, db)).rejects.toThrow();
    await expect(logSet(newSet('d', s.id, { load: { ...bar185, total: Number.NaN } }), db)).rejects.toThrow();
    await expect(logSet(newSet('e', 'nope'), db)).rejects.toThrow();
    await logSet(newSet('f', s.id), db);
    await finishWorkout(s.id, db);
    await expect(logSet(newSet('g', s.id), db)).rejects.toThrow();
    expect(await db.sets.count()).toBe(1);
  });
});

describe('updateSet', () => {
  it('changes reps and load, keeps id, order and exercise', async () => {
    const s = await startWorkout('g', db);
    await logSet(newSet('a', s.id), db);
    await logSet(newSet('b', s.id), db);
    const next = await updateSet('b', { reps: 11, load: { ...bar185, total: 195, perSide: [45, 25, 5] } }, db);
    expect(next).toMatchObject({ id: 'b', order: 1, exerciseId: 'barbell-back-squat', reps: 11, load: { total: 195 } });
    const timed = await updateSet('a', { seconds: 30, load: { kind: 'timed', unit: 'lb', total: 0 } }, db);
    expect(timed.reps).toBeUndefined();
    expect(timed.seconds).toBe(30);
    await expect(updateSet('missing', { reps: 1, load: bar185 }, db)).rejects.toThrow();
    await expect(updateSet('a', { reps: -1, load: bar185 }, db)).rejects.toThrow();
  });
});

describe('delete and undo', () => {
  it('deleteSet returns the record and restoreSet puts it back with the same id and order', async () => {
    const s = await startWorkout('g', db);
    for (const id of ['a', 'b', 'c']) await logSet(newSet(id, s.id), db);
    const gone = await deleteSet('b', db);
    expect(gone).toMatchObject({ id: 'b', order: 1 });
    expect((await setsOf(s.id, db)).map((x) => x.id)).toEqual(['a', 'c']);
    expect(await deleteSet('b', db)).toBeUndefined();
    await restoreSet(gone!, db);
    expect((await setsOf(s.id, db)).map((x) => [x.id, x.order])).toEqual([
      ['a', 0],
      ['b', 1],
      ['c', 2],
    ]);
    expect(await db.sets.get('b')).toEqual(gone);
  });

  it('PLAN 1.10d (2): Undo puts back the record deleteSet read, not the edit sheet\'s stale copy (save 12 over 10, delete, undo → 12)', async () => {
    const s = await startWorkout('g', db);
    const stale = await logSet(newSet('a', s.id, { reps: 10 }), db);
    const d = createDeleteUndo<WorkoutSet>({ remove: (x) => deleteSet(x.id, db), restore: (x) => restoreSet(x, db) });
    await updateSet('a', { reps: 12, load: bar185 }, db);
    await d.remove(stale); // the sheet still holds reps 10
    expect(await setsOf(s.id, db)).toEqual([]);
    const back = await d.undo('a');
    expect(back!.reps).toBe(12);
    expect((await db.sets.get('a'))!.reps).toBe(12);
  });

  it('Codex 1.10d (5): a workout logged before the order counter (v3 style) never gets duplicate orders', async () => {
    const s = await startWorkout('g', db);
    // Sets written before schema v4: orders 0, 1, 2 and no counter row.
    for (const [i, id] of ['a', 'b', 'c'].entries()) {
      await db.sets.add({ id, sessionId: s.id, exerciseId: 'barbell-back-squat', order: i, kind: 'work', reps: 10, load: bar185, uncertain: false });
    }
    expect(await db.orderCounters.get(s.id)).toBeUndefined();
    const gone = (await deleteSet('c', db))!; // the newest
    expect(await db.orderCounters.get(s.id)).toEqual({ sessionId: s.id, next: 3 });
    const d = await logSet(newSet('d', s.id), db);
    expect(d.order).toBe(3);
    await restoreSet(gone, db);
    const orders = (await setsOf(s.id, db)).map((x) => [x.id, x.order]);
    expect(orders).toEqual([
      ['a', 0],
      ['b', 1],
      ['c', 2],
      ['d', 3],
    ]);
    // Undo into a counter that is behind (an old record): the counter moves past it.
    await db.orderCounters.delete(s.id);
    await deleteSet('d', db);
    await restoreSet({ ...d, order: 7 }, db);
    expect((await db.orderCounters.get(s.id))!.next).toBe(8);
    expect(await deleteSet('missing', db)).toBeUndefined();
  });

  it('PLAN 1.10d (3): restoring into a finished or deleted workout writes nothing and says so', async () => {
    const s = await startWorkout('g', db);
    await logSet(newSet('a', s.id), db);
    const gone = (await logSet(newSet('b', s.id), db))!;
    await deleteSet('b', db);
    await finishWorkout(s.id, db, 5);
    await expect(restoreSet(gone, db)).rejects.toBeInstanceOf(WorkoutFinishedError);
    await expect(restoreSet(gone, db)).rejects.toThrow('That workout is already finished');
    expect(await db.sets.get('b')).toBeUndefined();

    // Finish discarded the empty workout (its only set deleted): Undo can never orphan a set.
    const t = await startWorkout('g', db);
    const only = await logSet(newSet('c', t.id), db);
    await deleteSet('c', db);
    expect(await finishWorkout(t.id, db)).toEqual({ saved: false });
    await expect(restoreSet(only, db)).rejects.toBeInstanceOf(WorkoutFinishedError);
    expect(await db.sets.count()).toBe(1);
  });
});

describe('finishWorkout', () => {
  it('saves a workout with sets', async () => {
    const s = await startWorkout('g', db, 1);
    await logSet(newSet('a', s.id), db);
    await logSet(newSet('b', s.id), db);
    expect(await finishWorkout(s.id, db, 99)).toEqual({ saved: true, sets: 2 });
    expect((await db.sessions.get(s.id))!.endedAt).toBe(99);
    expect(await finishWorkout(s.id, db, 200)).toEqual({ saved: true, sets: 2 });
    expect((await db.sessions.get(s.id))!.endedAt).toBe(99);
    expect(await getActiveSession(db)).toBeUndefined();
  });

  it('deletes a workout with no sets', async () => {
    const s = await startWorkout('g', db);
    expect(await finishWorkout(s.id, db)).toEqual({ saved: false });
    expect(await db.sessions.count()).toBe(0);
    expect(await finishWorkout(s.id, db)).toEqual({ saved: false });
  });
});

describe('exerciseSettings', () => {
  it('stores free weight answers for every gym and machine answers per gym', async () => {
    expect(isPerGym('stack')).toBe(true);
    expect(isPerGym('plate_machine')).toBe(true);
    expect(isPerGym('dumbbell_each')).toBe(false);

    expect(await saveLoadType('hip-thrust', 'gym-a', 'barbell', db)).toEqual({ exerciseId: 'hip-thrust', gymId: ANY_GYM, loadType: 'barbell' });
    expect(await loadTypeFor('hip-thrust', 'gym-b', db)).toBe('barbell');

    await saveLoadType('leg-press', 'gym-a', 'plate_machine', db);
    expect(await loadTypeFor('leg-press', 'gym-a', db)).toBe('plate_machine');
    expect(await loadTypeFor('leg-press', 'gym-b', db)).toBeUndefined();
    await saveLoadType('leg-press', 'gym-b', 'stack', db);
    expect(await loadTypeFor('leg-press', 'gym-b', db)).toBe('stack');
    expect(await loadTypeFor('leg-press', 'gym-a', db)).toBe('plate_machine');

    // This gym's machine answer wins over an every-gym answer.
    await saveLoadType('leg-press', 'gym-c', 'single', db);
    expect(await loadTypeFor('leg-press', 'gym-a', db)).toBe('plate_machine');
    expect(await loadTypeFor('leg-press', 'gym-z', db)).toBe('single');
    expect(pickLoadType([], 'x', 'g')).toBeUndefined();
    expect(pickLoadType([{ exerciseId: 'x', gymId: ANY_GYM, loadType: 'timed' }], 'x', ANY_GYM)).toBe('timed');
  });

  it('PLAN 1.10d (4): a bar choice is saved per exercise and gym, next to the load type answer', async () => {
    expect(pickBar([], 'bench', 'gym-a')).toBeUndefined();
    await saveLoadType('bench', 'gym-a', 'barbell', db); // free weight: every gym
    expect(await saveBarChoice('bench', 'gym-a', 'womens', db)).toEqual({ exerciseId: 'bench', gymId: 'gym-a', barId: 'womens' });
    const all = await db.exerciseSettings.toArray();
    expect(pickBar(all, 'bench', 'gym-a')).toBe('womens');
    expect(pickBar(all, 'bench', 'gym-b')).toBeUndefined();
    // A bar only record never hides the every-gym load type answer.
    expect(pickLoadType(all, 'bench', 'gym-a')).toBe('barbell');
    expect(await loadTypeFor('bench', 'gym-a', db)).toBe('barbell');
    // Machine answers and bar choices share the per gym record without losing each other.
    await saveBarChoice('leg-press', 'gym-a', 'olympic', db);
    await saveLoadType('leg-press', 'gym-a', 'plate_machine', db);
    expect(await db.exerciseSettings.get(['leg-press', 'gym-a'])).toEqual({ exerciseId: 'leg-press', gymId: 'gym-a', loadType: 'plate_machine', barId: 'olympic' });
    await saveBarChoice('leg-press', 'gym-a', 'womens', db);
    expect(await db.exerciseSettings.get(['leg-press', 'gym-a'])).toEqual({ exerciseId: 'leg-press', gymId: 'gym-a', loadType: 'plate_machine', barId: 'womens' });
  });
});

describe('PLAN 1.7h (5): counts and load agree', () => {
  it('logSet and updateSet reject a count that does not fit the load', async () => {
    const s = await startWorkout('g', db);
    const timed: Load = { kind: 'timed', unit: 'lb', total: 0 };
    await expect(logSet({ id: 'x1', sessionId: s.id, exerciseId: 'squat', seconds: 1, load: bar185 }, db)).rejects.toThrow('Invalid set');
    await expect(logSet({ id: 'x2', sessionId: s.id, exerciseId: 'plank', reps: 10, load: timed }, db)).rejects.toThrow('Invalid set');
    await expect(logSet({ id: 'x3', sessionId: s.id, exerciseId: 'squat', reps: 5, seconds: 5, load: bar185 }, db)).rejects.toThrow('Invalid set');
    await logSet(newSet('a', s.id), db);
    // Codex 1149 (2): an old 10 rep set edited after the exercise turned Timed is never "1 second".
    await expect(updateSet('a', { seconds: 1, load: bar185 }, db)).rejects.toThrow('Invalid set');
    expect(await db.sets.get('a')).toMatchObject({ reps: 10 });
    expect(await setsOf(s.id, db)).toHaveLength(1);
  });

  it('PLAN 1.7h (2): the submission commits with its set; a deleted set is never logged again under its id', async () => {
    const s = await startWorkout('g', db);
    await logSet({ ...newSet('a', s.id), rev: 4 }, db);
    expect(await db.submissions.get('a')).toEqual({ id: 'a', sessionId: s.id, exerciseId: 'barbell-back-squat', rev: 4 });
    await logSet(newSet('b', s.id), db);
    expect(await db.submissions.get('b')).toMatchObject({ rev: 0 });
    await deleteSet('a', db);
    await expect(logSet(newSet('a', s.id), db)).rejects.toBeInstanceOf(AlreadyLoggedError);
    expect((await setsOf(s.id, db)).map((x) => x.id)).toEqual(['b']);
  });
});
