// PLAN 3.6w (1): a personal plan holding a move G approved on this phone is known after app start,
// a Replace restore and a Merge restore: the approvals reach the gate before the saved plans are
// registered. A failed read, or a plan that still does not register, is reported (Today shows Try
// again) instead of the app silently going on without the plan.
//
// Each case runs in a fresh copy of the modules (vi.resetModules): a new phone, or the app opened
// again, whose gate and plan registry start empty, which is exactly when the order matters.
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Mods = {
  schema: typeof import('../schema');
  backup: typeof import('../backup');
  reviews: typeof import('../candidateReviews');
  saved: typeof import('../savedPlans');
  registry: typeof import('../planRegistry');
  gate: typeof import('../../data/candidateGate');
  plans: typeof import('../../data/plans');
  review: typeof import('../../lib/candidates/review');
};

async function fresh(): Promise<Mods> {
  vi.resetModules();
  return {
    schema: await import('../schema'),
    backup: await import('../backup'),
    reviews: await import('../candidateReviews'),
    saved: await import('../savedPlans'),
    registry: await import('../planRegistry'),
    gate: await import('../../data/candidateGate'),
    plans: await import('../../data/plans'),
    review: await import('../../lib/candidates/review'),
  };
}

const names: string[] = [];
const newDb = (m: Mods) => {
  const name = `reg-36w-${Math.random()}`;
  names.push(name);
  return new m.schema.AnyGymDB(name);
};
afterEach(async () => {
  vi.restoreAllMocks();
  for (const n of names.splice(0)) await Dexie.delete(n);
});

/** A personal plan whose first day also holds an approved candidate move (not on any ladder). */
async function seedPhone(m: Mods) {
  await m.gate.loadCandidateFile();
  // A move nothing else resolves (no plan exercise, no ladder id): only the approval makes it known.
  const cand = m.gate.ownerCandidates().find((c) => !m.plans.resolvePlanExercise(c.name, c.id));
  if (!cand) throw new Error('no candidate outside the ladders');
  const { generate } = await import('../../data/generator');
  const { equipmentPreset } = await import('../gyms');
  const hotel = equipmentPreset('hotel', 'lb');
  const r = generate({ goals: ['muscle'], experience: '1_2y', days: 2, minutes: 45, gym: { equipment: hotel.equipment, dumbbellRange: hotel.dumbbellRange }, place: 'hotel' });
  if (!r.ok) throw new Error(r.reason);
  const raw = JSON.parse(JSON.stringify(r.plan)) as { days: Array<{ blocks: unknown[] }> } & Record<string, unknown>;
  raw.days[0]!.blocks.push({ type: 'single', exercise: cand.name, id: cand.id, sets: 2, reps: '10-12' });
  const db = newDb(m);
  await db.open();
  await m.reviews.saveCandidateDecision(m.review.decisionRow(cand.id, 'approve', 1), db);
  const plan = await m.saved.saveGeneratedPlan(raw, db);
  expect(plan.days[0]!.blocks.length).toBe(r.plan.days[0]!.blocks.length + 1);
  const backup = await m.backup.exportBackup(db);
  return { db, raw, planId: plan.id, cand, backup };
}

let src: Awaited<ReturnType<typeof seedPhone>>;
beforeEach(async () => {
  src = await seedPhone(await fresh());
});

