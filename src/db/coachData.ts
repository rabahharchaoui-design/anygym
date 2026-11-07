// Everything the coach reads for Today (PLAN 3.8, SPEC 15), turned into the engine's input. Only
// finished, dated workouts count (imported history has no dates); warm ups, drops, uncertain sets
// and sets without a load never do. Weights are never touched here.
import type { Region } from '../lib/bodyArt';
import { REGION_NAMES } from '../lib/bodyArt';
import { liftKey, type ChangeRecord, type Effort, type Lift, type LiftSession, type TrainedSet } from '../lib/coach';
import type { RepRange } from '../lib/progression';
import { patternOf, slotOf, swapCandidates, workoutIdOf } from '../lib/swap';
import { QUICK_DEFAULT, dayWorkout, repRangeOf } from '../lib/planWorkout';
import { dayIndexOf } from '../lib/plans';
import { barForName } from '../lib/loadTypeRule';
import { SWAP_DATA, candidateBarOf } from '../data/patterns';
import { planById } from '../data/plans';
import { planExercise } from '../data/planExercises';
import { exerciseNameOf } from '../data/importMatch';
import { infoForExercise } from '../data/exerciseInfo';
import { loadSetupFor } from '../screens/workout/exerciseLoad';
import { pickBar } from './exerciseSettings';
import { getPastSessions, historyKeyFor } from './history';
import { getActiveGym } from './bootstrap';
import { getProfile } from './intake';
import { coachRows } from './coach';
import { db as defaultDb, type AnyGymDB } from './schema';
import type { CoachLiftRow } from './coachTypes';
import type { Gym, PlanState, Profile, Session, WorkoutSet } from './types';

const DAY = 24 * 60 * 60 * 1000;
/** How far back lifts are read: the rate window (8 weeks) plus room for streaks. */
const LIFT_WEEKS = 10;
/** Workouts of one lift read (newest first). */
const LIFT_SESSIONS = 16;

export type CoachData = {
  now: number;
  gym: Gym | undefined;
  profile: Profile | undefined;
  planState: PlanState | undefined;
  active: boolean;
  /** Start times of every finished, dated workout (newest first). */
  dates: number[];
  lifts: Lift[];
  changes: ChangeRecord[];
  closed: Set<string>;
  liftRows: CoachLiftRow[];
  /** Logged working sets of the last 3 days with their sure main muscles (Fresh muscles). */
  fresh: TrainedSet[];
  /** Main muscles worked yesterday and in the next plan day (the recovery note). */
  recovery: { yesterday: Region[]; next: Region[] } | undefined;
};

export const regionWord = (r: Region): string => REGION_NAMES[r].toLowerCase();

const dated = (s: Session) => s.endedAt !== undefined && !s.imported;

/** The main (primary) muscles of an exercise, only when sure (SPEC 4.3); none otherwise. */
export function primaryRegions(exerciseId: string): Region[] {
  const m = infoForExercise(exerciseId).muscles;
  if (!m) return [];
  return (Object.keys(m.shading) as Region[]).filter((r) => m.shading[r] === 'primary');
}

const nameOf = (id: string): string => planExercise(id)?.name ?? exerciseNameOf(id) ?? id;

/** The rep range a workout asked for this exercise: its built targets, its plan day, else the quick default. */
export function rangeFor(s: Session, exerciseId: string): RepRange | null {
  const t = s.targets?.[exerciseId];
  if (t) return t.reps === undefined ? null : typeof t.reps === 'number' ? [t.reps, t.reps] : t.reps;
  const plan = planById(s.planId);
  const day = plan ? dayIndexOf(plan, s.dayId) : -1;
  if (plan && day >= 0) {
    const slot = slotOf(s.swaps, exerciseId);
    const e = dayWorkout(plan, day, s.weekIndex ?? 0).find((x) => x.exerciseId === exerciseId) ?? dayWorkout(plan, day, s.weekIndex ?? 0).find((x) => x.exerciseId === slot);
    if (e) return e.reps === undefined ? null : repRangeOf(e);
  }
  return QUICK_DEFAULT.reps;
}

/** The plan in use when it has `exerciseId` as one of its own slots (a plateau may offer a variation). */
function planSlot(planState: PlanState | undefined, exerciseId: string): string | null {
  const plan = planById(planState?.planId);
  if (!plan) return null;
  return plan.days.some((_, i) => dayWorkout(plan, i, planState?.weekIndex ?? 0).some((e) => e.exerciseId === exerciseId && !e.warmup)) ? plan.id : null;
}

