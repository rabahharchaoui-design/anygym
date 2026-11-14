import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnyGymDB, SCHEMA_VERSION, SCHEMA_V1, SCHEMA_V2, SCHEMA_V3, SCHEMA_V4, SCHEMA_V5, SCHEMA_V6, SCHEMA_V7, SCHEMA_V8, SCHEMA_V9, SCHEMA_V10, SCHEMA_V11 } from '../schema';
import { ensureFirstGym } from '../bootstrap';
import { choosePlan, setFinishNextDay, setNextDay } from '../planState';
import { readSchedule, saveWeeklySchedule } from '../schedule';
import { readTraining, readTrainingLog } from '../training';
import { startPlanDay } from '../workoutStart';
import { finishWorkout } from '../workoutFinish';
import { reopenWorkout } from '../workoutReopen';
import { logSet } from '../workoutSets';
import { loadSavedPlans, saveGeneratedPlan } from '../savedPlans';
import { definitionPlan, planById } from '../../data/plans';
import { FROZEN_PLANS, frozenPlanText } from '../../data/frozenPlans';
import { GENERATOR_VERSION } from '../../lib/generator';
import { exportBackup, restoreReplace } from '../backup';
import { parseBackup } from '../../lib/backup';
import { TIRED_MS } from '../../lib/quickWhy';
import { generate } from '../../data/generator';
import { equipmentPreset } from '../gyms';
import type { Session, WorkoutSet } from '../types';

