// Tester: C2, a replace restore and the coach tables.
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnyGymDB } from '../schema';
import { makeGym } from '../gyms';
import { closeCard, saveEffort } from '../coach';
import { exportBackup, restoreMerge, restoreReplace } from '../backup';

let db: AnyGymDB;
let name: string;
beforeEach(async () => {
  name = `v38-${Math.random()}`;
  db = new AnyGymDB(name);
  await db.open();
  await db.gyms.add(makeGym({ name: 'Home', type: 'full', unit: 'lb', isActive: true }, 1));
});
afterEach(async () => {
  db.close();
  await Dexie.delete(name);
});

describe('verify 3.8 C2', () => {
  it('replace clears all four coach tables; merge keeps them; a rejected backup changes nothing', async () => {
    const backup = await exportBackup(db, 1);
    await closeCard('missed:1', 'dismissed', db);
    await saveEffort('w0', 'barbell-back-squat', 'hard', db);
    await db.coachLifts.put({ key: 'k', exerciseId: 'e', learned: { estimate: null, rate: null, scale: 0.5, at: 1 } } as never);
    await db.coachChanges.put({ id: 'c', cardId: 'x', key: 'k', appliedAt: 1 } as never);
    const counts = async () => [await db.coachLifts.count(), await db.coachChanges.count(), await db.coachCards.count(), await db.efforts.count()];
    expect(await counts()).toEqual([1, 1, 1, 1]);
    await restoreMerge(backup, db);
    expect(await counts()).toEqual([1, 1, 1, 1]);
    const bad = { ...backup, tables: { ...(backup as unknown as { tables: object }).tables, sessions: [{ nonsense: true }] } };
    await expect(restoreReplace(bad as never, db)).rejects.toBeTruthy();
    expect(await counts()).toEqual([1, 1, 1, 1]);
    await restoreReplace(backup, db);
    expect(await counts()).toEqual([0, 0, 0, 0]);
  });
});
