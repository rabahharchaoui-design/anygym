// Everything the workout screens read (PLAN 1.7c): the session, its sets, the gym, the day's
// entries in the workout's own order, load types, "Last time" and targets. No writes here.
import { useEffect, useMemo, useState } from 'react';
import { afterPaint } from '../../ui/afterPaint';
import { db } from '../../db/schema';
import type { BarId, Gym, JournalEntry, Load, Session, WorkoutSet } from '../../db/types';
import { setsOf } from '../../db/workouts';
import { committedOf, journalOf } from './rowLog';
import type { Committed } from '../../lib/setTable';
import { getPastSessions, lastSessionSets, workoutWins } from '../../db/history';
import type { SetRecord } from '../../lib/records';
import { pickBar, pickLoadType, pickNote, pickRest, pickRestOff } from '../../db/exerciseSettings';
import { planExercise } from '../../data/planExercises';
import { planById } from '../../data/plans';
import { dayIndexOf, estimateDayMinutes, type Plan, type PlanDay } from '../../lib/plans';
import { adjustEntries, dayWorkout, doneCounts, orderEntries, quickEntry, repRangeOf, upNext, type DoneCounts, type WorkoutEntry } from '../../lib/planWorkout';
import { barForName, planItemLoadType } from '../../lib/loadTypeRule';
import { progress, type PastSession, type PastSet, type Progression } from '../../lib/progression';
import { liveRowAdjustments } from '../../lib/extraSets';
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
  committed: Committed;
  /** Log set writes that started and did not commit (the IndexedDB journal, PLAN 1.7i). */
  journal: readonly JournalEntry[];
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
  /** Rest timer Off for this exercise (PLAN 2.2d). */
  restOffOf: (id: string) => boolean;
  /** The rest time picked (or the plan's), also while the timer is off. */
  restTimeOf: (id: string) => number;
  noteOf: (id: string) => string | undefined;
  /** Planned sets done per exercise (warm ups on a normal lift left out, planWorkout.doneCounts). */
  done: DoneCounts;
  /** The exercise to do next (the highlighted row), or null when every set is done. */
  nextId: string | null;
  isQuick: boolean;
  /**
   * PLAN 2.2e: the record a logged set set (the live PR badge), from every earlier workout of that
   * exercise. Undefined while the read runs or after it failed: no history read is no claim.
   */
  recordOf: (setId: string) => SetRecord | undefined;
  /** Bumps when "+ Add set" adds a row. */
  bump: () => void;
};

const EMPTY: Committed = new Map();
const NO_JOURNAL: readonly JournalEntry[] = [];
const NO_RECORDS: ReadonlyMap<string, SetRecord> = new Map();

export function useWorkout(sessionId: string, hidden: ReadonlySet<string>): Workout {
  const session = useLive(() => db.sessions.get(sessionId), [sessionId]);
  // The sets and their submissions in one read, so pending rows are reconciled against exactly the
  // sets shown (PLAN 1.7h).
  const allSets = useLive(
    () =>
      db.transaction('r', db.sets, db.submissions, db.journal, async () => ({
        sets: await setsOf(sessionId),
        committed: await committedOf(sessionId),
        journal: await journalOf(sessionId),
      })),
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

  // The sets shown (a set being deleted is already gone): rows removed with a logged set stay removed
  // only while that set is (PLAN 2.2d round 2, lib/extraSets.ts rowAdjustments).
  const sets = (allSets.data?.sets ?? []).filter((s) => !hidden.has(s.id));
  const presentKey = sets.map((s) => s.id).join('|');
  const entries = useMemo(() => {
    const base = orderEntries(planEntries, exerciseIds, (id, block) => quickEntry(id, nameOf(id), loadTypeOf(id), block));
    // Rows added or removed by hand (PLAN 2.2d): one rule for every surface (adjustEntries).
    return adjustEntries(base, liveRowAdjustments(sessionId, new Set(presentKey ? presentKey.split('|') : [])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planEntries, exerciseIds, sessionId, extraTick, settings.data, gym.data, presentKey]);
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

  // Live PR badges (PLAN 2.2e): recomputed from the database whenever a set commits, so a failed
  // Log never shows one and an edit, delete or Undo is reflected. Not required for logging.
  const wins = useLive(() => workoutWins(sessionId, (id) => planEntryOf.get(id)?.name ?? planExercise(id)?.name ?? id), [sessionId]);
  // Applied after the check's frame has painted (critic B6): the badge never stalls the check.
  const [recordMap, setRecordMap] = useState<ReadonlyMap<string, SetRecord>>(NO_RECORDS);
  useEffect(() => {
    const next = new Map((wins.error ? [] : (wins.data?.records ?? [])).map((r) => [r.setId, r]));
    return afterPaint(() => setRecordMap(next));
  }, [wins.data, wins.error]);

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

  // Working sets only: a warm up on a normal lift leaves its planned rows to do (PLAN 1.7j).
  const done = doneCounts(entries, sets);

  // Rest timer Off (PLAN 2.2d) is a user rest of none: logging a set starts no countdown.
  const restOffOf = (id: string) => pickRestOff(list, id);
  const userRestOf = (id: string) => (restOffOf(id) ? 0 : pickRest(list, id));
  const restOf = (id: string) => userRestOf(id) ?? entryMap.get(id)?.restSec ?? 90;
  /** The rest time to show and edit (kept while the timer is off). */
  const restTimeOf = (id: string) => pickRest(list, id) ?? entryMap.get(id)?.restSec ?? 90;

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
    journal: allSets.data?.journal ?? NO_JOURNAL,
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
    restOffOf,
    restTimeOf,
    noteOf: (id) => pickNote(list, id),
    done,
    nextId: upNext(entries, done, sets[sets.length - 1]?.exerciseId),
    isQuick: !plan,
    recordOf: (setId) => recordMap.get(setId),
    bump: () => setExtraTick((t) => t + 1),
  };
}

