import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { AnyGymDB } from '../schema';
import { ensureFirstGym } from '../bootstrap';
import { getProfile, redoAnswers, saveIntake } from '../intake';

// PLAN 3.3a: two goals are stored additively: intake.goals (Main first) beside intake.goal and
// profile.goal (the Main), so everything that read one goal still reads the Main.
let n = 0;
const names: string[] = [];
const fresh = async () => {
  const name = `anygym-intake-3.3a-${n++}`;
  names.push(name);
  const db = new AnyGymDB(name);
  await db.open();
  return db;
};
afterEach(async () => {
  while (names.length) await Dexie.delete(names.pop()!);
});

describe('saving two goals', () => {
  it('stores goals Main first, and the Main as goal on the answers and the profile', async () => {
    const db = await fresh();
    await ensureFirstGym(db);
    await saveIntake({ goal: 'strength', goals: ['strength', 'muscle'], units: { weight: 'kg', distance: 'km', measure: 'cm' } }, db, 1000);
    const p = (await getProfile(db))!;
    expect(p.goal).toBe('strength');
    expect(p.intake).toMatchObject({ goal: 'strength', goals: ['strength', 'muscle'] });
    // A redo starts from both, in order.
    expect(await redoAnswers({ distance: 'km', measure: 'cm' }, db)).toMatchObject({ goal: 'strength', goals: ['strength', 'muscle'] });
  });

  it('a profile saved before 3.3a (one goal) still loads and redoes', async () => {
    const db = await fresh();
    await ensureFirstGym(db);
    await db.profile.put({ id: 'me', createdAt: 1, defaultUnit: 'lb', goal: 'tone', intake: { goal: 'tone' }, intakeDoneAt: 1 });
    const a = await redoAnswers({ distance: 'mi', measure: 'in' }, db);
    expect(a.goal).toBe('tone');
    expect(a.goals).toBeUndefined();
  });
});
