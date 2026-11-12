import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnyGymDB, SCHEMA_VERSION, SCHEMA_V1, SCHEMA_V2, SCHEMA_V3, SCHEMA_V4, SCHEMA_V5, SCHEMA_V6, SCHEMA_V7, SCHEMA_V8, SCHEMA_V9, SCHEMA_V10, SCHEMA_V11 } from '../schema';
import { ensureFirstGym } from '../bootstrap';
import { choosePlan } from '../planState';
import { readSchedule, saveWeeklySchedule } from '../schedule';
import { readTraining } from '../training';
import { startPlanDay } from '../workoutStart';
import { finishWorkout } from '../workoutFinish';
import { reopenWorkout } from '../workoutReopen';
import { logSet } from '../workoutSets';
import { saveGeneratedPlan } from '../savedPlans';
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
  await db.sets.add({ id: `${id}-set`, sessionId: id, exerciseId, order: 0, kind: 'work', reps: 8, load, uncertain: false, ...setOpts });
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
    for (const pending of [[99], [1, 1], [-1], [0.5], []]) {
      const bad = structuredClone(backup); bad.tables.planState[0]!.pendingDayIndices = pending;
      expect(parseBackup(JSON.stringify(bad)).ok, String(pending)).toBe(false);
    }
    const badWeek = structuredClone(backup); badWeek.tables.profile[0]!.weeklySchedule!.weekdays = ['bad' as 'mon'];
    expect(parseBackup(JSON.stringify(badWeek)).ok).toBe(false);
  });
});
