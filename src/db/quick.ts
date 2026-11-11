// Quick workout builds it for you (PLAN 3.5a): what it reads (recent muscles, learned dislikes,
// "Always use this" picks) and what it writes (the built workout, the learned dislikes). Additive
// only: dislikes live on the profile, a built workout's targets on its session; history is never touched.
// PLAN 3.5b adds the rotation memory: the cards shown last time (on the profile), the style a quick
// workout started from (on its session), and when each muscle last had logged sets (read only).
import { planById } from '../data/plans';
import { profileFor } from '../data/order';
import { learnLeft, learnNever, learnSwap, recentMuscles, RECENT_MS, unlearnNever, type Concept, type ConceptId, type Dislikes } from '../lib/quick';
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
/**
 * PLAN 3.5f: a left swipe on `id` in the workout `workout` (a deck visit or a session): it ranks
 * lower, the workout is remembered for it, and `ask` says whether to ask "Hide it for good?" now
 * (the third different workout, once only). No profile yet: nothing is learned, nothing is asked.
 */
export async function recordLeft(id: string, workout: string, db: AnyGymDB = defaultDb): Promise<{ ask: boolean }> {
  let ask = false;
  await updateDislikes((d) => {
    const r = learnLeft(d, id, workout);
    ask = r.ask;
    return r.dislikes;
  }, db);
  return { ask };
}
/** Long press: never show `id` again. */
export const recordNever = (id: string, db: AnyGymDB = defaultDb) => updateDislikes((d) => learnNever(d, id), db);
/** Undo of a long press. */
export const undoNever = (id: string, db: AnyGymDB = defaultDb) => updateDislikes((d) => unlearnNever(d, id), db);

/** When the latest workout with logged working sets in the last 3 days was started (null: none). */
export async function readRecentAt(now = Date.now(), db: AnyGymDB = defaultDb): Promise<number | null> {
  const sessions = (await db.sessions.where('startedAt').aboveOrEqual(now - RECENT_MS).toArray()).filter((s) => !s.imported && s.startedAt <= now);
  let at: number | null = null;
  for (const s of sessions) if ((await db.sets.where('sessionId').equals(s.id).filter((x) => x.kind !== 'warmup').count()) > 0) at = Math.max(at ?? 0, s.startedAt);
  return at;
}

/** Muscles with logged working sets in workouts started in the last 3 days (logged sets only). */
export async function readRecentMuscles(now = Date.now(), db: AnyGymDB = defaultDb): Promise<Muscle[]> {
  return db.transaction('r', db.sessions, db.sets, async () => {
    const sessions = await db.sessions.where('startedAt').aboveOrEqual(now - RECENT_MS).toArray();
    const ids = sessions.filter((s) => !s.imported).map((s) => s.id);
    const sets = ids.length ? await db.sets.where('sessionId').anyOf(ids).toArray() : [];
    // What a lift trains hard and the helpers a compound tires (bench: chest, then triceps and front
    // delts), so the day after bench never brings triceps as "fresh". Grip is left out.
    return recentMuscles(sessions, sets, (id) => {
      const p = profileFor(id);
      return [...p.targets, ...p.helpers.filter((m) => m !== 'forearms')];
    }, now);
  });
}

/** The plan's "Always use this" picks, slot → exercise (the same ones startPlanDay applies). */
export async function alwaysPicks(planId: string, db: AnyGymDB = defaultDb): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const row of await db.exerciseSettings.filter((x) => x.gymId === ANY_GYM && !!x.alwaysUse?.[planId]).toArray()) out[row.exerciseId] = row.alwaysUse![planId]!;
  return out;
}

const targetOf = (it: Concept['items'][number], pair?: QuickTarget['pair']): QuickTarget => ({
  sets: it.sets,
  restSec: it.restSec,
  ...(it.reps !== undefined ? { reps: it.reps } : {}),
  ...(it.seconds !== undefined ? { seconds: it.seconds } : {}),
  ...(pair ? { pair } : {}),
});

/** PLAN 3.5b: each grouped item's place in its superset or circuit (a group of one is a single). */
export function pairsOf(items: Concept['items']): Map<string, NonNullable<QuickTarget['pair']>> {
  const members = new Map<number, string[]>();
  for (const it of items) if (it.group !== undefined) members.set(it.group, [...(members.get(it.group) ?? []), it.id]);
  const out = new Map<string, NonNullable<QuickTarget['pair']>>();
  for (const [group, ids] of members) if (ids.length > 1) ids.forEach((id, index) => out.set(id, { group, index, size: ids.length }));
  return out;
}

// ---------------------------------------------------------------- rotation memory (PLAN 3.5b)

const LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * When each muscle last had logged working sets (never warm ups, never imports, never a future
 * date), over the last 30 days. A muscle missing here has no date the app is sure of.
 */
