// The fast exercise picker (PLAN 1.7c, SPEC 20.3, 21.2). Pure: no Dexie, no React.
//
// BODY PARTS come from the exercise name only when the name makes it certain; anything else is
// "More" (never a guess). First matching rule wins, whole words, case insensitive:
//   Core       crunch, sit up, plank, russian twist, leg raise, dead bug, bird dog, v up,
//              mountain climber, knee hug, toe touch
//   (stretches, sprints, intervals, rotations → More: not a strength body part)
//   Legs       squat, lunge, leg press, leg extension, leg curl, calf, hip thrust, romanian
//              deadlift, abductor, adductor, glute, step up
//   (then the muscle words tricep, bicep, pushdown, skull crusher → Arms, before any Back or Chest word)
//   Back       row (not upright row), pulldown, pull up, chin up, back extension, hyperextension
//   Chest      bench press, chest, push up, fly (not rear delt or reverse), incline press, pec
//   Shoulders  shoulder, overhead press, lateral raise, front raise, arnold, rear delt,
//              reverse fly, upright row, face pull, plate raise
//   Arms       curl (leg curl is caught by Legs first), tricep, bicep, pushdown, skull crusher,
//              wrist, forearm, finger roll, dip
// "Deadlift" alone works the whole back and legs, so it stays in More.
//
// POPULAR only lists exercises whose load type the active gym can make (SPEC 3): barbell needs a
// rack, dumbbells and one weight need a dumbbell range, cables need the cable station, plate
// machines need a leg press; bodyweight and timed work anywhere. Unknown load types are not
// listed as popular (we cannot tell), but stay findable by search and under "All".
import type { EquipmentId, Gym } from '../db/types';

export type GymKit = { equipment: readonly EquipmentId[]; dumbbellRange: Gym['dumbbellRange'] };
import type { ExerciseLoadType, PlanExercise } from './loadTypeRule';

export const BODY_PARTS = ['Chest', 'Back', 'Shoulders', 'Arms', 'Legs', 'Core'] as const;
export type BodyPart = (typeof BODY_PARTS)[number] | 'More';

const word = (name: string, words: string[]) => words.some((w) => new RegExp(`\\b${w.replace(/ /g, '[\\s-]+')}\\b`, 'i').test(name));

export function bodyPartOf(name: string): BodyPart {
  if (word(name, ['stretch', 'sprint', 'interval', 'rotation'])) return 'More';
  if (word(name, ['crunch', 'sit up', 'plank', 'russian twist', 'leg raise', 'dead bug', 'bird dog', 'v up', 'mountain climber', 'knee hug', 'toe touch'])) return 'Core';
  if (word(name, ['squat', 'lunge', 'leg press', 'leg extension', 'leg curl', 'calf', 'calf raise', 'hip thrust', 'romanian deadlift', 'abductor', 'adductor', 'glute', 'step up'])) return 'Legs';
  // Muscle words decide before movement words: a "Tricep Pulldown" is arms, never back.
  if (word(name, ['tricep', 'triceps', 'bicep', 'biceps', 'pushdown', 'skull crusher'])) return 'Arms';
  if (word(name, ['upright row'])) return 'Shoulders';
  if (word(name, ['row', 'pulldown', 'pull up', 'chin up', 'back extension', 'hyperextension'])) return 'Back';
  if (word(name, ['rear delt', 'reverse fly'])) return 'Shoulders';
  if (word(name, ['bench press', 'chest', 'push up', 'fly', 'incline press', 'incline plate press', 'pec'])) return 'Chest';
  if (word(name, ['shoulder', 'overhead press', 'lateral raise', 'front raise', 'arnold', 'face pull', 'plate raise'])) return 'Shoulders';
  if (word(name, ['curl', 'tricep', 'triceps', 'bicep', 'biceps', 'pushdown', 'skull crusher', 'wrist', 'forearm', 'finger roll', 'dip', 'dips'])) return 'Arms';
  return 'More';
}

/** Can this gym make this load type? undefined for an unknown type (we cannot tell). */
export function gymSupports(loadType: ExerciseLoadType, gym: GymKit): boolean | undefined {
  switch (loadType) {
    case 'barbell':
      return gym.equipment.includes('barbell_rack');
    case 'dumbbell_each':
    case 'single':
      return gym.dumbbellRange !== null;
    case 'stack':
      return gym.equipment.includes('cable_station');
    case 'plate_machine':
      return gym.equipment.includes('leg_press');
    case 'bodyweight':
    case 'timed':
      return true;
    case 'unknown':
      return undefined;
  }
}

export type PickerSection = { title: string; items: PlanExercise[] };

/**
 * DUPLICATES (ux-critic, Session 1 gate; SPEC 0 and 6). Two ids are merged ONLY when they are the
 * same movement on the same implement beyond doubt: the same words in another order, or a bare
 * name whose extra words add nothing about the equipment. The picker then shows the entry once, as
 * the more specific name; both ids stay in the data and history under either id counts as one.
 *   bent-over-barbell-row  → barbell-bent-over-row   same words, another order
 *   plank                  → elbow-plank             a plank is on the elbows, no equipment
 * NOT merged, even though the names look alike: a bare machine name next to a specific machine
 * ("Leg Curl" vs "Machine Lying Leg Curl": seated or lying is not known; "Leg Extension", "Leg
 * Press" vs "Machine Leg Press" or "Angled Machine Leg Press": the exact machine is not known).
 * They stay separate entries with their own history (SPEC 6: a different machine is a different
 * lift). The unit test checks the implement rule against the whole list.
 */
