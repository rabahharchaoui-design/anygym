// PLAN 2.0c group 5 (Codex 1025 1651 #4, 1722 #6, 1945 #3 #7): changing a gym's units or bar answers
// never reclassifies legacy Smith history as Olympic, and an equipment answer typed in one unit is
// never stored in the other.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnyGymDB } from '../schema';
import { makeGym } from '../gyms';
import type { Gym, Load } from '../types';
import { getPastSessions, lastSessionSets, legacyBarOf, preserveLegacyBars, workoutRecords } from '../history';
import { UnitChangedError, setEquipmentWeight, setGymUnit } from '../equipment';
import { finishWorkout, logSet, startWorkout, updateSet } from '../workouts';
import { isLoad } from '../../lib/backup';

let db: AnyGymDB;
let n = 0;
beforeEach(async () => {
  db = new AnyGymDB(`anygym-2.0c-weights-${n++}`);
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

async function workout(gymId: string, at: number, sets: Array<{ id: string; reps: number; load: Load }>, exerciseId = 'bench-press') {
  const s = await startWorkout(gymId, db, at);
  for (const x of sets) await logSet({ id: x.id, sessionId: s.id, exerciseId, reps: x.reps, load: x.load }, db);
  await finishWorkout(s.id, db, at + 1);
  return s;
}

const legacySmith: Load = { kind: 'barbell', unit: 'lb', total: 90, barWeight: 0, perSide: [45] };
const legacyOlympic: Load = { kind: 'barbell', unit: 'lb', total: 135, barWeight: 45, perSide: [45] };
const olympicB = (id: string) => ({ id, reps: 5, load: { kind: 'barbell', unit: 'lb', total: 95, barWeight: 45, barId: 'olympic', perSide: [25] } as Load });
const opts = (gymId: string) => [gymId, 'barbell', { db, defaultBar: 'olympic' as const }] as const;

describe('acceptance E: a unit change never moves legacy Smith sets into Olympic history', () => {
  it('reproduction: legacy Smith at gym A, A switches to kg, Olympic history at gym B stays clean (history, LAST TIME, records)', async () => {
    const a = await gymWith('A', 0);
    const b = await gymWith('B', null);
    await workout(a.id, 1000, [{ id: 's1', reps: 10, load: legacySmith }]);
    await setGymUnit(a.id, 'kg', db);
    // Stored evidence was resolved before the gym changed: the set is Smith for good.
    expect((await db.sets.get('s1'))!.load).toEqual({ ...legacySmith, barId: 'smith' });
    expect(await getPastSessions('bench-press', b.id, 'barbell', 6, { db, defaultBar: 'olympic' })).toEqual([]);
    expect(await lastSessionSets('bench-press', ...opts(b.id))).toBeNull();
    const now = await workout(b.id, 5000, [olympicB('o1')]);
    expect(await workoutRecords(now.id, () => 'Bench Press', db)).toEqual([]);
    // Still gym A's Smith history.
    expect((await getPastSessions('bench-press', a.id, 'barbell', 6, { db, smith: true, defaultBar: 'olympic' })).map((p) => p.sets[0]!.load.total)).toEqual([90]);
  });

  it('a Smith answer reset (bar answer changed) also keeps the old identity; legacy Olympic stays Olympic', async () => {
    const a = await gymWith('A', 0);
    await workout(a.id, 1000, [{ id: 's1', reps: 10, load: legacySmith }]);
    await workout(a.id, 2000, [{ id: 'o1', reps: 8, load: legacyOlympic }]);
    await setEquipmentWeight(a.id, 'smith_machine', { kind: 'bar_weight', value: 25 }, db);
    expect((await db.sets.get('s1'))!.load!.barId).toBe('smith');
    expect((await db.sets.get('o1'))!.load!.barId).toBe('olympic');
    expect((await getPastSessions('bench-press', a.id, 'barbell', 6, { db, defaultBar: 'olympic' })).map((p) => p.sets[0]!.load.total)).toEqual([135]);
  });

  it('an ambiguous set (Smith answer equals a free bar) is marked unresolved and stays excluded after the answer changes', async () => {
    const a = await gymWith('A', 45);
    await workout(a.id, 1000, [{ id: 'x1', reps: 8, load: legacyOlympic }]);
    expect(await getPastSessions('bench-press', a.id, 'barbell', 6, { db, defaultBar: 'olympic' })).toEqual([]);
    await setGymUnit(a.id, 'kg', db);
    await setGymUnit(a.id, 'lb', db); // Smith answer gone: without the mark this would read as Olympic
    expect((await db.sets.get('x1'))!.load).toEqual({ ...legacyOlympic, legacyBarUnresolved: true });
    expect(await getPastSessions('bench-press', a.id, 'barbell', 6, { db, defaultBar: 'olympic' })).toEqual([]);
    expect(await getPastSessions('bench-press', a.id, 'barbell', 6, { db, smith: true, defaultBar: 'olympic' })).toEqual([]);
    expect(legacyBarOf({ ...legacyOlympic, legacyBarUnresolved: true }, 'olympic', { bars: { olympic: 45, womens: 35, ez_curl: null, trap: null, smith: null }, unit: 'lb' })).toBeNull();
  });

  it('sets from before 2.0c at a gym already in the other unit are left out, never guessed Olympic', async () => {
    const a = await gymWith('A', 0);
    await workout(a.id, 1000, [{ id: 's1', reps: 10, load: legacySmith }]);
    await db.gyms.update(a.id, { unit: 'kg' }); // changed by an older version: nothing was preserved
    expect(await getPastSessions('bench-press', a.id, 'barbell', 6, { db, defaultBar: 'olympic' })).toEqual([]);
  });

  it('only that gym is touched, explicit bar ids and totals stay, repeat calls change nothing', async () => {
    const a = await gymWith('A', 0);
    const b = await gymWith('B', 0);
    await workout(a.id, 1000, [{ id: 's1', reps: 10, load: legacySmith }, { id: 'e1', reps: 5, load: { ...legacyOlympic, barId: 'womens' } }]);
    await workout(b.id, 2000, [{ id: 's2', reps: 10, load: legacySmith }]);
    expect(await preserveLegacyBars(db, (await db.gyms.get(a.id))!)).toBe(1);
    expect(await preserveLegacyBars(db, (await db.gyms.get(a.id))!)).toBe(0);
    expect((await db.sets.get('e1'))!.load!.barId).toBe('womens');
    expect((await db.sets.get('s2'))!.load!.barId).toBeUndefined();
    const s1 = (await db.sets.get('s1'))!;
    expect([s1.load!.total, s1.load!.unit, s1.load!.perSide, s1.reps, s1.order]).toEqual([90, 'lb', [45], 10, 0]);
  });

  it('aliases of the exercise and a Smith exercise by name resolve too', async () => {
    const a = await gymWith('A', 45);
    await workout(a.id, 1000, [{ id: 'm1', reps: 8, load: legacyOlympic }], 'smith-machine-squat');
    await setGymUnit(a.id, 'kg', db);
    expect((await db.sets.get('m1'))!.load!.barId).toBe('smith');
  });

  it('the same bar answer again changes no set (nothing to preserve)', async () => {
    const a = await gymWith('A', 0);
    await workout(a.id, 1000, [{ id: 's1', reps: 10, load: legacySmith }]);
    await setEquipmentWeight(a.id, 'smith_machine', { kind: 'plates_only', value: 0 }, db, 'lb');
    expect((await db.sets.get('s1'))!.load!.barId).toBeUndefined();
  });

  it('a failing unit change rolls back the identity additions with it', async () => {
    const a = await gymWith('A', 0);
    await workout(a.id, 1000, [{ id: 's1', reps: 10, load: legacySmith }]);
    const put = db.gyms.put.bind(db.gyms);
    (db.gyms as unknown as { put: typeof put }).put = (() => Promise.reject(new Error('synthetic write failure'))) as never;
    await expect(setGymUnit(a.id, 'kg', db)).rejects.toThrow();
    (db.gyms as unknown as { put: typeof put }).put = put;
    expect((await db.sets.get('s1'))!.load!.barId).toBeUndefined();
    expect((await db.gyms.get(a.id))!.unit).toBe('lb');
  });

  it('an explicit bar edit removes the unresolved mark; a reps only edit keeps it', async () => {
    const a = await gymWith('A', 45);
    const s = await startWorkout(a.id, db, 1000);
    await logSet({ id: 'x1', sessionId: s.id, exerciseId: 'bench-press', reps: 8, load: { ...legacyOlympic, legacyBarUnresolved: true } }, db);
    await updateSet('x1', { reps: 9, load: { ...legacyOlympic, legacyBarUnresolved: true } }, db);
    expect((await db.sets.get('x1'))!.load!.legacyBarUnresolved).toBe(true);
    await updateSet('x1', { reps: 9, load: { ...legacyOlympic, barId: 'olympic', legacyBarUnresolved: true } }, db);
    expect((await db.sets.get('x1'))!.load).toEqual({ ...legacyOlympic, barId: 'olympic' });
  });

  it('backup: the mark round trips and contradicts a bar id', () => {
    expect(isLoad({ ...legacyOlympic, legacyBarUnresolved: true })).toBe(true);
    expect(isLoad({ ...legacyOlympic, barId: 'olympic', legacyBarUnresolved: true })).toBe(false);
    expect(isLoad({ kind: 'single', unit: 'lb', total: 53, legacyBarUnresolved: true })).toBe(false);
    expect(isLoad({ ...legacyOlympic, legacyBarUnresolved: false })).toBe(false);
  });
});

describe('equipment answers never cross a unit change (Codex 1025 1945 #3)', () => {
  it('a 35 lb bar answer typed before the gym switched to kg is refused, nothing stored', async () => {
    const a = await gymWith('A', null);
    await setGymUnit(a.id, 'kg', db);
    await expect(setEquipmentWeight(a.id, 'ez_curl_bar', { kind: 'bar_weight', value: 35 }, db, 'lb')).rejects.toBeInstanceOf(UnitChangedError);
    const g = (await db.gyms.get(a.id))!;
    expect(g.bars.ez_curl).toBeNull();
    expect(g.equipmentWeights.ez_curl_bar).toBeUndefined();
    // The same answer typed in kg is saved.
    expect((await setEquipmentWeight(a.id, 'ez_curl_bar', { kind: 'bar_weight', value: 10 }, db, 'kg')).bars.ez_curl).toBe(10);
  });

  it('stack steps and starting weights too; a unit change resets every answer to unknown', async () => {
    const a = await gymWith('A', 0);
    await setEquipmentWeight(a.id, 'leg-press', { kind: 'starting_resistance', value: 50 }, db, 'lb');
    await setEquipmentWeight(a.id, 'cable_station', { kind: 'stack_step', value: 10 }, db, 'lb');
    const kg = await setGymUnit(a.id, 'kg', db);
    expect(kg.equipmentWeights).toEqual({});
    expect(kg.bars.smith).toBeNull();
    await expect(setEquipmentWeight(a.id, 'cable_station', { kind: 'stack_step', value: 10 }, db, 'lb')).rejects.toBeInstanceOf(UnitChangedError);
  });
});
