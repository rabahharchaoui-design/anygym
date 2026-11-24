// Everything the coach reads for Today (PLAN 3.8, SPEC 15), turned into the engine's input. Only
// finished, dated workouts count (imported history has no dates); warm ups, drops, uncertain sets
// and sets without a load never do. Weights are never touched here.
import { resolveSchedule } from './schedule';
import { restDayOf, scheduleStyleOf } from '../lib/plan/schedule';
import { fixedDaysOf } from '../lib/plan/weekdays';
import { weekKey } from '../lib/coach/time';
import type { Region } from '../lib/bodyArt';
import { REGION_NAMES } from '../lib/bodyArt';
import { ownRegionLabel, ownRegionLabels, type MuscleMapData } from '../lib/muscles';
import { liftKey, type ChangeRecord, type Effort, type Lift, type LiftSession, type TrainedSet } from '../lib/coach';
import type { RepRange } from '../lib/progression';
import { patternOf, slotOf, swapCandidates, workoutIdOf } from '../lib/swap';
import { QUICK_DEFAULT, dayWorkout, repRangeOf } from '../lib/planWorkout';
import { dayIndexOf } from '../lib/plans';
import { keptDayOf, movesOn } from '../lib/finishPlan';
import { planProgress } from './workoutFinish';
import { barForName } from '../lib/loadTypeRule';
import { SWAP_DATA, candidateBarOf } from '../data/patterns';
import { planById } from '../data/plans';
import { familyDayIndex, samePlanFamily } from '../data/planFamily';
import { planExercise } from '../data/planExercises';
import { exerciseNameOf } from '../data/importMatch';
import { infoForExercise } from '../data/exerciseInfo';
import { loadSetupFor } from '../screens/workout/exerciseLoad';
import { sameHorns } from '../lib/load';
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
  /** Main muscles worked yesterday and in the next plan day, in each exercise's own words (the recovery note, PLAN 4.6c 3). */
  recovery: { yesterday: string[]; next: string[] } | undefined;
  /** The day up next is the same day again (under 60% done): its number and the part done workout's own set counts. */
  kept: { dayN: number; logged?: number; planned?: number } | undefined;
  /** PLAN 3.5g: the exercises of the plan day up next (a coach card lists these lifts first). */
  todayIds: string[];
  /** PLAN 3.5g: when each coach card was answered (no backup reminder on a coach card's day). */
  answeredAt: number[];
  /** PLAN 3.5g: logged exercises of the last 3 days whose muscles are not confirmed (not on the map). */
  unmapped: string[];
  /** PLAN R1 (4): sure main muscles of those 3 days that have a name but no shape on the map (rotator cuff). */
  unshaped: string[];
};

export const regionWord = (r: Region): string => REGION_NAMES[r].toLowerCase();

const dated = (s: Session) => s.endedAt !== undefined && !s.imported;

/** The main (primary) muscles of an exercise, only when sure (SPEC 4.3); none otherwise. */
export function primaryRegions(exerciseId: string): Region[] {
  const m = infoForExercise(exerciseId).muscles;
  if (!m) return [];
  return (Object.keys(m.shading) as Region[]).filter((r) => m.shading[r] === 'primary');
}

/** Sure main muscles of an exercise that have a name but no shape on the map (rotator cuff, PLAN R1 4). */
export function shapelessMuscles(exerciseId: string): string[] {
  const m = infoForExercise(exerciseId).muscles;
  return (m?.primary ?? []).filter((t) => t.regions.length === 0 && t.label).map((t) => t.label);
}

/** The exercise's own words for its primary shapes that stand for more than one muscle (PLAN 4.6a 5, 4.6c 3). */
export function primaryNames(exerciseId: string): Partial<Record<Region, string>> {
  const m = infoForExercise(exerciseId).muscles;
  const out: Partial<Record<Region, string>> = {};
  if (!m) return out;
  for (const r of primaryRegions(exerciseId)) {
    const own = ownRegionLabel(r, { primary: m.primary, secondary: [] });
    if (own) out[r] = own;
  }
  return out;
}

