// PLAN 3.6d (audit A1 and its "not verified" twin): a backup must restore on a new phone, through
// parseBackup (the only door the Restore button has), not only on the phone that made it.
//
// Each "phone" is a fresh copy of the modules (vi.resetModules): its plan registry and candidate
// gate start empty, exactly like a new phone or Safari data cleared.
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';

type Mods = {
  schema: typeof import('../schema');
  backup: typeof import('../backup');
  reviews: typeof import('../candidateReviews');
  saved: typeof import('../savedPlans');
  gate: typeof import('../../data/candidateGate');
  plans: typeof import('../../data/plans');
  review: typeof import('../../lib/candidates/review');
  lib: typeof import('../../lib/backup');
  tips: typeof import('../../lib/coachTips');
  order: typeof import('../../data/order');
  planState: typeof import('../planState');
  gyms: typeof import('../gyms');
  gen: typeof import('../../data/generator');
  boot: typeof import('../bootstrap');
  registry: typeof import('../planRegistry');
};

async function phone(): Promise<Mods> {
  vi.resetModules();
  return {
    schema: await import('../schema'),
    backup: await import('../backup'),
    reviews: await import('../candidateReviews'),
    saved: await import('../savedPlans'),
    gate: await import('../../data/candidateGate'),
    plans: await import('../../data/plans'),
    review: await import('../../lib/candidates/review'),
    lib: await import('../../lib/backup'),
    tips: await import('../../lib/coachTips'),
    order: await import('../../data/order'),
    planState: await import('../planState'),
    gyms: await import('../gyms'),
    gen: await import('../../data/generator'),
    boot: await import('../bootstrap'),
    registry: await import('../planRegistry'),
  };
}

const names: string[] = [];
async function newDb(m: Mods) {
  const name = `b36d-${Math.random()}`;
  names.push(name);
  const db = new m.schema.AnyGymDB(name);
  await db.open();
  return db;
}
afterEach(async () => {
  vi.restoreAllMocks();
  for (const n of names.splice(0)) await Dexie.delete(n);
});

type RawPlan = { days: Array<{ blocks: unknown[] }> } & Record<string, unknown>;

function hotelPlan(m: Mods): RawPlan {
  const kit = m.gyms.equipmentPreset('hotel', 'lb');
  const r = m.gen.generate({ goals: ['muscle'], experience: '1_2y', days: 2, minutes: 45, gym: { equipment: kit.equipment, dumbbellRange: kit.dumbbellRange }, place: 'hotel' });
  if (!r.ok) throw new Error(r.reason);
  return JSON.parse(JSON.stringify(r.plan)) as RawPlan;
}

/** A personal plan that holds a move only an approval on the phone makes known. */
async function planWithApprovedMove(m: Mods) {
  await m.gate.loadCandidateFile();
  const cand = m.gate.ownerCandidates().find((c) => !m.plans.resolvePlanExercise(c.name, c.id));
  if (!cand) throw new Error('no candidate outside the ladders');
  const db = await newDb(m);
  const raw = hotelPlan(m);
  raw.days[0]!.blocks.push({ type: 'single', exercise: cand.name, id: cand.id, sets: 2, reps: '10-12' });
  const saved = await m.reviews.saveCandidateDecision(m.review.decisionRow(cand.id, 'approve', 1), db);
  const plan = await m.saved.saveGeneratedPlan(raw, db);
  return { db, cand, plan, saved };
}

