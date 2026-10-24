// The fast exercise picker (PLAN 1.7c, SPEC 20.3, 21.2). Pure: no Dexie, no React.
//
// BODY PARTS come from the exercise name only when the name makes it certain; anything else is
// "More" (never a guess). First matching rule wins, whole words, case insensitive:
//   Core       crunch, sit up, plank, russian twist, leg raise, dead bug, bird dog, v up,
//              mountain climber, knee hug, toe touch
//   (stretches, sprints, intervals, rotations → More: not a strength body part)
//   Legs       squat, lunge, leg press, leg extension, leg curl, calf, hip thrust, romanian
//              deadlift, abductor, adductor, glute, step up
//   Back       row (not upright row), pulldown, pull up, chin up, back extension, hyperextension
//   Chest      bench press, chest, push up, fly (not rear delt or reverse), incline press, pec
//   Shoulders  shoulder, overhead press, lateral raise, front raise, arnold, rear delt,
//              reverse fly, upright row, face pull, plate raise
//   Arms       curl (leg curl is caught by Legs first), tricep, bicep, pushdown, skull crusher,
//              wrist, forearm, finger roll, dip
// "Deadlift" alone works the whole back and legs, so it stays in More.
//
// FOR YOUR GYM: exercises whose load type the active gym can make (SPEC 3): barbell needs a
// rack, dumbbells and one weight need a dumbbell range, cables need the cable station, plate
// machines need a leg press; bodyweight and timed work anywhere. Unknown load types are not
// listed here (we cannot tell), but stay findable by search and under "Everything else".
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

const matches = (e: PlanExercise, q: string) => e.name.toLowerCase().includes(q);

/**
 * What the picker lists. With a search: one list of matches. Without: Recent, For your gym, then
 * Everything else, each exercise once. A body part narrows every section.
 */
export function pickerSections(
  all: readonly PlanExercise[],
  opts: { query: string; part: BodyPart | null; recent: readonly string[]; gym: GymKit | undefined },
): PickerSection[] {
  const q = opts.query.trim().toLowerCase();
  const inPart = (e: PlanExercise) => opts.part === null || bodyPartOf(e.name) === opts.part;
  if (q) {
    const items = all.filter((e) => matches(e, q) && inPart(e));
    return items.length ? [{ title: 'Results', items }] : [];
  }
  const byId = new Map(all.map((e) => [e.id, e]));
  const recent = opts.recent.map((id) => byId.get(id)).filter((e): e is PlanExercise => !!e && inPart(e));
  const taken = new Set(recent.map((e) => e.id));
  const forGym = opts.gym ? all.filter((e) => !taken.has(e.id) && inPart(e) && gymSupports(e.loadType, opts.gym!) === true) : [];
  for (const e of forGym) taken.add(e.id);
  const rest = all.filter((e) => !taken.has(e.id) && inPart(e));
  return [
    { title: 'Recent', items: recent },
    { title: 'For your gym', items: forGym },
    { title: 'Everything else', items: rest },
  ].filter((s) => s.items.length > 0);
}
