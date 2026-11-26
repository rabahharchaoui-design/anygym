// PLAN Q3a0 (SPEC 20.3): the log as Quick's target menu reads it (lib/quickCards.ts targetMenu). Only
// the facts: each dated workout with its logged sets, their kind, and the exercise's primary (target)
// and secondary (helper) muscles. What counts as trained is decided in src/lib/recovery alone (3
// working sets with the group as a primary muscle); nothing is counted here.
import { profileFor } from '../data/order';
import type { LoggedSet, LoggedWorkout } from '../lib/recovery';
import { db as defaultDb, type AnyGymDB } from './schema';
import type { WorkoutSet } from './types';

/** One logged set as recovery sees it; a set with no reps or time logged, or not a lift, proves nothing. */
function loggedOf(row: WorkoutSet): LoggedSet | null {
  if (!(row.reps || row.seconds)) return null;
  const p = profileFor(row.exerciseId);
  if (p.role !== 'lift') return null;
  return { kind: row.kind, primary: [...p.targets], secondary: [...p.helpers], ...(row.uncertain ? { uncertain: true } : {}) };
}

/**
 * Every dated workout started by `now` (imported history has no dates and never counts), with its
 * logged sets. A plain Dexie promise chain: it may run inside a live transaction (Safari).
 */
export function readRecoveryLog(now: number, db: AnyGymDB = defaultDb): Promise<LoggedWorkout[]> {
  return db.sessions.where('startedAt').belowOrEqual(now).toArray().then((all) => {
    const sessions = all.filter((s) => !s.imported && Number.isFinite(s.startedAt));
    if (!sessions.length) return [];
    const byId = new Map(sessions.map((s) => [s.id, { at: s.startedAt, sets: [] as LoggedSet[] }]));
    return db.sets.where('sessionId').anyOf([...byId.keys()]).toArray().then((sets) => {
      for (const row of sets) {
        const s = loggedOf(row);
        if (s) byId.get(row.sessionId)?.sets.push(s);
      }
      return [...byId.values()];
    });
  });
}