/** A generated plan with at least one coach tip, its tuned copy in use, a rotation pending. */
async function tunedPlanInUse(m: Mods) {
  for (const place of ['full', 'hotel', 'home'] as const) {
    for (const days of [2, 3, 4, 5] as const) {
      for (const exp of ['new', '1_2y', '3y'] as const) {
        const kit = m.gyms.equipmentPreset(place, 'lb');
        const r = m.gen.generate({ goals: ['muscle'], experience: exp, days, minutes: 60, gym: { equipment: kit.equipment, dumbbellRange: kit.dumbbellRange }, place });
        if (!r.ok) continue;
        const db = await newDb(m);
        const plan = await m.saved.saveGeneratedPlan(JSON.parse(JSON.stringify(r.plan)), db);
        const tips = m.tips.planTips(plan, (id: string) => m.order.profileFor(id));
        if (!tips.length) continue;
        const tid = m.tips.tunedId(plan.id, tips.map((t) => t.id));
        await m.boot.ensureFirstGym(db);
        const st = await m.planState.choosePlan(tid, db);
        await db.planState.put({ ...st, pendingDayIndices: plan.days.map((_, i) => i) });
        return { db, plan, tid };
      }
    }
  }
  throw new Error('no generated plan with a coach tip');
}

describe('A1: a coach tuned copy of Your plan', () => {
  it('a backup taken while it is in use parses and restores on a new phone', async () => {
    const old = await phone();
    const { db, tid, plan } = await tunedPlanInUse(old);
    const text = old.lib.serializeBackup(await old.backup.exportBackup(db));
    expect(old.lib.parseBackup(text).ok).toBe(true);

    const fresh = await phone();
    const parsed = fresh.lib.parseBackup(text);
    expect(parsed).toMatchObject({ ok: true });
    if (!parsed.ok) return;
    const target = await newDb(fresh);
    await fresh.backup.restoreReplace(parsed.backup, target);
    const state = await target.planState.get('active');
    expect(state?.planId).toBe(tid);
    expect(state?.pendingDayIndices).toEqual(plan.days.map((_, i) => i));
    // The tuned copy is known on the new phone once its base plan is registered.
    expect(fresh.plans.planById(tid)?.id).toBe(tid);
  });

  it('a pending day past the plan is still refused (the check still knows the plan)', async () => {
    const old = await phone();
    const { db, plan } = await tunedPlanInUse(old);
    const st = (await db.planState.get('active'))!;
    await db.planState.put({ ...st, pendingDayIndices: [plan.days.length + 3] });
    const text = old.lib.serializeBackup(await old.backup.exportBackup(db));
    const fresh = await phone();
    expect(fresh.lib.parseBackup(text)).toEqual({ ok: false, error: fresh.lib.DAMAGED });
  });
});

describe('not verified list: a personal plan holding an approved candidate move', () => {
  it('parses on a new phone whose gate is empty, and the plan runs after the restore', async () => {
    const old = await phone();
    const { db, plan } = await planWithApprovedMove(old);
    const text = old.lib.serializeBackup(await old.backup.exportBackup(db));
    expect(old.lib.parseBackup(text).ok).toBe(true);

    const fresh = await phone();
    const parsed = fresh.lib.parseBackup(text);
    expect(parsed).toMatchObject({ ok: true });
    if (!parsed.ok) return;
    await fresh.gate.loadCandidateFile();
    const target = await newDb(fresh);
    await fresh.backup.restoreReplace(parsed.backup, target);
    expect(fresh.plans.planById(plan.id)?.id).toBe(plan.id);
    expect(fresh.registry.registryStatus().state).toBe('ready');
  });

  it('after the approval is taken back, the next backup still parses on the same phone', async () => {
    const m = await phone();
    const { db, cand, saved } = await planWithApprovedMove(m);
    await m.reviews.undoCandidateDecision(cand.id, saved.previous, db);
    const text = m.lib.serializeBackup(await m.backup.exportBackup(db));
    expect(m.lib.parseBackup(text)).toMatchObject({ ok: true });
  });

  it('a plan row whose definition names another id is still refused', async () => {
    const m = await phone();
    const { db, plan } = await planWithApprovedMove(m);
    const backup = await m.backup.exportBackup(db);
    const row = backup.tables.plans.find((p) => p.id === plan.id)!;
    row.definition = { ...(row.definition as Record<string, unknown>), id: 'mine-someone-else' };
    expect(m.lib.parseBackup(m.lib.serializeBackup(backup))).toEqual({ ok: false, error: m.lib.DAMAGED });
  });
});
