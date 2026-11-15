// PLAN 3.6w (1): the plan registry is filled in one order everywhere (app start, Replace, Merge):
// this phone's candidate approvals reach the gate first, then every saved generated plan is
// registered. A personal plan may hold a move G approved, so the other order can leave it out. A
// failed read, or a saved plan that does not register, is never a silent "no plan": the status
// says so and Today shows one line with Try again (SPEC 13.1).
import { loadApprovals } from './candidateReviews';
import { registerSavedPlan } from '../data/plans';
import { db as defaultDb, type AnyGymDB } from './schema';

export type RegistryStatus = { state: 'loading' | 'ready' | 'failed'; missing: number };

let status: RegistryStatus = { state: 'loading', missing: 0 };
let lastDb: AnyGymDB = defaultDb;
const listeners = new Set<() => void>();

const set = (next: RegistryStatus) => {
  status = next;
  for (const l of listeners) l();
};

export const registryStatus = (): RegistryStatus => status;
export function onRegistryStatus(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Thrown when the registry could not be filled: the plans stay on the phone, only unknown here. */
export class PlanRegistryError extends Error {
  constructor(readonly missing: number, cause?: unknown) {
    super(missing ? `${missing} saved plan(s) could not be loaded` : 'Saved plans could not be read', { cause });
  }
}

/** Approvals, then saved plans. Resolves with how many saved plans are known; throws PlanRegistryError. */
export async function loadPlanRegistry(db: AnyGymDB = defaultDb): Promise<number> {
  lastDb = db;
  set({ state: 'loading', missing: 0 });
  let rows;
  try {
    await loadApprovals(db);
    rows = await db.plans.filter((p) => p.source === 'generated' && !!p.definition).toArray();
  } catch (e) {
    set({ state: 'failed', missing: 0 });
    throw new PlanRegistryError(0, e);
  }
  let n = 0;
  for (const r of rows) if (registerSavedPlan(r.definition)) n++;
  const missing = rows.length - n;
  if (missing) {
    set({ state: 'failed', missing });
    throw new PlanRegistryError(missing);
  }
  set({ state: 'ready', missing: 0 });
  return n;
}

/** Try again (Today): the same load against the same database. Never throws. */
export const retryPlanRegistry = (): Promise<void> =>
  loadPlanRegistry(lastDb).then(
    () => undefined,
    (e: unknown) => console.warn('AnyGym plans unavailable', e),
  );
