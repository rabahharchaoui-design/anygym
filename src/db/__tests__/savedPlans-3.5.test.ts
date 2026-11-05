import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnyGymDB } from '../schema';
import { loadSavedPlans, saveGeneratedPlan } from '../savedPlans';
import { exportBackup, restoreReplace } from '../backup';
import { parseBackup, serializeBackup } from '../../lib/backup';
import { generate } from '../../data/generator';
import { planById } from '../../data/plans';
import { choosePlan } from '../planState';
import { startPlanDay } from '../workouts';
import { makeGym } from '../gyms';
import { equipmentPreset } from '../gyms';

// PLAN 3.5: a generated plan is saved once, found by every screen, starts a workout, and comes back
// whole from a backup.

let db: AnyGymDB;
let n = 0;
beforeEach(async () => {
  db = new AnyGymDB(`anygym-saved-${n++}`);
  await db.open();
});
afterEach(async () => {
  await db.delete();
});

const hotel = equipmentPreset('hotel', 'lb');
const built = (days: number) => {
  const r = generate({ goals: ['muscle'], experience: '1_2y', days, minutes: 45, gym: { equipment: hotel.equipment, dumbbellRange: hotel.dumbbellRange }, place: 'hotel' });
  if (!r.ok) throw new Error(r.reason);
  return r.plan as unknown as Record<string, unknown>;
};

describe('saved generated plans', () => {
  it('saves once, registers, and Day 1 starts a workout with its exercises', async () => {
    const raw = built(4);
    const plan = await saveGeneratedPlan(raw, db, 1000);
    await saveGeneratedPlan(raw, db, 2000);
    const rows = await db.plans.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: plan.id, source: 'generated', createdAt: 1000 });
    expect(planById(plan.id)?.days).toHaveLength(4);
    const gym = makeGym({ name: 'Hotel', type: 'hotel', unit: 'lb', isActive: true });
    await db.gyms.add(gym);
    await choosePlan(plan.id, db);
    const s = await startPlanDay(gym.id, plan.id, 0, db);
    expect(s.planId).toBe(plan.id);
    expect(s.exerciseIds?.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  it('refuses a definition the app cannot run (and writes nothing)', async () => {
    await expect(saveGeneratedPlan({ id: 'mine-bad', days: [{ n: 1, name: 'x', blocks: [{ type: 'single', exercise: 'Nope', id: 'Nope', sets: 3 }] }] }, db)).rejects.toThrow();
    await expect(saveGeneratedPlan({ ...built(3), id: 'five-day-split' }, db)).rejects.toThrow();
    expect(await db.plans.count()).toBe(0);
  });

  it('comes back from a backup with its definition, and loads at start', async () => {
    const raw = built(2);
    const plan = await saveGeneratedPlan(raw, db);
    await choosePlan(plan.id, db);
    const text = serializeBackup(await exportBackup(db));
    const parsed = parseBackup(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const other = new AnyGymDB(`anygym-saved-other-${n++}`);
    await other.open();
    try {
      await restoreReplace(parsed.backup, other);
      expect((await other.plans.get(plan.id))?.definition).toEqual(raw);
      expect(await loadSavedPlans(other)).toBe(1);
      expect((await other.planState.get('active'))?.planId).toBe(plan.id);
    } finally {
      await other.delete();
    }
  });

  it('a backup with a broken definition is refused', async () => {
    const plan = await saveGeneratedPlan(built(3), db);
    const backup = await exportBackup(db);
    const text = serializeBackup(backup).replace(`"id":"${plan.id}","name"`, `"id":"${plan.id}","name"`).replace('"blocks":[', '"blocks":[{"type":"single","exercise":"Made up","id":"Made_Up"},');
    expect(parseBackup(text).ok).toBe(false);
  });
});
