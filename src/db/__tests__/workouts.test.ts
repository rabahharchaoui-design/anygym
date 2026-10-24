import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnyGymDB } from '../schema';
import { ANY_GYM, type Load } from '../types';
import { addExercise, deleteSet, finishWorkout, getActiveSession, logSet, restoreSet, setsOf, startWorkout, updateSet } from '../workouts';
import { isPerGym, loadTypeFor, pickLoadType, saveLoadType } from '../exerciseSettings';

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
});
