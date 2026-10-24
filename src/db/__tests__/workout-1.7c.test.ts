import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnyGymDB } from '../schema';
import { ANY_GYM, type Load } from '../types';
import {
  WorkoutFinishedError,
  addExercise,
  finishWorkout,
  logSet,
  removeExercise,
  restoreExercise,
  setExerciseOrder,
  startWorkout,
  updateSetType,
} from '../workouts';
import { pickBar, pickLoadType, pickNote, pickRest, saveBarChoice, saveExerciseNote, saveExerciseRest, saveLoadType } from '../exerciseSettings';
import { recentExerciseIds, workoutRecords } from '../history';

let db: AnyGymDB;
let n = 0;
beforeEach(async () => {
  db = new AnyGymDB(`anygym-17c-${n++}`);
  await db.open();
});
afterEach(async () => {
  await db.delete();
});

const bar = (total: number, perSide: number[]): Load => ({ kind: 'barbell', unit: 'lb', total, barWeight: 45, perSide });
const names = (id: string) => ({ squat: 'Barbell Back Squat', bench: 'Bench' })[id] ?? id;

describe('set types (failure flag)', () => {
  it('logs F as a work set with failure, and changes types later', async () => {
    const s = await startWorkout('g', db);
    const set = await logSet({ id: 'a', sessionId: s.id, exerciseId: 'squat', reps: 8, load: bar(135, [45]), failure: true }, db);
    expect(set).toMatchObject({ kind: 'work', failure: true });
    const warm = await logSet({ id: 'b', sessionId: s.id, exerciseId: 'squat', reps: 8, load: bar(135, [45]), kind: 'warmup', failure: true }, db);
    expect(warm.failure).toBeUndefined();
    expect(await updateSetType('a', 'drop', false, db)).toMatchObject({ kind: 'drop' });
    expect((await db.sets.get('a'))!.failure).toBeUndefined();
    expect(await updateSetType('a', 'work', true, db)).toMatchObject({ kind: 'work', failure: true });
    await expect(updateSetType('nope', 'work', false, db)).rejects.toThrow();
  });
});

describe('exercise order and remove', () => {
  it('reorders only the same exercises of an active workout', async () => {
    const s = await startWorkout('g', db);
    await addExercise(s.id, 'a', db);
    await addExercise(s.id, 'b', db);
    await setExerciseOrder(s.id, ['b', 'a'], db);
    expect((await db.sessions.get(s.id))!.exerciseIds).toEqual(['b', 'a']);
    await expect(setExerciseOrder(s.id, ['b', 'c'], db)).rejects.toThrow();
    await expect(setExerciseOrder(s.id, ['b'], db)).rejects.toThrow();
  });
  it('removes an exercise without sets, Undo puts it back in place; never one with sets', async () => {
    const s = await startWorkout('g', db);
    for (const id of ['a', 'b', 'c']) await addExercise(s.id, id, db);
    expect(await removeExercise(s.id, 'b', db)).toBe(1);
    expect((await db.sessions.get(s.id))!.exerciseIds).toEqual(['a', 'c']);
    await restoreExercise(s.id, 'b', 1, db);
    expect((await db.sessions.get(s.id))!.exerciseIds).toEqual(['a', 'b', 'c']);
    expect(await removeExercise(s.id, 'zz', db)).toBe(-1);
    await logSet({ id: 'x', sessionId: s.id, exerciseId: 'a', reps: 5, load: bar(135, [45]) }, db);
    await expect(removeExercise(s.id, 'a', db)).rejects.toThrow('Exercise has sets');
    await finishWorkout(s.id, db);
    await expect(restoreExercise(s.id, 'b', 0, db)).rejects.toBeInstanceOf(WorkoutFinishedError);
    await expect(removeExercise(s.id, 'c', db)).rejects.toThrow();
  });
});

describe('exercise preferences: rest and note', () => {
  it('saved on the every-gym record, keeping load type and bar choice', async () => {
    await saveLoadType('curl', 'g1', 'dumbbell_each', db);
    await saveBarChoice('curl', ANY_GYM, 'ez_curl', db);
    await saveExerciseRest('curl', 120, db);
    await saveExerciseNote('curl', '  Seat on 4  ', db);
    const all = await db.exerciseSettings.toArray();
    expect(pickRest(all, 'curl')).toBe(120);
    expect(pickNote(all, 'curl')).toBe('Seat on 4');
    expect(pickLoadType(all, 'curl', 'g1')).toBe('dumbbell_each');
    expect(pickBar(all, 'curl', ANY_GYM)).toBe('ez_curl');
    await saveExerciseNote('curl', '   ', db);
    expect(pickNote(await db.exerciseSettings.toArray(), 'curl')).toBeUndefined();
    expect(pickRest([], 'curl')).toBeUndefined();
  });
  it('rejects a rest outside 0 to 10 minutes', async () => {
    await expect(saveExerciseRest('x', -15, db)).rejects.toThrow();
    await expect(saveExerciseRest('x', 601, db)).rejects.toThrow();
    await expect(saveExerciseRest('x', 1.5, db)).rejects.toThrow();
    expect((await saveExerciseRest('x', 0, db)).restSec).toBe(0);
  });
});

