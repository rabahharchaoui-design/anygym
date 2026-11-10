// Quick workout's style cards and "Hit what's fresh" (PLAN 3.5b, 3.5d, 3.5g): each built by the plan
// generator's own rules and offered only when its name is true of what it holds. Pure. Moved out of
// quick.ts (code organization).
import { type BuildDeps, type BuildSpec, type StyleDef, type StyleId, buildCard, densityFor, structureOf, styleSpec } from './quickStyles';
import type { Concept, QuickDeps, QuickInput, QuickItem } from './quick';
import type { GeneratorInput } from './generator';
import { JOINT_WORD, fits, gearOf, itemsOf, mainMuscles } from './quickShow';
import { type Muscle, muscleWord, patternTargets } from './order';
import { type Pattern, requiresOf, workoutIdOf } from './swap';
import { TIRED_MS, cap, leavesOut, mainWords, muscleRestLine, restedLine, targetsOf, trainedWithin, wordList } from './quickWhy';

/** The fresh concept's pool, big moves first; only the patterns that train no recent muscle stay. */
export const FRESH_POOL: Pattern[] = ['squat', 'hinge', 'horizontal push', 'horizontal pull', 'vertical push', 'vertical pull', 'lunge', 'glutes', 'lateral delt', 'chest isolation', 'rear delt', 'biceps', 'triceps', 'quads isolation', 'hamstrings isolation', 'calves', 'core'];
export const LEG_PATTERNS: ReadonlySet<Pattern> = new Set<Pattern>(['squat', 'hinge', 'lunge', 'glutes', 'quads isolation', 'hamstrings isolation', 'calves']);

export const BLURB: Record<StyleId, string> = {
  circuit: 'Legs, push and pull, one after another',
  pump: 'Moves in pairs, short rest',
  strength: 'Fewer moves, heavier, longer rest',
  cardioCore: 'Cardio and abs, one after another',
  mobility: 'Stretches, nothing heavy',
  armsAbs: 'Arms and abs, back to back',
  easy: 'A light day: no barbell, nothing jumpy',
};

/** The chip a card's structure earns (a style's own chip first). */
export function chipOf(style: StyleDef | null, items: readonly QuickItem[]): string {
  if (style?.chip) return style.chip;
  const st = structureOf(items);
  if (st.circuits) return 'Circuit';
  if (st.supersets) return 'Pairs';
  return 'Straight sets';
}

export const BUILD = (deps: QuickDeps): BuildDeps => ({ ...deps, requires: (id) => requiresOf(deps.data, id) });

/**
 * 3.5b round 4 (B1): muscles trained in the last 3 days rank a style card's moves, never remove them:
 * a move for one of them counts as one more soft dislike (the generator puts it after the others that
 * fit the slot, and still uses it when nothing else does). "Hit what's fresh" is the card that leaves them out.
 */
export function restedFirst(base: GeneratorInput, recent: readonly Muscle[], deps: Pick<QuickDeps, 'data' | 'profile'>): GeneratorInput {
  if (!recent.length) return base;
  const tired = new Set(recent);
  const soft: Record<string, number> = { ...base.soft };
  for (const ladder of Object.values(deps.data.patterns))
    for (const c of ladder.candidates) {
      const id = workoutIdOf(c);
      if (deps.profile(id).targets.some((m) => tired.has(m))) soft[id] = (soft[id] ?? 0) + 1;
    }
  return { ...base, soft };
}

