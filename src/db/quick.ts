// Quick workout builds it for you (PLAN 3.5a): what it reads (recent muscles, learned dislikes,
// "Always use this" picks) and what it writes (the built workout, the learned dislikes). Additive
// only: dislikes live on the profile, a built workout's targets on its session; history is never touched.
import { planById } from '../data/plans';
import { profileFor } from '../data/order';
import { learnNever, learnSwap, recentMuscles, RECENT_MS, unlearnNever, type Concept, type Dislikes } from '../lib/quick';
import type { Muscle } from '../lib/order';
import { getProfile } from './intake';
import { newId } from './ids';
import { db as defaultDb, type AnyGymDB } from './schema';
import { setWorkoutTrim } from './timeBudget';
import { swapExercise } from './swaps';
import { ANY_GYM, type QuickTarget, type Session } from './types';
import { getActiveSession, startPlanDay } from './workouts';

export async function getDislikes(db: AnyGymDB = defaultDb): Promise<Dislikes> {
  return (await getProfile(db))?.dislikes ?? {};
}

/** Changes the learned dislikes on the profile (no profile yet: nothing is learned). */
async function updateDislikes(fn: (d: Dislikes) => Dislikes, db: AnyGymDB): Promise<Dislikes> {
  return db.transaction('rw', db.profile, async () => {
    const p = await getProfile(db);
    if (!p) return {};
    const dislikes = fn(p.dislikes ?? {});
    await db.profile.put({ ...p, dislikes });
    return dislikes;
  });
}

/** A left swipe swapped `id` away: one more soft dislike (ranked lower later, never a ban). */
export const recordSwapAway = (id: string, db: AnyGymDB = defaultDb) => updateDislikes((d) => learnSwap(d, id), db);
/** Long press: never show `id` again. */
export const recordNever = (id: string, db: AnyGymDB = defaultDb) => updateDislikes((d) => learnNever(d, id), db);
/** Undo of a long press. */
export const undoNever = (id: string, db: AnyGymDB = defaultDb) => updateDislikes((d) => unlearnNever(d, id), db);

/** Muscles with logged working sets in workouts started in the last 3 days (logged sets only). */
export async function readRecentMuscles(now = Date.now(), db: AnyGymDB = defaultDb): Promise<Muscle[]> {
  return db.transaction('r', db.sessions, db.sets, async () => {
    const sessions = await db.sessions.where('startedAt').aboveOrEqual(now - RECENT_MS).toArray();
    const ids = sessions.filter((s) => !s.imported).map((s) => s.id);
    const sets = ids.length ? await db.sets.where('sessionId').anyOf(ids).toArray() : [];
    return recentMuscles(sessions, sets, (id) => profileFor(id).targets, now);
  });
}

/** The plan's "Always use this" picks, slot → exercise (the same ones startPlanDay applies). */
export async function alwaysPicks(planId: string, db: AnyGymDB = defaultDb): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const row of await db.exerciseSettings.filter((x) => x.gymId === ANY_GYM && !!x.alwaysUse?.[planId]).toArray()) out[row.exerciseId] = row.alwaysUse![planId]!;
  return out;
}

const targetOf = (it: Concept['items'][number]): QuickTarget => ({
  sets: it.sets,
  restSec: it.restSec,
  ...(it.reps !== undefined ? { reps: it.reps } : {}),
  ...(it.seconds !== undefined ? { seconds: it.seconds } : {}),
});

/**
 * Starts the curated workout. A plan day concept starts as that plan day (it counts for the plan),
 * with its trim and the deck's swaps; any other concept is a quick workout holding exactly the
 * deck's exercises and targets. A workout already in progress is returned untouched.
 */
export async function startBuilt(gymId: string, concept: Pick<Concept, 'items' | 'plan'>, minutes: number, db: AnyGymDB = defaultDb, now = Date.now()): Promise<Session> {
  const part = concept.plan;
  if (part && planById(part.planId)) {
    const before = await getActiveSession(db);
    if (before) return before;
    const session = await startPlanDay(gymId, part.planId, part.dayIndex, db, now);
    if (part.trim) await setWorkoutTrim(session.id, minutes, part.trim, db);
    for (const it of concept.items) if (it.id !== it.origin) await swapExercise(session.id, it.origin, it.id, {}, db);
    return (await db.sessions.get(session.id)) ?? session;
  }
  return db.transaction('rw', db.sessions, async () => {
    const active = await getActiveSession(db);
    if (active) return active;
    const ids = [...new Set(concept.items.map((it) => it.id))];
    const targets: Record<string, QuickTarget> = {};
    for (const it of concept.items) targets[it.id] ??= targetOf(it);
    const session: Session = { id: newId(), gymId, startedAt: now, imported: false, exerciseIds: ids, targets, timeBudgetMin: minutes };
    await db.sessions.add(session);
    return session;
  });
}
