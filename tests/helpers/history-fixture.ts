// SPEC 13.3: "2 years of history (generated)". A deterministic history from a seed: about 300
// finished workouts and 4000 sets over two years, on both curated plans, in an lb gym (the app's
// own active gym) and a kg gym, with warm ups, drop sets, holds, bodyweight work and a few
// imported workouts. Loads are built with src/lib/load.ts only (no weight math here).
//
// Written straight into the app's IndexedDB in one transaction (seedHistory). No test seam in the
// shipped app: the records have exactly the shapes src/db/types.ts defines.
import { createRequire } from 'node:module';
import type { Gym, Load, Session, Unit, WorkoutSet } from '../../src/db/types';
import { barbellLoad, bodyweightLoad, dumbbellLoad, platesForSide, stackLoad, timedLoad } from '../../src/lib/load';
import { slugify, type PlanExercise } from '../../src/lib/loadTypeRule';
import { dayIdOf, normalizePlan } from '../../src/lib/plans';
import { expect, type Page } from '../fixtures';
import { dbAll, dbPut } from '../workout-helpers';

// The same plans and exercise list the app bundles (src/data/plans.ts), read without JSON imports.
const require = createRequire(import.meta.url);
const EXERCISES = new Map((require('../../data/plan-exercises.json') as PlanExercise[]).map((e) => [e.id, e]));
const planExercise = (id: string) => EXERCISES.get(id);
const PLANS = ['five-day-split', 'six-week-volume'].map((f) => normalizePlan(require(`../../data/plans/${f}.json`), (name) => planExercise(slugify(name))));

/** mulberry32: a tiny seeded PRNG, so the same seed always makes the same history. */
export function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, int: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1)), pick: <T>(xs: readonly T[]) => xs[Math.floor(next() * xs.length)]! };
}

export type History = { sessions: Session[]; sets: WorkoutSet[]; kgGym: Gym };

const DAY = 86_400_000;

/** One working weight per exercise that creeps up over the two years. */
function loadFor(kind: Load['kind'], unit: Unit, progress: number, r: ReturnType<typeof rng>, scale: number): Load | null {
  const kg = unit === 'kg';
  switch (kind) {
    case 'barbell': {
      const bar = kg ? 20 : 45;
      // Per side, in whole plates of the unit: 25 → 70 lb (10 → 32.5 kg) over the history.
      const steps = kg ? [10, 12.5, 15, 17.5, 20, 22.5, 25, 27.5, 30, 32.5] : [25, 30, 35, 40, 45, 50, 55, 60, 65, 70];
      const side = steps[Math.min(steps.length - 1, Math.floor(progress * steps.length * scale))]!;
      const plates = platesForSide(side, unit);
      return plates ? barbellLoad(bar, plates, 'none', unit, 'olympic') : null;
    }
    case 'dumbbell_each': {
      const xs = kg ? [8, 10, 12, 14, 16, 18, 20] : [20, 25, 30, 35, 40, 45, 50];
      return dumbbellLoad(xs[Math.min(xs.length - 1, Math.floor(progress * xs.length * scale))]!, unit);
    }
    case 'stack':
    case 'single':
    case 'plate_machine': {
      const xs = kg ? [20, 25, 30, 35, 40, 45, 50, 55] : [40, 50, 60, 70, 80, 90, 100, 110];
      return stackLoad(xs[Math.min(xs.length - 1, Math.floor(progress * xs.length * scale + r.next()))]!, unit);
    }
    case 'bodyweight':
      return bodyweightLoad(unit);
    case 'timed':
      return timedLoad(unit);
  }
}

/**
 * Generates the history. `gym` is the app's active (lb) gym; a kg gym record is made next to it.
 * `now` is the end of the history (the newest workout is two days before it).
 */
