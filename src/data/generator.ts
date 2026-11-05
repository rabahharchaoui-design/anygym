// The plan generator over the committed data (PLAN 3.5): the pattern ladders, the ordering profiles
// and the names the app already shows. src/lib/generator.ts stays pure.
import { generatePlan, type GeneratorDeps, type GeneratorInput, type GeneratorResult } from '../lib/generator';
import { SWAP_DATA } from './patterns';
import { profileFor } from './order';
import { exerciseNameOf } from './importMatch';

export const GENERATOR_DEPS: GeneratorDeps = {
  data: SWAP_DATA,
  profile: (id) => profileFor(id),
  name: (id) => exerciseNameOf(id) ?? id,
};

export const generate = (input: GeneratorInput): GeneratorResult => generatePlan(input, GENERATOR_DEPS);
