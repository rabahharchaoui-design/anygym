// Plans generated from someone's answers (PLAN 3.5), saved on the phone in the plans table (the row
// keeps the whole definition, an additive field: no new store, no version bump). Every saved plan is
// registered with src/data/plans.ts when the app starts, so Today, the workout, History and Finish
// find it like a curated plan. A definition is never changed: the same answers give the same id, new
// answers a new plan, and a past workout keeps the plan it was started from.
import { definitionPlan, registerSavedPlan } from '../data/plans';
import type { Plan as PlanDefinition } from '../lib/plans';
import { db as defaultDb, type AnyGymDB } from './schema';

/** Saves a generated plan (once: the same id is the same plan) and makes it known. Throws for a definition the app cannot run. */
export async function saveGeneratedPlan(raw: Record<string, unknown>, db: AnyGymDB = defaultDb, now = Date.now()): Promise<PlanDefinition> {
  const plan = definitionPlan(raw);
  if (!plan) throw new Error('Not a plan this app can run');
  await db.transaction('rw', db.plans, async () => {
    if (await db.plans.get(plan.id)) return;
    await db.plans.add({ id: plan.id, name: plan.name, source: 'generated', createdAt: now, definition: raw });
  });
  return registerSavedPlan(raw) ?? plan;
}

/** App start (and after a restore): registers every saved generated plan. Rows it cannot run are left as they are. */
export async function loadSavedPlans(db: AnyGymDB = defaultDb): Promise<number> {
  const rows = await db.plans.filter((p) => p.source === 'generated' && !!p.definition).toArray();
  let n = 0;
  for (const r of rows) if (registerSavedPlan(r.definition)) n++;
  return n;
}
