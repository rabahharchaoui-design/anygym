// PLAN 3.6w (2): a lighter week on a stack with an add-on stores the target as pin + add-on; apply,
// reopen and Undo keep it; an old target with no add-on field reads exactly as before.
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnyGymDB } from '../schema';
import { applyChanges, coachTargets, undoChange } from '../coach';
import type { PlannedChange } from '../../lib/coach';

let db: AnyGymDB;
let name: string;
beforeEach(async () => {
  name = `coach-addon-${Math.random()}`;
  db = new AnyGymDB(name);
  await db.open();
});
afterEach(async () => {
  db.close();
  await Dexie.delete(name);
});

const KEY = 'lat-pulldown|g1|stack';
const lighter: PlannedChange = { key: KEY, exerciseId: 'lat-pulldown', name: 'Lat pulldown', loadKind: 'stack', unit: 'lb', from: 100, fromTotal: 150, to: 85, toAdded: 50, reason: '−15 lb this week: a lighter week', source: 'deload', until: 99, reps: 'low' };

describe('stack add-on targets', () => {
  it('apply stores the add-on, a reopen reads it back, Undo puts the old target back', async () => {
    const old = { value: 100, unit: 'lb' as const, loadKind: 'stack' as const, reason: 'Keep going', source: 'level_up' as const, setAt: 1 };
    await db.coachLifts.put({ key: KEY, exerciseId: 'lat-pulldown', target: old, updatedAt: 1 });
    const applied = await applyChanges('deload:x', 'x', [lighter], db, 5);
    expect(applied.records[0]).toMatchObject({ to: 85, toAdded: 50, prevTarget: old });
    db.close();
    db = new AnyGymDB(name);
    await db.open();
    expect((await coachTargets(db)).get(KEY)).toEqual({ value: 85, added: 50, unit: 'lb', loadKind: 'stack', reason: lighter.reason, source: 'deload', setAt: 5, until: 99, reps: 'low' });
    await undoChange(applied.records[0]!.id, db, 6);
    // The old target, stored before 3.6w with no add-on field, comes back exactly as it was.
    expect((await coachTargets(db)).get(KEY)).toEqual(old);
  });

  it('Undo never replaces a newer target with the same pin but another add-on', async () => {
    const applied = await applyChanges('deload:x', 'x', [lighter], db, 5);
    const newer = { value: 85, added: 25, unit: 'lb' as const, loadKind: 'stack' as const, reason: 'set by hand', source: 'deload' as const, setAt: 5 };
    await db.coachLifts.put({ key: KEY, exerciseId: 'lat-pulldown', target: newer, updatedAt: 6 });
    await undoChange(applied.records[0]!.id, db, 7);
    expect((await coachTargets(db)).get(KEY)).toEqual(newer);
  });

  it('a change without an add-on stores no added field (old shape)', async () => {
    await applyChanges('deload:y', 'y', [{ ...lighter, to: 135, toAdded: undefined }], db, 5);
    const t = (await coachTargets(db)).get(KEY)!;
    expect(t.value).toBe(135);
    expect('added' in t).toBe(false);
  });
});