/**
 * Sure main muscles in the exercise's own words (PLAN 4.6c 3). A shape that stands for more than
 * one muscle contributes each label, so yesterday and today match only when a label matches.
 * A shape with one muscle keeps that muscle's name. Nothing sure contributes nothing.
 */
export function muscleWords(m: Pick<MuscleMapData, 'primary' | 'shading'> | null | undefined): string[] {
  if (!m) return [];
  const data = { primary: m.primary, secondary: [] as MuscleMapData['secondary'] };
  const words: string[] = [];
  for (const r of (Object.keys(m.shading) as Region[]).filter((x) => m.shading[x] === 'primary')) {
    const labels = ownRegionLabels(r, data);
    words.push(...(labels.length ? labels : [regionWord(r)]));
  }
  return [...new Set(words)];
}

/** The exercise's sure main muscles in words (PLAN 4.6c 3). */
export const primaryWords = (exerciseId: string): string[] => muscleWords(infoForExercise(exerciseId).muscles);

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
  const storedState = await db.planState.get('active');
  const resolved = storedState ? await resolveSchedule(storedState, profile, now, db) : null;
  const planState = storedState && resolved?.dayIndex != null ? { ...storedState, nextDayIndex: resolved.dayIndex } : storedState;
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
    const bar = pickBar(settings, x.exerciseId, gym.id) ?? planExercise(x.exerciseId)?.bar ?? candidateBarOf(x.exerciseId);
    const setup = { unit: gym.unit, ...loadSetupFor(gym, x.load.kind, x.exerciseId, name, smith ? 'smith' : bar) };
    for (const p of past) {
      const s = byStart.get(p.date);
      if (!s) continue;
      const own = p.sets.filter((y) => y.reps !== undefined && y.load.kind === x.load.kind).map((y) => ({ reps: y.reps!, load: y.load }));
      if (!own.length) continue;
      // PLAN 3.6h2: a plate machine counted on another number of sides before its answer: that
      // workout and every older one are not the same lift for the coach (newest first, so stop).
      if (!own.every((y) => sameHorns(y.load, setup))) break;
      const effort = effortOf.get(`${s.id}|${x.exerciseId}`);
      sessions.push({ sessionId: s.id, date: s.startedAt, sets: own, range: rangeFor(s, x.exerciseId), ...(effort ? { effort } : {}) });
    }
    if (!sessions.length) continue;
    const key = liftKey(x.exerciseId, x.load.kind, historyKeyFor(x.load.kind, gym.id, smith), smith);
    const lift: Lift = {
      key,
      exerciseId: x.exerciseId,
      name,
      loadKind: x.load.kind,
      pattern: patternOf(SWAP_DATA, x.exerciseId),
      setup,
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

  // Fresh muscles: the last 3 days of logged working sets (all of them, any load). PLAN 3.5g: an
  // exercise without sure muscles is named under the map, never guessed onto it.
  const fresh: TrainedSet[] = [];
  const unmapped = new Set<string>();
  const unshaped = new Set<string>();
  for (const x of sets) {
    const s = sessionOf.get(x.sessionId);
    if (!s || x.kind !== 'work' || x.uncertain || s.startedAt < now - 3 * DAY) continue;
    const regions = primaryRegions(x.exerciseId);
    if (regions.length) fresh.push({ at: s.startedAt, regions, names: primaryNames(x.exerciseId) });
    else {
      // Sure muscles with no shape on the map are named by their own name (PLAN R1 4); an
      // exercise without sure muscles is named instead.
      const named = shapelessMuscles(x.exerciseId);
      if (named.length) named.forEach((n) => unshaped.add(n));
      else unmapped.add(nameOf(x.exerciseId));
    }
  }

  return {
    now,
    gym,
    profile,
    planState,
    active,
    dates,
    lifts,
    changes: rows.changes,
    closed,
    liftRows: rows.lifts,
    fresh,
    // No "today works it again" when today is not a training day: every day left is resting, or the calendar says rest (truth pass, critic r3 5).
    recovery: resolved?.dayIndex === null || restsToday(profile, planState, now, recent) ? undefined : recoveryRegions(recent, sets, planState, now),
    kept: resolved?.kept && planState ? await keptDay(planState, finished, db) : undefined,
    todayIds: nextDayIds(planState),
    answeredAt: rows.cards.map((c) => c.at),
    unmapped: [...unmapped],
    unshaped: [...unshaped],
  };
}

