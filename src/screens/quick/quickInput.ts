// Quick workout's generator input (PLAN 3.5a): the intake answers at the active gym, with what was
// learned (never list, soft dislikes). Shared by the Quick workout screen and Today's build card.
import type { Gym } from '../../db/types';
import type { GeneratorInput } from '../../lib/generator';
import type { IntakeAnswers } from '../../lib/intake/funnel';
import { generatorInputOf } from '../../lib/intake/yourPlan';
import { withDislikes, type Dislikes } from '../../lib/quick';

export const kitOf = (gym: Pick<Gym, 'equipment' | 'dumbbellRange'>): GeneratorInput['gym'] => ({ equipment: gym.equipment, dumbbellRange: gym.dumbbellRange });

export function baseInput(answers: IntakeAnswers | undefined, gym: GeneratorInput['gym'], dislikes: Dislikes | undefined): GeneratorInput {
  const raw = answers ? generatorInputOf(answers) : { goals: [], gym };
  const input: GeneratorInput = { ...raw, gym };
  delete input.place;
  return withDislikes(input, dislikes);
}

/** Where a gym's equipment is edited (Settings → Gyms → the gym → Equipment). */
export const equipmentPath = (gymId: string) => `/settings/gyms/${encodeURIComponent(gymId)}/equipment`;
