// What a candidate shows (PLAN 3.5e): its muscle map and its gear in plain words. Pure, from the
// candidate record only (its own shoulder part, the SPEC 4.5 rules), so the review card and an
// approved move in a workout show the same thing.
import type { EquipmentId } from '../../db/types';
import { resolveMuscles, type MuscleMapData } from '../muscles';
import type { CandidateGroup, CandidateRecord } from './types';
import { cap } from '../words';

export function candidateMuscles(c: CandidateRecord): MuscleMapData | null {
  return resolveMuscles(c, { exercises: c.muscleOverride ? { [c.id]: c.muscleOverride } : {} });
}

/** The gear the move needs, in plain words: "Dumbbells + a bench", "Nothing: just your body". */
export function gearLine(c: Pick<CandidateRecord, 'requires'>, label: Readonly<Record<EquipmentId, string>>): string {
  if (!c.requires.length) return 'Nothing: just your body';
  const parts = c.requires.map((group) => {
    if (group.every((id) => id === 'flat_bench' || id === 'adjustable_bench')) return group.length > 1 ? 'a bench' : 'an adjustable bench';
    return group.map((id) => label[id]).join(' or ');
  });
  const line = parts.join(' + ');
  return cap(line);
}

/** What kind of move it is, in plain words (SPEC 13.1), for the review card. */
export const GROUP_WORDS: Record<CandidateGroup, string> = {
  squat: 'Squat',
  hinge: 'Hip hinge',
  lunge: 'Lunge',
  'horizontal push': 'Push',
  'vertical push': 'Overhead press',
  'horizontal pull': 'Row',
  'vertical pull': 'Pull down',
  'chest isolation': 'Chest',
  'lateral delt': 'Side delts',
  'rear delt': 'Rear delts',
  biceps: 'Biceps',
  triceps: 'Triceps',
  'quads isolation': 'Quads',
  'hamstrings isolation': 'Hamstrings',
  glutes: 'Glutes',
  calves: 'Calves',
  core: 'Core',
  cardio: 'Cardio',
  mobility: 'Stretch',
  power: 'Jump and power',
  accessory: 'Extra',
};
