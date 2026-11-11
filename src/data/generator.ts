// The plan generator over the committed data (PLAN 3.5): the pattern ladders, the ordering profiles
// and the names the app already shows. src/lib/generator.ts stays pure.
import { generatePlan, type GeneratorDeps, type GeneratorInput, type GeneratorResult } from '../lib/generator';
import { SWAP_DATA } from './patterns';
import { profileFor } from './order';
import { exerciseNameOf } from './importMatch';
import { approvedCardio } from './candidateGate';

export const GENERATOR_DEPS: GeneratorDeps = {
  data: SWAP_DATA,
  profile: (id) => profileFor(id),
  name: (id) => exerciseNameOf(id) ?? id,
  // PLAN 3.5j: a cardio warm up only from a move approved on this phone.
  cardio: approvedCardio,
};

export const generate = (input: GeneratorInput): GeneratorResult => generatePlan(input, GENERATOR_DEPS);
