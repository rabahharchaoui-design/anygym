// Everything the workout screens read (PLAN 1.7c): the session, its sets, the gym, the day's
// entries in the workout's own order, load types, "Last time" and targets. No writes here.
import { useMemo, useState } from 'react';
import { db } from '../../db/schema';
import type { BarId, Gym, Load, Session, WorkoutSet } from '../../db/types';
import { setsOf } from '../../db/workouts';
import { committedOf } from './rowLog';
import { getPastSessions, lastSessionSets } from '../../db/history';
import { pickBar, pickLoadType, pickNote, pickRest } from '../../db/exerciseSettings';
import { planExercise } from '../../data/planExercises';
import { planById } from '../../data/plans';
import { dayIndexOf, estimateDayMinutes, type Plan, type PlanDay } from '../../lib/plans';
import { dayWorkout, orderEntries, quickEntry, repRangeOf, upNext, type DoneCounts, type WorkoutEntry } from '../../lib/planWorkout';
import { barForName, planItemLoadType } from '../../lib/loadTypeRule';
import { progress, type PastSession, type PastSet, type Progression } from '../../lib/progression';
import { extraSets } from '../../lib/extraSets';
import { useLive } from '../../hooks/useLive';
import { barIdFor, loadSetupFor } from './exerciseLoad';

export type Workout = {
  /** Every required read landed and none failed: logging and Finish may run. */
  ready: boolean;
  /** A required read failed (PLAN 1.7h): show LoadError, block logging and Finish. */
  error: unknown;
  /** Starts every required read again. */
  retry: () => void;
  session: Session | undefined;
  sessionReady: boolean;
  /** A read that worked says the workout is gone or finished (only then the screen goes home). */
  sessionMissing: boolean;
  /** Committed Log set writes of this workout, set id → submitted version (rowLog.ts). */
  committed: ReadonlyMap<string, number | undefined>;
  gym: Gym | undefined;
  plan: Plan | undefined;
  day: PlanDay | undefined;
  minutes: number | undefined;
  /** Logged sets (hidden ones, waiting for a delete, left out), logged order. */
  sets: WorkoutSet[];
  setsOfExercise: (id: string) => WorkoutSet[];
  /** The workout's exercises in order, each with its targets (sets include "+ Add set" rows). */
  entries: WorkoutEntry[];
  entryOf: (id: string) => WorkoutEntry | undefined;
  nameOf: (id: string) => string;
  loadTypeOf: (id: string) => Load['kind'] | undefined;
  barOf: (id: string) => ReturnType<typeof pickBar>;
  progressionOf: (id: string) => Progression | undefined;
  /** The last workout's sets of this exercise exactly as done (LAST TIME column), or null. */
  lastSetsOf: (id: string) => PastSet[] | null;
  /** Rest after a set: the user's pick, else the plan's (or the 90 s default). */
  restOf: (id: string) => number;
  userRestOf: (id: string) => number | undefined;
  noteOf: (id: string) => string | undefined;
  done: DoneCounts;
  /** The exercise to do next (the highlighted row), or null when every set is done. */
  nextId: string | null;
  isQuick: boolean;
  /** Bumps when "+ Add set" adds a row. */
  bump: () => void;
};

const EMPTY: ReadonlyMap<string, number | undefined> = new Map();

