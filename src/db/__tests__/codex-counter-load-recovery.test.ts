import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnyGymDB, SCHEMA_V1, SCHEMA_V2, SCHEMA_V3 } from '../schema';
import { makeGym } from '../gyms';
import { setEquipmentWeight } from '../equipment';
import type { Load, WorkoutSet } from '../types';
import { deleteSet, finishWorkout, logSet, restoreSet, setsOf, startWorkout } from '../workouts';
import { currentLoad } from '../../screens/workout/exerciseLoad';

let db: AnyGymDB;
let n = 0;
beforeEach(async () => {
  db = new AnyGymDB(`anygym-codex-counter-load-${n++}`);
  await db.open();
});
afterEach(async () => { await db.delete(); });

async function reopen() {
  const name = db.name;
  db.close();
  db = new AnyGymDB(name);
  await db.open();
}

const bar: Load = { kind: 'barbell', unit: 'lb', total: 135, barWeight: 45, perSide: [45] };
const input = (id: string, sessionId: string) => ({ id, sessionId, exerciseId: 'squat', reps: 10, load: bar });

describe('order counter and equipment recovery (built PLAN 1.3–1.10c)', () => {
  it('rolls back the order counter with a failed set insert, then retries once after reopen', async () => {
    const session = await startWorkout('synthetic-gym', db, 1000);
    const first = await logSet(input('first', session.id), db);
    const beforeCounter = await db.orderCounters.get(session.id);
    const beforeSession = await db.sessions.get(session.id);
    const fail = () => { throw new Error('synthetic set insert failure'); };
    db.sets.hook('creating', fail);
    try {
      await expect(logSet(input('retry', session.id), db)).rejects.toThrow('synthetic set insert failure');
    } finally {
      db.sets.hook('creating').unsubscribe(fail);
    }
    await reopen();
    expect(await db.orderCounters.get(session.id)).toEqual(beforeCounter);
    expect(await db.sessions.get(session.id)).toEqual(beforeSession);
    expect(await setsOf(session.id, db)).toEqual([first]);
    const retry = await logSet(input('retry', session.id), db);
    expect(retry.order).toBe(1);
    expect(await logSet(input('retry', session.id), db)).toEqual(retry);
    await reopen();
    expect(await db.orderCounters.get(session.id)).toEqual({ sessionId: session.id, next: 2 });
    expect(await setsOf(session.id, db)).toEqual([first, retry]);
  });

  it('keeps the counter when every set is deleted and reopened, and clears it only on empty Finish', async () => {
    const session = await startWorkout('synthetic-gym', db, 1000);
    const a = await logSet(input('a', session.id), db);
    const b = await logSet(input('b', session.id), db);
    await deleteSet(a.id, db);
    await deleteSet(b.id, db);
    await reopen();
    const c = await logSet(input('c', session.id), db);
    expect(c.order).toBe(2);
    await restoreSet(b, db);
    await reopen();
    expect(await setsOf(session.id, db)).toEqual([b, c]);
    await deleteSet(b.id, db);
    await deleteSet(c.id, db);
    expect(await finishWorkout(session.id, db, 2000)).toEqual({ saved: false });
    await reopen();
    expect(await db.sessions.get(session.id)).toBeUndefined();
    expect(await db.orderCounters.get(session.id)).toBeUndefined();
    expect(await setsOf(session.id, db)).toEqual([]);
  });

  // CODEX FOUND BUG: Deleting the newest v3 set before the first v4 log reuses its order, so Undo creates duplicate orders.
  it('upgrades a v3 workout then deletes, logs and undoes without reversing the original and new sets', async () => {
    const name = db.name;
    await db.delete();
    const old = new Dexie(name);
    old.version(1).stores(SCHEMA_V1);
    old.version(2).stores(SCHEMA_V2);
    old.version(3).stores(SCHEMA_V3);
    const original: WorkoutSet[] = ['z-first', 'z-last'].map((id, order) => ({
      ...input(id, 'legacy'), order, kind: 'work', uncertain: false,
    }));
    try {
      await old.open();
      await old.table('sessions').add({ id: 'legacy', gymId: 'synthetic-gym', startedAt: 1000, imported: false, exerciseIds: ['squat'] });
      await old.table('sets').bulkAdd(original);
    } finally {
      old.close();
    }
    db = new AnyGymDB(name);
    await db.open();
    expect(await setsOf('legacy', db)).toEqual(original);
    const removed = await deleteSet('z-last', db);
    const appended = await logSet(input('a-new', 'legacy'), db);
    await restoreSet(removed!, db);
    await reopen();
    const saved = await setsOf('legacy', db);
    expect(saved.map((s) => s.id)).toEqual(['z-first', 'z-last', 'a-new']);
    expect(new Set(saved.map((s) => s.order)).size).toBe(3);
    expect(appended.order).toBeGreaterThan(removed!.order);
  });

  it('reopens per-gym bar and machine answers and saves literal totals without mixing units or collars', async () => {
    const lb = makeGym({ name: 'Synthetic lb', type: 'full', unit: 'lb' }, 1000);
    const kg = { ...makeGym({ name: 'Synthetic kg', type: 'full', unit: 'kg' }, 1000), collars: 'competition' as const };
    await db.gyms.bulkAdd([lb, kg]);
    await setEquipmentWeight(lb.id, 'smith_machine', { kind: 'plates_only', value: 0 }, db);
    await setEquipmentWeight(kg.id, 'smith_machine', { kind: 'bar_weight', value: 15 }, db);
    await setEquipmentWeight(lb.id, 'leg-press', { kind: 'starting_resistance', value: 110 }, db);
    await setEquipmentWeight(kg.id, 'leg-press', { kind: 'starting_resistance', value: 35 }, db);
    await reopen();
    const pounds = (await db.gyms.get(lb.id))!;
    const kilos = (await db.gyms.get(kg.id))!;
    const cases: Array<{ gym: typeof lb; name: string; id: string; plates: number[]; expected: Load }> = [
      { gym: pounds, name: 'Smith Squat', id: 'smith-squat', plates: [45, 2.5], expected: { kind: 'barbell', unit: 'lb', total: 95, barWeight: 0, perSide: [45, 2.5], barId: 'smith', collars: 0 } },
      { gym: kilos, name: 'Smith Squat', id: 'smith-squat', plates: [20, 1.25], expected: { kind: 'barbell', unit: 'kg', total: 62.5, barWeight: 15, perSide: [20, 1.25], barId: 'smith', collars: 5 } },
      { gym: pounds, name: 'Leg Press', id: 'leg-press', plates: [45, 25], expected: { kind: 'plate_machine', unit: 'lb', total: 250, barWeight: 110, perSide: [45, 25], collars: 0 } },
      { gym: kilos, name: 'Leg Press', id: 'leg-press', plates: [20, 1.25], expected: { kind: 'plate_machine', unit: 'kg', total: 77.5, barWeight: 35, perSide: [20, 1.25], collars: 0 } },
    ];
    for (const [i, c] of cases.entries()) {
      const load = currentLoad(null, c.plates, c.expected.kind, c.gym, c.id, c.name);
      expect(load).toEqual(c.expected);
      const session = await startWorkout(c.gym.id, db, 2000 + i);
      await logSet({ id: `load-${i}`, sessionId: session.id, exerciseId: c.id, reps: 8, load: load! }, db);
      await finishWorkout(session.id, db, 3000 + i);
    }
    // Changing equipment later cannot rewrite any historical set's entered weight.
    await setEquipmentWeight(kg.id, 'smith_machine', { kind: 'bar_weight', value: 20 }, db);
    await setEquipmentWeight(lb.id, 'leg-press', { kind: 'plates_only', value: 0 }, db);
    await reopen();
    for (const [i, c] of cases.entries()) expect((await db.sets.get(`load-${i}`))!.load).toEqual(c.expected);
  });
});
