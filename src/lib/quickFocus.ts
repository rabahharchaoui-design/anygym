// Quick workout's one area days (PLAN 3.5f): "Chest day", "Back day", "Shoulder day", "Leg day",
// each laid out by the smart structure rules (lib/orderSession.ts, SPEC 22): the biggest compound
// first with the best gear this gym has, an angle variation, an isolation, a finisher pair with a
// non competing muscle, 6 to 10 hard sets for the area, rest by type, fitted to the minutes through
// the one estimate. Pure. Only moves with a sure demo and sure gear (the swap ladders, so approved
// candidates join by themselves). Round 2: with fewer than 3 sure moves for the area the card is the
// nearest honest day instead (a push day led by the one sure chest press), saying why; an area with
// no sure big lift at all gets no card.
import { FAMILY_OF, NEWER, PRESCRIPTION, setsFor } from './generatorRules';
import { AREA_RULES, FALLBACK_RULES, SESSION_AREAS, isCompound, structureSession, type AreaRule, type Profile, type SessionArea, type SessionItem } from './order';
import { type Concept, type QuickDeps, type QuickInput, quickDepsFor } from './quick';
import { rankSoft, sureGear } from './quickDeck';
import { gearOf, itemsOf, mainMuscles } from './quickShow';
import { type GroupedItem, quickMinutes } from './quickStyles';
import { muscleRestLine, wordList } from './quickWhy';
import { cap } from './words';
import { muscleWord } from './order';
import { type Pattern, workoutIdOf } from './swap';
import { noteById } from './coachFacts';

/** The intake focus areas (SPEC 14 item 2) that have a day here. */
const FOCUS_AREA: Readonly<Record<string, SessionArea>> = { chest: 'chest', back: 'back', shoulders: 'shoulders', legs: 'legs', glutes: 'legs' };

/** The areas in the order their cards are offered: the person's own focus areas first. */
export function focusOrder(focus: readonly string[] | undefined): SessionArea[] {
  const mine = (focus ?? []).map((f) => FOCUS_AREA[f]).filter((a): a is SessionArea => !!a);
  return [...new Set([...mine, ...SESSION_AREAS])];
}

/** Fewer sure moves than this for an area: the nearest honest day instead (FALLBACK_RULES). */
export const FEWEST_AREA_MOVES = 3;

/** The sure moves this gym has for an area's own patterns that train its muscles. */
function areaMoves(rule: AreaRule, pool: (pattern: Pattern) => Profile[]): Profile[] {
  const all = [...rule.main, ...rule.angle, ...rule.isolation].flatMap(pool).filter((p) => p.role === 'lift' && p.targets.some((m) => rule.muscles.includes(m)));
  return all.filter((p, i) => all.findIndex((q) => q.id === p.id) === i);
}

/** One area's day for this person, gym and minutes, or null when it cannot be built honestly. */
export function focusCard(area: SessionArea, input: QuickInput, deps0: QuickDeps): Concept | null {
  const deps = quickDepsFor(input.base, deps0);
  const base = input.base;
  const never = new Set((base.never ?? []).map(deps.data.sameAs));
  const love = new Set((base.love ?? []).map(deps.data.sameAs));
  const pool = (pattern: Pattern): Profile[] => {
    const ids = deps.data.patterns[pattern].candidates
      .filter((c) => !c.timed)
      .map(workoutIdOf)
      .filter((id) => deps.usable!(id) && sureGear(deps.data, id, base.gym) && !never.has(deps.data.sameAs(id)));
    // Fewest left swipes first, and a move the person loves leads its pattern; else the ladder's order (best gear first).
    const ranked = rankSoft(ids, base.soft);
    return [...ranked.filter((id) => love.has(deps.data.sameAs(id))), ...ranked.filter((id) => !love.has(deps.data.sameAs(id)))].map((id) => deps.profileOf(id, deps.name(id)));
  };
  const family = FAMILY_OF[base.goals[0] ?? 'muscle'] ?? 'muscle';
  const rx = PRESCRIPTION[family];
  const newer = base.experience === undefined || NEWER.has(base.experience);
  const comeback = base.experience === 'break';
  const day = (items: readonly SessionItem[]): GroupedItem[] =>
    items.map((it) => ({ id: it.id, pattern: it.pattern, sets: it.sets, reps: it.reps, restSec: it.restSec, compound: it.compound, ...(it.group !== undefined ? { group: it.group } : {}) }));
  const session = (rule?: AreaRule) =>
    structureSession({
      area,
      ...(rule ? { rule } : {}),
      minutes: input.minutes,
      pool,
      goal: family === 'strength' ? 'strength' : 'muscle',
      reps: { compound: rx.compoundReps, isolation: rx.accessoryReps },
      sets: { compound: setsFor(base.experience ?? 'new', true, comeback), isolation: setsFor(base.experience ?? 'new', false, comeback), max: newer ? 3 : 4 },
      minutesOf: (items) => quickMinutes(day(items).map((it) => ({ ...it, name: deps.name(it.id) }))),
    });
  const own = AREA_RULES[area];
  const moves = areaMoves(own, pool);
  // Fewer than 3 sure moves: the nearest honest day, led by the area's own big lift (none: no card).
  const fallback = FALLBACK_RULES[area];
  const few = moves.length < FEWEST_AREA_MOVES;
  const near = few && fallback.rule.main.flatMap(pool).some((p) => p.role === 'lift' && isCompound(p)) ? fallback : null;
  const plan = few ? (near ? session(near.rule) : null) : session();
  if (!plan) return null;
  const items = itemsOf(deps, day(plan.items));
  const rule = near ? near.rule : own;
  const words = [...new Set(rule.muscles.map(muscleWord))];
  const first = items[0]!;
  // A logged rest says the most; else the structure's curated line, or why this is the nearest day
  // (data/coach-facts.json, chosen by id: never made up here).
  const line = near
    ? noteById(deps.facts, 'idea-fewer', { muscle: muscleWord(own.muscles[0]!), name: first.name }).why
    : (muscleRestLine(items, deps, input.lastTrained, input.now ?? Date.now()) ?? noteById(deps.facts, 'idea-structure').why);
  return {
    id: 'focus',
    variant: near ? near.id : area,
    variantLabel: rule.title.toLowerCase(),
    focus: cap(wordList(words, 2)),
    title: rule.title,
    line,
    items,
    minutes: plan.minutes,
    over: false,
    chip: near ? 'Few moves here' : 'One area',
    effort: 2,
    gear: gearOf(items.map((it) => it.id), deps.data, base.gym),
    primary: mainMuscles(items, deps),
    ...(plan.minutes < input.minutes - 2 ? { short: 'moves' as const } : {}),
    ...(newer ? { newer: true } : {}),
  };
}

/** Every area day that can be built, the person's focus areas first (a nearest day only once: two areas may both lead to a push day). */
export function focusCards(input: QuickInput, deps: QuickDeps): Concept[] {
  const out: Concept[] = [];
  for (const a of focusOrder(input.base.focus)) {
    const c = focusCard(a, input, deps);
    if (c && !out.some((o) => o.title === c.title)) out.push(c);
  }
  return out;
}
