// Which answers "How do you load this?" can be true for an exercise (PLAN 3.7a): its equipment, as
// the catalog records it, rules the others out. Pure, no runtime imports.
//
// THE RULE (equipment → the load kinds it allows, most likely first):
//   machine          → a weight stack, or plates on the machine (a Smith machine: plates on a bar)
//   cable            → a weight stack
//   barbell, e-z curl bar → plates on a bar
//   dumbbell         → dumbbells, or one weight
//   kettlebells      → one weight, or one in each hand
//   body only        → bodyweight, or timed
//   anything else, or not known (bands, other, a custom exercise) → every kind: nothing is ruled out.
// Never an empty list.
import type { Load } from '../db/types';

export type LoadKind = Load['kind'];

/** Every load kind, in the question's usual order. */
export const ALL_LOAD_KINDS: readonly LoadKind[] = ['barbell', 'dumbbell_each', 'single', 'stack', 'plate_machine', 'bodyweight', 'timed'];

const BY_EQUIPMENT: Readonly<Record<string, readonly LoadKind[]>> = {
  machine: ['stack', 'plate_machine'],
  cable: ['stack'],
  barbell: ['barbell'],
  'e-z curl bar': ['barbell'],
  dumbbell: ['dumbbell_each', 'single'],
  kettlebells: ['single', 'dumbbell_each'],
  'body only': ['bodyweight', 'timed'],
};

/** The load kinds an exercise's equipment allows, most likely first (see THE RULE above). */
export function allowedLoadKinds(equipment: string | null | undefined, name = ''): readonly LoadKind[] {
  const key = equipment?.trim().toLowerCase() ?? '';
  // A Smith machine is a bar on rails: its plates go on a bar (the barbell input with the Smith bar).
  if (key === 'machine' && /\bsmith\b/i.test(name)) return ['barbell'];
  return BY_EQUIPMENT[key] ?? ALL_LOAD_KINDS;
}
