// Past sessions of one exercise for the progression engine (SPEC 6, src/lib/progression.ts).
import type { PastSession } from '../lib/progression';
import { db as defaultDb, type AnyGymDB } from './schema';
import { ANY_GYM, type Load, type Session, type WorkoutSet } from './types';

/**
 * Which gym's history counts (SPEC 6): machines, cables, Smith and plate loaded machines are not
 * comparable between gyms, so they are keyed by gym; free weights (barbell, dumbbells, kettlebells,
 * bodyweight, timed) share one history across every gym (ANY_GYM).
 */
export function historyKeyFor(loadKind: Load['kind'], gymId: string, smith = false): string {
  return smith || loadKind === 'stack' || loadKind === 'plate_machine' ? gymId : ANY_GYM;
}

/**
 * Up to `limit` earlier workouts with this exercise, newest first, for `progress()`. Skips the
 * workout in progress, sets without a load and uncertain (imported) sets. Each session's unit is
 * the unit its first set was logged in (sets keep their own unit too).
 */
export async function getPastSessions(
  exerciseId: string,
  gymId: string,
  loadKind: Load['kind'],
  limit = 6,
  opts: { smith?: boolean; db?: AnyGymDB } = {},
): Promise<PastSession[]> {
  const db = opts.db ?? defaultDb;
  const key = historyKeyFor(loadKind, gymId, opts.smith);
  const sets = (await db.sets.where('exerciseId').equals(exerciseId).toArray()).filter(
    (s): s is WorkoutSet & { load: Load } => !s.uncertain && !!s.load,
  );
  const ids = [...new Set(sets.map((s) => s.sessionId))];
  const sessions = (await db.sessions.bulkGet(ids))
    .filter((s): s is Session => !!s)
    .filter((s) => !(s.endedAt === undefined && !s.imported))
    .filter((s) => key === ANY_GYM || s.gymId === key)
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, limit);
  return sessions.map((s) => {
    const own = sets.filter((x) => x.sessionId === s.id).sort((a, b) => a.order - b.order);
    return {
      date: s.startedAt,
      gymId: s.gymId,
      unit: own[0]!.load.unit,
      sets: own.map((x) => {
        const out: PastSession['sets'][number] = { kind: x.kind, load: x.load };
        if (x.reps !== undefined) out.reps = x.reps;
        if (x.seconds !== undefined) out.seconds = x.seconds;
        return out;
      }),
    };
  });
}
