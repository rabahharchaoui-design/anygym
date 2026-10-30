// PLAN 1.7k (Codex 1025 1348 #6): an older Smith set saved without a barId never enters Olympic history.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnyGymDB } from '../schema';
import { makeGym } from '../gyms';
import type { Gym, Load } from '../types';
import { getPastSessions, legacyBarOf, workoutRecords } from '../history';
import { finishWorkout, logSet, startWorkout } from '../workouts';

let db: AnyGymDB;
let n = 0;
beforeEach(async () => {
  db = new AnyGymDB(`anygym-1.7k-weights-${n++}`);
  await db.open();
});
afterEach(async () => {
  await db.delete();
});

const gymWith = async (name: string, smith: number | null): Promise<Gym> => {
  const g = makeGym({ name, type: 'full', unit: 'lb' }, 1);
  const gym = { ...g, bars: { ...g.bars, smith } };
  await db.gyms.add(gym);
  return gym;
};

async function workout(gymId: string, at: number, sets: Array<{ id: string; reps: number; load: Load }>) {
  const s = await startWorkout(gymId, db, at);
  for (const x of sets) await logSet({ id: x.id, sessionId: s.id, exerciseId: 'bench-press', reps: x.reps, load: x.load }, db);
  await finishWorkout(s.id, db, at + 1);
  return s;
}

// A legacy (no barId) plates only Smith bench set: bar weight 0, the gym's Smith answer.
const legacySmith: Load = { kind: 'barbell', unit: 'lb', total: 90, barWeight: 0, perSide: [45] };
const legacyOlympic: Load = { kind: 'barbell', unit: 'lb', total: 135, barWeight: 45, perSide: [45] };