export const PICKER_ALIASES: Readonly<Record<string, string>> = {
  'bent-over-barbell-row': 'barbell-bent-over-row',
  plank: 'elbow-plank',
};

/** Extra words that never say anything about the implement (a bare name plus these is the same lift). */
export const NEUTRAL_WORDS: readonly string[] = ['elbow'];

/** Bare names whose equipment differs from the specific one: named by their equipment in the picker. */
export const PICKER_NAMES: Readonly<Record<string, string>> = {
  'bicep-curl': 'Dumbbell Bicep Curl',
  'chest-fly': 'Dumbbell Chest Fly',
};

/** The id the picker shows for an exercise id (itself, or the entry it is a duplicate of). */
export const pickerId = (id: string): string => PICKER_ALIASES[id] ?? id;

/**
 * Every id that is the same exercise as this one (itself, the entry it stands for, and the
 * duplicates that stand for it): history under either id counts as one exercise's history.
 */
export function sameExerciseIds(id: string): string[] {
  const shown = pickerId(id);
  return [shown, ...Object.keys(PICKER_ALIASES).filter((k) => PICKER_ALIASES[k] === shown)];
}

/** The name the picker shows for an exercise. */
export const pickerName = (e: Pick<PlanExercise, 'id' | 'name'>): string => PICKER_NAMES[e.id] ?? e.name;

/**
 * Popular (SPEC 20.3 default list): the big compounds first (squat, bench, deadlift, rows, pull
 * ups, overhead press), then a few staples. Only ids that exist and the gym can make are shown.
 */
export const POPULAR_IDS: readonly string[] = [
  'barbell-back-squat',
  'barbell-incline-bench-press',
  'dumbbell-bench-press',
  'deadlift',
  'romanian-deadlift',
  'barbell-bent-over-row',
  'single-arm-dumbbell-row',
  'wide-grip-pull-up',
  'overhead-press',
  'lat-machine-wide-grip-pulldown',
  'machine-leg-press',
  'front-squat',
];

const words = (text: string) => text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

/** Every word of the search is in the name (any order), or in the name of a duplicate it stands for. */
function matcher(all: readonly PlanExercise[]) {
  const extra = new Map<string, string>();
  for (const e of all) {
    const to = PICKER_ALIASES[e.id];
    if (to) extra.set(to, `${extra.get(to) ?? ''} ${e.name}`);
  }
  return (e: PlanExercise, q: string[]) => {
    const hay = `${pickerName(e)} ${e.name} ${extra.get(e.id) ?? ''}`.toLowerCase();
    return q.every((w) => hay.includes(w));
  };
}

/**
 * What the picker lists. With a search: one list of matches across every body part (a chip picked
 * after typing narrows it). Without: Recent, Popular, then All, each exercise once. A body part
 * narrows every section. Duplicate entries are never listed (PICKER_ALIASES).
 */
export function pickerSections(
  all: readonly PlanExercise[],
  opts: { query: string; part: BodyPart | null; recent: readonly string[]; gym: GymKit | undefined },
): PickerSection[] {
  const q = words(opts.query);
  const shown = all.filter((e) => !PICKER_ALIASES[e.id]);
  const inPart = (e: PlanExercise) => opts.part === null || bodyPartOf(e.name) === opts.part;
  if (q.length) {
    const match = matcher(all);
    const items = shown.filter((e) => match(e, q) && inPart(e));
    return items.length ? [{ title: 'Results', items }] : [];
  }
  const byId = new Map(shown.map((e) => [e.id, e]));
  const taken = new Set<string>();
  const take = (e: PlanExercise | undefined): e is PlanExercise => !!e && !taken.has(e.id) && inPart(e) && !!taken.add(e.id);
  const recent = opts.recent.map((id) => byId.get(pickerId(id))).filter(take);
  const canMake = (e: PlanExercise) => !opts.gym || gymSupports(e.loadType, opts.gym) === true;
  const popular = POPULAR_IDS.map((id) => byId.get(id)).filter((e): e is PlanExercise => !!e && canMake(e)).filter(take);
  const rest = shown.filter(take);
  return [
    { title: 'Recent', items: recent },
    { title: 'Popular', items: popular },
    { title: 'All', items: rest },
  ].filter((s) => s.items.length > 0);
}

const tokens = (text: string) => new Set(words(text).map((w) => (w.length > 3 ? w.replace(/s$/, '') : w)));

/**
 * Import pick sheet: exercises with the file's load type first, then the closest names (how many
 * normalized words they share with the file's text), then list order. Never a guess: the user picks.
 */
export function closestFirst<T extends { name: string; loadType?: string }>(all: readonly T[], text: string, loadType?: string): T[] {
  const want = tokens(text);
  const score = (e: T) => [...tokens(e.name)].filter((w) => want.has(w)).length;
  // The same load type as the file says first (a dumbbell press stays among dumbbell lifts), then word overlap.
  const same = (e: T) => (loadType && e.loadType === loadType ? 1 : 0);
  return all
    .map((e, i) => ({ e, i, t: same(e), s: score(e) }))
    .sort((a, b) => b.t - a.t || b.s - a.s || a.i - b.i)
    .map((x) => x.e);
}
