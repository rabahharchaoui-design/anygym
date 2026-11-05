// PLAN 3.6: the time budget on a live workout. The plan JSON never changes, logged sets never move,
// an exercise with sets is never cut, Undo is exact, Finish counts the trimmed day, backups keep it.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RECORD_CHECKS } from '../../lib/backup';
import { dayWorkout } from '../../lib/planWorkout';
import { planById } from '../../data/plans';
import { profileFor } from '../../data/order';
import { trimDay } from '../../lib/timeBudget';
import { makeGym } from '../gyms';
import { AnyGymDB } from '../schema';
import { TrimStaleError, rememberBudget, setWorkoutTrim, undoWorkoutTrim } from '../timeBudget';
import type { Gym, Load } from '../types';
import { WorkoutFinishedError, finishWorkout, logSet, startPlanDay } from '../workouts';

const PLAN = 'five-day-split';
const split = planById(PLAN)!;
let db: AnyGymDB;
let n = 0;
let gym: Gym;
beforeEach(async () => {
  db = new AnyGymDB(`anygym-trim-${n++}`);
  await db.open();
  gym = makeGym({ name: 'Full', type: 'full', unit: 'lb', isActive: true });
  await db.gyms.add(gym);
});
afterEach(async () => {
  await db.delete();
});

const load: Load = { kind: 'barbell', unit: 'lb', total: 185, barWeight: 45, perSide: [45, 25] };
const session = async (id: string) => (await db.sessions.get(id))!;
const trim45 = (logged = {}) => trimDay(split.days[2]!, { budget: 45, profileOf: (id, name) => profileFor(id, name), logged }).trim!;

describe('setWorkoutTrim', () => {
  it('cuts for this workout only; the plan, the logged sets and the order of the rest stay; Undo is exact', async () => {
    const planBefore = JSON.stringify(split);
    const s = await startPlanDay(gym.id, PLAN, 2, db);
    await logSet({ id: 'a', sessionId: s.id, exerciseId: 'wide-grip-pull-up', reps: 8, load: { kind: 'bodyweight', unit: 'lb', total: 0 } as Load }, db);
    const t = trim45();
    const r = await setWorkoutTrim(s.id, 45, t, db);
    const after = await session(s.id);
    expect(after.trim).toEqual(t);
    expect(after.timeBudgetMin).toBe(45);
    for (const id of t.drop) expect(after.exerciseIds).not.toContain(id);
    expect(after.exerciseIds).toEqual(s.exerciseIds!.filter((id) => !t.drop.includes(id)));
    expect(await db.sets.count()).toBe(1);
    expect((await db.gyms.get(gym.id))!.timeBudgetMin).toBe(45);
    expect(JSON.stringify(split)).toBe(planBefore);
    expect(RECORD_CHECKS.sessions(after)).toBe(true);
    expect(RECORD_CHECKS.gyms((await db.gyms.get(gym.id))!)).toBe(true);

    await undoWorkoutTrim(s.id, r, db);
    const back = await session(s.id);
    expect(back.exerciseIds).toEqual(s.exerciseIds);
    expect(back.trim).toBeUndefined();
    expect(back.timeBudgetMin).toBeUndefined();
    expect((await db.gyms.get(gym.id))!.timeBudgetMin).toBeUndefined();
    expect(await db.sets.count()).toBe(1);
  });

  it('back to "75+": the cut exercises return at their plan place', async () => {
    const s = await startPlanDay(gym.id, PLAN, 2, db);
    await setWorkoutTrim(s.id, 45, trim45(), db);
    await setWorkoutTrim(s.id, 75, null, db);
    const back = await session(s.id);
    expect(back.exerciseIds).toEqual(s.exerciseIds);
    expect(back.trim).toBeUndefined();
    expect(back.timeBudgetMin).toBe(75);
  });

  it('refuses to cut an exercise that has a set; refuses a finished workout', async () => {
    const s = await startPlanDay(gym.id, PLAN, 2, db);
    await logSet({ id: 'w', sessionId: s.id, exerciseId: 'wrist-twist', reps: 10, load }, db);
    await expect(setWorkoutTrim(s.id, 45, trim45(), db)).rejects.toBeInstanceOf(TrimStaleError);
    expect((await session(s.id)).trim).toBeUndefined();
    // Computed with the logged set, the trim leaves it in.
    const t = trim45({ 'wrist-twist': 1 });
    expect(t.drop).not.toContain('wrist-twist');
    await setWorkoutTrim(s.id, 45, t, db);
    await finishWorkout(s.id, db);
    await expect(setWorkoutTrim(s.id, 30, t, db)).rejects.toBeInstanceOf(WorkoutFinishedError);
  });

  it('Finish counts the trimmed day: every kept exercise done is the whole day', async () => {
    const s = await startPlanDay(gym.id, PLAN, 2, db);
    const t = trimDay(split.days[2]!, { budget: 30, profileOf: (id, name) => profileFor(id, name) }).trim!;
    await setWorkoutTrim(s.id, 30, t, db);
    const trimmed = (await session(s.id)).exerciseIds!;
    const entries = dayWorkout(split, 2).filter((e) => trimmed.includes(e.exerciseId));
    let k = 0;
    for (const e of entries) for (let i = 0; i < (t.sets[e.exerciseId] ?? e.sets); i++) await logSet({ id: `s${k++}`, sessionId: s.id, exerciseId: e.exerciseId, reps: 10, load }, db);
    const res = await finishWorkout(s.id, db);
    expect(res.saved && res.progress?.complete).toBe(true);
  });

  it('rememberBudget keeps the last pick per gym', async () => {
    await rememberBudget(gym.id, 30, db);
    expect((await db.gyms.get(gym.id))!.timeBudgetMin).toBe(30);
  });
});
