// Auto warm up sets (SPEC 15): added to the first big lift of the day for intermediate lifters and
// up, from that lift's real working weight (load.ts warmUpLadder). Skippable like any row; stored
// as warm ups, so progress and records never count them (progression.ts, records.ts).
import type { Load } from '../../db/types';
import { warmUpLadder, type LoadSetup, type WarmUp } from '../load';
import { isCompound, weighted } from './classify';
import type { LiftClass } from './types';

/** Intake experience ids (SPEC 14) that get warm ups added: 1 to 2 years, 3+ years, coming back. */
export const WARM_UP_LEVELS: readonly string[] = ['1_2y', '3y', 'break'];

export const wantsWarmUps = (experience: string | undefined): boolean => !!experience && WARM_UP_LEVELS.includes(experience);

/** The first big lift of the day: the first working entry that is a compound and moves weight. */
export function firstCompound(
  entries: ReadonlyArray<{ exerciseId: string; warmup: boolean; finisher?: true }>,
  clsOf: (id: string) => LiftClass | null,
  kindOf: (id: string) => Load['kind'] | undefined,
): string | null {
  for (const e of entries) {
    if (e.warmup || e.finisher) continue;
    const kind = kindOf(e.exerciseId);
    if (kind && weighted(kind) && isCompound(clsOf(e.exerciseId))) return e.exerciseId;
  }
  return null;
}

/** The warm ups for one lift at its working weight (empty when none fit). */
export function autoWarmUps(experience: string | undefined, kind: Load['kind'], work: number | null, setup: LoadSetup): WarmUp[] {
  if (!wantsWarmUps(experience) || work === null) return [];
  return warmUpLadder(kind, work, setup);
}
