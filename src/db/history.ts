// Past sessions of one exercise for the progression engine (SPEC 6, src/lib/progression.ts).
import type { PastSession, PastSet } from '../lib/progression';
import { recordsFor, type PersonalRecord } from '../lib/records';
import { barForName } from '../lib/loadTypeRule';
import { db as defaultDb, type AnyGymDB } from './schema';
import { ANY_GYM, type BarId, type Load, type Session, type WorkoutSet } from './types';

/**
 * Which gym's history counts (SPEC 6): machines, cables, Smith and plate loaded machines are not
 * comparable between gyms, so they are keyed by gym; free weights (barbell, dumbbells, kettlebells,
 * bodyweight, timed) share one history across every gym (ANY_GYM).
 */
export function historyKeyFor(loadKind: Load['kind'], gymId: string, smith = false): string {
  return smith || loadKind === 'stack' || loadKind === 'plate_machine' ? gymId : ANY_GYM;
}

export type HistoryOptions = {
  /** Smith machine lifts: only Smith sets, keyed per gym (SPEC 6). Otherwise Smith sets are left out. */
  smith?: boolean;
  /** The exercise's own bar, for older barbell sets saved without a barId (PLAN 1.7c). */
  defaultBar?: BarId;
  db?: AnyGymDB;
};

type Usable = WorkoutSet & { load: Load };

/** This exercise's usable sets of this load kind: not uncertain, with a load, on the right bar. */
async function usableSets(exerciseId: string, loadKind: Load['kind'], opts: HistoryOptions, db: AnyGymDB): Promise<Usable[]> {
  const barOf = (s: Usable) => s.load.barId ?? opts.defaultBar ?? 'olympic';
  return (await db.sets.where('exerciseId').equals(exerciseId).toArray()).filter(
    (s): s is Usable =>
      !s.uncertain && !!s.load && s.load.kind === loadKind && (loadKind !== 'barbell' || (barOf(s as Usable) === 'smith') === !!opts.smith),
  );
}

/** Finished (or imported) sessions holding these sets at the right gym, newest first. */
async function sessionsOfSets(sets: Usable[], key: string, db: AnyGymDB): Promise<Session[]> {
  const ids = [...new Set(sets.map((s) => s.sessionId))];
  return (await db.sessions.bulkGet(ids))
    .filter((s): s is Session => !!s)
    .filter((s) => !(s.endedAt === undefined && !s.imported))
    .filter((s) => key === ANY_GYM || s.gymId === key)
    .sort((a, b) => b.startedAt - a.startedAt);
}

const pastSet = (x: Usable): PastSet => {
  const out: PastSet = { kind: x.kind, load: x.load };
  if (x.reps !== undefined) out.reps = x.reps;
  if (x.seconds !== undefined) out.seconds = x.seconds;
  return out;
};

/**
 * Up to `limit` earlier workouts with WORKING sets of this exercise and load kind, newest first,
 * for `progress()`. Warm ups and drops are left out before the sessions are picked (PLAN 1.7c), so
 * warm up only workouts never hide real history. Skips the workout in progress, sets without a
 * load and uncertain (imported) sets. Each session's unit is its first set's unit.
 */
export async function getPastSessions(exerciseId: string, gymId: string, loadKind: Load['kind'], limit = 6, opts: HistoryOptions = {}): Promise<PastSession[]> {
  const db = opts.db ?? defaultDb;
  const key = historyKeyFor(loadKind, gymId, opts.smith);
  const sets = (await usableSets(exerciseId, loadKind, opts, db)).filter((s) => s.kind === 'work');
  const sessions = (await sessionsOfSets(sets, key, db)).slice(0, limit);
  return sessions.map((s) => {
    const own = sets.filter((x) => x.sessionId === s.id).sort((a, b) => a.order - b.order);
    return { date: s.startedAt, gymId: s.gymId, unit: own[0]!.load.unit, sets: own.map(pastSet) };
  });
}

/**
 * The last workout's sets of this exercise exactly as done, in order, warm ups and drops included
 * (the LAST TIME column, SPEC 21.1). null when there is none.
 */
