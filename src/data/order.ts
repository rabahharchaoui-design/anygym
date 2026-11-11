// Ordering profiles over the committed data (PLAN 3.4a, SPEC 22): every plan exercise and every
// pattern ladder candidate gets one, from its pattern (data/patterns.json) and what it is loaded
// with. The few exercises no pattern describes (stretches, shrugs, forearm work, warm ups) carry
// their own facts here, by id. Nothing here is a guess about a muscle: an exercise without a pattern
// and without a row below has no targets, so no rule ever claims it works one.
import type { EquipmentId } from '../db/types';
import type { ExerciseLoadType } from '../lib/loadTypeRule';
import { profileOf, type Implement, type Profile } from '../lib/order';
import { PATTERNS, patternOf, requiresOf, supports, workoutIdOf, type Candidate, type Requires } from '../lib/swap';
import type { GymKit } from '../lib/picker';
import { SWAP_DATA, candidateLoadOf } from './patterns';
import { planExercise } from './planExercises';
import { exerciseNameOf } from './importMatch';
import { approvedCandidate, onApprovedChange } from './candidateGate';

type Override = NonNullable<Parameters<typeof profileOf>[0]['override']>;

const STRETCH: Override = { role: 'stretch', tier: 4, targets: [], helpers: [], load: 0 };
const WARMUP: Override = { role: 'warmup', tier: -1, targets: [], helpers: [], load: 0 };
const CARDIO: Override = { role: 'cardio', tier: 5, targets: [], helpers: [], load: 0 };

/** Facts for exercises the patterns do not describe, or describe too broadly. */
export const PROFILE_OVERRIDES: Readonly<Record<string, Override>> = {
  'static-quadricep-stretch': STRETCH,
  'static-proximal-hamstring-stretch': STRETCH,
  'static-pigeon-stretch': STRETCH,
  'dynamic-hip-flexor-stretch': { ...WARMUP, role: 'dynamic' },
  'band-internal-shoulder-rotation-0-degrees': WARMUP,
  'band-internal-shoulder-rotation-90-degrees': WARMUP,
  '30-second-interval-sprint': CARDIO,
  'forearm-finger-roll': { targets: ['forearms'], helpers: [], tier: 3, load: 1 },
  'wrist-twist': { targets: ['forearms'], helpers: [], tier: 3, load: 1 },
  'dumbbell-shrug': { targets: ['traps'], helpers: [], tier: 2, load: 2 },
  'dumbbell-front-raise': { targets: ['front delts'], helpers: [], tier: 2, load: 2 },
  'smith-machine-upright-row': { targets: ['side delts', 'traps'], helpers: [], tier: 2, load: 3 },
  'upright-row': { targets: ['side delts', 'traps'], helpers: [], tier: 2, load: 3 },
  'hip-abductor': { targets: ['abductors'], helpers: [], tier: 2, load: 2 },
  'hip-adductor': { targets: ['adductors'], helpers: [], tier: 2, load: 2 },
  // A back extension is lower back work (rule 3: never before squats or deadlifts), not a big hinge.
  'hyperextension-roman-chair-back-extension': { targets: ['lower back'], helpers: [], tier: 2, load: 3 },
  // A straight arm pulldown is a lat isolation (no biceps), not a big pull.
  'Straight-Arm_Pulldown': { helpers: [], tier: 2, load: 2 },
  Good_Morning: { tier: 1 },
  // A cable kickback is a glute isolation: 10 to 15 reps and short rest, never compound prescriptions (3.6a).
  'One-Legged_Cable_Kickback': { tier: 2 },
  // Skills that take years to learn: never suggested to a newer lifter (Up next, SPEC 22).
  'Handstand_Push-Ups': { advanced: true },
  Natural_Glute_Ham_Raise: { advanced: true },
  // The full deadlift is the biggest lift there is.
  deadlift: { load: 11 },
  Sumo_Deadlift: { load: 11 },
};

const MACHINES: ReadonlySet<EquipmentId> = new Set<EquipmentId>([
  'smith_machine',
  'leg_extension',
  'leg_curl',
  'chest_press_machine',
  'pec_deck',
  'lat_pulldown',
  'seated_row',
  'shoulder_press_machine',
  'calf_raise_machine',
  'hip_adductor_abductor',
]);

/** The implement a requirement names first (benches are never the implement). */
function implementOfRequires(r: Requires): Implement {
  const main = r.find((g) => !g.every((id) => id === 'flat_bench' || id === 'adjustable_bench'));
  const id = main?.[0];
  if (!id) return 'bodyweight';
  if (id === 'barbell_rack' || id === 'ez_curl_bar') return 'barbell';
  if (id === 'leg_press') return 'plate machine';
  if (id === 'dumbbells') return 'dumbbell';
  if (id === 'kettlebells') return 'kettlebell';
  if (id === 'cable_station') return 'cable';
  if (id === 'resistance_bands') return 'band';
  if (MACHINES.has(id)) return 'machine';
  return 'bodyweight';
}

const LOAD_IMPLEMENT: Partial<Record<ExerciseLoadType, Implement>> = {
  barbell: 'barbell',
  plate_machine: 'plate machine',
  dumbbell_each: 'dumbbell',
  stack: 'machine',
  bodyweight: 'bodyweight',
};

const CACHE = new Map<string, Profile>();
// PLAN 3.5e: an approved candidate gets its pattern from then on.
onApprovedChange(() => CACHE.clear());

/** The ordering profile of any exercise id a workout or plan can hold. */
export function profileFor(id: string, name?: string): Profile {
  const hit = CACHE.get(id);
  if (hit && (name === undefined || hit.name === name)) return hit;
  const requires = requiresOf(SWAP_DATA, id);
  const loadType = planExercise(id)?.loadType ?? candidateLoadOf(id);
  const implement = requires ? implementOfRequires(requires) : ((loadType && LOAD_IMPLEMENT[loadType]) ?? 'unknown');
  // PLAN 3.5j: an approved cardio move is cardio (a warm up or finisher), never a lift.
  const override = PROFILE_OVERRIDES[id] ?? (approvedCandidate(id)?.pattern === 'cardio' ? CARDIO : undefined);
  const p = profileOf({ id, name: name ?? planExercise(id)?.name ?? exerciseNameOf(id) ?? id, pattern: patternOf(SWAP_DATA, id), implement, ...(override ? { override } : {}) });
  CACHE.set(id, p);
  return p;
}

/**
 * What Up next may suggest at this gym: every ladder candidate the gym can surely do (its gear is
 * known and there), by the id its sets log under, best first within each pattern. Never anything
 * whose gear is not known for sure.
 */
export function upNextPool(gym: GymKit): Profile[] {
  const out: Profile[] = [];
  const seen = new Set<string>();
  for (const pattern of PATTERNS) {
    for (const c of SWAP_DATA.patterns[pattern].candidates as Candidate[]) {
      const id = workoutIdOf(c);
      const key = SWAP_DATA.sameAs(id);
      if (seen.has(key) || !supports(c.requires, gym)) continue;
      seen.add(key);
      out.push(profileFor(id));
    }
  }
  return out;
}
