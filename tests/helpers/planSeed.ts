// PLAN 2.0a: put working sets straight into the workout in progress, so a test can finish a plan
// day above or below the 60% rule without tapping dozens of checks. The day's working exercises
// come from the app's own plan code (no warm ups, stretches or finisher).
import { readFileSync } from 'node:fs';
import { expect, type Page } from '../fixtures';
import { slugify, type PlanExercise } from '../../src/lib/loadTypeRule';
import { dayIndexOf, normalizePlan, type Plan } from '../../src/lib/plans';
import { dayWorkout, isWorkingEntry } from '../../src/lib/planWorkout';
import { dbAll, dbPut } from '../workout-helpers';

// The shipped plans, normalized exactly like src/data/plans.ts (JSON read from disk: the test
// runner cannot import JSON modules).
const exercises = new Map((JSON.parse(readFileSync('data/plan-exercises.json', 'utf8')) as PlanExercise[]).map((e) => [e.id, e]));
const PLANS: Plan[] = ['five-day-split', 'six-week-volume'].map((f) =>
  normalizePlan(JSON.parse(readFileSync(`data/plans/${f}.json`, 'utf8')), (name: string) => exercises.get(slugify(name))),
);
const planById = (id: string | undefined): Plan | undefined => PLANS.find((p) => p.id === id);

type S = { id: string; planId?: string; dayId?: string; weekIndex?: number; endedAt?: number; imported: boolean };

/** The working sets the active plan day prescribes, and how many are already logged. */
export async function workingSetsOfActive(page: Page): Promise<{ session: S; planned: number }> {
  await expect.poll(async () => (await dbAll<S>(page, 'sessions')).some((s) => s.endedAt === undefined && !s.imported)).toBe(true);
  const session = (await dbAll<S>(page, 'sessions')).find((s) => s.endedAt === undefined && !s.imported)!;
  const plan = planById(session.planId)!;
  const entries = dayWorkout(plan, dayIndexOf(plan, session.dayId), session.weekIndex ?? 0).filter(isWorkingEntry);
  return { session, planned: entries.reduce((a, e) => a + Math.max(1, e.sets), 0) };
}

/**
 * Adds up to `count` working sets (in day order, each exercise up to its plan) to the active plan
 * workout, on top of what is logged. Returns how many working sets the day prescribes.
 */
export async function seedWorkingSets(page: Page, count: number): Promise<number> {
  const { session, planned } = await workingSetsOfActive(page);
  const plan = planById(session.planId)!;
  const entries = dayWorkout(plan, dayIndexOf(plan, session.dayId), session.weekIndex ?? 0).filter(isWorkingEntry);
  const logged = await dbAll<{ sessionId: string; exerciseId: string; kind: string; order: number }>(page, 'sets');
  const mine = logged.filter((x) => x.sessionId === session.id);
  let order = mine.reduce((a, x) => Math.max(a, x.order + 1), 0) + 100;
  const sets: unknown[] = [];
  for (const e of entries) {
    const have = mine.filter((x) => x.exerciseId === e.exerciseId && x.kind !== 'warmup').length;
    for (let k = have; k < Math.max(1, e.sets) && sets.length < count; k++) {
      const timed = e.seconds !== undefined && e.reps === undefined;
      sets.push({
        id: `seed-${session.id}-${e.exerciseId}-${k}`,
        sessionId: session.id,
        exerciseId: e.exerciseId,
        order: order++,
        kind: 'work',
        uncertain: false,
        ...(timed ? { seconds: 30, load: { kind: 'timed', unit: 'lb', total: 0 } } : { reps: 8, load: { kind: 'bodyweight', unit: 'lb', total: 0 } }),
      });
    }
  }
  await dbPut(page, { sets, orderCounters: [{ sessionId: session.id, next: order }] });
  return planned;
}
