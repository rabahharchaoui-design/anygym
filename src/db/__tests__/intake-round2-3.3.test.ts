import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnyGymDB } from '../schema';
import { makeGym } from '../gyms';
import { ensureFirstGym } from '../bootstrap';
import { setEquipmentWeight, setGymUnit } from '../equipment';
import { choosePlan } from '../planState';
import { clearIntakeDraft, getProfile, INTAKE_DRAFT_KEY, intakeDraftHere, intakeToResume, redoAnswers, saveIntake } from '../intake';
import { startWorkout } from '../workouts';
import type { IntakeAnswers } from '../../lib/intake/funnel';

// PLAN 3.3 round 2, Codex review: a redo never rewrites a gym it was not asked to change.

let n = 0;
const names: string[] = [];
const fresh = async () => {
  const name = `anygym-intake-r2-${n++}`;
  names.push(name);
  const db = new AnyGymDB(name);
  await db.open();
  return db;
};
afterEach(async () => {
  while (names.length) await Dexie.delete(names.pop()!);
});

const FALLBACK = { distance: 'km', measure: 'cm', body: 'female' } as const;
const first: IntakeAnswers = { goal: 'muscle', units: { weight: 'lb', distance: 'mi', measure: 'in', body: 'male' }, place: 'full' };

describe('item 1: a redo never resets the gym units', () => {
  it('hydrates from the active gym and the body preference, never the old answer', async () => {
    const db = await fresh();
    const gym = await ensureFirstGym(db);
    await saveIntake(first, db);
    await setGymUnit(gym.id, 'kg', db);
    const a = await redoAnswers(FALLBACK, db);
    expect(a.units).toEqual({ weight: 'kg', distance: 'mi', measure: 'in', body: 'female' });
  });

  it('Settings changed the unit after the intake: a redo left alone keeps plates, bars and machine answers', async () => {
    const db = await fresh();
    const gym = await ensureFirstGym(db);
    await saveIntake(first, db);
    await setGymUnit(gym.id, 'kg', db);
    await setEquipmentWeight(gym.id, 'leg_press', { kind: 'starting_resistance', value: 50 }, db, 'kg');
    await db.gyms.update(gym.id, { plateInventory: [{ weight: 20, enabled: true }] });
    const before = await db.gyms.get(gym.id);
    const start = await redoAnswers(FALLBACK, db);
    await saveIntake(start, db, 2, { start });
    expect(await db.gyms.get(gym.id)).toEqual(before);
    expect((await getProfile(db))!.defaultUnit).toBe('kg');
  });

  it('a stale answer never reaches another gym the user switched to', async () => {
    const db = await fresh();
    const a = await ensureFirstGym(db);
    await saveIntake(first, db);
    const other = makeGym({ name: 'Japan', type: 'hotel', unit: 'kg', isActive: true }, 99);
    await db.gyms.update(a.id, { isActive: false });
    await db.gyms.add(other);
    const start = await redoAnswers(FALLBACK, db);
    await saveIntake(start, db, 2, { start });
    expect(await db.gyms.get(other.id)).toEqual(other);
  });

  it('changing the toggle during the redo goes through the Settings path, once; going back to it undoes it', async () => {
    const db = await fresh();
    const gym = await ensureFirstGym(db);
    await saveIntake(first, db);
    const start = await redoAnswers(FALLBACK, db);
    const kg: IntakeAnswers = { ...start, units: { ...start.units!, weight: 'kg' } };
    await saveIntake(kg, db, 2, { start });
    const after = (await db.gyms.get(gym.id))!;
    expect(after.unit).toBe('kg');
    expect(after.bars.olympic).toBe(20);
    expect(after.plateInventory.some((p) => p.weight === 25)).toBe(true);
    // Back from the reveal to lb: compared with what was just saved.
    await saveIntake(start, db, 3, { start: kg });
    expect((await db.gyms.get(gym.id))!.unit).toBe('lb');
  });

  it('a first intake still sets up the unused first gym; a gym with workouts keeps its unit unless asked', async () => {
    const db = await fresh();
    const gym = await ensureFirstGym(db);
    await startWorkout(gym.id, db);
    await saveIntake({ units: { weight: 'kg', distance: 'km', measure: 'cm', body: 'male' } }, db);
    expect((await db.gyms.get(gym.id))!.unit).toBe('lb');
  });

  it('a draft resumed after the first save compares with the saved answers', async () => {
    const db = await fresh();
    const gym = await ensureFirstGym(db);
    await saveIntake(first, db);
    await saveIntake({ ...first, units: { ...first.units!, weight: 'kg' } }, db, 2);
    expect((await db.gyms.get(gym.id))!.unit).toBe('kg');
  });
});

