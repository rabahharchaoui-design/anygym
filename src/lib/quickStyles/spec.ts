// The spec of a style variant for a person and the minutes.
import type { GeneratorInput } from '../generator';
import type { BuildSpec } from './buildTypes';
import { densityFor } from './estimate';
import type { StyleDef } from './types';

/** The spec of a style variant for this person and these minutes. */
export function styleSpec(style: StyleDef, variant: StyleDef['variants'][number], input: GeneratorInput, minutes: number): BuildSpec {
  const newer = input.experience === 'new' || input.experience === 'months' || input.experience === undefined || input.experience === 'break';
  const density = densityFor(minutes);
  const want = Math.min(density.max, style.maxMoves?.(minutes) ?? density.max);
  const spec: BuildSpec = {
    name: `${style.id}-${variant.key}`,
    slots: variant.slots,
    shape: style.shape(minutes),
    input: { ...input, ...(style.goals ? { goals: style.goals } : {}), ...(style.noFallback ? { noFallback: true as const } : {}) },
    want,
    density: style.maxMoves ? { ...density, min: Math.min(density.min, want) } : density,
    maxSets: style.maxSets(newer),
    rest: style.rest,
  };
  if (style.reps) spec.reps = style.reps;
  if (style.sets) spec.sets = style.sets(newer);
  if (style.only) spec.only = style.only;
  if (style.maxHeavy !== undefined) spec.maxHeavy = style.maxHeavy;
  return spec;
}
