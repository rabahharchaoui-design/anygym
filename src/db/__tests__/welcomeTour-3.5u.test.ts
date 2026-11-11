import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { AnyGymDB } from '../schema';
import { ensureFirstGym } from '../bootstrap';
import { getProfile, redoAnswers, saveIntake } from '../intake';
import { armWelcomeTour, finishWelcomeTour } from '../welcomeTour';

// PLAN 3.5u: the welcome's one flag on the profile row.
let n = 0;
const names: string[] = [];
const fresh = async () => {
  const name = `anygym-tour-3.5u-${n++}`;
  names.push(name);
  const db = new AnyGymDB(name);
  await db.open();
  return db;
};
afterEach(async () => {
  while (names.length) await Dexie.delete(names.pop()!);
});

describe('the welcome tour flag', () => {
  it('arms after a first intake, finishes once, and never arms again', async () => {
    const db = await fresh();
    await ensureFirstGym(db);
    await saveIntake({ goal: 'muscle' }, db, 1000);
    expect((await getProfile(db))!.welcomeTour).toBeUndefined();
    await armWelcomeTour(db);
    expect((await getProfile(db))!.welcomeTour).toBe('pending');
    // Saving the answers again (a redo) keeps the flag as it is.
    await saveIntake({ goal: 'strength' }, db, 2000);
    expect((await getProfile(db))!.welcomeTour).toBe('pending');
    await finishWelcomeTour(db);
    expect((await getProfile(db))!.welcomeTour).toBe('done');
    await armWelcomeTour(db);
    expect((await getProfile(db))!.welcomeTour).toBe('done');
    await saveIntake({ goal: 'tone' }, db, 3000);
    expect((await getProfile(db))!.welcomeTour).toBe('done');
  });

  it('someone from before 3.5u has no flag, and finishing does not make one', async () => {
    const db = await fresh();
    await ensureFirstGym(db);
    await db.profile.put({ id: 'me', createdAt: 1, defaultUnit: 'lb', intakeDoneAt: 1, intake: { goal: 'tone' } });
    await finishWelcomeTour(db);
    expect((await getProfile(db))!.welcomeTour).toBeUndefined();
    // No profile at all: nothing to arm.
    const empty = await fresh();
    await armWelcomeTour(empty);
    expect(await getProfile(empty)).toBeUndefined();
  });

  it('older saved answers to the hidden questions still load for a redo and survive saving it', async () => {
    const db = await fresh();
    await ensureFirstGym(db);
    await db.profile.put({ id: 'me', createdAt: 1, defaultUnit: 'kg', intakeDoneAt: 1, intake: { goal: 'muscle', when: 'early', bodyweight: { value: 80, unit: 'kg' } } });
    const a = await redoAnswers({ distance: 'km', measure: 'cm' }, db);
    expect(a.when).toBe('early');
    expect(a.bodyweight).toEqual({ value: 80, unit: 'kg' });
    await saveIntake({ ...a, goal: 'strength' }, db, 5000);
    expect((await getProfile(db))!.intake).toMatchObject({ goal: 'strength', when: 'early', bodyweight: { value: 80, unit: 'kg' } });
  });
});