/** A style card, or null when the gym, the never list or the minutes leave too little for its name to be true. */
export function styleCard(style: StyleDef, variant: StyleDef['variants'][number], input: QuickInput, deps: QuickDeps): Concept | null {
  if (style.minMinutes !== undefined && input.minutes < style.minMinutes) return null;
  const base = restedFirst(input.base, input.recent, deps);
  const attempt = (d: QuickDeps) => {
    const b = buildCard(styleSpec(style, variant, { ...base, minutes: input.minutes }, input.minutes), BUILD(d), input.minutes);
    if (!b || !fits(b.minutes, input.minutes)) return null;
    if (!style.honest(b.items.map((it) => d.profile(it.id)), b.items)) return null;
    // 3.5b round 4 (B1): a card holds G's count for the minutes; fewer is never offered as a full card
    // (Strength focus is fewer on purpose, and its 4th and 5th lifts come before extra sets).
    if (!style.maxMoves && b.items.length < densityFor(input.minutes).min) return null;
    return b;
  };
  // 3.5d (9), 3.5g: muscles trained in the last 48 h stay out of every style card (the Full body
  // circuit and the Pairs too). A card that cannot be built without them is not offered at all.
  const tired = trainedWithin(input.lastTrained, input.now ?? Date.now(), TIRED_MS);
  // Round 2: when every tired muscle cannot go (yesterday's chest press also tires front delts and
  // triceps, so a shoulder press would go too), the big ones go and the small helpers may stay.
  const SMALL: readonly Muscle[] = ['front delts', 'triceps', 'biceps', 'forearms'];
  const ladder = [tired, tired.filter((m) => !SMALL.includes(m))].filter((t, i, all) => t.length > 0 && (i === 0 || t.length < all[0]!.length));
  let kept: readonly Muscle[] = [];
  let built: ReturnType<typeof attempt> = null;
  for (const t of ladder) {
    const rested: QuickDeps = { ...deps, usable: (id) => deps.usable(id) && !targetsOf(deps, id).some((m) => t.includes(m)) };
    built = attempt(rested);
    if (built) {
      kept = t;
      break;
    }
  }
  if (!built && ladder.length) return null;
  built = built ?? attempt(deps);
  if (!built) return null;
  const items = itemsOf(deps, built.items);
  const ids = items.map((it) => it.id);
  const easyOn = (input.base.easyOn ?? []).filter((j) => JOINT_WORD[j]);
  // 3.5b round 4 (M6): a pump names what it pairs ("Chest and back pairs"), never a generic line.
  const pairWords = style.id === 'pump' ? mainWords(items, deps).words : [];
  const blurb =
    style.id === 'easy' && easyOn.length
      ? `A light day, easy on your ${wordList(easyOn.map((j) => JOINT_WORD[j]!), 2)}`
      : pairWords.length
        ? `${cap(wordList(pairWords))} pairs`
        : BLURB[style.id];
  const focus = mainWords(items, deps).words;
  return {
    id: style.id,
    variant: variant.key,
    variantLabel: variant.label,
    ...(focus.length ? { focus: cap(wordList(focus)) } : {}),
    title: style.title,
    // 3.5g: the why line names the muscles this card trains most, each with its own rest.
    line: muscleRestLine(items, deps, input.lastTrained, input.now ?? Date.now()) ?? blurb,
    altLines: [...(kept.length ? [leavesOut(kept, input)] : []), blurb],
    items,
    minutes: built.minutes,
    over: false,
    chip: chipOf(style, items),
    effort: style.effort,
    gear: gearOf(ids, deps.data, input.base.gym),
    primary: mainMuscles(items, deps),
    ...(built.short ? { short: built.short } : {}),
    ...(newerOf(input.base) ? { newer: true } : {}),
  };
}

export const newerOf = (base: Pick<GeneratorInput, 'experience'>) => base.experience === undefined || base.experience === 'new' || base.experience === 'months' || base.experience === 'break';

/** The one plain line a short card shows (PLAN 3.5b round 2), or null. */
export function shortLine(c: Pick<Concept, 'short' | 'newer' | 'id'>): string | null {
  if (!c.short) return null;
  if (c.short === 'caps' && c.newer) return "Fewer sets while you're new";
  if (c.id === 'plan') return "All of today's plan this gym can do";
  // 3.5b round 4 (B1): never "All this gym can do" while the gym has other moves: say what ran out.
  if (c.id === 'fresh') return c.short === 'caps' ? 'As long as this style goes' : 'No more rested moves here';
  return c.short === 'caps' ? 'As long as this style goes' : 'No more moves of this kind here';
}

