// The plan generator over the committed data (PLAN 3.5): the pattern ladders, the ordering profiles
// and the names the app already shows. src/lib/generator.ts stays pure.
import { generatePlan, type GeneratorDeps, type GeneratorInput, type GeneratorResult } from '../lib/generator';
import { focusFacts, FOCUS_MOBILITY } from './focus';
import { SWAP_DATA } from './patterns';
import { profileFor } from './order';
import { exerciseNameOf } from './importMatch';
import { approvedCardio, approvedFocusLifts, approvedVersion } from './candidateGate';

export const GENERATOR_DEPS: GeneratorDeps = {
  data: SWAP_DATA,
  focusFacts,
  focusCandidates: FOCUS_MOBILITY,
  // PLAN 3.6g: Grip and Forearms are served only with a forearm move approved on this phone.
  focusLifts: approvedFocusLifts,
  profile: (id) => profileFor(id),
  name: (id) => exerciseNameOf(id) ?? id,
  // PLAN 3.5j: a cardio warm up only from a move approved on this phone.
  cardio: approvedCardio,
  // PLAN 3.6p: everything above that can change on this phone changes with the approved set.
  stamp: approvedVersion,
};

export const generate = (input: GeneratorInput): GeneratorResult => generatePlan(input, GENERATOR_DEPS);
