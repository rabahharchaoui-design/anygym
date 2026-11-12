// Which effect a moment gets (PLAN 3.6h), pure. The effects themselves are drawn in ./fx (a lazy
// chunk) and in Particles (the burst); this file only names them and caps their cost.
import type { MomentKind } from './types';

export const EFFECTS = ['burst', 'shards', 'ambient', 'ring', 'trail'] as const;
/**
 * burst    ice blue particles from one point: a record.
 * shards   slow falling glass: the first workout.
 * ambient  calm drifting glass behind a summary (it loops, quietly, and is not tied to a moment).
 * ring     a titanium ring that assembles: a level up (used later).
 * trail    a light trail along a route: a run record (used later).
 */
export type EffectVariant = (typeof EFFECTS)[number];

/** The most pieces an effect may ever draw in one frame: the cap that keeps 60 fps on an iPhone. */
export const EFFECT_CAP: Record<EffectVariant, number> = { burst: 48, shards: 14, ambient: 5, ring: 12, trail: 8 };

/** The effect that belongs to a kind of moment. Anything without its own gets the burst. */
export function effectFor(kind: MomentKind): Exclude<EffectVariant, 'ambient'> {
  if (kind === 'first_workout') return 'shards';
  if (kind === 'level_up') return 'ring';
  if (kind === 'run_record') return 'trail';
  return 'burst';
}

/** How many pieces to draw: what was asked for, never more than the cap, never fewer than one. */
export function cappedCount(variant: EffectVariant, wanted?: number): number {
  const cap = EFFECT_CAP[variant];
  return Math.max(1, Math.min(cap, Math.round(wanted ?? cap)));
}
