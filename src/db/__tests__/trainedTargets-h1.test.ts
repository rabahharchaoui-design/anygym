// PLAN H1 (2), SPEC 20.3: only an exercise's target (primary) muscles are trained by its sets.
// Helper muscles never get the trained stamp; they are kept apart, only to keep suggestions off them.
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnyGymDB } from '../schema';
import { readHelped, readTraining, readTrainingLog } from '../training';
import { readLastHelped, readRecentMuscles } from '../quick';
import { profileFor } from '../../data/order';
import type { WorkoutSet } from '../types';

const NOW = new Date(2026, 10, 22, 12).getTime();
const HOUR = 60 * 60 * 1000;
let db: AnyGymDB;
let name: string;
beforeEach(async () => {
  name = `trained-h1-${Math.random()}`;
  db = new AnyGymDB(name);
  await db.open();
});
afterEach(async () => { db.close(); await Dexie.delete(name); });

const set = (exerciseId: string, order: number): WorkoutSet => ({ id: `${exerciseId}-${order}`, sessionId: 'w', exerciseId, order, kind: 'work', reps: 8, load: { kind: 'bodyweight', unit: 'lb', total: 0 }, uncertain: false });
async function log(exerciseId: string) {
  await db.sessions.put({ id: 'w', gymId: 'g', startedAt: NOW - 2 * HOUR, endedAt: NOW - HOUR, imported: false });
  await db.sets.bulkPut([0, 1, 2].map((i) => set(exerciseId, i)));
}

describe('H1: helper muscles are never trained', () => {
  it('the bench press has chest as its target and triceps and shoulders as helpers (the premise)', () => {
    const p = profileFor('dumbbell-bench-press');
    expect(p.targets).toContain('chest');
    expect(p.targets).not.toContain('triceps');
    expect(p.helpers).toContain('triceps');
    expect(p.helpers.some((m) => m.includes('delts'))).toBe(true);
  });

  it('bench only: chest is trained; triceps and shoulders are not named', async () => {
    await log('dumbbell-bench-press');
    const trained = await readTraining(NOW, db);
    expect(trained.chest).toBe(NOW - 2 * HOUR);
    expect(trained.triceps).toBeUndefined();
    expect(Object.keys(trained).some((m) => m.includes('delts'))).toBe(false);
    expect(await readRecentMuscles(NOW, db)).toEqual(Object.keys(trained));
    const [entry] = await readTrainingLog(NOW, db);
    expect(entry!.sets).toEqual({ chest: 3 });
  });

  it('bench only: the helpers are kept apart, never mixed into the trained list', async () => {
    await log('dumbbell-bench-press');
    const helped = await readHelped(NOW, db);
    expect(helped.triceps).toBe(NOW - 2 * HOUR);
    expect(helped.chest).toBeUndefined();
    expect(helped.forearms).toBeUndefined();
    expect(await readLastHelped(NOW, db)).toEqual(helped);
  });

  it('a triceps day: triceps are trained', async () => {
    expect(profileFor('cable-tricep-pushdown').targets).toContain('triceps');
    await log('cable-tricep-pushdown');
    const trained = await readTraining(NOW, db);
    expect(trained.triceps).toBe(NOW - 2 * HOUR);
    expect(await readRecentMuscles(NOW, db)).toContain('triceps');
    const [entry] = await readTrainingLog(NOW, db);
    expect(entry!.sets.triceps).toBe(3);
    expect((await readHelped(NOW, db)).triceps).toBeUndefined();
  });
});