describe('legacy Smith sets without barId (PLAN 1.7k)', () => {
  it('a plates only Smith set from gym A never appears in gym B Olympic history, LAST TIME or records', async () => {
    const a = await gymWith('A', 0);
    const b = await gymWith('B', null);
    await workout(a.id, 1000, [{ id: 's1', reps: 10, load: legacySmith }]);
    const olympic = await getPastSessions('bench-press', b.id, 'barbell', 6, { db, defaultBar: 'olympic' });
    expect(olympic).toEqual([]);
    // It is gym A's Smith history.
    const smithA = await getPastSessions('bench-press', a.id, 'barbell', 6, { db, smith: true, defaultBar: 'olympic' });
    expect(smithA.map((s) => s.sets[0]!.load.total)).toEqual([90]);
    expect(await getPastSessions('bench-press', b.id, 'barbell', 6, { db, smith: true, defaultBar: 'olympic' })).toEqual([]);
    // A new Olympic workout at B: the old Smith set is no earlier record to compare with.
    const now = await workout(b.id, 5000, [{ id: 'o1', reps: 5, load: { ...legacyOlympic, barId: 'olympic' } }]);
    expect(await workoutRecords(now.id, () => 'Bench Press', db)).toEqual([]);
  });

  it('a legacy Olympic set (bar weight of the Olympic bar) stays Olympic history everywhere', async () => {
    const a = await gymWith('A', 0);
    const b = await gymWith('B', null);
    await workout(a.id, 1000, [{ id: 'o1', reps: 8, load: legacyOlympic }]);
    expect((await getPastSessions('bench-press', b.id, 'barbell', 6, { db, defaultBar: 'olympic' })).length).toBe(1);
  });

  it('legacyBarOf: stored bar weight evidence decides, never today\'s bar setting; ambiguous is null', () => {
    const bars = { olympic: 45, womens: 35, ez_curl: null, trap: null, smith: 0 };
    const lb = (barWeight: number) => ({ barWeight, unit: 'lb' as const });
    const gym = { bars, unit: 'lb' as const };
    expect(legacyBarOf(lb(0), 'olympic', gym)).toBe('smith');
    expect(legacyBarOf(lb(45), 'olympic', gym)).toBe('olympic');
    expect(legacyBarOf(lb(35), 'olympic', gym)).toBe('womens');
    // Smith answer equal to a free bar's weight: ambiguous, left out (never guessed).
    expect(legacyBarOf(lb(45), 'olympic', { ...gym, bars: { ...bars, smith: 45 } })).toBeNull();
    // No Smith answer: a 0 bar is no evidence of anything; the exercise's own bar.
    expect(legacyBarOf(lb(0), 'olympic', { ...gym, bars: { ...bars, smith: null } })).toBe('olympic');
    // A Smith exercise by name stays Smith.
    expect(legacyBarOf(lb(45), 'smith', gym)).toBe('smith');
    // No gym record at all: the exercise's own bar (nothing there can change any more).
    expect(legacyBarOf(lb(0), 'olympic', undefined)).toBe('olympic');
    // PLAN 2.0c: the gym is in another unit now, its answers were reset: the evidence is gone, so
    // the set is left out (null), never guessed as the exercise's own bar.
    expect(legacyBarOf({ barWeight: 20, unit: 'kg' }, 'olympic', gym)).toBeNull();
  });

  it('review: a legacy 45 lb Olympic set stays Olympic when Smith is selected today (Smith answer 0); the bar change persists it', async () => {
    const { saveBarChoice } = await import('../exerciseSettings');
    const a = await gymWith('A', 0);
    await workout(a.id, 1000, [{ id: 'o1', reps: 8, load: legacyOlympic }]);
    await workout(a.id, 2000, [{ id: 's1', reps: 10, load: legacySmith }]);
    await saveBarChoice('bench-press', a.id, 'smith', db, 'olympic');
    // Persisted on the change: each legacy set now carries the bar its evidence says.
    expect((await db.sets.get('o1'))!.load!.barId).toBe('olympic');
    expect((await db.sets.get('s1'))!.load!.barId).toBe('smith');
    const olympic = await getPastSessions('bench-press', a.id, 'barbell', 6, { db, defaultBar: 'olympic' });
    expect(olympic.map((p) => p.sets[0]!.load.total)).toEqual([135]);
    const smith = await getPastSessions('bench-press', a.id, 'barbell', 6, { db, smith: true, defaultBar: 'olympic' });
    expect(smith.map((p) => p.sets[0]!.load.total)).toEqual([90]);
  });

  it('review: an ambiguous legacy set (Smith answer = Olympic bar weight) is in no history and is not stamped', async () => {
    const { saveBarChoice } = await import('../exerciseSettings');
    const a = await gymWith('A', 45);
    await workout(a.id, 1000, [{ id: 'x1', reps: 8, load: legacyOlympic }]);
    expect(await getPastSessions('bench-press', a.id, 'barbell', 6, { db, defaultBar: 'olympic' })).toEqual([]);
    expect(await getPastSessions('bench-press', a.id, 'barbell', 6, { db, smith: true, defaultBar: 'olympic' })).toEqual([]);
    await saveBarChoice('bench-press', a.id, 'olympic', db, 'olympic');
    expect((await db.sets.get('x1'))!.load!.barId).toBeUndefined();
  });

  it('review: a legacy Smith workout never earns Olympic records', async () => {
    const a = await gymWith('A', 0);
    // Earlier Olympic history: 135 x 8.
    await workout(a.id, 1000, [{ id: 'o1', reps: 8, load: { ...legacyOlympic, barId: 'olympic' } }]);
    // Today, a legacy plates only Smith set with more reps on a lighter total: no Olympic record.
    const now = await workout(a.id, 5000, [{ id: 's1', reps: 12, load: { ...legacySmith, total: 135, perSide: [45, 10, 10, 2.5] } }]);
    expect(await workoutRecords(now.id, () => 'Bench Press', db)).toEqual([]);
  });

  it('a legacy set at a gym whose bar choice for the exercise was Smith is that gym Smith history', async () => {
    const a = await gymWith('A', 25);
    await db.exerciseSettings.put({ exerciseId: 'bench-press', gymId: a.id, barId: 'smith' });
    await workout(a.id, 1000, [{ id: 's1', reps: 10, load: { kind: 'barbell', unit: 'lb', total: 115, barWeight: 25, perSide: [45] } }]);
    expect(await getPastSessions('bench-press', a.id, 'barbell', 6, { db, defaultBar: 'olympic' })).toEqual([]);
    expect((await getPastSessions('bench-press', a.id, 'barbell', 6, { db, smith: true, defaultBar: 'olympic' })).length).toBe(1);
  });
});
