import type { MutableRefObject } from 'react';
import { saveIntake } from '../../db/intake';
import { bodyPref } from '../../lib/bodyPref';
import type { IntakeAnswers } from '../../lib/intake/funnel';

/** Saves the answers (profile, units, the first gym) and the muscle map body; a gym compares with `baseline`. */
export async function persistAnswers(answers: IntakeAnswers, baseline: MutableRefObject<IntakeAnswers | undefined>): Promise<void> {
  await saveIntake(answers, undefined, undefined, { start: baseline.current });
  baseline.current = answers;
  if (answers.units) bodyPref.set(answers.units.body);
}
