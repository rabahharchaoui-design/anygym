// Past sessions of one exercise for the progression engine (SPEC 6, src/lib/progression.ts).
import type { PastSession, PastSet } from '../lib/progression';
import { recordsFor, type PersonalRecord } from '../lib/records';
import { sameExerciseIds } from '../lib/picker';
import { barForName } from '../lib/loadTypeRule';
import { planById } from '../data/plans';
import { planExercise } from '../data/planExercises';
import { dayIndexOf } from '../lib/plans';
import { dayWorkout } from '../lib/planWorkout';
import { db as defaultDb, type AnyGymDB } from './schema';
import { ANY_GYM, type BarId, type Gym, type Load, type Session, type WorkoutSet } from './types';

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

const FREE_BARS: readonly BarId[] = ['olympic', 'womens', 'ez_curl', 'trap'];

/**
 * The bar of an older barbell set saved without a barId (PLAN 1.7k, 2.0c), from stored evidence only.
 * `nameBar` is the exercise's own bar (its plan entry or name rule, never the user's bar setting,
 * which may have changed since). The set's bar weight is compared with the bars of the gym it was
 * logged at (same unit only, stored numbers as they are, no arithmetic):
 * - an exercise that is a Smith lift by name: Smith;
 * - marked unresolved when its gym changed (PLAN 2.0c): null;
 * - the gym is in another unit now (its answers were reset): null, the evidence is gone, so it is
 *   left out rather than guessed (resolved ids are stored before a unit or bar change,
 *   preserveLegacyBars, so this only meets sets from before PLAN 2.0c);
 * - no gym record to compare with: the exercise's own bar (nothing there can change any more);
 * - the weight is that gym's Smith answer and no free bar's (plates only Smith is 0): Smith;
 * - the weight is a free bar's and not the Smith answer (a 45 lb set with a Smith answer of 0):
 *   that free bar, never Smith;
 * - the weight is both the Smith answer and a free bar's: null, ambiguous, left out of every
 *   comparison (history, LAST TIME, targets, records) rather than guessed;
 * - no bar weight stored: the exercise's own bar when the gym has no Smith answer (it could not
 *   have been a Smith bar), else null;
 * - a weight no bar there has: the exercise's own bar.
 */
export function legacyBarOf(load: Pick<Load, 'barWeight' | 'unit' | 'legacyBarUnresolved'>, nameBar: BarId, gym: Pick<Gym, 'bars' | 'unit'> | undefined): BarId | null {
  if (nameBar === 'smith') return 'smith';
  if (load.legacyBarUnresolved) return null;
  if (!gym) return nameBar;
  if (load.unit !== gym.unit) return null;
  const w = load.barWeight;
  if (w === undefined || w === null) return gym.bars.smith === null ? nameBar : null;
  const smith = gym.bars.smith !== null && gym.bars.smith === w;
  const free = FREE_BARS.filter((b) => gym.bars[b] !== null && gym.bars[b] === w);
  if (smith) return free.length ? null : 'smith';
  return free.length && !free.includes(nameBar) ? free[0]! : nameBar;
}

/** The exercise's own bar for legacy sets: its plan entry's bar, else the name rule (as useWorkout). */
export function exerciseBarOf(exerciseId: string): BarId {
  const p = planExercise(exerciseId);
  return p?.bar ?? barForName(p?.name ?? exerciseId);
}

/**
 * PLAN 2.0c: before a gym's unit or bar answers change, every older barbell set logged there
 * without a barId gets the bar its stored evidence resolves to against the gym AS IT IS NOW
 * (`gymBefore`), or the unresolved mark when the evidence is ambiguous or missing. One additive
 * field per set; totals, units, plates, ids and order stay. Call inside the caller's transaction
 * (sets, sessions), before the gym is written, so both commit or neither does. `only`: just these
 * exercise ids (a bar choice), `exerciseBar`: their own bar when the caller knows it.
 */
export async function preserveLegacyBars(db: AnyGymDB, gymBefore: Gym, only?: readonly string[], exerciseBar?: BarId): Promise<number> {
  const sessions = await db.sessions.where('gymId').equals(gymBefore.id).toArray();
  if (!sessions.length) return 0;
  const here = new Set(sessions.map((x) => x.id));
  const sets = only
    ? await db.sets.where('exerciseId').anyOf([...only]).toArray()
    : await db.sets.where('sessionId').anyOf([...here]).toArray();
  let n = 0;
  for (const x of sets) {
    if (!here.has(x.sessionId) || x.load?.kind !== 'barbell' || x.load.barId !== undefined || x.load.legacyBarUnresolved) continue;
    const bar = legacyBarOf(x.load, exerciseBar ?? exerciseBarOf(x.exerciseId), gymBefore);
    await db.sets.put({ ...x, load: bar === null ? { ...x.load, legacyBarUnresolved: true } : { ...x.load, barId: bar } });
    n++;
  }
  return n;
}

