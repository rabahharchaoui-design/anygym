// Which lifts are a MAIN lift for the celebrations (PLAN 3.6b): a loaded barbell (or trap bar) squat,
// deadlift, bench press, overhead or military press, or bent over row. Only these can earn the full
// screen "Heaviest ever". It is not the ordering rule (isHeavy in lib/order.ts decides rest and order
// and is wrong for this: it counts bodyweight squats, goblet squats and leg presses).
//   - By data: a big pattern (squat, hinge, horizontal push, vertical push, horizontal pull) whose
//     first piece of gear is the barbell and rack. Bodyweight, machine, Smith, cable, kettlebell and
//     dumbbell versions never match, and neither does any exercise without a pattern.
//   - Where the data cannot tell: ALLOWED lists the exercises with no pattern or gear in the data that
//     are a barbell main lift all the same (checked by hand).
//   - Assistance lifts on a bar are NOT main lifts: ASSISTANCE lists them (they are MEDIUM at most).
import type { Pattern } from '../lib/swap';
import { patternOf, requiresOf } from '../lib/swap';
import { SWAP_DATA } from './patterns';

const MAIN_PATTERNS: ReadonlySet<Pattern> = new Set<Pattern>(['squat', 'hinge', 'horizontal push', 'vertical push', 'horizontal pull']);

/** Barbell main lifts the data has no pattern for (no pattern, no gear listed). */
const ALLOWED: ReadonlySet<string> = new Set(['Seated_Barbell_Military_Press', 'Trap_Bar_Deadlift']);

/** On a bar and in a big pattern, but assistance work or not a loaded bar lift. */
const ASSISTANCE: ReadonlySet<string> = new Set([
  'Inverted_Row', // bodyweight, hung under a bar
  'Good_Morning',
  'romanian-deadlift',
  'Romanian_Deadlift',
  'barbell-straight-leg-romanian-deadlift',
  'Stiff-Legged_Barbell_Deadlift',
]);

/** True when this exercise id is a loaded barbell (or trap bar) squat, deadlift, bench, overhead press or bent over row. */
export function isMainLift(exerciseId: string): boolean {
  if (ALLOWED.has(exerciseId)) return true;
  if (ASSISTANCE.has(exerciseId)) return false;
  const pattern = patternOf(SWAP_DATA, exerciseId);
  if (!pattern || !MAIN_PATTERNS.has(pattern)) return false;
  // The first group that is not just a bench: a bar needs its rack.
  const gear = requiresOf(SWAP_DATA, exerciseId)?.find((g) => !g.every((id) => id === 'flat_bench' || id === 'adjustable_bench'));
  return gear?.[0] === 'barbell_rack';
}
