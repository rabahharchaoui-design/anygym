// PLAN H2, SPEC 20.3: Quick's trained facts (its Skips line and its rested line) follow the one rule
// in src/lib/recovery: 3 logged working sets with the group as a primary muscle. One set is not enough.
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnyGymDB } from '../schema';
import { readHelped, readTraining } from '../training';
import { readLastTrained, readRecentAt, readRecentMuscles } from '../quick';
import type { WorkoutSet } from '../types';

const NOW = new Date(2026, 10, 26, 12).getTime();
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
let db: AnyGymDB;
let name: string;
beforeEach(async () => {
  name = `trained-h2-${Math.random()}`;
  db = new AnyGymDB(name);
  await db.open();
});
afterEach(async () => { db.close(); await Dexie.delete(name); });

const set = (sessionId: string, exerciseId: string, order: number, kind: WorkoutSet['kind'] = 'work'): WorkoutSet => ({ id: `${sessionId}-${exerciseId}-${order}`, sessionId, exerciseId, order, kind, reps: 8, load: { kind: 'bodyweight', unit: 'lb', total: 0 }, uncertain: false });
async function log(sessionId: string, at: number, exerciseId: string, count: number, kind: WorkoutSet['kind'] = 'work') {
  await db.sessions.put({ id: sessionId, gymId: 'g', startedAt: at, endedAt: at + HOUR, imported: false });
  await db.sets.bulkPut(Array.from({ length: count }, (_, i) => set(sessionId, exerciseId, i, kind)));
}

describe('H2: Quick counts a muscle as trained only after 3 working sets', () => {
  it('one working set of bench: chest is not trained, nothing is skipped', async () => {
    await log('a', NOW - 2 * HOUR, 'dumbbell-bench-press', 1);
    expect((await readTraining(NOW, db)).chest).toBeUndefined();
    expect(await readLastTrained(NOW, db)).toEqual({});
    expect(await readRecentMuscles(NOW, db)).toEqual([]);
    expect(await readRecentAt(NOW, db)).toBeNull();
  });

  it('one set today after a full chest day 5 days ago: no "chest rested 5 days" claim', async () => {
    await log('old', NOW - 5 * DAY, 'dumbbell-bench-press', 3);
    await log('new', NOW - 2 * HOUR, 'dumbbell-bench-press', 1);
    expect((await readTraining(NOW, db)).chest).toBe(NOW - 5 * DAY);
    // Worked today, so the app is not sure chest rested since: the rest claim is dropped (sureRest).
    expect((await readHelped(NOW, db)).chest).toBe(NOW - 2 * HOUR);
  });

  it('two sets plus warmups are still not trained', async () => {
    await log('a', NOW - 2 * HOUR, 'dumbbell-bench-press', 2);
    await db.sets.bulkPut([5, 6, 7].map((i) => set('a', 'dumbbell-bench-press', i, 'warmup')));
    expect(await readRecentMuscles(NOW, db)).toEqual([]);
  });

  it('three working sets: chest is trained and skipped, with the date of that workout', async () => {
    await log('old', NOW - 30 * HOUR, 'dumbbell-bench-press', 3);
    await log('new', NOW - 2 * HOUR, 'dumbbell-bench-press', 1);
    expect((await readTraining(NOW, db)).chest).toBe(NOW - 30 * HOUR);
    expect(await readRecentMuscles(NOW, db)).toEqual(['chest']);
    // The Skips line's "when" is the workout that trained it, not the later single set.
    expect(await readRecentAt(NOW, db)).toBe(NOW - 30 * HOUR);
  });
});
