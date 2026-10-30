import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnyGymDB } from '../schema';
import type { Load } from '../types';
import { applyFinishProgress, choosePlan, getPlanState, NextDayRefusedError, setFinishNextDay, setNextDay, weekFor } from '../planState';
import { fillPlanDay } from './fillPlanDay';
import { finishWorkout, getActiveSession, logSet, reopenWorkout, startPlanDay, startWorkout } from '../workouts';

let db: AnyGymDB;
let n = 0;
beforeEach(async () => {
  db = new AnyGymDB(`anygym-planstate-${n++}`);
  await db.open();
});
afterEach(async () => {
  await db.delete();
});

const bar: Load = { kind: 'barbell', unit: 'lb', total: 135, barWeight: 45, perSide: [45] };
const logOne = (sessionId: string, id = 's1') => logSet({ id, sessionId, exerciseId: 'barbell-back-squat', reps: 8, load: bar }, db);

describe('choosePlan / setNextDay', () => {
  it('starts a plan at day 1, week 1; Change day moves the next day', async () => {
    expect(await getPlanState(db)).toBeUndefined();
    expect(await setNextDay(2, db)).toBeUndefined();
    const s = await choosePlan('five-day-split', db, 1000);
    expect(s).toEqual({ id: 'active', planId: 'five-day-split', startedAt: 1000, weekIndex: 0, nextDayIndex: 0, doneDays: [] });
    expect(await getPlanState(db)).toEqual(s);
    expect((await setNextDay(2, db))!.nextDayIndex).toBe(2);
    expect((await setNextDay(99, db))!.nextDayIndex).toBe(4);
    expect((await setNextDay(-3, db))!.nextDayIndex).toBe(0);
    await expect(choosePlan('nope', db)).rejects.toThrow('Plan not found');
    // Choosing again starts over.
    expect((await choosePlan('six-week-volume', db, 2000)).nextDayIndex).toBe(0);
  });

  it('weekFor: only weekly plans, only the active one', async () => {
    expect(weekFor(undefined, 'six-week-volume')).toBe(0);
    const s = { id: 'active' as const, planId: 'six-week-volume', startedAt: 0, weekIndex: 3, nextDayIndex: 0, doneDays: [] };
    expect(weekFor(s, 'six-week-volume')).toBe(3);
    expect(weekFor({ ...s, weekIndex: 12 }, 'six-week-volume')).toBe(5);
    expect(weekFor(s, 'five-day-split')).toBe(0);
    expect(weekFor({ ...s, planId: 'five-day-split' }, 'five-day-split')).toBe(0);
    expect(weekFor(s, 'nope')).toBe(0);
  });
});

describe('startPlanDay', () => {
  it('creates the session with planId, dayId, week and the day’s exercises in order', async () => {
    await choosePlan('five-day-split', db);
    const s = await startPlanDay('gym-1', 'five-day-split', 1, db, 5000);
    expect(s).toMatchObject({ gymId: 'gym-1', planId: 'five-day-split', dayId: '2', weekIndex: 0, startedAt: 5000, imported: false });
    expect(s.exerciseIds!.slice(0, 4)).toEqual([
      'band-internal-shoulder-rotation-0-degrees',
      'band-internal-shoulder-rotation-90-degrees',
      'dumbbell-bench-press',
      'barbell-incline-bench-press',
    ]);
    expect(s.exerciseIds).toHaveLength(10);
    expect(s.exerciseIds!.at(-1)).toBe('finisher-stair-climbing');
    // A double tap returns the same workout.
    expect((await startPlanDay('gym-1', 'five-day-split', 3, db)).id).toBe(s.id);
    expect((await startWorkout('gym-1', db)).id).toBe(s.id);
    expect(await db.sessions.count()).toBe(1);
    await expect(startPlanDay('gym-1', 'five-day-split', 9, db)).rejects.toThrow('Plan day not found');
    await expect(startPlanDay('gym-1', 'nope', 0, db)).rejects.toThrow('Plan day not found');
  });

  it('weekly table: the session keeps the week it started in', async () => {
    await choosePlan('six-week-volume', db);
    await db.planState.update('active', { weekIndex: 2 });
    const s = await startPlanDay('gym-1', 'six-week-volume', 0, db);
    expect(s.weekIndex).toBe(2);
  });
});

