// PLAN 4.4f (3): the candidate file is its own chunk, not precached. Offline right after an update it
// cannot load; that used to fail the whole plan registry, so Today said "Could not load your plans".
// Now the saved and built in plans still register; only a plan holding an approved candidate move
// waits (counted as missing, Try again loads it), and nothing saved is changed or deleted.
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';

async function fresh(offline: boolean) {
  vi.resetModules();
  vi.doUnmock('../../data/candidateGate');
  if (offline) {
    vi.doMock('../../data/candidateGate', async (orig) => ({
      ...(await orig<typeof import('../../data/candidateGate')>()),
      loadCandidateFile: () => Promise.reject(new TypeError('Failed to fetch dynamically imported module')),
    }));
  }
  return {
    schema: await import('../schema'),
    reviews: await import('../candidateReviews'),
    saved: await import('../savedPlans'),
    registry: await import('../planRegistry'),
    gate: await import('../../data/candidateGate'),
    plans: await import('../../data/plans'),
    review: await import('../../lib/candidates/review'),
  };
}

const names: string[] = [];
afterEach(async () => {
  vi.doUnmock('../../data/candidateGate');
  vi.restoreAllMocks();
  for (const n of names.splice(0)) await Dexie.delete(n);
});

/** A phone with one approval, a plain personal plan and a personal plan holding the approved move. */
async function seedPhone() {
  const m = await fresh(false);
  await m.gate.loadCandidateFile();
  const cand = m.gate.ownerCandidates().find((c) => !m.plans.resolvePlanExercise(c.name, c.id));
  if (!cand) throw new Error('no candidate outside the ladders');
  const { generate } = await import('../../data/generator');
  const { equipmentPreset } = await import('../gyms');
  const hotel = equipmentPreset('hotel', 'lb');
  const make = (days: number) => {
    const r = generate({ goals: ['muscle'], experience: '1_2y', days, minutes: 45, gym: { equipment: hotel.equipment, dumbbellRange: hotel.dumbbellRange }, place: 'hotel' });
    if (!r.ok) throw new Error(r.reason);
    return JSON.parse(JSON.stringify(r.plan)) as { days: Array<{ blocks: unknown[] }> } & Record<string, unknown>;
  };
  const plain = make(3);
  const withCand = make(2);
  withCand.days[0]!.blocks.push({ type: 'single', exercise: cand.name, id: cand.id, sets: 2, reps: '10-12' });
  const name = `reg-44f-${Math.random()}`;
  names.push(name);
  const db = new m.schema.AnyGymDB(name);
  await db.open();
  await m.reviews.saveCandidateDecision(m.review.decisionRow(cand.id, 'approve', 1), db);
  const a = await m.saved.saveGeneratedPlan(plain, db);
  const b = await m.saved.saveGeneratedPlan(withCand, db);
  const before = { plans: await db.plans.toArray(), reviews: await db.candidateReviews.toArray() };
  db.close();
  return { name, plainId: a.id, candPlanId: b.id, cand, before };
}

describe('the candidate file cannot load (PLAN 4.4f 3)', () => {
  it('applyApprovals does not throw; no candidate is approved', async () => {
    const src = await seedPhone();
    const m = await fresh(true);
    const db = new m.schema.AnyGymDB(src.name);
    await expect(m.reviews.loadApprovals(db)).resolves.toBe(1);
    expect(m.gate.isApprovedCandidate(src.cand.id)).toBe(false);
    db.close();
  });

  it('saved and built in plans register; the plan with the approved move waits; nothing saved changes', async () => {
    const src = await seedPhone();
    const m = await fresh(true);
    const db = new m.schema.AnyGymDB(src.name);
    await expect(m.registry.loadPlanRegistry(db)).rejects.toThrow(/1 saved plan/);
    // Not "Could not load your plans" (missing 0): one plan waits for the file.
    expect(m.registry.registryStatus()).toEqual({ state: 'failed', missing: 1 });
    expect(m.plans.planById(src.plainId)?.id).toBe(src.plainId);
    expect(m.plans.planById(m.plans.PLANS[0]!.id)?.id).toBe(m.plans.PLANS[0]!.id);
    expect(m.plans.planById(src.candPlanId)).toBeUndefined();
    expect(await db.plans.toArray()).toEqual(src.before.plans);
    expect(await db.candidateReviews.toArray()).toEqual(src.before.reviews);
    db.close();
  });
});
