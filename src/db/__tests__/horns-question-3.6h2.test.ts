// PLAN 3.6h2 (1): the answer is stored per gym and plate machine (Gym.machineHorns, optional), old
// gyms read as not answered, backups old and new restore, and saved sets never change.
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnyGymDB } from '../schema';
import { machineHornsFor, makeGym } from '../gyms';
import { setEquipmentWeight, setGymUnit, setMachineHorns } from '../equipment';
import { exportBackup, restoreReplace } from '../backup';
import { finishWorkout, logSet, setsOf, startWorkout } from '../workouts';
import { parseBackup } from '../../lib/backup';
import { RECORD_CHECKS } from '../../lib/backupChecks';
import type { Gym, Load } from '../types';
import { currentLoad, loadSetupFor, machineHorns, machineHornsKnown } from '../../screens/workout/exerciseLoad';

const names: string[] = [];
let db: AnyGymDB;
let gym: Gym;
const open = async (name: string) => {
  names.push(name);
  const d = new AnyGymDB(name);
  await d.open();
  return d;
};
beforeEach(async () => {
  db = await open(`horns-q-${Math.random()}`);
  gym = makeGym({ name: 'Home', type: 'full', unit: 'lb', isActive: true }, 1);
  await db.gyms.add(gym);
});
afterEach(async () => {
  db.close();
  for (const n of names.splice(0)) await Dexie.delete(n);
});

const CALF = 'machine-seated-calf-raise';
const CALF_NAME = 'Machine Seated Calf Raise';
const old: Load = { kind: 'plate_machine', unit: 'lb', total: 140, barWeight: 50, perSide: [45], collars: 0 };

describe('the stored answer', () => {
  it('an old gym has no answer; a leg press sled is sure (two); the answer wins and is per machine', async () => {
    expect('machineHorns' in gym).toBe(false);
    expect(machineHornsFor(gym, CALF)).toBeNull();
    expect(machineHornsKnown(gym, CALF, CALF_NAME)).toBeNull();
    expect(machineHorns(gym, CALF, CALF_NAME)).toBe(2);
    expect(machineHornsKnown(gym, 'leg-press-machine-calf-raise', 'Leg Press Machine Calf Raise')).toBe(2);
    const g = await setMachineHorns(gym.id, CALF, 1, db);
    expect(g.machineHorns).toEqual({ [CALF]: 1 });
    expect((await db.gyms.get(gym.id))!.machineHorns).toEqual({ [CALF]: 1 });
    expect(machineHornsKnown(g, CALF, CALF_NAME)).toBe(1);
    expect(machineHornsFor(g, 'other')).toBeNull();
    expect(machineHornsFor(g, 'other', 2)).toBe(2);
    expect((await setMachineHorns(gym.id, CALF, 2, db)).machineHorns).toEqual({ [CALF]: 2 });
  });

  it('a start weight answer and a unit change keep it; bad input and a missing gym are refused', async () => {
    await setMachineHorns(gym.id, CALF, 1, db);
    expect((await setEquipmentWeight(gym.id, CALF, { kind: 'starting_resistance', value: 25 }, db)).machineHorns).toEqual({ [CALF]: 1 });
    expect((await setGymUnit(gym.id, 'kg', db)).machineHorns).toEqual({ [CALF]: 1 });
    await expect(setMachineHorns(gym.id, '', 1, db)).rejects.toThrow('Invalid machine sides');
    await expect(setMachineHorns(gym.id, CALF, 3 as 1, db)).rejects.toThrow('Invalid machine sides');
    await expect(setMachineHorns('nope', CALF, 1, db)).rejects.toThrow('Gym not found');
  });

  it('the setup and the card count the plates once after "one side": start + plates', async () => {
    const answered = { ...(await setEquipmentWeight(gym.id, CALF, { kind: 'starting_resistance', value: 50 }, db)) };
    // Not answered yet: no total at all (PLAN 3.7a), never both sides by default.
    expect(currentLoad(null, [45], 'plate_machine', answered, CALF, CALF_NAME)).toBeNull();
    expect('horns' in loadSetupFor(answered, 'plate_machine', CALF, CALF_NAME)).toBe(false);
    const one = await setMachineHorns(gym.id, CALF, 1, db);
    expect(currentLoad(null, [45], 'plate_machine', one, CALF, CALF_NAME)).toEqual({ kind: 'plate_machine', unit: 'lb', total: 95, barWeight: 50, perSide: [45], collars: 0, horns: 1 });
    expect(loadSetupFor(one, 'plate_machine', CALF, CALF_NAME).horns).toBe(1);
    expect('horns' in loadSetupFor(one, 'stack', CALF, CALF_NAME)).toBe(false);
  });
});

describe('saved data across the answer', () => {
  it('a set logged before the answer keeps its 140 lb total and its own snapshot', async () => {
    const s = await startWorkout(gym.id, db, 1000);
    await logSet({ id: 'old', sessionId: s.id, exerciseId: CALF, reps: 10, load: old }, db);
    await finishWorkout(s.id, db, 2000);
    const before = await setsOf(s.id, db);
    await setMachineHorns(gym.id, CALF, 1, db);
    expect(await setsOf(s.id, db)).toEqual(before);
    expect(before[0]!.load).toEqual(old);
  });

  it('backups: an old gym without the field and a gym with answers both restore; a bad answer is refused', async () => {
    expect(RECORD_CHECKS.gyms(gym)).toBe(true);
    expect(RECORD_CHECKS.gyms({ ...gym, machineHorns: { [CALF]: 1, leg_press: 2 } })).toBe(true);
    expect(RECORD_CHECKS.gyms({ ...gym, machineHorns: { [CALF]: 3 } })).toBe(false);
    await setMachineHorns(gym.id, CALF, 1, db);
    const parsed = parseBackup(JSON.stringify(await exportBackup(db, 3000)));
    expect(parsed.ok).toBe(true);
    const fresh = await open(`horns-q-restore-${Math.random()}`);
    await restoreReplace((parsed as { ok: true; backup: never }).backup, fresh);
    expect((await fresh.gyms.get(gym.id))!.machineHorns).toEqual({ [CALF]: 1 });
    fresh.close();
  });
});
