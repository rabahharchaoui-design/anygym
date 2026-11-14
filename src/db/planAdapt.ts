// The same gym substitutions are used for recovery selection and for the session that starts.
import { SWAP_DATA } from '../data/patterns';
import { adaptDay } from '../lib/swap';
import { dayWorkout } from '../lib/planWorkout';
import type { Plan } from '../lib/plans';
import { db as defaultDb, type AnyGymDB } from './schema';
import { ANY_GYM, type Gym } from './types';

export async function alwaysPicks(planId: string, db: AnyGymDB = defaultDb): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const row of await db.exerciseSettings.filter((x) => x.gymId === ANY_GYM && !!x.alwaysUse?.[planId]).toArray()) out[row.exerciseId] = row.alwaysUse![planId]!;
  return out;
}
export function adaptedPlanDay(plan: Plan, dayIndex: number, weekIndex: number, gym: Gym | undefined, always: Record<string, string>) {
  const entries = dayWorkout(plan, dayIndex, weekIndex);
  const exerciseIds = [...new Set(entries.map((e) => e.exerciseId))];
  if (!gym) return { exerciseIds, swaps: [] };
  return adaptDay(SWAP_DATA, entries.filter((e, i) => exerciseIds.indexOf(e.exerciseId) === i), gym, always);
}
