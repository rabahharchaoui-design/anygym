import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnyGymDB } from '../../../db/schema';
import { ANY_GYM } from '../../../db/types';
import type { Draft } from '../../../lib/drafts';
import { finishWorkout, logSet, setsOf, startWorkout } from '../../../db/workouts';
import { pickRest, pickRestOff, saveExerciseRest, saveExerciseRestOff } from '../../../db/exerciseSettings';
import { choosePlanUndoable, undoChoosePlan } from '../../../db/planState';
import { addExtraSet, extraSets, removeExtraSet, resetExtraSetsMemory } from '../../../lib/extraSets';
import { buildBackup, parseBackup, RECORD_CHECKS, serializeBackup, type BackupTables } from '../../../lib/backup';
import { dropSlot, insertSlot } from '../../../lib/setTable';
import { barbellLoad, totalLifted } from '../../../lib/load';
import { deletesFor, disposeDeletes } from '../sessionRecovery';

// PLAN 2.2d: rest timer Off per exercise, Remove set (rows and logged sets), Plan saved with Undo.

let name: string;
let db: AnyGymDB;
let n = 0;
beforeEach(async () => {
  name = `anygym-22d-${n++}`;
  db = new AnyGymDB(name);
  await db.open();
  resetExtraSetsMemory();
});
afterEach(async () => {
  db.close();
  await new AnyGymDB(name).delete();
});

// The gym of lib/__tests__/backup.test.ts.
const GYM = { id: 'g', name: 'Home', type: 'home', unit: 'kg', equipment: [], dumbbellRange: null, bars: { olympic: 45, womens: 35, ez_curl: null, trap: null, smith: 0 }, stackStep: 2.5, equipmentWeights: {}, plateInventory: [], collars: 'none', plateColors: 'color', isActive: true, createdAt: 1 };

const memoryKv = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};

describe('rest timer Off per exercise', () => {
  it('is an additive field on the every gym record; the rest time picked before is kept', async () => {
    await saveExerciseRest('bench', 120, db);
    await saveExerciseRestOff('bench', true, db);
    const list = await db.exerciseSettings.toArray();
    expect(pickRestOff(list, 'bench')).toBe(true);
    expect(pickRest(list, 'bench')).toBe(120);
    expect(await db.exerciseSettings.get(['bench', ANY_GYM])).toEqual({ exerciseId: 'bench', gymId: ANY_GYM, restSec: 120, restOff: true });
    // Back on: the field goes, 120 s is back.
    await saveExerciseRestOff('bench', false, db);
    const again = await db.exerciseSettings.toArray();
    expect(pickRestOff(again, 'bench')).toBe(false);
    expect(await db.exerciseSettings.get(['bench', ANY_GYM])).toEqual({ exerciseId: 'bench', gymId: ANY_GYM, restSec: 120 });
  });

  it('keeps a load type answer on the same record, and only that exercise is off', async () => {
    await db.exerciseSettings.put({ exerciseId: 'row', gymId: ANY_GYM, loadType: 'barbell' });
    await saveExerciseRestOff('row', true, db);
    const list = await db.exerciseSettings.toArray();
    expect(await db.exerciseSettings.get(['row', ANY_GYM])).toEqual({ exerciseId: 'row', gymId: ANY_GYM, loadType: 'barbell', restOff: true });
    expect(pickRestOff(list, 'bench')).toBe(false);
  });

  it('survives a backup', () => {
    expect(RECORD_CHECKS.exerciseSettings({ exerciseId: 'a', gymId: ANY_GYM, restOff: true })).toBe(true);
    expect(RECORD_CHECKS.exerciseSettings({ exerciseId: 'a', gymId: ANY_GYM, restOff: 'yes' })).toBe(false);
  });
});

