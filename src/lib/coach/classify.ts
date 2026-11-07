// Which kind of lift an exercise is (SPEC 15), from its swap ladder pattern (data/patterns.json).
// No pattern: not known for sure, so the coach leaves it alone (SPEC 0).
import type { Load } from '../../db/types';
import type { Pattern } from '../swap';
import type { LiftClass } from './types';

const LOWER: readonly Pattern[] = ['squat', 'hinge', 'lunge'];
const UPPER: readonly Pattern[] = ['horizontal push', 'vertical push', 'horizontal pull', 'vertical pull'];

/** Big leg lifts, upper body compounds, or small exercises; null when the pattern is not known. */
export function liftClass(pattern: Pattern | null | undefined): LiftClass | null {
  if (!pattern) return null;
  if (LOWER.includes(pattern)) return 'lower';
  if (UPPER.includes(pattern)) return 'upper';
  return 'isolation';
}

/** Lifts that move weight: the ones the coach can raise or lighten (not bodyweight reps or holds). */
export function weighted(kind: Load['kind']): boolean {
  return kind !== 'bodyweight' && kind !== 'timed';
}

/** A compound lift (warm ups, rest): big leg or upper body lift. */
export const isCompound = (cls: LiftClass | null): boolean => cls === 'lower' || cls === 'upper';
