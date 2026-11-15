// PLAN 3.6w (4): saved data is never rewritten by the horns model. Old plate machine sets (no
// `horns`, total = start + 2 × plates) read back exactly after a reopen and a backup round trip,
// and a one horn snapshot survives the same trip unchanged.
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnyGymDB } from '../schema';
import { makeGym } from '../gyms';
import { exportBackup, restoreReplace } from '../backup';
import { finishWorkout, logSet, setsOf, startWorkout } from '../workouts';
import { parseBackup } from '../../lib/backup';
import { otherOf, plateMachineLoad } from '../../lib/load';
import type { Load } from '../types';

const names: string[] = [];
let db: AnyGymDB;
const open = async (name: string) => {
  names.push(name);
  const d = new AnyGymDB(name);
  await d.open();
  return d;
};
beforeEach(async () => {
  db = await open(`horns-${Math.random()}`);
  await db.gyms.add(makeGym({ name: 'Home', type: 'full', unit: 'lb', isActive: true }, 1));
});
afterEach(async () => {
  db.close();
  for (const n of names.splice(0)) await Dexie.delete(n);
});

// Shaped like every plate machine load saved before 3.6w.
const old: Load = { kind: 'plate_machine', unit: 'lb', total: 140, barWeight: 50, perSide: [45], collars: 0 };

describe('horns and saved data', () => {
  it('old sets keep their totals through a reopen and a backup round trip; a one horn set too', async () => {
    const gym = (await db.gyms.toArray())[0]!;
    const s = await startWorkout(gym.id, db, 1000);
    await logSet({ id: 'old', sessionId: s.id, exerciseId: 'machine-seated-calf-raise', reps: 10, load: old }, db);
    const single = plateMachineLoad(0, [45], 'lb', undefined, 1)!;
    await logSet({ id: 'one', sessionId: s.id, exerciseId: 'machine-seated-calf-raise', reps: 10, load: single }, db);
    await finishWorkout(s.id, db, 2000);
    const before = await setsOf(s.id, db);
    expect(before.map((x) => x.load)).toEqual([old, { ...single }]);
    expect(before[1]!.load).toMatchObject({ total: 45, horns: 1 });

    const name = db.name;
    db.close();
    db = await open(name);
    expect(await setsOf(s.id, db)).toEqual(before);
    expect(otherOf((await setsOf(s.id, db))[0]!.load!)).toBe(0);

    const parsed = parseBackup(JSON.stringify(await exportBackup(db, 3000)));
    expect(parsed.ok).toBe(true);
    const fresh = await open(`horns-restore-${Math.random()}`);
    await restoreReplace((parsed as { ok: true; backup: never }).backup, fresh);
    expect(await setsOf(s.id, fresh)).toEqual(before);
    fresh.close();
  });
});
