// "What did this workout earn" (PLAN M18a): the one read the finish screen calls (M18b), and the
// award on save. Everything is derived from saved data by the pure rules (lib/streak, lib/badges,
// lib/prRows over the one record rule of db/history.ts); only the badges are stored (db/badges.ts),
// once ever, dated with the workout's save. A workout still going, imported or with warm ups only
// earns nothing, and a number the app does not know (the Time of an imported workout) is null.
import { planById } from '../data/plans';
import { earnedBy, type EarnedBadge } from '../lib/badges';
import { totalLifted } from '../lib/load';
import { prRows, type PrRow } from '../lib/prRows';
import { countsAsWorkout, weekCount, weeklyGoal, weekStreak, type WeekCount, type WorkoutFact } from '../lib/streak';
import { sessionTime, type WorkoutTime } from '../lib/workoutTime';
import { isWorkSet, workSetCount } from '../lib/workSets';
import { awardBadges, badgesOfSession } from './badges';
import { finishedWins } from './history';
import { db as defaultDb, type AnyGymDB } from './schema';
import type { Unit, WorkoutSet } from './types';

export type WorkoutEarned = {
  /** Start to save; null when unknown. */
  time: WorkoutTime | null;
  /** Working sets (warm ups never count). */
  sets: number;
  /** Total lifted of the working sets in `unit` (0 when none is known). */
  lifted: number;
  unit: Unit;
  /** This week's workouts against the plan's goal (or 3), counting this one. */
  week: WeekCount;
  /** Weeks in a row hitting the goal (SPEC 17), as of this workout. */
  streakWeeks: number;
  /** One row per lift with a new record. */
  prs: PrRow[];
  /** The badges this workout earned (stored now when they were not yet), in catalog order. */
  badges: EarnedBadge[];
};

type Context = { facts: WorkoutFact[]; goal: number; runs: { city?: string; startedAt: number; endedAt?: number }[] };

/** Every saved workout as facts, the weekly goal and the runs' cities. */
async function context(db: AnyGymDB): Promise<Context> {
  const [sessions, sets, gyms, runs, state] = await Promise.all([db.sessions.toArray(), db.sets.toArray(), db.gyms.toArray(), db.runs.toArray(), db.planState.get('active')]);
  const bySession = new Map<string, WorkoutSet[]>();
  for (const x of sets) bySession.set(x.sessionId, [...(bySession.get(x.sessionId) ?? []), x]);
  const cityOf = new Map(gyms.map((g) => [g.id, g.city?.trim() || undefined]));
  const facts = sessions.map((s): WorkoutFact => {
    const own = bySession.get(s.id) ?? [];
    const city = cityOf.get(s.gymId);
    return { id: s.id, startedAt: s.startedAt, ...(s.endedAt !== undefined ? { endedAt: s.endedAt } : {}), imported: s.imported, workSets: workSetCount(own), liftedLb: totalLifted(own.filter(isWorkSet), 'lb'), ...(city ? { city } : {}) };
  });
  return { facts, goal: weeklyGoal(planById(state?.planId)?.daysPerWeek), runs: runs.map((r) => ({ ...(r.city ? { city: r.city } : {}), startedAt: r.startedAt, ...(r.endedAt !== undefined ? { endedAt: r.endedAt } : {}) })) };
}

/**
 * What this workout earned, and its new badges stored (never twice: a second call, a reload or a
 * double Finish returns the same badges with their first date). Undefined while it is not finished.
 */
export async function workoutEarned(sessionId: string, nameOf: (exerciseId: string) => string, unit: Unit, db: AnyGymDB = defaultDb): Promise<WorkoutEarned | undefined> {
  const won = await finishedWins(sessionId, nameOf, db);
  if (!won) return undefined;
  const { session, sets, groups } = won;
  const ctx = await context(db);
  const fact = ctx.facts.find((f) => f.id === sessionId)!;
  const counted = countsAsWorkout(fact);
  const prs = counted ? prRows(groups) : [];
  const upTo = ctx.facts.filter((f) => f.startedAt <= session.startedAt);
  if (counted && session.endedAt !== undefined) await awardBadges(earnedBy({ workout: fact, workouts: ctx.facts, runs: ctx.runs, prs: prs.length, goal: ctx.goal }), sessionId, session.endedAt, db);
  return {
    time: sessionTime(session),
    sets: workSetCount(sets),
    lifted: totalLifted(sets.filter(isWorkSet), unit),
    unit,
    week: counted ? weekCount(upTo, session.startedAt, ctx.goal) : { count: 0, goal: ctx.goal, complete: false },
    streakWeeks: counted ? weekStreak(upTo, session.startedAt, ctx.goal) : 0,
    prs,
    badges: await badgesOfSession(sessionId, db),
  };
}

/** Finish's award (PLAN M18a): the badges of a just saved workout, stored now. Never throws: a failure leaves the save as it is, and the next read awards them. */
export async function awardOnSave(sessionId: string, db: AnyGymDB = defaultDb): Promise<EarnedBadge[]> {
  try {
    return (await workoutEarned(sessionId, (id) => id, 'lb', db))?.badges ?? [];
  } catch {
    return [];
  }
}