let db: AnyGymDB;
const now = new Date(2026, 10, 10, 12).getTime();
const planId = 'mine-test-36f-rotation';
const exercises = ['dumbbell-bench-press', 'cable-seated-close-grip-row', 'barbell-back-squat'];
const load = { kind: 'dumbbell_each' as const, unit: 'lb' as const, total: 10 };
let gymId: string;
beforeEach(async () => {
  db = new AnyGymDB(`schedule-36f-${Math.random()}`); await db.open();
  gymId = (await ensureFirstGym(db)).id;
  await db.profile.add({ id: 'me', defaultUnit: 'lb', createdAt: 1, intake: { scheduleStyle: 'flexible' } });
  await saveGeneratedPlan({ id: planId, name: 'Test rotation', daysPerWeek: 3, progressionMode: 'double', days: exercises.map((id, i) => ({ n: i + 1, name: `Day ${i + 1}`, blocks: [{ type: 'single', id, exercise: id, sets: 3, reps: [8, 12], restSec: 120 }] })) }, db, now);
  await choosePlan(planId, db, now);
});
afterEach(async () => { vi.restoreAllMocks(); await db.delete(); });
async function trained(id: string, exerciseId: string, opts: Partial<Session> = {}, setOpts: Partial<WorkoutSet> = {}) {
  await db.sessions.add({ id, gymId: 'another-gym', startedAt: now - 60_000, endedAt: now - 30_000, imported: false, ...opts });
  // Three hard sets: the least that counts for the 48 hour rule (lib/plan/recovery.ts).
  for (let i = 0; i < 3; i++) await db.sets.add({ id: `${id}-set-${i}`, sessionId: id, exerciseId, order: i, kind: 'work', reps: 8, load, uncertain: false, ...setOpts });
}
describe('saved schedules and starts', () => {
  it('saves weekly days offline once, and a failed write remains unanswered for retry', async () => {
    await db.profile.update('me', { intake: { scheduleStyle: 'weekly' } });
    expect((await readSchedule(now, db)).needsWeek).toBe(true);
    const put = vi.spyOn(db.profile, 'put').mockRejectedValueOnce(new Error('write failed'));
    await expect(saveWeeklySchedule(['tue', 'fri'], now, db)).rejects.toThrow(); put.mockRestore();
    expect((await readSchedule(now, db)).needsWeek).toBe(true);
    await saveWeeklySchedule(['tue', 'fri', 'tue'], now, db);
    expect((await readSchedule(now + 86_400_000, db)).needsWeek).toBe(false);
    expect((await db.profile.get('me'))!.weeklySchedule!.weekdays).toEqual(['tue', 'fri']);
    expect((await readSchedule(now + 7 * 86_400_000, db)).needsWeek).toBe(true);
  });
  it('resolves recovery from actual cross-gym sets, revalidates Start, and makes a double Start idempotent', async () => {
    await trained('chest', exercises[0]!);
    const read = await readSchedule(now, db);
    expect(read.resolved).toMatchObject({ dayIndex: 1, deferred: [0], pendingDayIndices: [1, 2, 0] });
    await expect(startPlanDay(gymId, planId, 0, db, now)).rejects.toThrow('next day changed');
    expect(await db.sessions.count()).toBe(1);
    const [a, b] = await Promise.all([startPlanDay(gymId, planId, 1, db, now), startPlanDay(gymId, planId, 1, db, now)]);
    expect(a.id).toBe(b.id);
    expect(a.dayId).toBe('2');
    expect((await db.planState.get('active'))!.pendingDayIndices).toEqual([1, 2, 0]);
    expect(await startPlanDay(gymId, planId, 0, db, now)).toEqual(a); // Resume wins even with stale day selection.
  });
  it('rolls back the queue if creating the session fails', async () => {
    await trained('chest', exercises[0]!);
    const before = await db.planState.get('active');
    vi.spyOn(db.sessions, 'add').mockRejectedValueOnce(new Error('full'));
    await expect(startPlanDay(gymId, planId, 1, db, now)).rejects.toThrow('full');
    expect(await db.planState.get('active')).toEqual(before);
    expect(await db.sessions.count()).toBe(1);
  });
  it('has an all-blocked state and uses an elapsed 48 hours, excluding unreliable or non-working sets', async () => {
    for (const [i, id] of exercises.entries()) await trained(`recent-${i}`, id);
    expect((await readSchedule(now, db)).resolved?.dayIndex).toBeNull();
    await expect(startPlanDay(gymId, planId, 0, db, now)).rejects.toThrow('recovery');
    expect((await readSchedule(now - 60_000 + TIRED_MS, db)).resolved?.dayIndex).toBe(0);
    await db.sessions.clear(); await db.sets.clear();
    await trained('uncertain', exercises[0]!, {}, { uncertain: true });
    await trained('warmup', exercises[0]!, {}, { kind: 'warmup' });
    await trained('import', exercises[0]!, { imported: true });
    await trained('future', exercises[0]!, { startedAt: now + 1000 });
    expect(await readTraining(now, db)).toEqual({});
    expect((await readSchedule(now, db)).resolved?.dayIndex).toBe(0);
  });
  it('never locks the person out: a day they choose starts even while every day rests, and the choice is used up when the plan moves on', async () => {
    for (const [i, id] of exercises.entries()) await trained(`recent-${i}`, id);
    const blocked = (await readSchedule(now, db)).resolved!;
    expect(blocked).toMatchObject({ dayIndex: null, pendingDayIndices: [0, 1, 2] });
    await setNextDay(blocked.pendingDayIndices[0]!, db); // "Train anyway": the next day in order.
    expect((await readSchedule(now, db)).resolved).toMatchObject({ dayIndex: 0, deferred: [] });
    const s = await startPlanDay(gymId, planId, 0, db, now);
    expect(s.dayId).toBe('1');
    for (const id of ['a', 'b', 'c']) await logSet({ id, sessionId: s.id, exerciseId: exercises[0]!, reps: 8, load }, db);
    await finishWorkout(s.id, db, now + 1000);
    const after = (await db.planState.get('active'))!;
    expect(after).toMatchObject({ nextDayIndex: 1, pendingDayIndices: [1, 2] });
    expect(after.chosenDayIndex).toBeUndefined();
    // Finish Undo brings the choice back with the rest of the pointer.
    expect(await reopenWorkout(s.id, undefined, db)).toBe(true);
    expect((await db.planState.get('active'))!).toMatchObject({ nextDayIndex: 0, chosenDayIndex: 0, pendingDayIndices: [0, 1, 2] });
  });
  it('Change day on a flexible plan wins over the 48 hour rule, and a short workout keeps it', async () => {
    await trained('legs', exercises[2]!);
    await setNextDay(2, db);
    expect((await readSchedule(now, db)).resolved).toMatchObject({ dayIndex: 2, deferred: [] });
    const s = await startPlanDay(gymId, planId, 2, db, now);
    await logSet({ id: 'one', sessionId: s.id, exerciseId: exercises[2]!, reps: 8, load }, db);
    await finishWorkout(s.id, db, now + 1000);
    expect((await db.planState.get('active'))!).toMatchObject({ nextDayIndex: 2, chosenDayIndex: 2, partial: { 2: 1 / 3 } });
    expect((await readSchedule(now + 2000, db)).resolved?.dayIndex).toBe(2);
  });
  it('keeps partial Finish, advances at 60%, and Finish Undo restores the entire deferred queue', async () => {
    await trained('chest', exercises[0]!);
    const s = await startPlanDay(gymId, planId, 1, db, now);
    await logSet({ id: 'one', sessionId: s.id, exerciseId: exercises[1]!, reps: 8, load }, db);
    await finishWorkout(s.id, db, now + 1000);
    expect((await db.planState.get('active'))!).toMatchObject({ nextDayIndex: 1, pendingDayIndices: [1, 2, 0], partial: { 1: 1 / 3 } });
    await reopenWorkout(s.id, undefined, db);
    const before = await db.planState.get('active');
    await logSet({ id: 'two', sessionId: s.id, exerciseId: exercises[1]!, reps: 8, load }, db);
    await finishWorkout(s.id, db, now + 2000);
    expect((await db.planState.get('active'))!).toMatchObject({ nextDayIndex: 2, pendingDayIndices: [2, 0], partial: { 1: 2 / 3 }, doneDays: [] });
    expect(await reopenWorkout(s.id, undefined, db)).toBe(true);
    expect(await db.planState.get('active')).toEqual(before);
  });
});
describe('round 2: one next day rule (critic BLOCKER 3, MAJOR 5)', () => {
  it('one set on Day 1 keeps Day 1 on the finish screen and on Today: both read the same resolver', async () => {
    const s = await startPlanDay(gymId, planId, 0, db, now);
    await logSet({ id: 'one', sessionId: s.id, exerciseId: exercises[0]!, reps: 8, load }, db);
    await finishWorkout(s.id, db, now + 1000);
    expect((await db.planState.get('active'))!).toMatchObject({ nextDayIndex: 0, partial: { 0: 1 / 3 } });
    expect((await readSchedule(now + 2000, db)).resolved).toMatchObject({ dayIndex: 0, deferred: [] });
    // The next day, one empty bar set of another day's lift in a quick workout: still no rest day, still Day 1.
    await db.sessions.add({ id: 'q', gymId, startedAt: now + 86_400_000, endedAt: now + 86_400_000 + 1000, imported: false });
    await db.sets.add({ id: 'q-1', sessionId: 'q', exerciseId: exercises[2]!, order: 0, kind: 'work', reps: 8, load, uncertain: false });
    expect((await readSchedule(now + 86_400_000 + 2000, db)).resolved).toMatchObject({ dayIndex: 0, deferred: [] });
  });
  it('a kept day stays up next even when its part done workout had many hard sets on its muscles', async () => {
    const s = await startPlanDay(gymId, planId, 0, db, now);
    await logSet({ id: 'one', sessionId: s.id, exerciseId: exercises[0]!, reps: 8, load }, db);
    // Four more chest sets on a lift that is not in the day: real work, but the day is still under 60%.
    for (const id of ['a', 'b', 'c', 'd']) await logSet({ id, sessionId: s.id, exerciseId: 'barbell-incline-bench-press', reps: 8, load: { kind: 'barbell', unit: 'lb', total: 45, barWeight: 45, perSide: [] } }, db);
    await finishWorkout(s.id, db, now + 1000);
    expect((await db.planState.get('active'))!.nextDayIndex).toBe(0);
    expect((await readTrainingLog(now + 2000, db))[0]!.sets.chest).toBe(5);
    expect((await readSchedule(now + 2000, db)).resolved).toMatchObject({ dayIndex: 0, deferred: [] });
  });
  it('two hard sets never count, three do; Train anyway offers the most rested day and the card data names the muscles', async () => {
    await db.sessions.add({ id: 'two', gymId, startedAt: now - 60_000, endedAt: now - 30_000, imported: false });
    for (let i = 0; i < 2; i++) await db.sets.add({ id: `two-${i}`, sessionId: 'two', exerciseId: exercises[0]!, order: i, kind: 'work', reps: 8, load, uncertain: false });
    expect((await readSchedule(now, db)).resolved).toMatchObject({ dayIndex: 0, deferred: [] });
    await db.sets.add({ id: 'two-2', sessionId: 'two', exerciseId: exercises[0]!, order: 2, kind: 'work', reps: 8, load, uncertain: false });
    expect((await readSchedule(now, db)).resolved).toMatchObject({ dayIndex: 1, deferred: [0] });
    // Day 2 trained 20 hours ago and Day 3 just now: every day rests, and the one to train anyway is not the one just trained.
    await trained('back', exercises[1]!, { startedAt: now - 20 * 3_600_000 });
    await trained('legs', exercises[2]!, { startedAt: now - 1000 });
    const r = (await readSchedule(now, db)).resolved!;
    expect(r).toMatchObject({ dayIndex: null, anywayIndex: 1, eligibleAt: now + 28 * 3_600_000 });
    expect(r.resting!.muscles).toContain('back');
    expect(r.resting!.trainedAt).toBe(now - 20 * 3_600_000);
  });
  it('Change on the finish screen is the person\'s own pick: the rule never moves it', async () => {
    await trained('legs', exercises[2]!);
    const s = await startPlanDay(gymId, planId, 0, db, now);
    for (const id of ['a', 'b', 'c']) await logSet({ id, sessionId: s.id, exerciseId: exercises[0]!, reps: 8, load }, db);
    await finishWorkout(s.id, db, now + 1000);
    expect((await readSchedule(now + 2000, db)).resolved?.dayIndex).toBe(1);
    await setFinishNextDay(s.id, 2, db);
    expect((await db.planState.get('active'))!).toMatchObject({ nextDayIndex: 2, chosenDayIndex: 2, pendingDayIndices: [2, 1] });
    expect((await readSchedule(now + 2000, db)).resolved).toMatchObject({ dayIndex: 2, deferred: [] });
  });
});
describe('additive v11 data and backup compatibility', () => {
  it('opens old v11 rows unchanged', async () => {
    const oldName = `old-36f-${Math.random()}`;
    const old = new Dexie(oldName); old.version(11).stores({ ...SCHEMA_V1, ...SCHEMA_V2, ...SCHEMA_V3, ...SCHEMA_V4, ...SCHEMA_V5, ...SCHEMA_V6, ...SCHEMA_V7, ...SCHEMA_V8, ...SCHEMA_V9, ...SCHEMA_V10, ...SCHEMA_V11 }); await old.open();
    const row = { id: 'active', planId, startedAt: 10, weekIndex: 0, nextDayIndex: 1, doneDays: [0] };
    await old.table('planState').put(row); old.close();
    const opened = new AnyGymDB(oldName); await opened.open();
    expect(SCHEMA_VERSION).toBe(11); expect(await opened.planState.get('active')).toEqual(row);
    await opened.delete();
  });
  it('round-trips ranked answers, weekly choice, deferred days and generated explanations; refuses invalid queues', async () => {
    const result = generate({ goals: ['muscle'], experience: '3y', days: 4, minutes: 60, gym: equipmentPreset('full', 'lb'), focusPicks: ['lats', 'biceps', 'quads', 'abs'], scheduleStyle: 'weekly' });
    expect(result.ok).toBe(true); if (!result.ok) return;
    await saveGeneratedPlan(result.plan as unknown as Record<string, unknown>, db, now);
    await choosePlan(result.plan.id, db, now);
    await db.planState.update('active', { nextDayIndex: 1, pendingDayIndices: [1, 2, 0, 3] });
    await db.profile.update('me', { intake: { scheduleStyle: 'weekly', focusPicks: ['lats', 'biceps', 'quads', 'abs'] } });
    await saveWeeklySchedule(['tue', 'fri'], now, db);
    const backup = await exportBackup(db, now);
    const parsed = parseBackup(JSON.stringify(backup)); expect(parsed.ok).toBe(true);
    const other = new AnyGymDB(`restored-36f-${Math.random()}`); await other.open();
    try {
      await restoreReplace(backup, other);
      expect(await other.profile.toArray()).toEqual(await db.profile.toArray());
      expect(await other.planState.toArray()).toEqual(await db.planState.toArray());
      expect(await other.plans.toArray()).toEqual(await db.plans.toArray());
    } finally { await other.delete(); }
    for (const chosen of [99, -1, 0.5, '1']) {
      const bad = structuredClone(backup); (bad.tables.planState[0] as { chosenDayIndex?: unknown }).chosenDayIndex = chosen;
      expect(parseBackup(JSON.stringify(bad)).ok, String(chosen)).toBe(false);
    }
    const picked = structuredClone(backup); picked.tables.planState[0]!.chosenDayIndex = 2;
    expect(parseBackup(JSON.stringify(picked)).ok).toBe(true);
    for (const pending of [[99], [1, 1], [-1], [0.5], []]) {
      const bad = structuredClone(backup); bad.tables.planState[0]!.pendingDayIndices = pending;
      expect(parseBackup(JSON.stringify(bad)).ok, String(pending)).toBe(false);
    }
    const badWeek = structuredClone(backup); badWeek.tables.profile[0]!.weeklySchedule!.weekdays = ['bad' as 'mon'];
    expect(parseBackup(JSON.stringify(badWeek)).ok).toBe(false);
  });
  it('a profile from before 3.6f with saved weekdays stays on its calendar: no rotation queue, no 48 hour move, the old finish', async () => {
    await db.profile.update('me', { intake: { focus: ['arms'], weekdays: ['mon', 'wed', 'fri'], days: 3 } });
    for (const [i, id] of exercises.entries()) await trained(`recent-${i}`, id);
    const read = await readSchedule(now, db);
    expect(read).toMatchObject({ style: 'fixed', needsWeek: false, resolved: { dayIndex: 0, deferred: [] } });
    const s = await startPlanDay(gymId, planId, 0, db, now);
    for (const id of ['a', 'b', 'c']) await logSet({ id, sessionId: s.id, exerciseId: exercises[0]!, reps: 8, load }, db);
    await finishWorkout(s.id, db, now + 1000);
    const state = (await db.planState.get('active'))!;
    expect(state).toMatchObject({ nextDayIndex: 1, doneDays: [0] });
    expect('pendingDayIndices' in state).toBe(false);
    expect((await readSchedule(now + 2000, db)).resolved?.dayIndex).toBe(1);
  });
  it('a backup from before 3.6f (none of the new fields) still checks out and restores as it was', async () => {
    await db.profile.update('me', { intake: { focus: ['arms', 'back'], weekdays: ['mon', 'thu'], days: 3, minutes: 45 } });
    await trained('old', exercises[0]!, { gymId });
    const backup = await exportBackup(db, now);
    const text = JSON.stringify(backup);
    for (const key of ['scheduleStyle', 'focusPicks', 'weeklySchedule', 'pendingDayIndices', 'chosenDayIndex', 'focusReport', 'focusWhy']) expect(text).not.toContain(key);
    expect(parseBackup(text)).toMatchObject({ ok: true });
    const other = new AnyGymDB(`restored-old-36f-${Math.random()}`); await other.open();
    try {
      await restoreReplace(backup, other);
      for (const table of ['profile', 'planState', 'plans', 'sessions', 'sets'] as const) expect(await other.table(table).toArray()).toEqual(await db.table(table).toArray());
      expect((await readSchedule(now, other)).style).toBe('fixed');
    } finally { await other.delete(); }
  });
  it('generator version 3 changed no shipped plan, and a saved version 2 plan still opens with the same days', async () => {
    expect(GENERATOR_VERSION).toBe(3);
    for (const p of FROZEN_PLANS) {
      const v3 = JSON.parse(frozenPlanText(p)) as Record<string, unknown>;
      // No focus picks: nothing of 3.6f is in the file but the version number.
      for (const key of ['focusReport', 'scheduleStyle']) expect(key in v3).toBe(false);
      expect(JSON.stringify(v3)).not.toContain('focusWhy');
      const v2 = { ...v3, generator: 2 };
      expect(definitionPlan(v2)).toEqual(definitionPlan(v3));
    }
    const built = generate({ goals: ['muscle'], experience: '1_2y', days: 3, minutes: 45, gym: equipmentPreset('full', 'lb') });
    expect(built.ok).toBe(true); if (!built.ok) return;
    const old = { ...(built.plan as unknown as Record<string, unknown>), id: 'mine-saved-by-version-2', generator: 2 };
    await db.plans.add({ id: 'mine-saved-by-version-2', name: 'Old plan', source: 'generated', createdAt: 1, definition: old });
    expect(await loadSavedPlans(db)).toBeGreaterThanOrEqual(1);
    expect(planById('mine-saved-by-version-2')!.days).toEqual(definitionPlan(built.plan)!.days);
    // And with picks the same answers give the same plan every time (a saved plan never changes by itself).
    const again = generate({ goals: ['muscle'], experience: '1_2y', days: 3, minutes: 45, gym: equipmentPreset('full', 'lb') });
    expect(again).toEqual(built);
  });
});
