// One inclusion rule for rotation recovery, Quick and Up next: real, dated, certain working sets.
import { profileFor } from '../data/order';
import { focusFacts } from '../data/focus';
import type { Muscle } from '../lib/order';
import type { TrainingEntry } from '../lib/plan/recovery';
import { type LoggedWorkout, musclesTrained, musclesWorkedOnly } from '../lib/recovery';
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

/** The target (primary) muscles of one logged set that proves something; never its helpers. */
function targetsOf(row: WorkoutSet): Muscle[] {
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

/** One session's proving sets as src/lib/recovery reads them (every set here is a certain working set). */
const loggedOf = (at: number, rows: readonly WorkoutSet[]): LoggedWorkout => ({ at, sets: rows.map((row) => ({ kind: row.kind, primary: targetsOf(row) })) });

/** Muscle → the start of the latest workout whose sets give it, over the last 30 days. */
async function lastDates(of: (at: number, rows: readonly WorkoutSet[]) => Muscle[], now: number, db: AnyGymDB, excludeSession?: string): Promise<Partial<Record<Muscle, number>>> {
  const { sessions, sets } = await workSince(now - LOOKBACK, now, db, excludeSession);
  const bySession = new Map<string, WorkoutSet[]>();
  for (const row of sets) if (liftOf(row)) bySession.set(row.sessionId, [...(bySession.get(row.sessionId) ?? []), row]);
  const out: Partial<Record<Muscle, number>> = {};
  for (const [id, rows] of bySession) {
    const at = sessions.get(id)!.startedAt;
    for (const m of of(at, rows)) out[m] = Math.max(out[m] ?? 0, at);
  }
  return out;
}

/**
 * When each muscle was last trained. SPEC 20.3 (PLAN H2): the one rule lives in src/lib/recovery
 * (3 working sets with the group as a primary muscle); helpers never count (PLAN H1).
 */
export const readTraining = (now: number, db: AnyGymDB = defaultDb, excludeSession?: string) =>
  lastDates((at, rows) => musclesTrained(loggedOf(at, rows)), now, db, excludeSession);

/**
 * When each muscle last worked without being trained: as a helper of a logged working set, or as a
 * target with too few sets (PLAN H2). Never a trained fact (PLAN H1); it keeps suggestions off the
 * muscle and any "rested" claim past that workout off the screen.
 */
export const readHelped = (now: number, db: AnyGymDB = defaultDb, excludeSession?: string) =>
  lastDates((at, rows) => [...new Set([...rows.flatMap(helperMusclesOf), ...musclesWorkedOnly(loggedOf(at, rows))])], now, db, excludeSession);

/**
 * The last 48 hours of real work, one entry per workout, for the next day rule (lib/plan/recovery.ts
 * decides what counts). The same proving sets as readTraining.
 */
export async function readTrainingLog(now: number, db: AnyGymDB = defaultDb): Promise<TrainingEntry[]> {
  const { sessions, sets } = await workSince(now - TIRED_MS, now, db);
  const byId = new Map([...sessions.values()].map((s) => [s.id, { at: s.startedAt, ...(s.planId ? { planId: s.planId } : {}), ...(s.dayId ? { dayId: s.dayId } : {}), sets: {} as Record<string, number> }]));
  for (const row of sets) {
    const e = byId.get(row.sessionId)!;
    for (const m of targetsOf(row)) e.sets[m] = (e.sets[m] ?? 0) + 1;
  }
  return [...byId.values()];
}

/**
 * PLAN Q3a0: every dated workout's proving sets, as Quick's target menu reads them (lib/quickCards.ts
 * targetMenu). The whole history, so "rested longest" is true; what counts as trained is decided in
 * src/lib/recovery alone. A plain Dexie promise chain (see workSince).
 */
export function readRecoveryLog(now: number, db: AnyGymDB = defaultDb): Promise<LoggedWorkout[]> {
  return workSince(0, now, db).then(({ sessions, sets }) => {
    const bySession = new Map<string, WorkoutSet[]>();
    for (const row of sets) if (liftOf(row)) bySession.set(row.sessionId, [...(bySession.get(row.sessionId) ?? []), row]);
    return [...bySession].map(([id, rows]) => loggedOf(sessions.get(id)!.startedAt, rows));
  });
}