describe('approvals before saved plans', () => {
  it('app start: the plan with an approved move is known, with every exercise', async () => {
    const m = await fresh();
    const db = new m.schema.AnyGymDB(src.db.name);
    expect(m.plans.planById(src.planId)).toBeUndefined();
    expect(await m.registry.loadPlanRegistry(db)).toBe(1);
    const plan = m.plans.planById(src.planId);
    expect(plan?.days[0]!.blocks.some((b) => b.items.some((e) => e.exerciseId === src.cand.id))).toBe(true);
    expect(m.registry.registryStatus()).toEqual({ state: 'ready', missing: 0 });
    db.close();
  });

  it('Replace restore on a phone with an empty gate: the plan is known', async () => {
    const m = await fresh();
    const db = newDb(m);
    await db.open();
    await m.backup.restoreReplace(src.backup as never, db);
    expect(m.gate.isApprovedCandidate(src.cand.id)).toBe(true);
    expect(m.plans.planById(src.planId)?.id).toBe(src.planId);
    expect(m.registry.registryStatus().state).toBe('ready');
    db.close();
  });

  it('Merge restore on a phone with an empty gate: the plan is known', async () => {
    const m = await fresh();
    const db = newDb(m);
    await db.open();
    await m.backup.restoreMerge(src.backup as never, db);
    expect(m.gate.isApprovedCandidate(src.cand.id)).toBe(true);
    expect(m.plans.planById(src.planId)?.id).toBe(src.planId);
    expect(m.registry.registryStatus().state).toBe('ready');
    db.close();
  });
});

describe('a failure is reported with Try again, never silent', () => {
  it('the approvals read fails at start: failed status, Try again loads the plan', async () => {
    const m = await fresh();
    const db = new m.schema.AnyGymDB(src.db.name);
    await db.open();
    const spy = vi.spyOn(db.candidateReviews, 'toArray').mockRejectedValueOnce(new Error('read failed'));
    await expect(m.registry.loadPlanRegistry(db)).rejects.toBeInstanceOf(m.registry.PlanRegistryError);
    expect(m.registry.registryStatus()).toEqual({ state: 'failed', missing: 0 });
    expect(m.plans.planById(src.planId)).toBeUndefined();
    spy.mockRestore();
    await m.registry.retryPlanRegistry();
    expect(m.registry.registryStatus().state).toBe('ready');
    expect(m.plans.planById(src.planId)?.id).toBe(src.planId);
    db.close();
  });

  it('the saved plans read fails: failed status', async () => {
    const m = await fresh();
    const db = new m.schema.AnyGymDB(src.db.name);
    await db.open();
    vi.spyOn(db.plans, 'filter').mockImplementationOnce(() => {
      throw new Error('read failed');
    });
    await expect(m.registry.loadPlanRegistry(db)).rejects.toThrow();
    expect(m.registry.registryStatus().state).toBe('failed');
    db.close();
  });

  it('a saved plan that does not register is counted as missing (the approval was taken back)', async () => {
    const m = await fresh();
    const db = new m.schema.AnyGymDB(src.db.name);
    await db.open();
    await db.candidateReviews.put(m.review.decisionRow(src.cand.id, 'wrong', 2));
    await expect(m.registry.loadPlanRegistry(db)).rejects.toThrow(/1 saved plan/);
    expect(m.registry.registryStatus()).toEqual({ state: 'failed', missing: 1 });
    // The plan itself stays on the phone untouched.
    expect((await db.plans.get(src.planId))?.definition).toEqual(src.raw);
    db.close();
  });

  it('a restore whose plans then fail to load still restores, and reports the failure', async () => {
    const m = await fresh();
    const db = newDb(m);
    await db.open();
    vi.spyOn(db.candidateReviews, 'toArray').mockRejectedValue(new Error('read failed'));
    const result = await m.backup.restoreReplace(src.backup as never, db);
    expect(result.workouts).toBe(src.backup.tables.sessions.length);
    expect((await db.plans.get(src.planId))?.definition).toEqual(src.raw);
    expect(m.registry.registryStatus().state).toBe('failed');
    db.close();
  });
});

describe('the words on Today', () => {
  it('one plain sentence for each case', async () => {
    const { registryWords } = await import('../../hooks/usePlanRegistry');
    expect(registryWords(0)).toBe('Could not load your plans.');
    expect(registryWords(1)).toBe('One of your plans could not be loaded.');
    expect(registryWords(2)).toBe('2 of your plans could not be loaded.');
  });
});