export const FRESH_REST: StyleDef['rest'] = { group: 60, single: 60, floor: 45, cap: 90 };

/** "Hit what's fresh": muscles with no logged sets in the last 3 days, all of them, then upper or legs only. */
export function freshCards(input: QuickInput, deps: QuickDeps): Concept[] {
  const recent = [...new Set(input.recent)];
  const logged = recent.length > 0 || Object.keys(input.lastTrained ?? {}).length > 0;
  if (!logged) return [];
  // Round 2 (B4): nothing on this card may light a muscle the Skips line names, on its map either.
  const blocked = new Set(recent.flatMap((m) => deps.muscleRegions?.(m) ?? []));
  // 3.5d round 3: and no move whose main muscle was trained in the last 3 days, whatever its pattern.
  const freshDeps: QuickDeps = { ...deps, usable: (id) => deps.usable(id) && !targetsOf(deps, id).some((m) => recent.includes(m)) && !(deps.litRegions?.(id) ?? []).some((r) => blocked.has(r)) };
  // The why line names only muscles truly not trained in the last 3 days (a word shared with a trained muscle, shoulders, is out too).
  const tiredWords = new Set(recent.map(muscleWord));
  const restedOnly = Object.fromEntries(Object.entries(input.lastTrained ?? {}).filter(([m]) => !tiredWords.has(muscleWord(m as Muscle)))) as QuickInput['lastTrained'];
  const pool = FRESH_POOL.filter((p) => !patternTargets(p).some((m) => recent.includes(m)));
  const pools = [pool, pool.filter((p) => !LEG_PATTERNS.has(p)), pool.filter((p) => LEG_PATTERNS.has(p) || p === 'core')];
  const out: Concept[] = [];
  const density = densityFor(input.minutes);
  for (const [k, ps] of pools.entries()) {
    if (ps.length < 3) continue;
    const spec: BuildSpec = {
      name: `fresh-${k}`,
      slots: ps.map((p) => ({ pattern: p })),
      shape: input.minutes <= 20 ? 'circuit' : 'pairs',
      input: { ...input.base, avoidMuscles: recent, ...(k > 0 ? { noFallback: true as const } : {}) },
      want: density.max,
      density,
      maxSets: input.base.experience === 'new' ? 3 : 4,
      rest: FRESH_REST,
    };
    const built = buildCard(spec, BUILD(freshDeps), input.minutes);
    if (!built || !fits(built.minutes, input.minutes)) continue;
    const items = itemsOf(deps, built.items, (it) => `${cap(wordList(targetsOf(deps, it.id).map(muscleWord)))}: not trained in 3 days`);
    if (out.some((o) => o.items.length === items.length && o.items.every((x) => items.some((y) => y.id === x.id)))) continue;
    const ids = items.map((it) => it.id);
    const rested = restedLine(items, deps, restedOnly, input.now ?? Date.now(), 1);
    const skips = recent.length ? `Skips ${wordList([...new Set(recent.map(muscleWord))].slice(0, 2))} (trained ${input.recentWhen ?? 'lately'})` : null;
    out.push({
      id: 'fresh',
      title: "Hit what's fresh",
      line: rested ?? skips ?? `${cap(wordList(mainWords(items, deps).words))}: not trained in 3 days`,
      items,
      minutes: built.minutes,
      over: false,
      chip: chipOf(null, items),
      effort: 2,
      gear: gearOf(ids, deps.data, input.base.gym),
      primary: mainMuscles(items, deps),
      ...(built.short ? { short: built.short } : {}),
      ...(newerOf(input.base) ? { newer: true } : {}),
    });
  }
  return out;
}