/** This exercise's usable sets of this load kind: not uncertain, with a load, on the right bar. */
async function usableSets(exerciseId: string, loadKind: Load['kind'], opts: HistoryOptions, db: AnyGymDB): Promise<Usable[]> {
  // A duplicate list entry is the same exercise (lib/picker.ts PICKER_ALIASES): its sets count too.
  const ids = sameExerciseIds(exerciseId);
  const where = db.sets.where('exerciseId');
  const sets = (await (ids.length === 1 ? where.equals(exerciseId) : where.anyOf(ids)).toArray()).filter(
    (s): s is Usable => !s.uncertain && !!s.load && s.load.kind === loadKind,
  );
  if (loadKind !== 'barbell') return sets;
  const barOf = await legacyBars(sets, ids, opts.defaultBar ?? 'olympic', db);
  // Ambiguous legacy sets (null) are in neither history.
  return sets.filter((s) => {
    const bar = barOf(s);
    return bar !== null && (bar === 'smith') === !!opts.smith;
  });
}

/**
 * Bar identity for barbell sets: their own barId, else legacyBarOf with the gym of that set's
 * workout, read once. null: an ambiguous legacy set.
 */
export async function legacyBars(sets: ReadonlyArray<Pick<WorkoutSet, 'sessionId' | 'exerciseId'> & { load: Load }>, ids: readonly string[], defaultBar: BarId, db: AnyGymDB): Promise<(s: { sessionId: string; exerciseId: string; load: Load }) => BarId | null> {
  const legacy = sets.filter((s) => s.load.barId === undefined);
  if (!legacy.length) return (s) => s.load.barId ?? null;
  const sessions = await db.sessions.bulkGet([...new Set(legacy.map((s) => s.sessionId))]);
  const gymOfSession = new Map(sessions.filter((x): x is Session => !!x).map((x) => [x.id, x.gymId]));
  const gyms = new Map((await db.gyms.bulkGet([...new Set(gymOfSession.values())])).filter((g): g is Gym => !!g).map((g) => [g.id, g]));
  void ids;
  return (s) => {
    if (s.load.barId !== undefined) return s.load.barId;
    const gymId = gymOfSession.get(s.sessionId);
    return legacyBarOf(s.load, defaultBar, gymId === undefined ? undefined : gyms.get(gymId));
  };
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

/** The warm up items of a plan day workout (stretches, band work): never "Recent" lifts. */
function warmUpIds(session: Session): Set<string> {
  const plan = planById(session.planId);
  const i = plan ? dayIndexOf(plan, session.dayId) : -1;
  return new Set(plan && i >= 0 ? dayWorkout(plan, i, session.weekIndex ?? 0).filter((e) => e.warmup).map((e) => e.exerciseId) : []);
}

/**
 * Exercises from finished workouts, most recent first, each once (the "Recent" list of the
 * exercise picker, SPEC 20.3). Imported and uncertain sets count too: the user did them. Warm ups
 * stay out (a plan day's warm up items, and exercises done only as warm up sets).
 */
export async function recentExerciseIds(limit = 8, db: AnyGymDB = defaultDb): Promise<string[]> {
  const sessions = (await db.sessions.orderBy('startedAt').reverse().toArray()).filter((s) => s.endedAt !== undefined || s.imported);
  const out: string[] = [];
  for (const s of sessions) {
    const sets = await db.sets.where('[sessionId+order]').between([s.id, -Infinity], [s.id, Infinity]).toArray();
    const warm = warmUpIds(s);
    for (const x of sets) {
      if (x.kind === 'warmup' || warm.has(x.exerciseId)) continue;
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
    // Legacy sets (no barId) of this workout go through the same resolver as earlier workouts (PLAN
    // 1.7k): a legacy Smith workout never earns Olympic records; an ambiguous set earns none.
    const barOf = await legacyBars(today.filter((x) => x.load.kind === 'barbell'), [id], defaultBar, db);
    const groupOf = (x: WorkoutSet & { load: Load }): 'smith' | 'free' | null => {
      if (x.load.kind !== 'barbell') return 'free';
      const bar = barOf(x);
      return bar === null ? null : bar === 'smith' ? 'smith' : 'free';
    };
    for (const smith of [false, true]) {
      const group = today.filter((x) => groupOf(x) === (smith ? 'smith' : 'free'));
      const firstWork = group.find((x) => x.kind === 'work');
      if (!firstWork) continue;
      const kind = firstWork.load.kind;
      const past = (await getPastSessions(id, session.gymId, kind, Number.MAX_SAFE_INTEGER, { smith, defaultBar, db })).filter((p) => p.date < session.startedAt);
      out.push(...recordsFor(id, name, group.map(pick), past.flatMap((p) => p.sets)));
    }
  }
  return out;
}
