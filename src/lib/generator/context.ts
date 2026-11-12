// The working context of one generation.
import type { GoalId } from '../intake/options';
import { FAMILY_OF } from '../generatorRules';
import type { Ctx, GeneratorDeps, GeneratorInput } from './types';

/** The working context of one generation: goals, and the love, never and soft lists by sameAs key. */
export function contextOf(input: GeneratorInput, deps: GeneratorDeps): Ctx {
  const goals = input.goals.filter((g, i, all) => all.indexOf(g) === i && FAMILY_OF[g] !== undefined);
  const main: GoalId = goals[0] ?? 'health';
  const also: GoalId | null = goals[1] ?? null;
  const key = (id: string) => deps.data.sameAs(id);
  const softOf = new Map<string, number>();
  for (const [id, n] of Object.entries(input.soft ?? {})) if (n > 0) softOf.set(key(id), (softOf.get(key(id)) ?? 0) + n);
  const ctx: Ctx = {
    input,
    deps,
    main,
    also,
    family: FAMILY_OF[main],
    loveKeys: new Set((input.love ?? []).map(key)),
    neverKeys: new Set((input.never ?? []).map(key)),
    softOf,
    weekUsed: new Map(),
  };
  // Never wins over love (SPEC 15: never want means never).
  for (const k of ctx.neverKeys) ctx.loveKeys.delete(k);
  return ctx;
}
