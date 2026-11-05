// PLAN 3.4: swapping inside a live workout. Saved sets never move; Undo is exact; Finish counts slots.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RECORD_CHECKS } from '../../lib/backup';
import { dayWorkout } from '../../lib/planWorkout';
import { PLANS } from '../../data/plans';
import { makeGym } from '../gyms';
import { AnyGymDB } from '../schema';
import { SwapPendingError, SwapUndoStaleError, stopAlways, swapExercise, undoSwap } from '../swaps';
import { ANY_GYM, type Gym, type Load } from '../types';
import { WorkoutFinishedError, deleteSet, finishWorkout, logSet, restoreSet, startPlanDay, startWorkout, addExercise } from '../workouts';

const PLAN = 'five-day-split';
let db: AnyGymDB;
let n = 0;
let full: Gym;
let hotel: Gym;
beforeEach(async () => {
  db = new AnyGymDB(`anygym-swaps-${n++}`);
  await db.open();
  full = makeGym({ name: 'Full', type: 'full', unit: 'lb', isActive: true });
  hotel = makeGym({ name: 'Hotel', type: 'hotel', unit: 'lb' });
  await db.gyms.bulkAdd([full, hotel]);
});
afterEach(async () => {
  await db.delete();
});

const load: Load = { kind: 'barbell', unit: 'lb', total: 185, barWeight: 45, perSide: [45, 25] };
const log = (id: string, sessionId: string, exerciseId: string) => logSet({ id, sessionId, exerciseId, reps: 10, load }, db);
const session = async (id: string) => (await db.sessions.get(id))!;

describe('startPlanDay meets a gym', () => {
  it('a full gym gets the plan as written and no swaps field', async () => {
    const s = await startPlanDay(full.id, PLAN, 0, db);
    expect(s.swaps).toBeUndefined();
    expect(s.exerciseIds).toContain('barbell-back-squat');
  });

  it('a hotel gym stores what it swapped; starting twice returns one workout', async () => {
    const s = await startPlanDay(hotel.id, PLAN, 0, db);
    expect(s.swaps?.find((x) => x.slot === 'barbell-back-squat')).toEqual({ slot: 'barbell-back-squat', current: 'Dumbbell_Squat', auto: true, reason: 'no barbell here' });
    expect(s.exerciseIds).toContain('Dumbbell_Squat');
    expect((await startPlanDay(hotel.id, PLAN, 0, db)).id).toBe(s.id);
    expect(await db.sessions.count()).toBe(1);
  });

  it('a gym that is gone changes nothing, and the plan JSON is the same afterwards', async () => {
    const before = JSON.stringify(dayWorkout(PLANS.find((p) => p.id === PLAN)!, 0, 0));
    const s = await startPlanDay('no-such-gym', PLAN, 0, db);
    expect(s.swaps).toBeUndefined();
    expect(JSON.stringify(dayWorkout(PLANS.find((p) => p.id === PLAN)!, 0, 0))).toBe(before);
  });
});

