import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { AnyGymDB, SCHEMA_V1, SCHEMA_V2, SCHEMA_V3, SCHEMA_V4, SCHEMA_V5, SCHEMA_V6, SCHEMA_V7, SCHEMA_V8, SCHEMA_V9 } from '../schema';
import { makeGym } from '../gyms';
import { ensureFirstGym } from '../bootstrap';
import { choosePlan } from '../planState';
import { getProfile, needsIntake, saveIntake, savedAnswers } from '../intake';
import { startWorkout } from '../workouts';
import { RECORD_CHECKS } from '../../lib/backup';
import { EQUIPMENT_IDS } from '../types';
import type { IntakeAnswers } from '../../lib/intake/funnel';

let n = 0;
const names: string[] = [];
const fresh = async () => {
  const name = `anygym-intake-${n++}`;
  names.push(name);
  const db = new AnyGymDB(name);
  await db.open();
  return db;
};
afterEach(async () => {
  while (names.length) await Dexie.delete(names.pop()!);
});

const answers: IntakeAnswers = {
  goal: 'muscle',
  units: { weight: 'kg', distance: 'km', measure: 'cm', body: 'female' },
  experience: '3y',
  days: 4,
  place: 'hotel',
  equipment: ['dumbbells', 'adjustable_bench', 'cable_station'],
  name: 'Sam',
  bodyweight: { value: 72.5, unit: 'kg' },
  height: { unit: 'cm', cm: 180 },
  skipped: ['age'],
};

describe('who sees the intake (PLAN 3.3)', () => {
  it('a brand new phone (only the first gym) needs it', async () => {
    const db = await fresh();
    await ensureFirstGym(db);
    expect(await needsIntake(db)).toBe(true);
  });

  it('an existing user never does: a profile, a workout, or a plan in use', async () => {
    const a = await fresh();
    await a.profile.add({ id: 'me', defaultUnit: 'lb', createdAt: 1 });
    expect(await needsIntake(a)).toBe(false);
    const b = await fresh();
    const gym = await ensureFirstGym(b);
    await startWorkout(gym.id, b);
    expect(await needsIntake(b)).toBe(false);
    const c = await fresh();
    await choosePlan('five-day-split', c);
    expect(await needsIntake(c)).toBe(false);
  });

  it('after saving, the profile says done and the funnel never opens on its own again', async () => {
    const db = await fresh();
    await ensureFirstGym(db);
    const p = await saveIntake(answers, db, 5000);
    expect(p.intakeDoneAt).toBe(5000);
    expect(await needsIntake(db)).toBe(false);
    expect(await savedAnswers(db)).toEqual(answers);
  });
});

describe('saveIntake', () => {
  it('saves every answer on the profile and sets up the unused first gym', async () => {
    const db = await fresh();
    const first = await ensureFirstGym(db);
    expect(first.unit).toBe('lb');
    await saveIntake(answers, db, 5000);
    const p = (await getProfile(db))!;
    expect(p).toMatchObject({ id: 'me', name: 'Sam', goal: 'muscle', level: '3y', daysPerWeek: 4, defaultUnit: 'kg', distanceUnit: 'km', measureUnit: 'cm', intakeDoneAt: 5000, intake: answers });
    expect(RECORD_CHECKS.profile(p)).toBe(true);
    const gym = (await db.gyms.get(first.id))!;
    expect(gym).toMatchObject({ unit: 'kg', type: 'hotel', name: 'Hotel gym', equipment: answers.equipment, dumbbellRange: { min: 2, max: 24, step: 2 }, isActive: true, createdAt: first.createdAt });
  });

  it('keeps every other profile field (backup marks) and never renames a gym the user named', async () => {
    const db = await fresh();
    await db.gyms.add(makeGym({ name: 'Garage', type: 'full', unit: 'lb', isActive: true }, 10));
    await db.profile.add({ id: 'old', defaultUnit: 'lb', createdAt: 1, lastBackupAt: 99, backedUpSessionIds: ['x'] });
    await saveIntake({ place: 'home', equipment: [] }, db, 7000);
    const p = (await getProfile(db))!;
    expect(p).toMatchObject({ id: 'old', lastBackupAt: 99, backedUpSessionIds: ['x'], defaultUnit: 'lb', intakeDoneAt: 7000 });
    expect(await db.profile.count()).toBe(1);
    const gym = (await db.gyms.toArray())[0]!;
    expect(gym).toMatchObject({ name: 'Garage', type: 'home', equipment: [], dumbbellRange: null, unit: 'lb' });
  });

  it('a gym with workouts keeps its equipment; only the unit changes, as Settings would', async () => {
    const db = await fresh();
    const gym = await ensureFirstGym(db);
    await startWorkout(gym.id, db);
    await saveIntake({ ...answers, place: 'outdoors', equipment: [] }, db);
    const after = (await db.gyms.get(gym.id))!;
    expect(after.equipment).toEqual([...EQUIPMENT_IDS]);
    expect(after.type).toBe('full');
    expect(after.unit).toBe('kg');
    expect(after.bars.olympic).toBe(20);
  });

  it('drops invalid answers instead of storing them', async () => {
    const db = await fresh();
    await ensureFirstGym(db);
    await saveIntake({ goal: 'fly' as never, days: 9 as never, name: 'Al' }, db);
    expect((await getProfile(db))!.intake).toEqual({ name: 'Al' });
  });
});

describe('saved data is sacred: a v9 profile opens and reads the same', () => {
  it('a profile written before PLAN 3.3 is untouched and still valid', async () => {
    const name = `anygym-intake-mig-${n++}`;
    names.push(name);
    const old = new Dexie(name);
    old.version(1).stores(SCHEMA_V1);
    old.version(2).stores(SCHEMA_V2);
    old.version(3).stores(SCHEMA_V3);
    old.version(4).stores(SCHEMA_V4);
    old.version(5).stores(SCHEMA_V5);
    old.version(6).stores(SCHEMA_V6);
    old.version(7).stores(SCHEMA_V7);
    old.version(8).stores(SCHEMA_V8);
    old.version(9).stores(SCHEMA_V9);
    await old.open();
    const row = { id: 'me', defaultUnit: 'kg', createdAt: 1, name: 'Old', goal: 'muscle', lastBackupAt: 5 };
    await old.table('profile').add(row);
    old.close();
    const db = new AnyGymDB(name);
    await db.open();
    expect(await db.profile.toArray()).toEqual([row]);
    expect(RECORD_CHECKS.profile(row)).toBe(true);
    expect(await needsIntake(db)).toBe(false);
    expect(await savedAnswers(db)).toBeUndefined();
    // Saving later merges: the old fields stay.
    await saveIntake({ goal: 'strength' }, db, 9);
    expect(await getProfile(db)).toMatchObject({ id: 'me', name: 'Old', goal: 'strength', lastBackupAt: 5, intakeDoneAt: 9 });
  });

  it('backup checks reject a malformed intake field', () => {
    expect(RECORD_CHECKS.profile({ id: 'me', defaultUnit: 'kg', createdAt: 1, intake: 'x' })).toBe(false);
    expect(RECORD_CHECKS.profile({ id: 'me', defaultUnit: 'kg', createdAt: 1, distanceUnit: 'yd' })).toBe(false);
  });
});