export function generateHistory(gym: Gym, { seed = 20261024, now = Date.now(), weeks = 104 } = {}): History {
  const r = rng(seed);
  const kgGym: Gym = { ...gym, id: `${gym.id}-kg-history`, name: 'Hotel gym (kg)', unit: 'kg', isActive: false, createdAt: gym.createdAt - 1 };
  const sessions: Session[] = [];
  const sets: WorkoutSet[] = [];
  const start = now - weeks * 7 * DAY;
  let dayCursor = 0;
  let n = 0;
  // A few imported workouts first (SPEC 9.3: startedAt is the import order, never a date).
  for (let seq = 1; seq <= 6; seq++) {
    const id = `hist-imp-${seq}`;
    const exerciseId = r.pick(['barbell-back-squat', 'barbell-bench-press', 'romanian-deadlift'].filter((e) => planExercise(e)));
    sessions.push({ id, gymId: gym.id, startedAt: seq, imported: true, importSeq: seq, importHash: `hist-${seed}-${seq}`, exerciseIds: [exerciseId] });
    for (let o = 0; o < 3; o++) {
      sets.push({ id: `${id}-${o}`, sessionId: id, exerciseId, order: o, kind: 'work', reps: r.int(5, 10), load: loadFor('barbell', 'lb', 0.1, r, 1)!, uncertain: o === 2 });
    }
  }
  for (let week = 0; week < weeks; week++) {
    const perWeek = r.int(3, 4);
    const daysThisWeek = [...new Set(Array.from({ length: perWeek }, () => r.int(0, 6)))].sort();
    for (const d of daysThisWeek) {
      const when = start + (week * 7 + d) * DAY + r.int(6, 20) * 3_600_000;
      if (when > now - 2 * DAY) continue;
      // First year the 5 day split, second year the six week builder.
      const plan = week < weeks / 2 ? PLANS[0]! : PLANS[1]!;
      const day = plan.days[dayCursor++ % plan.days.length]!;
      const atKg = n % 7 === 6; // every 7th workout away, in a kg gym
      const g = atKg ? kgGym : gym;
      const id = `hist-${String(n).padStart(4, '0')}`;
      const progress = week / weeks;
      const items = day.blocks.flatMap((b) => b.items.map((it) => ({ it, warmup: !!b.warmup })));
      let order = 0;
      const exerciseIds: string[] = [];
      for (const { it, warmup } of items) {
        if (exerciseIds.length >= 4) break; // a 45 minute session: four exercises
        const info = planExercise(it.exerciseId);
        const kind = info?.loadType;
        if (!kind || kind === 'unknown') continue;
        const timed = kind === 'timed' || it.seconds !== undefined;
        const load = loadFor(timed ? 'timed' : kind, g.unit, progress, r, 0.6 + r.next() * 0.5);
        if (!load) continue;
        exerciseIds.push(it.exerciseId);
        const count = Math.min(4, it.weeks?.[0]?.sets ?? 3);
        if (!timed && kind === 'barbell' && !warmup && order === 0) {
          const w = loadFor('barbell', g.unit, 0, r, 1);
          if (w) sets.push({ id: `${id}-${order}`, sessionId: id, exerciseId: it.exerciseId, order: order++, kind: 'warmup', reps: 8, load: w, uncertain: false });
        }
        for (let s = 0; s < count; s++) {
          const set: WorkoutSet = { id: `${id}-${order}`, sessionId: id, exerciseId: it.exerciseId, order: order++, kind: warmup ? 'warmup' : 'work', load, uncertain: false };
          if (timed) set.seconds = r.pick([30, 45, 60]);
          else set.reps = r.int(6, 12);
          sets.push(set);
        }
        if (!timed && kind === 'stack' && r.next() < 0.3) {
          sets.push({ id: `${id}-${order}`, sessionId: id, exerciseId: it.exerciseId, order: order++, kind: 'drop', reps: r.int(8, 15), load: stackLoad(Math.max(10, (load.stackValue ?? 20) - (g.unit === 'kg' ? 10 : 20)), g.unit), uncertain: false });
        }
      }
      if (!order) continue;
      sessions.push({ id, gymId: g.id, planId: plan.id, dayId: dayIdOf(day), startedAt: when, endedAt: when + r.int(40, 80) * 60_000, imported: false, exerciseIds, ...(plan.progressionMode === 'weekly_table' ? { weekIndex: (week - Math.floor(weeks / 2)) % 6 } : {}) });
      n++;
    }
  }
  return { sessions, sets, kgGym };
}

/** Seeds the generated history into the app's database (the app has opened once). */
export async function seedHistory(page: Page, opts: Parameters<typeof generateHistory>[1] = {}): Promise<History & { gym: Gym }> {
  await expect.poll(async () => (await dbAll(page, 'gyms')).length).toBeGreaterThan(0);
  const gym = (await dbAll<Gym>(page, 'gyms')).find((g) => g.isActive)!;
  const h = generateHistory(gym, opts);
  await dbPut(page, { gyms: [h.kgGym], sessions: h.sessions, sets: h.sets });
  return { ...h, gym };
}
