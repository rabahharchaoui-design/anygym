// One inclusion rule for rotation recovery, Quick and Up next: real, dated, certain working sets.
import { profileFor } from '../data/order';
import { focusFacts } from '../data/focus';
import type { Muscle } from '../lib/order';
import type { TrainingEntry } from '../lib/plan/recovery';
import { TIRED_MS } from '../lib/quickWhy';
import { db as defaultDb, type AnyGymDB } from './schema';
import type { Session, WorkoutSet } from './types';

const LOOKBACK = 30 * 24 * 60 * 60 * 1000;

/**
 * The dated workouts since `from` with their sets (imported history has no dates and never counts).
 * A plain Dexie promise chain, never an async function: these reads run inside live transactions,
 * and Safari commits a transaction early when a native promise is awaited in between.
 */
function workSince(from: number, now: number, db: AnyGymDB, excludeSession?: string) {
  return db.sessions.where('startedAt').between(from, now, true, true).toArray().then((all) => {
    const sessions = new Map(all.filter((s) => !s.imported && s.id !== excludeSession).map((s): [string, Session] => [s.id, s]));
    const none: WorkoutSet[] = [];
    return (sessions.size ? db.sets.where('sessionId').anyOf([...sessions.keys()]).toArray() : db.sets.limit(0).toArray().then(() => none)).then((sets) => ({ sessions, sets }));
  });
}

/** The muscles one logged set trained: a certain working set of a lift, else none. Helpers count for recovery, never volume. */
function musclesOf(row: WorkoutSet): Muscle[] {
  if (row.kind !== 'work' || row.uncertain || !(row.reps || row.seconds)) return [];
  const p = profileFor(row.exerciseId);
  if (p.role !== 'lift' || !focusFacts(row.exerciseId, p).muscles.length) return [];
  // The actual logged exercise already reflects swaps.
  return [...new Set([...p.targets, ...p.helpers.filter((m) => m !== 'forearms')])];
}

export async function readTraining(now: number, db: AnyGymDB = defaultDb, excludeSession?: string): Promise<Partial<Record<Muscle, number>>> {
  const { sessions, sets } = await workSince(now - LOOKBACK, now, db, excludeSession);
  const trained: Partial<Record<Muscle, number>> = {};
  for (const row of sets) for (const m of musclesOf(row)) trained[m] = Math.max(trained[m] ?? 0, sessions.get(row.sessionId)!.startedAt);
  return trained;
}

/**
 * The last 48 hours of real work, one entry per workout, for the next day rule (lib/plan/recovery.ts
 * decides what counts). The same inclusion rule as readTraining.
 */
export async function readTrainingLog(now: number, db: AnyGymDB = defaultDb): Promise<TrainingEntry[]> {
  const { sessions, sets } = await workSince(now - TIRED_MS, now, db);
  const byId = new Map([...sessions.values()].map((s) => [s.id, { at: s.startedAt, ...(s.planId ? { planId: s.planId } : {}), ...(s.dayId ? { dayId: s.dayId } : {}), sets: {} as Record<string, number> }]));
  for (const row of sets) {
    const e = byId.get(row.sessionId)!;
    for (const m of musclesOf(row)) e.sets[m] = (e.sets[m] ?? 0) + 1;
  }
  return [...byId.values()];
}