describe('Remove set on a row still to do', () => {
  const d = (id: string): Draft => ({ id, load: null, reps: 8 }) as Draft;

  it('drops its slot (the rows below move up) and Undo puts the same draft back in place', () => {
    const slots = [d('a'), null, d('c'), d('d')];
    const dropped = dropSlot(slots, 2);
    expect(dropped.map((x) => x?.id ?? null)).toEqual(['a', null, 'd']);
    expect(insertSlot(dropped, 2, slots[2]!)).toEqual(slots);
    // An untouched row (no draft) comes back as one.
    expect(insertSlot(dropSlot(slots, 1), 1, null)).toEqual(slots);
    // Past the end (rows logged meanwhile): it goes last.
    expect(insertSlot([d('a')], 5, d('z')).map((x) => x?.id)).toEqual(['a', 'z']);
  });

  it('counts one row fewer per exercise (signed), and Undo counts it back to none', () => {
    const kv = memoryKv();
    expect(removeExtraSet('s1', 'squat', kv)).toBe(-1);
    expect(removeExtraSet('s1', 'squat', kv)).toBe(-2);
    expect(extraSets('s1', 'squat', kv)).toBe(-2);
    expect(addExtraSet('s1', 'squat', kv)).toBe(-1);
    expect(addExtraSet('s1', 'squat', kv)).toBe(0);
    // At none the key goes (no empty entry left behind).
    expect(JSON.parse(kv.getItem('anygym-extra-sets')!)).toEqual({ sessionId: 's1', extra: {} });
    expect(extraSets('s2', 'squat', kv)).toBe(0);
  });

  it('a removed planned row survives a backup of the live workout', () => {
    const t = {
      profile: [],
      gyms: [GYM],
      plans: [],
      planDays: [],
      sessions: [{ id: 's2', gymId: 'g', startedAt: 10, imported: false }],
      sets: [],
      runs: [],
      exerciseSettings: [],
      planState: [],
      orderCounters: [],
      submissions: [],
      tombstones: [],
      journal: [],
    } as unknown as BackupTables;
    const r = parseBackup(serializeBackup(buildBackup(t, {}, '1', 1, { extraSets: { sessionId: 's2', extra: { squat: -1, bench: 2 } } })));
    if (!r.ok) throw new Error(r.error);
    expect(r.backup.extraSets).toEqual({ sessionId: 's2', extra: { squat: -1, bench: 2 } });
  });
});

describe('Remove set on a logged set: delete with Undo, totals exact', () => {
  const b135 = barbellLoad(45, [45], 'none', 'lb')!;
  const b185 = barbellLoad(45, [45, 25], 'none', 'lb')!;

  it('the set goes, Undo writes back the same record (id and order), Finish counts exactly', async () => {
    const s = await startWorkout('g', db, 1);
    await logSet({ id: 'a', sessionId: s.id, exerciseId: 'squat', reps: 8, load: b135 }, db);
    await logSet({ id: 'b', sessionId: s.id, exerciseId: 'squat', reps: 7, load: b185 }, db);
    await logSet({ id: 'c', sessionId: s.id, exerciseId: 'squat', reps: 5, load: b185 }, db);
    const before = await setsOf(s.id, db);
    expect(totalLifted(before, 'lb')).toBe(8 * 135 + 7 * 185 + 5 * 185);

    const deletes = deletesFor(s.id, db);
    await deletes.remove(before[1]!);
    const gone = await setsOf(s.id, db);
    expect(gone.map((x) => x.id)).toEqual(['a', 'c']);
    expect(totalLifted(gone, 'lb')).toBe(8 * 135 + 5 * 185);

    const back = await deletes.undo('b');
    expect(back?.id).toBe('b');
    const after = await setsOf(s.id, db);
    expect(after).toEqual(before);
    expect(totalLifted(after, 'lb')).toBe(8 * 135 + 7 * 185 + 5 * 185);

    // Removed again and left deleted: Finish saves exactly the two that stay.
    await deletes.remove(after[0]!);
    await deletes.close();
    await finishWorkout(s.id, db, 99);
    const saved = await setsOf(s.id, db);
    expect(saved.map((x) => x.id)).toEqual(['b', 'c']);
    expect(totalLifted(saved, 'lb')).toBe(12 * 185);
    disposeDeletes(s.id);
  });
});

describe('Use this plan: Plan saved, with Undo', () => {
  it('Undo puts back the plan that was in use, exactly', async () => {
    const first = await choosePlanUndoable('five-day-split', db, 1);
    expect(first.changed).toBe(true);
    expect(first.previous).toBeUndefined();
    await db.planState.put({ ...first.state, nextDayIndex: 2, doneDays: [0, 1] });
    const old = await db.planState.get('active');
    const other = (await import('../../../data/plans')).PLANS.find((p) => p.id !== 'five-day-split')!;
    const second = await choosePlanUndoable(other.id, db, 2);
    expect(second.previous).toEqual(old);
    expect(await undoChoosePlan(second.state, second.previous, db)).toBe(true);
    expect(await db.planState.get('active')).toEqual(old);
  });

  it('Undo of the first plan leaves no plan; nothing to undo when it was already in use', async () => {
    const first = await choosePlanUndoable('five-day-split', db, 1);
    expect(await undoChoosePlan(first.state, first.previous, db)).toBe(true);
    expect(await db.planState.get('active')).toBeUndefined();
    await choosePlanUndoable('five-day-split', db, 1);
    expect((await choosePlanUndoable('five-day-split', db, 5)).changed).toBe(false);
  });

  it('never undoes over progress made since (saved data is sacred)', async () => {
    const first = await choosePlanUndoable('five-day-split', db, 1);
    await db.planState.put({ ...first.state, nextDayIndex: 1, doneDays: [0] });
    expect(await undoChoosePlan(first.state, first.previous, db)).toBe(false);
    expect((await db.planState.get('active'))?.doneDays).toEqual([0]);
  });
});