export function useWorkout(sessionId: string, hidden: ReadonlySet<string>): Workout {
  const session = useLive(() => db.sessions.get(sessionId), [sessionId]);
  // The sets and their submissions in one read, so pending rows are reconciled against exactly the
  // sets shown (PLAN 1.7h).
  const allSets = useLive(
    () => db.transaction('r', db.sets, db.submissions, async () => ({ sets: await setsOf(sessionId), committed: await committedOf(sessionId) })),
    [sessionId],
  );
  const gymId = session.data?.gymId;
  const gym = useLive(() => (gymId ? db.gyms.get(gymId) : Promise.resolve(undefined)), [gymId]);
  const settings = useLive(() => db.exerciseSettings.toArray(), []);
  const [extraTick, setExtraTick] = useState(0);
  const exerciseIds = useMemo(() => session.data?.exerciseIds ?? [], [session.data?.exerciseIds]);

  const plan = planById(session.data?.planId);
  const dayIndex = plan ? dayIndexOf(plan, session.data?.dayId) : -1;
  const weekIndex = session.data?.weekIndex ?? 0;
  const day = plan && dayIndex >= 0 ? plan.days[dayIndex] : undefined;
  const planEntries = useMemo(() => (plan && dayIndex >= 0 ? dayWorkout(plan, dayIndex, weekIndex) : []), [plan, dayIndex, weekIndex]);
  const planEntryOf = useMemo(() => new Map(planEntries.map((e) => [e.exerciseId, e])), [planEntries]);
  const list = settings.data ?? [];

  const nameOf = (id: string) => planEntryOf.get(id)?.name ?? planExercise(id)?.name ?? id;

  const loadTypeOf = (id: string): Load['kind'] | undefined => {
    // The user's own answer (asked once, or changed from the ⋯ menu) wins. Then the plan's unit
    // over the name: a "45 sec" hold is timed, "3 × 10" Plank is reps (loadTypeRule.ts). Then the
    // exercise list (name rule plus the hand written table). Unknown: asked once.
    const saved = gym.data ? pickLoadType(list, id, gym.data.id) : undefined;
    if (saved) return saved;
    const entry = planEntryOf.get(id);
    const fixed = planExercise(id)?.loadType;
    const kind = entry ? planItemLoadType(entry.name, entry, fixed) : fixed;
    return kind && kind !== 'unknown' ? kind : undefined;
  };
  // The bar picked here, else the exercise list's bar (Smith machine lifts), else the name rule.
  const barOf = (id: string) => (gym.data ? pickBar(list, id, gym.data.id) : undefined) ?? planExercise(id)?.bar;

  const entries = useMemo(() => {
    const base = orderEntries(planEntries, exerciseIds, (id, block) => quickEntry(id, nameOf(id), loadTypeOf(id), block));
    return base.map((e) => {
      const extra = extraSets(sessionId, e.exerciseId);
      return extra ? { ...e, sets: e.sets + extra } : e;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planEntries, exerciseIds, sessionId, extraTick, settings.data, gym.data]);
  const entryMap = useMemo(() => new Map(entries.map((e) => [e.exerciseId, e])), [entries]);

  // Earlier workouts of each exercise whose load type is known (SPEC 6): working sets for "Last
  // time" and targets, and the last workout exactly as done for the LAST TIME column (PLAN 1.7c).
  const defaultBarOf = (id: string) => planExercise(id)?.bar ?? barForName(nameOf(id));
  const historyKey = gymId
    ? exerciseIds.map((id) => `${id}:${loadTypeOf(id) ?? ''}:${barIdFor(nameOf(id), barOf(id)) === 'smith' ? 's' : ''}:${defaultBarOf(id)}`).join('|')
    : '';
  const history = useLive(async () => {
    const out = new Map<string, { past: PastSession[]; last: { date: number; sets: PastSet[] } | null }>();
    if (!gymId || !historyKey) return out;
    for (const pair of historyKey.split('|')) {
      const [id, kind, smith, defaultBar] = pair.split(':') as [string, Load['kind'] | '', string, BarId];
      if (!kind) continue;
      const opts = { smith: smith === 's', defaultBar };
      out.set(id, { past: await getPastSessions(id, gymId, kind, 6, opts), last: await lastSessionSets(id, gymId, kind, opts) });
    }
    return out;
  }, [historyKey, gymId]);

  const progressionOf = (id: string): Progression | undefined => {
    const kind = loadTypeOf(id);
    const past = history.data?.get(id)?.past;
    if (!kind || !past || !gym.data) return undefined;
    const entry = entryMap.get(id);
    return progress({
      exerciseId: id,
      loadKind: kind,
      unit: gym.data.unit,
      gym: loadSetupFor(gym.data, kind, id, nameOf(id), barOf(id)),
      repRange: entry && kind !== 'timed' ? repRangeOf(entry) : null,
      history: past,
      ...(entry?.prescription && kind !== 'timed' ? { prescription: entry.prescription } : {}),
    });
  };

  const sets = (allSets.data?.sets ?? []).filter((s) => !hidden.has(s.id));
  const done: Record<string, number> = {};
  for (const s of sets) done[s.exerciseId] = (done[s.exerciseId] ?? 0) + 1;

  const userRestOf = (id: string) => pickRest(list, id);
  const restOf = (id: string) => userRestOf(id) ?? entryMap.get(id)?.restSec ?? 90;

  const error = session.error ?? allSets.error ?? gym.error ?? settings.error ?? history.error ?? null;
  const retry = () => {
    for (const q of [session, allSets, gym, settings, history]) if (q.error) q.retry();
  };

  return {
    ready: !error && !!(session.data && gym.data && allSets.ready && settings.ready && history.ready),
    error,
    retry,
    session: session.data,
    sessionReady: session.ready,
    sessionMissing: session.ready && !session.error && (!session.data || session.data.endedAt !== undefined),
    committed: allSets.data?.committed ?? EMPTY,
    gym: gym.data,
    plan,
    day,
    minutes: day ? estimateDayMinutes(day, weekIndex) : undefined,
    sets,
    setsOfExercise: (id) => sets.filter((s) => s.exerciseId === id),
    entries,
    entryOf: (id) => entryMap.get(id),
    nameOf,
    loadTypeOf,
    barOf,
    progressionOf,
    lastSetsOf: (id) => history.data?.get(id)?.last?.sets ?? null,
    restOf,
    userRestOf,
    noteOf: (id) => pickNote(list, id),
    done,
    nextId: upNext(entries, done, sets[sets.length - 1]?.exerciseId),
    isQuick: !plan,
    bump: () => setExtraTick((t) => t + 1),
  };
}