export async function readLastTrained(now = Date.now(), db: AnyGymDB = defaultDb): Promise<Partial<Record<Muscle, number>>> {
  return db.transaction('r', db.sessions, db.sets, async () => {
    const sessions = (await db.sessions.where('startedAt').between(now - LOOKBACK_MS, now, true, true).toArray()).filter((s) => !s.imported);
    const at = new Map(sessions.map((s) => [s.id, s.startedAt]));
    const sets = at.size ? await db.sets.where('sessionId').anyOf([...at.keys()]).toArray() : [];
    const out: Partial<Record<Muscle, number>> = {};
    for (const st of sets) {
      if (st.kind === 'warmup') continue;
      const t = at.get(st.sessionId)!;
      for (const m of profileFor(st.exerciseId).targets) out[m] = Math.max(out[m] ?? 0, t);
    }
    return out;
  });
}

/** The styles of the last 2 quick workouts done (finished, with logged working sets), latest first. */
export async function readDoneStyles(db: AnyGymDB = defaultDb): Promise<string[]> {
  const out: string[] = [];
  const rows = await db.sessions.orderBy('startedAt').reverse().filter((s) => !!s.quickStyle && s.endedAt !== undefined && !s.imported).limit(20).toArray();
  for (const s of rows) {
    if (out.length >= 2) break;
    if ((await db.sets.where('sessionId').equals(s.id).filter((x) => x.kind !== 'warmup').count()) > 0) out.push(s.quickStyle!);
  }
  return out;
}

/** The cards shown last time (empty: none yet). */
export async function readShown(db: AnyGymDB = defaultDb): Promise<string[]> {
  return (await getProfile(db))?.quickIdeas?.shown ?? [];
}

/** A visit within this long of the last one sees the same cards (the rotation moves on when a workout starts or later). */
export const REVISIT_MS = 30 * 60 * 1000;

/**
 * PLAN 3.5j round 2: the rotation memory the cards are chosen with. The same inputs give the same
 * cards: a reload or a second visit within REVISIT_MS, with no workout started since, keeps the
 * memory the last visit used (`keep`: nothing is recorded again); a started workout, or a later
 * visit, moves the rotation on to what was shown last.
 */
export async function readRotation(now = Date.now(), db: AnyGymDB = defaultDb): Promise<{ lastShown: string[]; keep: boolean }> {
  const q = (await getProfile(db))?.quickIdeas;
  if (q?.prev && q.at !== undefined && now >= q.at && now - q.at < REVISIT_MS && (await db.sessions.where('startedAt').aboveOrEqual(q.at).count()) === 0) return { lastShown: q.prev, keep: true };
  return { lastShown: q?.shown ?? [], keep: false };
}

/** Remembers the cards shown now, the memory they were chosen with and when (no profile yet: nothing is remembered). */
export async function recordShown(ids: readonly ConceptId[], db: AnyGymDB = defaultDb, memory?: { prev: readonly string[]; at: number }): Promise<void> {
  await db.transaction('rw', db.profile, async () => {
    const p = await getProfile(db);
    if (!p) return;
    const { prev: _prev, at: _at, ...rest } = p.quickIdeas ?? {};
    await db.profile.put({ ...p, quickIdeas: { ...rest, shown: [...ids], ...(memory ? { prev: [...memory.prev], at: memory.at } : {}) } });
  });
}

/**
 * Starts the curated workout. A plan day concept starts as that plan day (it counts for the plan),
 * with its trim and the deck's swaps; any other concept is a quick workout holding exactly the
 * deck's exercises and targets. A workout already in progress is returned untouched.
 */
export async function startBuilt(gymId: string, concept: Pick<Concept, 'items' | 'plan'> & { id?: ConceptId; variant?: string }, minutes: number, db: AnyGymDB = defaultDb, now = Date.now()): Promise<Session> {
  const part = concept.plan;
  if (part && planById(part.planId)) {
    // One transaction over every table: the session, its trim, each swap and the gym's remembered
    // minutes commit together or not at all, so a failure leaves nothing and Retry starts the same deck.
    return db.transaction('rw', db.tables, async () => {
      const before = await getActiveSession(db);
      if (before) return before;
      const session = await startPlanDay(gymId, part.planId, part.dayIndex, db, now);
      if (part.trim) await setWorkoutTrim(session.id, minutes, part.trim, db);
      for (const it of concept.items) if (it.id !== it.origin) await swapExercise(session.id, it.origin, it.id, {}, db);
      return (await db.sessions.get(session.id)) ?? session;
    });
  }
  return db.transaction('rw', db.sessions, async () => {
    const active = await getActiveSession(db);
    if (active) return active;
    const ids = [...new Set(concept.items.map((it) => it.id))];
    // PLAN 3.5b: supersets and circuits go into the workout as they were on the card.
    const pairs = pairsOf(concept.items);
    const targets: Record<string, QuickTarget> = {};
    for (const it of concept.items) targets[it.id] ??= targetOf(it, pairs.get(it.id));
    const session: Session = { id: newId(), gymId, startedAt: now, imported: false, exerciseIds: ids, targets, timeBudgetMin: minutes };
    // PLAN 3.5f: an area day remembers its area ("focus:chest"), so its day list keeps its name.
    if (concept.id && concept.id !== 'plan') session.quickStyle = concept.id === 'focus' && concept.variant ? `focus:${concept.variant}` : concept.id;
    await db.sessions.add(session);
    return session;
  });
}
