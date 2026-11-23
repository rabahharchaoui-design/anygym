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

/** The exercise profile of a logged set that proves something: a certain working set of a lift with sure muscles. */
function liftOf(row: WorkoutSet) {
  if (row.kind !== 'work' || row.uncertain || !(row.reps || row.seconds)) return null;
  const p = profileFor(row.exerciseId);
  // The actual logged exercise already reflects swaps.
  return p.role === 'lift' && focusFacts(row.exerciseId, p).muscles.length ? p : null;
}

/** SPEC 20.3 (PLAN H1): the muscles one logged set trained: its exercise's targets, never its helpers. */
function trainedMusclesOf(row: WorkoutSet): Muscle[] {
  return [...(liftOf(row)?.targets ?? [])];
}

/**
 * The helper muscles one logged set worked, never one of its targets (forearms never count). Only to
 * keep a suggestion off a tired helper or a "rested" claim off it; never worded as trained.
 */
function helperMusclesOf(row: WorkoutSet): Muscle[] {
  const p = liftOf(row);
  return p ? p.helpers.filter((m) => m !== 'forearms' && !p.targets.includes(m)) : [];
}

/** Muscle → the start of the latest workout whose sets give it, over the last 30 days. */
async function lastDates(of: (row: WorkoutSet) => Muscle[], now: number, db: AnyGymDB, excludeSession?: string): Promise<Partial<Record<Muscle, number>>> {
  const { sessions, sets } = await workSince(now - LOOKBACK, now, db, excludeSession);
  const out: Partial<Record<Muscle, number>> = {};
  for (const row of sets) for (const m of of(row)) out[m] = Math.max(out[m] ?? 0, sessions.get(row.sessionId)!.startedAt);
  return out;
}

/** When each muscle was last trained (target muscles of logged working sets only). */
export const readTraining = (now: number, db: AnyGymDB = defaultDb, excludeSession?: string) => lastDates(trainedMusclesOf, now, db, excludeSession);

/** When each muscle last worked as a helper of a logged working set. Never a trained fact (PLAN H1). */
export const readHelped = (now: number, db: AnyGymDB = defaultDb, excludeSession?: string) => lastDates(helperMusclesOf, now, db, excludeSession);

/**
 * The last 48 hours of real work, one entry per workout, for the next day rule (lib/plan/recovery.ts
 * decides what counts). The same inclusion rule as readTraining.
 */
export async function readTrainingLog(now: number, db: AnyGymDB = defaultDb): Promise<TrainingEntry[]> {
  const { sessions, sets } = await workSince(now - TIRED_MS, now, db);
  const byId = new Map([...sessions.values()].map((s) => [s.id, { at: s.startedAt, ...(s.planId ? { planId: s.planId } : {}), ...(s.dayId ? { dayId: s.dayId } : {}), sets: {} as Record<string, number> }]));
  for (const row of sets) {
    const e = byId.get(row.sessionId)!;
    for (const m of trainedMusclesOf(row)) e.sets[m] = (e.sets[m] ?? 0) + 1;
  }
  return [...byId.values()];
}
