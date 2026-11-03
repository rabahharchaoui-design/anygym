// PLAN 2.2e: live PR badges and the finish lead line read from the database (workoutWins).
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnyGymDB } from '../schema';
import type { Load } from '../types';
import { deleteSet, finishWorkout, logSet, startWorkout } from '../workouts';
import { workoutWins } from '../history';
import { dumbbellLoad } from '../../lib/load';

let db: AnyGymDB;
let n = 0;
beforeEach(async () => {
  db = new AnyGymDB(`anygym-22e-${n++}`);
  await db.open();
});
afterEach(async () => {
  await db.delete();
});

const bar = (total: number, perSide: number[]): Load => ({ kind: 'barbell', unit: 'lb', total, barWeight: 45, perSide, barId: 'olympic' });
const smith = (total: number, perSide: number[]): Load => ({ kind: 'barbell', unit: 'lb', total, barWeight: 0, perSide, barId: 'smith' });
const names = (id: string) => ({ bench: 'Bench', squat: 'Squat' })[id] ?? id;

async function workout(at: number, sets: Array<[string, number, Load]>, gym = 'g', finish = true) {
  const s = await startWorkout(gym, db, at);
  for (const [i, [ex, reps, load]] of sets.entries()) await logSet({ id: `${at}-${i}`, sessionId: s.id, exerciseId: ex, reps, load }, db);
  if (finish) await finishWorkout(s.id, db, at + 1);
  return s;
}

describe('workoutWins', () => {
  it('nothing on the first ever session; live during the next one; the same after Finish', async () => {
    const a = await workout(1000, [['bench', 5, bar(185, [45, 25])], ['bench', 6, bar(185, [45, 25])]]);
    expect(await workoutWins(a.id, names, db)).toEqual({ records: [], win: null });
    const b = await workout(3000, [['bench', 6, bar(185, [45, 25])], ['bench', 7, bar(185, [45, 25])]], 'g', false);
    const live = await workoutWins(b.id, names, db);
    expect(live.records.map((r) => r.setId)).toEqual(['3000-1']); // 6 ties the best, 7 beats it
    expect(live.win).toMatchObject({ exerciseId: 'bench', setId: '3000-1', text: 'Bench 185 lb × 7, your best yet' });
    await finishWorkout(b.id, db, 4000);
    expect(await workoutWins(b.id, names, db)).toEqual(live);
    // The earlier workout never gains records from a later one.
    expect((await workoutWins(a.id, names, db)).records).toEqual([]);
    expect(await workoutWins('missing', names, db)).toEqual({ records: [], win: null });
  });

  it('every earlier workout counts, not only the last six', async () => {
    await workout(100, [['squat', 5, bar(315, [45, 45, 45])]]);
    for (let i = 1; i <= 7; i++) await workout(1000 * i, [['squat', 5, bar(225, [45, 45])]]);
    const s = await workout(9000, [['squat', 5, bar(275, [45, 45, 25])]], 'g', false);
    expect((await workoutWins(s.id, names, db)).records).toEqual([]);
  });

  it('a deleted set takes its badge with it; uncertain sets never count', async () => {
    await workout(1000, [['bench', 5, bar(185, [45, 25])]]);
    const s = await workout(2000, [['bench', 6, bar(185, [45, 25])]], 'g', false);
    expect((await workoutWins(s.id, names, db)).records).toHaveLength(1);
    await deleteSet('2000-0', db);
    expect((await workoutWins(s.id, names, db)).records).toEqual([]);
    await db.sets.put({ id: 'u', sessionId: s.id, exerciseId: 'bench', order: 9, kind: 'work', reps: 20, load: bar(185, [45, 25]), uncertain: true, loggedAt: 2500 } as never);
    expect((await workoutWins(s.id, names, db)).records).toEqual([]);
  });

  it('Smith and free bar sets keep their own history; Smith is per gym', async () => {
    await workout(1000, [['bench', 8, bar(185, [45, 25])], ['bench', 8, smith(90, [45])]]);
    const s = await workout(2000, [['bench', 8, smith(180, [45, 45])]], 'g', false);
    expect((await workoutWins(s.id, names, db)).win?.text).toBe('Bench 180 lb × 8, your best yet');
    await finishWorkout(s.id, db, 2500);
    const other = await workout(3000, [['bench', 8, smith(200, [45, 45, 10])]], 'h', false);
    expect((await workoutWins(other.id, names, db)).records).toEqual([]); // no Smith history at gym h
  });

  it('the biggest proportional win leads', async () => {
    await workout(1000, [['bench', 5, bar(185, [45, 25])], ['squat', 5, bar(225, [45, 45])]]);
    const s = await workout(2000, [['squat', 5, bar(235, [45, 45, 5])], ['bench', 7, bar(185, [45, 25])]], 'g', false);
    const w = await workoutWins(s.id, names, db);
    expect(w.records).toHaveLength(2);
    expect(w.win?.text).toBe('Bench 185 lb × 7, your best yet');
  });

  it('a barbell set, then a dumbbell PR in the same exercise: each load kind has its own history (Codex 2.2e #1)', async () => {
    const db1 = (each: number): Load => dumbbellLoad(each, 'lb');
    await workout(1000, [['bench', 5, bar(185, [45, 25])], ['bench', 8, db1(60)]]);
    const s = await workout(2000, [['bench', 5, bar(185, [45, 25])], ['bench', 9, db1(60)]], 'g', false);
    const w = await workoutWins(s.id, names, db);
    expect(w.records.map((r) => r.setId)).toEqual(['2000-1']);
    expect(w.win?.text).toBe('Bench 60 lb each × 9, your best yet');
  });
});
