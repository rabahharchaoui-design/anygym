import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { planById } from '../../data/plans';
import { profileFor } from '../../data/order';
import type { Concept, QuickItem } from '../../lib/quick';
import { applyTrim, trimDay } from '../../lib/timeBudget';
import { makeGym } from '../gyms';
import { startBuilt } from '../quick';
import { AnyGymDB } from '../schema';
import type { Gym } from '../types';

let db: AnyGymDB; let gym: Gym; let seq = 0;
beforeEach(async () => {
  db = new AnyGymDB(`anygym-verify-35c-${seq++}`); await db.open();
  gym = { ...makeGym({ name: 'V gym', type: 'full', unit: 'lb', isActive: true }), timeBudgetMin: 60 };
  await db.gyms.add(gym);
});
afterEach(async () => { await db.delete(); });

function deck(): Pick<Concept, 'items' | 'plan'> {
  const plan = planById('five-day-split')!; const day = plan.days[0]!;
  const trim = trimDay(day, { budget: 30, profileOf: profileFor }).trim!;
  const rep: Record<string, { id: string; name: string }> = {
    'barbell-back-squat': { id: 'Dumbbell_Squat', name: 'Dumbbell Squat' },
    'angled-machine-leg-press': { id: 'Leg_Press', name: 'Leg Press' },
  };
  const items: QuickItem[] = applyTrim(day, trim).blocks.flatMap((b) => b.items.map((it) => ({
    id: it.exerciseId, slot: it.exerciseId, origin: it.exerciseId, name: it.name, pattern: null, sets: b.sets ?? 1,
    reps: it.reps, seconds: it.seconds, restSec: b.restSec ?? 0, why: 'x', ...rep[it.exerciseId],
  })));
  return { items, plan: { planId: plan.id, dayIndex: 0, weekIndex: 0, day, trim } };
}
async function counts() {
  return { s: await db.sessions.count(), sets: await db.sets.count(), j: await db.journal.count(), sub: await db.submissions.count(), gym: (await db.gyms.get(gym.id))!.timeBudgetMin };
}
async function exact(c: ReturnType<typeof deck>) {
  const all = await db.sessions.toArray();
  expect(all).toHaveLength(1);
  const s = all[0]!;
  expect(s.exerciseIds).toEqual(c.items.map((i) => i.id));
  expect(s.trim).toEqual(c.plan!.trim);
  expect(s.timeBudgetMin).toBe(30);
  const swapped = c.items.filter((i) => i.id !== i.origin);
  expect(swapped.length).toBeGreaterThanOrEqual(2);
  for (const it of swapped) expect(s.swaps).toContainEqual({ slot: it.slot, current: it.id });
  expect(s.swaps).toHaveLength(swapped.length);
  expect((await db.gyms.get(gym.id))!.timeBudgetMin).toBe(30);
}

describe('3.5c verify: Start from a deck is one transaction', () => {
  for (const [label, nth] of [['trim write fails', 1], ['first swap fails', 2], ['second swap fails', 3]] as const) {
    it(`${label}: nothing remains, Retry starts the exact deck`, async () => {
      const c = deck(); const base = await counts();
      let n = 0; const fail = () => { if (++n === nth) throw new Error('boom'); };
      db.sessions.hook('updating', fail);
      await expect(startBuilt(gym.id, c, 30, db, 1000)).rejects.toThrow('boom');
      db.sessions.hook('updating').unsubscribe(fail);
      expect(await counts()).toEqual(base);
      expect(await db.sessions.count()).toBe(0);
      await startBuilt(gym.id, c, 30, db, 2000);
      await exact(c);
      const after = await counts();
      expect(after.j).toBe(0); expect(after.sets).toBe(0);
    });
  }
  it('gym minutes write failing mid-way leaves gym at the old minutes and no session', async () => {
    const c = deck();
    const fail = () => { throw new Error('gymboom'); };
    db.gyms.hook('updating', fail);
    await expect(startBuilt(gym.id, c, 30, db, 1000)).rejects.toThrow('gymboom');
    db.gyms.hook('updating').unsubscribe(fail);
    expect((await db.gyms.get(gym.id))!.timeBudgetMin).toBe(60);
    expect(await db.sessions.count()).toBe(0);
    await startBuilt(gym.id, c, 30, db, 2000); await exact(c);
  });
  it('normal Start writes once; double and concurrent Start give no duplicates', async () => {
    const c = deck();
    const [a, b] = await Promise.all([startBuilt(gym.id, c, 30, db, 1000), startBuilt(gym.id, c, 30, db, 1001)]);
    expect(a.id).toBe(b.id);
    await startBuilt(gym.id, c, 30, db, 3000);
    await exact(c);
    expect(await db.journal.count()).toBe(0);
  });
});
