// Picking the best candidate of a pattern for a slot, and filling a slot.
import type { EquipmentId } from '../../db/types';
import type { StyleId } from '../intake/options';
import { easyOnAvoids } from '../order';
import { supports, workoutIdOf, type Candidate, type Pattern, type Requires } from '../swap';
import { FALLBACK, type Slot } from '../generatorRules';
import type { Ctx, GeneratorInput, Item } from './types';

const BENCHES: ReadonlySet<EquipmentId> = new Set<EquipmentId>(['flat_bench', 'adjustable_bench']);
const FREE: ReadonlySet<EquipmentId> = new Set<EquipmentId>(['barbell_rack', 'ez_curl_bar', 'dumbbells', 'kettlebells']);
const BODY: ReadonlySet<EquipmentId> = new Set<EquipmentId>(['pull_up_bar', 'dip_station', 'hyperextension_bench']);

type Kind = 'machine' | 'free' | 'body' | 'band';

/** What a candidate is done with, from its requirement (a bench alone is not the implement). */
export function kindOf(r: Requires): Kind {
  const main = r.find((g) => !g.every((id) => BENCHES.has(id)));
  const id = main?.[0];
  if (!id || BODY.has(id)) return 'body';
  if (FREE.has(id)) return 'free';
  if (id === 'resistance_bands') return 'band';
  return 'machine';
}

/** SPEC 14 step 8: the training style ranks what fits (never what fits). */
const STYLE_RANK: Partial<Record<StyleId, Record<Kind, number>>> = {
  machines: { machine: 0, free: 1, body: 2, band: 2 },
  free: { free: 0, body: 1, machine: 2, band: 2 },
  bodyweight: { body: 0, band: 1, free: 2, machine: 2 },
};

/**
 * PLAN 3.7b: a brand new lifter learns on machines first, whatever else was answered (the Beginner
 * plan's own rule, src/data/frozenPlans.ts): a focus pick or a style never turns the plan into a
 * barbell plan. Machines first, then the rest in the order of the style picked. Undefined for
 * everyone else. It only ranks what fits: a gym with no machines still gets its plan.
 */
export function beginnerRank(input: GeneratorInput): Record<Kind, number> | undefined {
  if (input.experience !== 'new') return undefined;
  const rest = (input.style ? STYLE_RANK[input.style] : undefined) ?? STYLE_RANK.machines!;
  return { machine: 0, free: 1 + rest.free, body: 1 + rest.body, band: 1 + rest.band };
}

/** What ranks the candidates that fit: the beginner rule, else the training style picked (none: the ladder's own order). */
export const rankOf = (input: GeneratorInput): Record<Kind, number> | undefined => beginnerRank(input) ?? (input.style ? STYLE_RANK[input.style] : undefined);

/** Can this gym do it, and may this person get it? */
export function allowed(ctx: Ctx, c: Candidate, timedOk: boolean): boolean {
  if (!supports(c.requires, ctx.input.gym)) return false;
  if (c.timed && !timedOk) return false;
  const id = workoutIdOf(c);
  if (ctx.neverKeys.has(ctx.deps.data.sameAs(id))) return false;
  if (ctx.deps.usable && !ctx.deps.usable(id)) return false;
  const p = ctx.deps.profile(id);
  if (easyOnAvoids(ctx.input.easyOn, p)) return false;
  const avoid = ctx.input.avoidMuscles;
  if (avoid?.length && p.targets.some((m) => avoid.includes(m))) return false;
  if (p.advanced && ctx.input.experience !== '3y') return false;
  return true;
}

/** The best candidate of a pattern for a slot, or undefined. Loved first, then week variety (variant slots), then style, then the ladder. */
export function pickFrom(ctx: Ctx, pattern: Pattern, variant: boolean, dayKeys: ReadonlySet<string>): Candidate | undefined {
  const ladder = ctx.deps.data.patterns[pattern]?.candidates ?? [];
  const used = ctx.weekUsed.get(pattern) ?? new Set<string>();
  const style = rankOf(ctx.input);
  const scored = ladder
    .map((c, i) => ({ c, i, key: ctx.deps.data.sameAs(workoutIdOf(c)) }))
    .filter((x) => !dayKeys.has(x.key) && allowed(ctx, x.c, pattern === 'core'))
    .map((x) => ({
      ...x,
      loved: ctx.loveKeys.has(x.key) && !variant ? 0 : 1,
      fresh: variant && used.has(x.key) ? 1 : 0,
      style: style ? style[kindOf(x.c.requires)] : 0,
      soft: ctx.softOf.get(x.key) ?? 0,
    }));
  // Learned soft dislikes rank after a loved one and before variety and style (PLAN 3.5a).
  scored.sort((a, b) => a.loved - b.loved || a.soft - b.soft || a.fresh - b.fresh || a.style - b.style || a.i - b.i);
  return scored[0]?.c;
}

export function makeItem(ctx: Ctx, c: Candidate, pattern: Pattern): Item {
  const id = workoutIdOf(c);
  return { id, key: ctx.deps.data.sameAs(id), candidate: c, profile: ctx.deps.profile(id), pattern, sets: 0, extra: 0, rest: 0 };
}

/** Fills a slot: its pattern, else a fallback the day does not have yet (never a second of the same). Records what it took. */
export function fill(ctx: Ctx, slot: Slot, dayKeys: Set<string>, dayPatterns: ReadonlySet<Pattern>): Item | undefined {
  const patterns = ctx.input.noFallback ? [slot.pattern] : [slot.pattern, ...FALLBACK[slot.pattern].filter((p) => !dayPatterns.has(p))];
  for (const pattern of patterns) {
    const c = pickFrom(ctx, pattern, slot.variant === true, dayKeys);
    if (!c) continue;
    const item = makeItem(ctx, c, pattern);
    dayKeys.add(item.key);
    const used = ctx.weekUsed.get(pattern) ?? new Set<string>();
    used.add(item.key);
    ctx.weekUsed.set(pattern, used);
    return item;
  }
  return undefined;
}
