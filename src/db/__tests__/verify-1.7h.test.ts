import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { AnyGymDB, SCHEMA_V1, SCHEMA_V2, SCHEMA_V3, SCHEMA_V4, SCHEMA_V5, SCHEMA_VERSION } from '../schema';
import type { Load } from '../types';
import { deleteSet, logSet, setsOf, startWorkout, finishWorkout } from '../workouts';
import { acceptUndo, recoverDeletes, undoDelete } from '../tombstones';
import { saveDraft, type Draft } from '../../lib/drafts';
import { createLogQueue } from '../../lib/logQueue';
import { committedOf, reconcileSession, rowsOf, submitRow, type Deps } from '../../screens/workout/rowLog';

let n = 0;
const names: string[] = [];
afterEach(async () => {
  while (names.length) await Dexie.delete(names.pop()!);
});
const fresh = () => {
  const name = `verify-17h-${n++}`;
  names.push(name);
  return name;
};
const bar: Load = { kind: 'barbell', unit: 'lb', total: 135, barWeight: 45, perSide: [45], barId: 'olympic' };

function phone() {
  const disk = new Map<string, string>();
  return () => ({
    getItem: (k: string) => disk.get(k) ?? null,
    setItem: (k: string, v: string) => void disk.set(k, v),
    removeItem: (k: string) => void disk.delete(k),
  });
}

describe('verify 1.7h: v5 data byte identical after opening v6', () => {
  it('every record unchanged', async () => {
    const name = fresh();
    const v5 = new Dexie(name);
    v5.version(1).stores(SCHEMA_V1);
    v5.version(2).stores(SCHEMA_V2);
    v5.version(3).stores(SCHEMA_V3);
    v5.version(4).stores(SCHEMA_V4);
    v5.version(5).stores(SCHEMA_V5);
    await v5.open();
    const sessions = [
      { id: 's1', gymId: 'g', startedAt: 1, endedAt: 9, imported: false },
      { id: 's2', gymId: 'g', startedAt: 10, imported: false, exerciseIds: ['squat'] },
    ];
    const sets = Array.from({ length: 30 }, (_, i) => ({
      id: `set-${i}`, sessionId: i < 15 ? 's1' : 's2', exerciseId: 'squat', order: i % 15, kind: 'work', reps: 5 + (i % 4),
      load: { ...bar, total: 100 + i * 5 }, uncertain: i === 7, note: i === 2 ? 'x' : undefined,
    }));
    const planState = { id: 'active', planId: 'five-day-split', dayIndex: 2, doneDays: [0, 1] };
    const exerciseSettings = [{ exerciseId: 'squat', gymId: '', loadType: 'barbell', barId: 'smith', unit: 'lb' }];
    const orderCounters = [{ sessionId: 's1', next: 15 }, { sessionId: 's2', next: 15 }];
    const upgrades = (await v5.tables.map((t) => t.name)).includes('upgrades');
    await v5.table('sessions').bulkAdd(sessions);
    await v5.table('sets').bulkAdd(sets);
    await v5.table('planState').add(planState);
    await v5.table('exerciseSettings').bulkAdd(exerciseSettings);
    await v5.table('orderCounters').bulkAdd(orderCounters);
    const before: Record<string, string> = {};
    for (const t of v5.tables) before[t.name] = JSON.stringify(await t.toArray());
    v5.close();
    expect(upgrades).toBe(false); // there is no `upgrades` table in v5; noted

    const db = new AnyGymDB(name);
    await db.open();
    expect(db.verno).toBe(SCHEMA_VERSION);
    for (const t of Object.keys(before)) expect(JSON.stringify(await db.table(t).toArray())).toBe(before[t]);
    expect(await db.submissions.count()).toBe(0);
    expect(await db.tombstones.count()).toBe(0);
    expect(db.tables.map((t) => t.name).sort()).toEqual([...Object.keys(before), 'submissions', 'tombstones', 'kv', 'journal', 'reportQueue', 'crashSignatures', 'reportPreferences'].sort());
    db.close();
  });
});

describe('verify 1.7h kill scenarios', () => {
  it('(a) commit then lost memory: exactly one set, next pending row right, no dup on later checks', async () => {
    const name = fresh();
    let db = new AnyGymDB(name);
    await db.open();
    const s = await startWorkout('g', db, 1);
    const mk = phone();
    const d1: Draft = { id: 'row-A', load: bar, plates: [45], reps: 8, rev: 3, submitted: 3 };
    const d2: Draft = { id: 'row-B', load: bar, plates: [45], reps: 12, rev: 1 };
    const st = mk();
    saveDraft(s.id, 'squat@0', d1, st);
    saveDraft(s.id, 'squat@1', d2, st);
    // the write commits, then the process dies before cleanup
    await logSet({ id: 'row-A', sessionId: s.id, exerciseId: 'squat', reps: 8, load: bar, rev: 3 }, db);
    db.close();
    db = new AnyGymDB(name);
    await db.open();
    const deps: Deps = { db, storage: mk(), queue: createLogQueue() };
    await reconcileSession(s.id, deps);
    const rows = rowsOf(s.id, 'squat', deps);
    expect(rows.map((r) => r?.id)).toEqual(['row-B']);
    expect(rows[0]?.reps).toBe(12);
    // re-submitting the same row (double tap / retry) never makes a second set
    await submitRow(s.id, 'squat', d1, deps);
    await reconcileSession(s.id, deps);
    await reconcileSession(s.id, deps);
    expect((await setsOf(s.id, db)).map((x) => x.id)).toEqual(['row-A']);
    expect((await committedOf(s.id, db)).get('row-A')).toBe(3);
    expect(rowsOf(s.id, 'squat', deps).map((r) => r?.id)).toEqual(['row-B']);
    db.close();
  });

  it('(b)+(c) delete, kill in window: stays deleted + undo offered; accept undo, kill: restored once, same id/order', async () => {
    const name = fresh();
    let db = new AnyGymDB(name);
    await db.open();
    const s = await startWorkout('g', db, 1);
    for (const id of ['a', 'b', 'c']) await logSet({ id, sessionId: s.id, exerciseId: 'squat', reps: 5, load: bar }, db);
    const before = await setsOf(s.id, db);
    await deleteSet('b', db, 1000);
    db.close();
    db = new AnyGymDB(name);
    await db.open();
    await recoverDeletes(s.id, db, 2000);
    expect((await setsOf(s.id, db)).map((x) => x.id)).toEqual(['a', 'c']);
    expect(await db.tombstones.get('b')).toBeTruthy(); // Undo still offered
    // accept undo, then kill before the restore lands
    expect(await acceptUndo('b', db)).toBe(true);
    db.close();
    db = new AnyGymDB(name);
    await db.open();
    await recoverDeletes(s.id, db, 3000);
    await recoverDeletes(s.id, db, 3001);
    expect(await setsOf(s.id, db)).toEqual(before);
    expect(await db.tombstones.count()).toBe(0);
    // undo via normal path after the fact is a no-op, not a duplicate
    await undoDelete('b', db);
    expect((await setsOf(s.id, db)).length).toBe(3);
    // new set after undo gets a fresh order
    const nw = await logSet({ id: 'd', sessionId: s.id, exerciseId: 'squat', reps: 5, load: bar }, db);
    expect(nw.order).toBeGreaterThan(Math.max(...before.map((x) => x.order)));
    // after Finish nothing more restores
    await finishWorkout(s.id, db);
    db.close();
  });
});
