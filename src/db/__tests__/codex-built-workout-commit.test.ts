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

let db: AnyGymDB;
let gym: Gym;
let seq = 0;
beforeEach(async () => {
  db = new AnyGymDB(`anygym-codex-built-commit-${seq++}`);
  await db.open();
  gym = makeGym({ name: 'Synthetic full gym', type: 'full', unit: 'lb', isActive: true });
  await db.gyms.add(gym);
});
afterEach(async () => { await db.delete(); });
async function reopen() {
  const name = db.name;
  db.close();
  db = new AnyGymDB(name);
  await db.open();
}

function deck(): Pick<Concept, 'items' | 'plan'> {
  const plan = planById('five-day-split')!;
  const day = plan.days[0]!;
  const trim = trimDay(day, { budget: 30, profileOf: profileFor }).trim!;
  // The first two compound slots survive SPEC 7.4 trimming. The deck swapped
  // both to real catalog exercises before Start; neither choice may be lost.
  const replacements: Record<string, { id: string; name: string }> = {
    'barbell-back-squat': { id: 'Dumbbell_Squat', name: 'Dumbbell Squat' },
    'angled-machine-leg-press': { id: 'Leg_Press', name: 'Leg Press' },
  };
  const items: QuickItem[] = applyTrim(day, trim).blocks.flatMap((b) => b.items.map((it) => ({
    id: it.exerciseId, slot: it.exerciseId, origin: it.exerciseId, name: it.name,
    pattern: null, sets: b.sets ?? 1, reps: it.reps, seconds: it.seconds,
    restSec: b.restSec ?? 0, why: 'Chosen in the deck', ...replacements[it.exerciseId],
  })));
  return { items, plan: { planId: plan.id, dayIndex: 0, weekIndex: 0, day, trim } };
}

async function expectDeck(c: ReturnType<typeof deck>) {
  const [s] = await db.sessions.toArray();
  expect(s).toBeDefined();
  expect(s!.trim).toEqual(c.plan!.trim);
  expect(s!.timeBudgetMin).toBe(30);
  expect(s!.exerciseIds).toEqual(c.items.map((it) => it.id));
  for (const it of c.items.filter((it) => it.id !== it.origin)) {
    expect(s!.exerciseIds).toContain(it.id);
    expect(s!.exerciseIds).not.toContain(it.origin);
    expect(s!.swaps).toContainEqual({ slot: it.slot, current: it.id });
  }
  for (const id of c.plan!.trim!.drop) expect(s!.exerciseIds).not.toContain(id);
  expect((await db.gyms.get(gym.id))!.timeBudgetMin).toBe(30);
  expect(await db.sessions.count()).toBe(1);
}

// SPEC 0.4, 2, 20.3; completed PLAN 3.5a, 3.6. Existing tests exercise
// the deck and trim separately, not failure between their committed writes.
describe('built plan setup is one durable operation', () => {
  it('stores the trimmed deck exactly once across reload and a repeated Start', async () => {
    const c = deck();
    const before = JSON.stringify(planById('five-day-split'));
    const started = await startBuilt(gym.id, c, 30, db, 1000);
    await expectDeck(c);
    await reopen();
    expect(await startBuilt(gym.id, c, 30, db, 2000)).toEqual(started);
    await expectDeck(c);
    expect(JSON.stringify(planById('five-day-split'))).toBe(before);
  });

  // CODEX FOUND BUG: A failed built-workout trim leaves an untrimmed active session, and Retry never completes the chosen deck.
  it('rolls back a new workout when remembering its trim fails, so Retry can finish setup', async () => {
    const c = deck();
    const fail = () => { throw new Error('synthetic budget write failure'); };
    db.gyms.hook('updating', fail);
    try {
      await expect(startBuilt(gym.id, c, 30, db, 1000)).rejects.toThrow('synthetic budget write failure');
    } finally { db.gyms.hook('updating').unsubscribe(fail); }
    await reopen();
    expect.soft(await db.sessions.toArray(), 'a rejected Start must leave no resumable partial workout').toEqual([]);
    expect(await db.gyms.get(gym.id)).toEqual(gym);
    await startBuilt(gym.id, c, 30, db, 2000);
    await expectDeck(c);
  });

  // CODEX FOUND BUG: Failure on the second deck swap commits the trim and first swap, then Retry permanently skips the remaining choice.
  it('rolls back the trim and first replacement when saving the second deck replacement fails', async () => {
    const c = deck();
    let updates = 0;
    const fail = () => {
      if (++updates === 3) throw new Error('synthetic second swap failure');
    };
    db.sessions.hook('updating', fail);
    try {
      await expect(startBuilt(gym.id, c, 30, db, 1000)).rejects.toThrow('synthetic second swap failure');
      expect(updates).toBe(3); // trim, first replacement, second replacement
    } finally { db.sessions.hook('updating').unsubscribe(fail); }
    await reopen();
    expect.soft(await db.sessions.toArray(), 'the first replacement must not commit alone').toEqual([]);
    expect.soft(await db.gyms.get(gym.id), 'the failed Start must not change gym preferences').toEqual(gym);
    await startBuilt(gym.id, c, 30, db, 2000);
    await expectDeck(c);
  });
});