export async function coachData(now = Date.now(), db: AnyGymDB = defaultDb): Promise<CoachData> {
  const gym = await getActiveGym(db);
  const profile = await getProfile(db);
  const planState = await db.planState.get('active');
  const all = await db.sessions.toArray();
  const active = all.some((s) => s.endedAt === undefined && !s.imported);
  const finished = all.filter(dated).sort((a, b) => b.startedAt - a.startedAt);
  const dates = finished.map((s) => s.startedAt).filter((t) => t <= now);
  const rows = await coachRows(db);
  const closed = new Set(rows.cards.map((c) => c.id));
  const byStart = new Map(finished.map((s) => [s.startedAt, s]));
  const recent = finished.filter((s) => s.startedAt >= now - LIFT_WEEKS * 7 * DAY);
  const recentIds = recent.map((s) => s.id);
  const sets: WorkoutSet[] = recentIds.length ? await db.sets.where('sessionId').anyOf(recentIds).toArray() : [];
  const work = sets.filter((x): x is WorkoutSet & { load: NonNullable<WorkoutSet['load']> } => x.kind === 'work' && !!x.load && !x.uncertain);
  const efforts = recentIds.length ? await db.efforts.where('sessionId').anyOf(recentIds).toArray() : [];
  const effortOf = new Map(efforts.map((e) => [`${e.sessionId}|${e.exerciseId}`, e.effort as Effort]));
  const settings = await db.exerciseSettings.toArray();
  const liftRows = new Map(rows.lifts.map((r) => [r.key, r]));

  // Each exercise once, as it was last loaded (the newest workout first).
  const sessionOf = new Map(recent.map((s) => [s.id, s]));
  const newest = [...work].sort((a, b) => (sessionOf.get(b.sessionId)!.startedAt - sessionOf.get(a.sessionId)!.startedAt) || b.order - a.order);
  const seen = new Set<string>();
  const lifts: Lift[] = [];
  for (const x of newest) {
    const smith = x.load.kind === 'barbell' && x.load.barId === 'smith';
    const id = `${x.exerciseId}|${x.load.kind}|${smith}`;
    if (seen.has(id) || !gym) continue;
    seen.add(id);
    const name = nameOf(x.exerciseId);
    const past = await getPastSessions(x.exerciseId, gym.id, x.load.kind, LIFT_SESSIONS, { smith, defaultBar: planExercise(x.exerciseId)?.bar ?? candidateBarOf(x.exerciseId) ?? barForName(name), db });
    const sessions: LiftSession[] = [];
    for (const p of past) {
      const s = byStart.get(p.date);
      if (!s) continue;
      const own = p.sets.filter((y) => y.reps !== undefined && y.load.kind === x.load.kind).map((y) => ({ reps: y.reps!, load: y.load }));
      if (!own.length) continue;
      const effort = effortOf.get(`${s.id}|${x.exerciseId}`);
      sessions.push({ sessionId: s.id, date: s.startedAt, sets: own, range: rangeFor(s, x.exerciseId), ...(effort ? { effort } : {}) });
    }
    if (!sessions.length) continue;
    const key = liftKey(x.exerciseId, x.load.kind, historyKeyFor(x.load.kind, gym.id, smith), smith);
    const bar = pickBar(settings, x.exerciseId, gym.id) ?? planExercise(x.exerciseId)?.bar ?? candidateBarOf(x.exerciseId);
    const lift: Lift = {
      key,
      exerciseId: x.exerciseId,
      name,
      loadKind: x.load.kind,
      pattern: patternOf(SWAP_DATA, x.exerciseId),
      setup: { unit: gym.unit, ...loadSetupFor(gym, x.load.kind, x.exerciseId, name, smith ? 'smith' : bar) },
      sessions,
    };
    const target = liftRows.get(key)?.target;
    if (target) lift.target = target;
    // Codex 3.8 #3: what resolved outcomes taught it, durably.
    const scale = liftRows.get(key)?.learned?.scale;
    if (scale !== undefined) lift.scale = scale;
    const planId = planSlot(planState, x.exerciseId);
    if (planId) {
      const c = swapCandidates(SWAP_DATA, x.exerciseId, gym, { mode: 'reps', exclude: [x.exerciseId] })[0];
      if (c) lift.variation = { id: workoutIdOf(c), name: nameOf(workoutIdOf(c)), slot: x.exerciseId, planId };
    }
    lifts.push(lift);
  }

  // Fresh muscles: the last 3 days of logged working sets (all of them, any load).
  const fresh: TrainedSet[] = [];
  for (const x of sets) {
    const s = sessionOf.get(x.sessionId);
    if (!s || x.kind !== 'work' || x.uncertain || s.startedAt < now - 3 * DAY) continue;
    const regions = primaryRegions(x.exerciseId);
    if (regions.length) fresh.push({ at: s.startedAt, regions });
  }

  return { now, gym, profile, planState, active, dates, lifts, changes: rows.changes, closed, liftRows: rows.lifts, fresh, recovery: recoveryRegions(recent, sets, planState, now) };
}

/** Main muscles of yesterday's logged working sets, and of the next plan day (sure muscles only). */
function recoveryRegions(recent: readonly Session[], sets: readonly WorkoutSet[], planState: PlanState | undefined, now: number): CoachData['recovery'] {
  const plan = planById(planState?.planId);
  if (!plan || !planState) return undefined;
  const today = new Date(now).setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const ids = new Set(recent.filter((s) => s.startedAt >= yesterday.getTime() && s.startedAt < today).map((s) => s.id));
  const done = new Set<Region>();
  for (const x of sets) if (ids.has(x.sessionId) && x.kind === 'work' && !x.uncertain) for (const r of primaryRegions(x.exerciseId)) done.add(r);
  const index = Math.max(0, Math.min(planState.nextDayIndex, plan.days.length - 1));
  const next = new Set<Region>();
  for (const e of dayWorkout(plan, index, planState.weekIndex)) if (!e.warmup && !e.finisher) for (const r of primaryRegions(e.exerciseId)) next.add(r);
  return { yesterday: [...done], next: [...next] };
}

/** Today's live read: the coach's input and the rows behind it (screens/today/useCoach.ts). */
export const readCoach = coachData;

/** The weekdays the user trains, from the intake (SPEC 14 step 5), when given. */
export const weekdaysOf = (profile: Profile | undefined): string[] | undefined => {
  const w = (profile?.intake as { weekdays?: unknown } | undefined)?.weekdays;
  return Array.isArray(w) && w.every((x) => typeof x === 'string') && w.length ? (w as string[]) : undefined;
};