export async function lastSessionSets(exerciseId: string, gymId: string, loadKind: Load['kind'], opts: HistoryOptions = {}): Promise<{ date: number; sets: PastSet[] } | null> {
  const db = opts.db ?? defaultDb;
  const sets = await usableSets(exerciseId, loadKind, opts, db);
  const last = (await sessionsOfSets(sets, historyKeyFor(loadKind, gymId, opts.smith), db))[0];
  if (!last) return null;
  return { date: last.startedAt, sets: sets.filter((x) => x.sessionId === last.id).sort((a, b) => a.order - b.order).map(pastSet) };
}

/** A finished workout for the History list (SPEC 8, 13.1): only what is saved, nothing made up. */
export type FinishedWorkout = { session: Session; sets: number };

/** Finished workouts (ended, or imported), newest first, each with its set count. */
export async function listFinished(db: AnyGymDB = defaultDb): Promise<FinishedWorkout[]> {
  const sessions = (await db.sessions.orderBy('startedAt').reverse().toArray()).filter((s) => s.endedAt !== undefined || s.imported);
  const counts = new Map<string, number>();
  await db.sets.each((s) => counts.set(s.sessionId, (counts.get(s.sessionId) ?? 0) + 1));
  return sessions.map((session) => ({ session, sets: counts.get(session.id) ?? 0 }));
}

/** One finished workout and its sets in logged order; undefined if it does not exist or is still going. */
export async function finishedDetail(id: string, db: AnyGymDB = defaultDb): Promise<{ session: Session; sets: WorkoutSet[] } | undefined> {
  const session = await db.sessions.get(id);
  if (!session || (session.endedAt === undefined && !session.imported)) return undefined;
  const sets = await db.sets.where('[sessionId+order]').between([id, -Infinity], [id, Infinity]).toArray();
  return { session, sets };
}

/**
 * Exercises from finished workouts, most recent first, each once (the "Recent" list of the
 * exercise picker, SPEC 20.3). Imported and uncertain sets count too: the user did them.
 */
export async function recentExerciseIds(limit = 8, db: AnyGymDB = defaultDb): Promise<string[]> {
  const sessions = (await db.sessions.orderBy('startedAt').reverse().toArray()).filter((s) => s.endedAt !== undefined || s.imported);
  const out: string[] = [];
  for (const s of sessions) {
    const sets = await db.sets.where('[sessionId+order]').between([s.id, -Infinity], [s.id, Infinity]).toArray();
    for (const x of sets) {
      if (!out.includes(x.exerciseId)) out.push(x.exerciseId);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/**
 * Personal records set in one finished workout (SPEC 21.1 finish screen), from real history only
 * (src/lib/records.ts). Earlier workouts are keyed like "Last time": machines and Smith per gym,
 * free weights everywhere.
 */
export async function workoutRecords(
  sessionId: string,
  nameOf: (exerciseId: string) => string,
  db: AnyGymDB = defaultDb,
): Promise<PersonalRecord[]> {
  const detail = await finishedDetail(sessionId, db);
  if (!detail) return [];
  const { session, sets } = detail;
  const out: PersonalRecord[] = [];
  const ids = [...new Set(sets.map((s) => s.exerciseId))];
  for (const id of ids) {
    const today = sets.filter((s): s is WorkoutSet & { load: Load } => s.exerciseId === id && !!s.load && !s.uncertain);
    const name = nameOf(id);
    const defaultBar = barForName(name);
    const pick = (x: WorkoutSet & { load: Load }): PastSet => ({ kind: x.kind, load: x.load, ...(x.reps !== undefined ? { reps: x.reps } : {}) });
    // Same bar identity as "Last time" (PLAN 1.7f): Smith sets and free bar sets of one exercise
    // are separate lifts, each compared only with its own history (older sets: the default bar).
    const isSmith = (x: WorkoutSet & { load: Load }) => x.load.kind === 'barbell' && (x.load.barId ?? defaultBar) === 'smith';
    for (const smith of [false, true]) {
      const group = today.filter((x) => isSmith(x) === smith);
      const firstWork = group.find((x) => x.kind === 'work');
      if (!firstWork) continue;
      const kind = firstWork.load.kind;
      const past = (await getPastSessions(id, session.gymId, kind, Number.MAX_SAFE_INTEGER, { smith, defaultBar, db })).filter((p) => p.date < session.startedAt);
      out.push(...recordsFor(id, name, group.map(pick), past.flatMap((p) => p.sets)));
    }
  }
  return out;
}