describe('finishing a plan day advances the plan', () => {
  it('next day, done checks, wrap', async () => {
    await choosePlan('five-day-split', db);
    const s1 = await startPlanDay('gym-1', 'five-day-split', 0, db);
    await logOne(s1.id);
    await fillPlanDay(db, s1.id);
    expect(await finishWorkout(s1.id, db)).toMatchObject({ saved: true, progress: { complete: true } });
    expect(await getPlanState(db)).toMatchObject({ nextDayIndex: 1, doneDays: [0], weekIndex: 0 });
    // Finishing twice does not advance twice.
    await finishWorkout(s1.id, db);
    expect((await getPlanState(db))!.nextDayIndex).toBe(1);

    // Change day to the last day, finish it: wraps to day 1 and clears the checks.
    await setNextDay(4, db);
    const s5 = await startPlanDay('gym-1', 'five-day-split', 4, db);
    await logOne(s5.id, 's5');
    await fillPlanDay(db, s5.id);
    await finishWorkout(s5.id, db);
    expect(await getPlanState(db)).toMatchObject({ nextDayIndex: 0, doneDays: [], weekIndex: 0 });
  });

  it('weekly table wraps into the next week; an empty workout is discarded without advancing', async () => {
    await choosePlan('six-week-volume', db);
    await setNextDay(4, db);
    const empty = await startPlanDay('gym-1', 'six-week-volume', 4, db);
    expect(await finishWorkout(empty.id, db)).toEqual({ saved: false });
    expect((await getPlanState(db))!.nextDayIndex).toBe(4);
    const s = await startPlanDay('gym-1', 'six-week-volume', 4, db);
    await logOne(s.id);
    await fillPlanDay(db, s.id);
    await finishWorkout(s.id, db);
    expect(await getPlanState(db)).toMatchObject({ nextDayIndex: 0, weekIndex: 1 });
  });

  it('a quick workout, another plan’s day or an unknown day changes nothing', async () => {
    await choosePlan('five-day-split', db);
    const quick = await startWorkout('gym-1', db);
    await logOne(quick.id);
    await finishWorkout(quick.id, db);
    expect((await getPlanState(db))!.nextDayIndex).toBe(0);
    const all = { share: 1, complete: true };
    await applyFinishProgress({ id: 'x', gymId: 'g', planId: 'six-week-volume', dayId: '1', startedAt: 0, imported: false }, all, db);
    await applyFinishProgress({ id: 'x', gymId: 'g', planId: 'five-day-split', dayId: '42', startedAt: 0, imported: false }, all, db);
    await applyFinishProgress({ id: 'x', gymId: 'g', planId: 'five-day-split', dayId: '1', startedAt: 0, imported: false }, undefined, db);
    expect((await getPlanState(db))!.nextDayIndex).toBe(0);
    expect(await getActiveSession(db)).toBeUndefined();
  });

  it('Undo after Finish reopens the workout and puts the plan back exactly (1.7e)', async () => {
    await choosePlan('five-day-split', db);
    const s1 = await startPlanDay('gym-1', 'five-day-split', 0, db);
    await logOne(s1.id);
    await fillPlanDay(db, s1.id);
    await finishWorkout(s1.id, db);
    const s2 = await startPlanDay('gym-1', 'five-day-split', 1, db);
    await logOne(s2.id, 's2');
    await fillPlanDay(db, s2.id);
    const before = await getPlanState(db);
    expect(before).toMatchObject({ nextDayIndex: 1, doneDays: [0] });
    await finishWorkout(s2.id, db);
    expect(await getPlanState(db)).toMatchObject({ nextDayIndex: 2, doneDays: [0, 1] });
    expect(await reopenWorkout(s2.id, before, db)).toBe(true);
    expect(await getPlanState(db)).toEqual(before);
    const active = await getActiveSession(db);
    expect(active?.id).toBe(s2.id);
    expect(active && 'endedAt' in active).toBe(false);
    // Already open, or another workout in progress: refused, nothing changes.
    expect(await reopenWorkout(s2.id, before, db)).toBe(false);
    expect(await reopenWorkout(s1.id, before, db)).toBe(false);
    expect(await reopenWorkout('missing', before, db)).toBe(false);
  });

  it('Undo needs no state from the screen: Finish keeps the plan before, a second Finish never moves it again (2.0b)', async () => {
    await choosePlan('five-day-split', db);
    const before = await getPlanState(db);
    const s = await startPlanDay('gym-1', 'five-day-split', 0, db);
    await logOne(s.id);
    await fillPlanDay(db, s.id);
    await finishWorkout(s.id, db);
    expect((await getPlanState(db))!.nextDayIndex).toBe(1);
    // A second Finish of the ended workout (finish screen reopened by a link or a reload): no-op.
    await Promise.all([finishWorkout(s.id, db), finishWorkout(s.id, db)]);
    expect((await getPlanState(db))!.nextDayIndex).toBe(1);
    await setFinishNextDay(s.id, 3, db);
    // Undo without the plan state the finish screen used to carry: back exactly to before Finish.
    expect(await reopenWorkout(s.id, undefined, db)).toBe(true);
    expect(await getPlanState(db)).toEqual(before);
    // Finishing again moves the plan once, from where it was.
    await finishWorkout(s.id, db);
    expect((await getPlanState(db))!.nextDayIndex).toBe(1);
  });

  it('Undo of a quick workout reopens it and leaves the plan alone; a changed plan is not overwritten', async () => {
    await choosePlan('five-day-split', db);
    const quick = await startWorkout('gym-1', db);
    await logOne(quick.id);
    const before = await getPlanState(db);
    await finishWorkout(quick.id, db);
    await setNextDay(3, db);
    expect(await reopenWorkout(quick.id, before, db)).toBe(true);
    expect((await getPlanState(db))!.nextDayIndex).toBe(3);
    await finishWorkout(quick.id, db);
    const s = await startPlanDay('gym-1', 'five-day-split', 3, db);
    await logOne(s.id, 'sx');
    const b2 = await getPlanState(db);
    await finishWorkout(s.id, db);
    await choosePlan('six-week-volume', db);
    expect(await reopenWorkout(s.id, b2, db)).toBe(true);
    expect((await getPlanState(db))!.planId).toBe('six-week-volume');
    expect(await reopenWorkout(s.id, undefined, db)).toBe(false);
  });

  it('below 60% of the working sets the day stays up next with a partial ring (PLAN 2.0a)', async () => {
    await choosePlan('five-day-split', db);
    const s1 = await startPlanDay('gym-1', 'five-day-split', 0, db);
    // Classic Day 1: 12 working exercises, 37 working sets. 22 sets = 59.5%: keeps Day 1.
    expect(await fillPlanDay(db, s1.id, undefined, 22)).toBe(22);
    const r = await finishWorkout(s1.id, db);
    expect(r).toMatchObject({ saved: true, sets: 22, progress: { total: 12, complete: false } });
    const kept = await getPlanState(db);
    expect(kept).toMatchObject({ nextDayIndex: 0, doneDays: [] });
    expect(kept!.partial![0]).toBeCloseTo(22 / 37);
  });

  it('60 to 99% moves on with a partial ring and no tick; 100% earns the tick (PLAN 2.0a)', async () => {
    await choosePlan('five-day-split', db);
    const s1 = await startPlanDay('gym-1', 'five-day-split', 0, db);
    expect(await fillPlanDay(db, s1.id, undefined, 23)).toBe(23); // 62%
    await finishWorkout(s1.id, db);
    expect(await getPlanState(db)).toMatchObject({ nextDayIndex: 1, doneDays: [], partial: { 0: 23 / 37 } });
    // Finishing again never moves it twice.
    await finishWorkout(s1.id, db);
    expect((await getPlanState(db))!.nextDayIndex).toBe(1);
    // Day 2 in full: its tick, Day 1 keeps its partial ring.
    const s2 = await startPlanDay('gym-1', 'five-day-split', 1, db);
    await fillPlanDay(db, s2.id);
    await finishWorkout(s2.id, db);
    expect(await getPlanState(db)).toMatchObject({ nextDayIndex: 2, doneDays: [1], partial: { 0: 23 / 37 } });
    // The last day at 80% wraps to Day 1: the pass starts over, nothing carried.
    await setNextDay(4, db);
    const s5 = await startPlanDay('gym-1', 'five-day-split', 4, db);
    await fillPlanDay(db, s5.id, undefined, 20); // 20 of 27
    const r5 = await finishWorkout(s5.id, db);
    if (!r5.saved || !r5.progress) throw new Error('no progress');
    expect(r5.progress.share).toBeGreaterThanOrEqual(0.6);
    expect(r5.progress.complete).toBe(false);
    const wrapped = await getPlanState(db);
    expect(wrapped).toMatchObject({ nextDayIndex: 0, doneDays: [], weekIndex: 0 });
    expect(wrapped!.partial).toBeUndefined();
  });

  it('a session below 60% repeats even when an earlier pass of the day had more', async () => {
    await choosePlan('five-day-split', db);
    await db.planState.update('active', { partial: { 0: 0.9 } });
    const s = await startPlanDay('gym-1', 'five-day-split', 0, db);
    await fillPlanDay(db, s.id, undefined, 5);
    await finishWorkout(s.id, db);
    expect(await getPlanState(db)).toMatchObject({ nextDayIndex: 0, partial: { 0: 0.9 } });
  });

  it('Undo after a moved on finish restores the day, week, ticks and partial marks exactly', async () => {
    await choosePlan('five-day-split', db);
    await db.planState.update('active', { doneDays: [3], partial: { 2: 0.4 }, nextDayIndex: 0 });
    const before = await getPlanState(db);
    const s = await startPlanDay('gym-1', 'five-day-split', 0, db);
    await fillPlanDay(db, s.id, undefined, 30);
    await finishWorkout(s.id, db);
    expect(await getPlanState(db)).toMatchObject({ nextDayIndex: 1, doneDays: [3], partial: { 0: 30 / 37, 2: 0.4 } });
    await setFinishNextDay(s.id, 3, db);
    expect((await getPlanState(db))!.nextDayIndex).toBe(3);
    expect(await reopenWorkout(s.id, before, db)).toBe(true);
    expect(await getPlanState(db)).toEqual(before);
  });

  it('setFinishNextDay: only a finished workout of the active plan, a real day, no workout in progress', async () => {
    await choosePlan('six-week-volume', db);
    await setNextDay(4, db);
    const s = await startPlanDay('gym-1', 'six-week-volume', 4, db);
    // Still active: refused.
    await expect(setFinishNextDay(s.id, 2, db)).rejects.toBeInstanceOf(NextDayRefusedError);
    await fillPlanDay(db, s.id);
    await finishWorkout(s.id, db);
    expect(await getPlanState(db)).toMatchObject({ nextDayIndex: 0, weekIndex: 1 });
    // Change keeps the week Finish moved to.
    expect(await setFinishNextDay(s.id, 2, db)).toMatchObject({ nextDayIndex: 2, weekIndex: 1 });
    for (const bad of [-1, 5, 1.5, NaN]) await expect(setFinishNextDay(s.id, bad, db)).rejects.toBeInstanceOf(NextDayRefusedError);
    await expect(setFinishNextDay('missing', 1, db)).rejects.toBeInstanceOf(NextDayRefusedError);
    // Another workout in progress: refused.
    const other = await startWorkout('gym-1', db);
    await expect(setFinishNextDay(s.id, 1, db)).rejects.toBeInstanceOf(NextDayRefusedError);
    await logOne(other.id, 'o1');
    await finishWorkout(other.id, db);
    // A quick workout has no plan day.
    await expect(setFinishNextDay(other.id, 1, db)).rejects.toBeInstanceOf(NextDayRefusedError);
    // Another plan is active now: never touched.
    await choosePlan('five-day-split', db);
    await expect(setFinishNextDay(s.id, 1, db)).rejects.toBeInstanceOf(NextDayRefusedError);
    expect((await getPlanState(db))!.nextDayIndex).toBe(0);
  });

  it('a failed plan write rolls Finish back: the workout stays active and the plan unchanged', async () => {
    await choosePlan('five-day-split', db);
    const before = await getPlanState(db);
    const s = await startPlanDay('gym-1', 'five-day-split', 0, db);
    await fillPlanDay(db, s.id);
    const put = db.planState.put.bind(db.planState);
    db.planState.put = (() => Promise.reject(new Error('disk full'))) as unknown as typeof db.planState.put;
    await expect(finishWorkout(s.id, db)).rejects.toThrow();
    db.planState.put = put;
    expect((await db.sessions.get(s.id))!.endedAt).toBeUndefined();
    expect(await getPlanState(db)).toEqual(before);
  });

  it('a second partial finish of the same day keeps the larger share; a weekly plan day keeps its week', async () => {
    await choosePlan('six-week-volume', db);
    const s = await startPlanDay('gym-1', 'six-week-volume', 0, db);
    await logOne(s.id);
    await logSet({ id: 'two', sessionId: s.id, exerciseId: 'barbell-back-squat', reps: 8, load: bar }, db);
    await finishWorkout(s.id, db);
    const first = (await getPlanState(db))!.partial![0]!;
    const again = await startPlanDay('gym-1', 'six-week-volume', 0, db);
    await logOne(again.id, 'one');
    await finishWorkout(again.id, db);
    expect((await getPlanState(db))!.partial![0]).toBe(first);
    expect((await getPlanState(db))!.weekIndex).toBe(0);
  });
});