/** The kept day's number, with the set counts of its newest finished workout when that one is the part done one. */
async function keptDay(planState: PlanState, finished: readonly Session[], db: AnyGymDB): Promise<CoachData['kept']> {
  const plan = planById(planState.planId);
  const day = plan?.days[planState.nextDayIndex];
  if (!plan || !day) return undefined;
  const last = finished.find((s) => familyDayIndex(plan, s.planId, s.dayId) === planState.nextDayIndex);
  const p = last ? await planProgress(last, db) : undefined;
  return p && p.logged > 0 && !p.complete && !movesOn(p.share) ? { dayN: day.n, logged: p.logged, planned: p.planned } : { dayN: day.n };
}

/** The working exercises of the plan day up next, in order (none without a plan). */
function nextDayIds(planState: PlanState | undefined): string[] {
  const plan = planById(planState?.planId);
  if (!plan || !planState) return [];
  const index = Math.max(0, Math.min(planState.nextDayIndex, plan.days.length - 1));
  return dayWorkout(plan, index, planState.weekIndex).filter((e) => !e.warmup && !e.finisher).map((e) => e.exerciseId);
}

/** Main muscles of yesterday's logged working sets, and of the next plan day (sure muscles only, in each exercise's own words). */
function recoveryRegions(recent: readonly Session[], sets: readonly WorkoutSet[], planState: PlanState | undefined, now: number): CoachData['recovery'] {
  const plan = planById(planState?.planId);
  if (!plan || !planState) return undefined;
  const today = new Date(now).setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const ids = new Set(recent.filter((s) => s.startedAt >= yesterday.getTime() && s.startedAt < today).map((s) => s.id));
  const done = new Set<string>();
  for (const x of sets) if (ids.has(x.sessionId) && x.kind === 'work' && !x.uncertain) for (const w of primaryWords(x.exerciseId)) done.add(w);
  const index = Math.max(0, Math.min(planState.nextDayIndex, plan.days.length - 1));
  const next = new Set<string>();
  for (const e of dayWorkout(plan, index, planState.weekIndex)) if (!e.warmup && !e.finisher) for (const w of primaryWords(e.exerciseId)) next.add(w);
  return { yesterday: [...done], next: [...next] };
}

/** Today is a rest day on the person's calendar, or a fixed training day already done today: the same reading as Today's day card (db/schedule.ts readSchedule). */
function restsToday(profile: Profile | undefined, planState: PlanState | undefined, now: number, finished: readonly Session[]): boolean {
  const plan = planById(planState?.planId);
  if (!plan) return false;
  const style = scheduleStyleOf(profile?.intake);
  const midnight = new Date(now).setHours(0, 0, 0, 0);
  const doneToday = style === 'fixed' && keptDayOf(planState!) === undefined && finished.some((x) => !x.imported && !!x.dayId && samePlanFamily(x.planId, plan.id) && x.startedAt >= midnight);
  return !fixedDaysOf(style, profile?.intake?.weekdays, plan.days.length) && !!restDayOf(style, weekdaysOf(profile, now), now, doneToday);
}

/** Today's live read: the coach's input and the rows behind it (screens/today/useCoach.ts). */
export const readCoach = coachData;

/** The weekdays the user trains, from the intake (SPEC 14 step 5), when given. */
export const weekdaysOf = (profile: Profile | undefined, now = Date.now()): string[] | undefined => {
  const style = scheduleStyleOf(profile?.intake);
  if (style === 'flexible') return undefined;
  const w = style === 'weekly' ? (profile?.weeklySchedule?.weekKey === weekKey(now) ? profile.weeklySchedule.weekdays : undefined) : profile?.intake?.weekdays;
  return Array.isArray(w) && w.every((x) => typeof x === 'string') && w.length ? (w as string[]) : undefined;
};