describe('swapExercise', () => {
  it('this workout only: the next one starts from the plan again', async () => {
    const s = await startPlanDay(full.id, PLAN, 0, db);
    await swapExercise(s.id, 'barbell-back-squat', 'Dumbbell_Squat', {}, db);
    expect((await session(s.id)).exerciseIds).toContain('Dumbbell_Squat');
    await log('s1', s.id, 'Dumbbell_Squat');
    await finishWorkout(s.id, db, Date.now(), undefined, undefined, null);
    const next = await startPlanDay(full.id, PLAN, 0, db);
    expect(next.swaps).toBeUndefined();
    expect(next.exerciseIds).toContain('barbell-back-squat');
  });

  it('logged sets stay under the original, exactly', async () => {
    const s = await startPlanDay(full.id, PLAN, 0, db);
    await log('s1', s.id, 'barbell-back-squat');
    const saved = await db.sets.get('s1');
    await swapExercise(s.id, 'barbell-back-squat', 'Dumbbell_Squat', {}, db);
    expect(await db.sets.get('s1')).toEqual(saved);
    const after = await session(s.id);
    const at = after.exerciseIds!.indexOf('barbell-back-squat');
    expect(after.exerciseIds![at + 1]).toBe('Dumbbell_Squat');
    expect(after.swaps).toEqual([{ slot: 'barbell-back-squat', current: 'Dumbbell_Squat', kept: ['barbell-back-squat'] }]);
  });

  it('a deleted set with its Undo open still comes back under the original', async () => {
    const s = await startPlanDay(full.id, PLAN, 0, db);
    await log('s1', s.id, 'barbell-back-squat');
    const gone = (await deleteSet('s1', db))!;
    await swapExercise(s.id, 'barbell-back-squat', 'Dumbbell_Squat', {}, db);
    expect((await session(s.id)).swaps![0]!.kept).toEqual(['barbell-back-squat']);
    await restoreSet(gone, db);
    expect((await db.sets.get('s1'))?.exerciseId).toBe('barbell-back-squat');
  });

  it('Undo is exact; after a set on the replacement it is refused and nothing changes', async () => {
    const s = await startPlanDay(full.id, PLAN, 0, db);
    const before = await session(s.id);
    const r = await swapExercise(s.id, 'barbell-back-squat', 'Dumbbell_Squat', {}, db);
    await undoSwap(s.id, r, db);
    expect((await session(s.id)).exerciseIds).toEqual(before.exerciseIds);
    expect((await session(s.id)).swaps).toBeUndefined();
    const again = await swapExercise(s.id, 'barbell-back-squat', 'Dumbbell_Squat', {}, db);
    await log('s2', s.id, 'Dumbbell_Squat');
    await expect(undoSwap(s.id, again, db)).rejects.toBeInstanceOf(SwapUndoStaleError);
    expect((await session(s.id)).exerciseIds).toContain('Dumbbell_Squat');
  });

  it('a Log that has not landed refuses the swap', async () => {
    const s = await startPlanDay(full.id, PLAN, 0, db);
    await db.journal.put({ id: 'j1', sessionId: s.id, exerciseId: 'barbell-back-squat', key: 'k', rev: 1, draft: {}, at: 1 });
    await expect(swapExercise(s.id, 'barbell-back-squat', 'Dumbbell_Squat', {}, db)).rejects.toBeInstanceOf(SwapPendingError);
    expect((await session(s.id)).swaps).toBeUndefined();
  });

  it('a finished workout, an exercise not in it, or a replacement already in it: refused', async () => {
    const s = await startPlanDay(full.id, PLAN, 0, db);
    await expect(swapExercise(s.id, 'not-here', 'Dumbbell_Squat', {}, db)).rejects.toThrow();
    await expect(swapExercise(s.id, 'barbell-back-squat', 'static-quadricep-stretch', {}, db)).rejects.toThrow();
    await log('s1', s.id, 'barbell-back-squat');
    await finishWorkout(s.id, db, Date.now(), undefined, undefined, null);
    await expect(swapExercise(s.id, 'barbell-back-squat', 'Dumbbell_Squat', {}, db)).rejects.toBeInstanceOf(WorkoutFinishedError);
  });

  it('a quick workout swaps too, with no plan to remember', async () => {
    const s = await startWorkout(full.id, db);
    await addExercise(s.id, 'barbell-back-squat', db);
    await swapExercise(s.id, 'barbell-back-squat', 'Dumbbell_Squat', { always: true }, db);
    expect((await session(s.id)).exerciseIds).toEqual(['Dumbbell_Squat']);
    expect(await db.exerciseSettings.count()).toBe(0);
  });
});