describe('recentExerciseIds', () => {
  it('finished workouts only, newest first, each once', async () => {
    const a = await startWorkout('g', db, 1000);
    await logSet({ id: '1', sessionId: a.id, exerciseId: 'squat', reps: 5, load: bar(135, [45]) }, db);
    await logSet({ id: '2', sessionId: a.id, exerciseId: 'bench', reps: 5, load: bar(135, [45]) }, db);
    await finishWorkout(a.id, db, 2000);
    const b = await startWorkout('g', db, 3000);
    await logSet({ id: '3', sessionId: b.id, exerciseId: 'row', reps: 5, load: bar(135, [45]) }, db);
    await logSet({ id: '4', sessionId: b.id, exerciseId: 'squat', reps: 5, load: bar(135, [45]) }, db);
    expect(await recentExerciseIds(8, db)).toEqual(['squat', 'bench']);
    await finishWorkout(b.id, db, 4000);
    expect(await recentExerciseIds(8, db)).toEqual(['row', 'squat', 'bench']);
    expect(await recentExerciseIds(1, db)).toEqual(['row']);
  });
});

describe('workoutRecords', () => {
  it('only from earlier workouts; nothing the first time', async () => {
    const a = await startWorkout('g', db, 1000);
    await logSet({ id: '1', sessionId: a.id, exerciseId: 'squat', reps: 8, load: bar(135, [45]) }, db);
    await finishWorkout(a.id, db, 2000);
    expect(await workoutRecords(a.id, names, db)).toEqual([]);
    const b = await startWorkout('g', db, 3000);
    await logSet({ id: '2', sessionId: b.id, exerciseId: 'squat', reps: 10, load: bar(135, [45]) }, db);
    await logSet({ id: '3', sessionId: b.id, exerciseId: 'squat', reps: 5, load: bar(185, [45, 25]) }, db);
    await finishWorkout(b.id, db, 4000);
    const r = await workoutRecords(b.id, names, db);
    expect(r.map((x) => x.text)).toEqual(['Barbell Back Squat: heaviest ever, 185 lb', 'Barbell Back Squat: most reps at 135 lb, 10']);
    // The earlier workout does not gain records from the later one.
    expect(await workoutRecords(a.id, names, db)).toEqual([]);
    expect(await workoutRecords('missing', names, db)).toEqual([]);
  });
});

describe('workoutRecords keeps Smith and free bar lifts apart (PLAN 1.7f)', () => {
  const smith = (total: number, perSide: number[]): Load => ({ kind: 'barbell', unit: 'lb', total, barWeight: 0, perSide, barId: 'smith' });
  const workout = async (at: number, loads: Load[]) => {
    const s = await startWorkout('g', db, at);
    for (const [i, load] of loads.entries()) await logSet({ id: `${at}-${i}`, sessionId: s.id, exerciseId: 'bench', reps: 8, load }, db);
    await finishWorkout(s.id, db, at + 1);
    return s;
  };

  it('a heavier Smith set in the same workout earns no Olympic record, and has no Smith history yet', async () => {
    await workout(1000, [bar(135, [45])]);
    const s = await workout(2000, [bar(135, [45]), smith(270, [45, 45, 45])]);
    expect(await workoutRecords(s.id, names, db)).toEqual([]);
  });

  it('each lift is compared with its own history only (legacy sets without barId count as the default bar)', async () => {
    await workout(1000, [bar(185, [45, 25]), smith(90, [45])]);
    // Smith 180 beats Smith 90 (not the free 185); free 155 beats nothing.
    const s = await workout(2000, [bar(155, [45, 10]), smith(180, [45, 45])]);
    expect((await workoutRecords(s.id, names, db)).map((r) => r.text)).toEqual(['Bench: heaviest ever, 180 lb']);
    // A free bar record against free history only, with the Smith 180 in the same workout.
    const t = await workout(3000, [bar(195, [45, 30]), smith(100, [50])]);
    expect((await workoutRecords(t.id, names, db)).map((r) => r.text)).toEqual(['Bench: heaviest ever, 195 lb']);
  });

  it('a Smith exercise by name: older sets without barId are Smith', async () => {
    const legacy: Load = { kind: 'barbell', unit: 'lb', total: 90, barWeight: 0, perSide: [45] };
    const a = await startWorkout('g', db, 1000);
    await logSet({ id: 's1', sessionId: a.id, exerciseId: 'smith-squat', reps: 8, load: legacy }, db);
    await finishWorkout(a.id, db, 1001);
    const b = await startWorkout('g', db, 2000);
    await logSet({ id: 's2', sessionId: b.id, exerciseId: 'smith-squat', reps: 8, load: smith(180, [45, 45]) }, db);
    await finishWorkout(b.id, db, 2001);
    expect((await workoutRecords(b.id, () => 'Smith Squat', db)).map((r) => r.text)).toEqual(['Smith Squat: heaviest ever, 180 lb']);
  });
});

describe('changing how an exercise is loaded (Loaded with… Change)', () => {
  it('a machine answer at this gym and a free weight answer never fight: the newest wins', async () => {
    await saveLoadType('leg-press', 'g1', 'stack', db);
    expect(pickLoadType(await db.exerciseSettings.toArray(), 'leg-press', 'g1')).toBe('stack');
    await saveLoadType('leg-press', 'g1', 'barbell', db);
    expect(pickLoadType(await db.exerciseSettings.toArray(), 'leg-press', 'g1')).toBe('barbell');
    await saveLoadType('leg-press', 'g1', 'plate_machine', db);
    expect(pickLoadType(await db.exerciseSettings.toArray(), 'leg-press', 'g1')).toBe('plate_machine');
    expect(pickLoadType(await db.exerciseSettings.toArray(), 'leg-press', 'g2')).toBeUndefined();
  });
});