describe('item 3: never an invented dumbbell range', () => {
  const home = (extra: IntakeAnswers = {}): IntakeAnswers => ({ units: first.units, place: 'home', equipment: ['dumbbells'], ...extra });

  it('home or outdoors with Dumbbells and no answered range stores none, never the hotel range', async () => {
    for (const place of ['home', 'outdoors'] as const) {
      const db = await fresh();
      const gym = await ensureFirstGym(db);
      await saveIntake(home({ place }), db);
      expect((await db.gyms.get(gym.id))!.dumbbellRange).toBeNull();
    }
  });

  it('the range the user typed is what is stored, and a bad one is dropped', async () => {
    const db = await fresh();
    const gym = await ensureFirstGym(db);
    await saveIntake(home({ dumbbellRange: { min: 10, max: 40, step: 10 } }), db);
    expect((await db.gyms.get(gym.id))!.dumbbellRange).toEqual({ min: 10, max: 40, step: 10 });
    expect((await getProfile(db))!.intake!.dumbbellRange).toEqual({ min: 10, max: 40, step: 10 });
    const b = await fresh();
    const g2 = await ensureFirstGym(b);
    await saveIntake(home({ dumbbellRange: { min: 40, max: 10, step: 10 } }), b);
    expect((await b.gyms.get(g2.id))!.dumbbellRange).toBeNull();
  });

  it('the SPEC 3 presets still apply: hotel and full', async () => {
    const db = await fresh();
    const gym = await ensureFirstGym(db);
    await saveIntake({ units: first.units, place: 'hotel', equipment: ['dumbbells'] }, db);
    expect((await db.gyms.get(gym.id))!.dumbbellRange).toEqual({ min: 5, max: 50, step: 5 });
  });

  it('a redo preserves a custom range: unchanged, or when only other equipment changed', async () => {
    const db = await fresh();
    const gym = await ensureFirstGym(db);
    await saveIntake({ units: first.units, place: 'hotel', equipment: ['dumbbells'] }, db);
    const custom = { min: 7.5, max: 32.5, step: 2.5 };
    await db.gyms.update(gym.id, { dumbbellRange: custom });
    const start = await redoAnswers(FALLBACK, db);
    await saveIntake(start, db, 2, { start });
    expect((await db.gyms.get(gym.id))!.dumbbellRange).toEqual(custom);
    await saveIntake({ ...start, equipment: ['dumbbells', 'treadmill'] }, db, 3, { start });
    const after = (await db.gyms.get(gym.id))!;
    expect(after.equipment).toEqual(['dumbbells', 'treadmill']);
    expect(after.dumbbellRange).toEqual(custom);
  });

  it('redo hydrates a home gym custom range into the question', async () => {
    const db = await fresh();
    const gym = await ensureFirstGym(db);
    await saveIntake(home({ dumbbellRange: { min: 10, max: 40, step: 10 } }), db);
    await db.gyms.update(gym.id, { dumbbellRange: { min: 5, max: 25, step: 5 } });
    expect((await redoAnswers(FALLBACK, db)).dumbbellRange).toEqual({ min: 5, max: 25, step: 5 });
  });
});

describe('item 4: a skipped name', () => {
  it('skipping Name on a redo deletes the stored name', async () => {
    const db = await fresh();
    await ensureFirstGym(db);
    await saveIntake({ name: 'Sam' }, db);
    expect((await getProfile(db))!.name).toBe('Sam');
    await saveIntake({ skipped: ['name'] }, db, 2);
    const p = (await getProfile(db))!;
    expect(p.name).toBeUndefined();
    expect('name' in p).toBe(false);
    expect(p.intake!.name).toBeUndefined();
  });

  it('a name set before the intake stays when the screen was not skipped', async () => {
    const db = await fresh();
    await db.profile.add({ id: 'me', defaultUnit: 'lb', createdAt: 1, name: 'Old' });
    await saveIntake({ goal: 'muscle' }, db, 2);
    expect((await getProfile(db))!.name).toBe('Old');
  });
});

describe('a funnel left unfinished comes back (round 3)', () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('saving keeps the draft; with nothing started the funnel resumes', async () => {
    const db = await fresh();
    await ensureFirstGym(db);
    store.set(INTAKE_DRAFT_KEY, '{"step":"reveal","answers":{}}');
    await saveIntake(first, db);
    expect(intakeDraftHere()).toBe(true);
    expect(await intakeToResume(db)).toBe(true);
    clearIntakeDraft();
    expect(await intakeToResume(db)).toBe(false);
  });

  it('with a plan or a workout a leftover draft is cleared and never pulls the user back', async () => {
    const a = await fresh();
    await choosePlan('five-day-split', a);
    store.set(INTAKE_DRAFT_KEY, '{"step":"reveal","answers":{}}');
    expect(await intakeToResume(a)).toBe(false);
    expect(intakeDraftHere()).toBe(false);
    const b = await fresh();
    const gym = await ensureFirstGym(b);
    await startWorkout(gym.id, b);
    store.set(INTAKE_DRAFT_KEY, '{"step":"goal","answers":{}}');
    expect(await intakeToResume(b)).toBe(false);
    expect(intakeDraftHere()).toBe(false);
  });
});