describe('Always use this', () => {
  it('is additive, per plan and slot; the next workout uses it; Undo and Stop take it back', async () => {
    await db.exerciseSettings.put({ exerciseId: 'barbell-back-squat', gymId: ANY_GYM, restSec: 75, note: 'mine' });
    const s = await startPlanDay(full.id, PLAN, 0, db);
    const r = await swapExercise(s.id, 'barbell-back-squat', 'Smith_Machine_Squat', { always: true }, db);
    expect(await db.exerciseSettings.get(['barbell-back-squat', ANY_GYM])).toEqual({ exerciseId: 'barbell-back-squat', gymId: ANY_GYM, restSec: 75, note: 'mine', alwaysUse: { [PLAN]: 'Smith_Machine_Squat' } });
    await undoSwap(s.id, r, db);
    expect(await db.exerciseSettings.get(['barbell-back-squat', ANY_GYM])).toEqual({ exerciseId: 'barbell-back-squat', gymId: ANY_GYM, restSec: 75, note: 'mine' });
    await swapExercise(s.id, 'barbell-back-squat', 'Smith_Machine_Squat', { always: true }, db);
    await log('s1', s.id, 'Smith_Machine_Squat');
    await finishWorkout(s.id, db, Date.now(), undefined, undefined, null);
    const next = await startPlanDay(full.id, PLAN, 0, db);
    expect(next.swaps).toEqual([{ slot: 'barbell-back-squat', current: 'Smith_Machine_Squat', always: true }]);
    await log('s2', next.id, 'Smith_Machine_Squat');
    await stopAlways('barbell-back-squat', PLAN, db);
    await finishWorkout(next.id, db, Date.now(), undefined, undefined, null);
    expect((await startPlanDay(full.id, PLAN, 0, db)).swaps).toBeUndefined();
  });
});

describe('Finish counts slots', () => {
  it('a day done through swaps moves the plan on like the plan itself', async () => {
    const plan = PLANS.find((p) => p.id === PLAN)!;
    await db.planState.put({ id: 'active', planId: PLAN, startedAt: 1, weekIndex: 0, nextDayIndex: 0, doneDays: [] });
    const s = await startPlanDay(hotel.id, PLAN, 0, db);
    const real = (await session(s.id)).swaps!;
    let k = 0;
    for (const e of dayWorkout(plan, 0, 0)) {
      if (e.warmup || e.finisher) continue;
      const row = real.find((x) => x.slot === e.exerciseId);
      if (row?.noFit) continue;
      for (let i = 0; i < e.sets; i++) await log(`k${k++}`, s.id, row?.current ?? e.exerciseId);
    }
    const out = await finishWorkout(s.id, db, Date.now(), undefined, undefined, null);
    expect(out.saved && out.progress?.complete).toBe(true);
    expect((await db.planState.get('active'))?.nextDayIndex).toBe(1);
  });
});

describe('backup', () => {
  it('sessions with swaps and settings with alwaysUse pass; malformed ones do not', () => {
    const base = { id: 's', gymId: 'g', startedAt: 1, imported: false };
    expect(RECORD_CHECKS.sessions({ ...base, swaps: [{ slot: 'a', current: 'b', kept: ['a'], auto: true, reason: 'no cable here' }] })).toBe(true);
    expect(RECORD_CHECKS.sessions({ ...base, swaps: [{ slot: 'a', current: 'a', noFit: true }] })).toBe(true);
    expect(RECORD_CHECKS.sessions(base)).toBe(true);
    expect(RECORD_CHECKS.sessions({ ...base, swaps: [{ slot: 'a' }] })).toBe(false);
    expect(RECORD_CHECKS.sessions({ ...base, swaps: 'x' })).toBe(false);
    expect(RECORD_CHECKS.exerciseSettings({ exerciseId: 'a', gymId: '', alwaysUse: { p: 'b' } })).toBe(true);
    expect(RECORD_CHECKS.exerciseSettings({ exerciseId: 'a', gymId: '', alwaysUse: { p: 1 } })).toBe(false);
  });
});
