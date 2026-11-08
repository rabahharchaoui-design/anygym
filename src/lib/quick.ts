// Quick workout builds it for you (PLAN 3.5a, SPEC 20.3, G Nov 5). Pure: no JSON, no Dexie, no React
// (src/data/quick.ts binds the committed data). Four things live here:
//   1. the "How long?" chip that opens preselected from the intake minutes;
//   2. PLAN 3.5b: up to 4 cards that differ by style (quickStyles.ts): "Your plan, short" (the plan
//      day trimmed the SPEC 7.4 way), "Hit what's fresh" (muscles not trained in the last 3 days, from
//      logged sets only), then styles in rotation (Full body circuit, Superset pump, Strength focus,
//      Arms and abs finisher, Easy start; Cardio and core and Mobility reset wait for sure demos).
//      Each is built by the plan generator's own rules, fitted to the minutes with supersets, rounds,
//      sets and rest through the one estimate, and only offered when its name is true of what it holds;
//   3. the deck's swap: another exercise of the same movement pattern that fits the gym (swap.ts),
//      soft dislikes ranked last;
//   4. learning: a left swipe counts as a soft dislike (ranks lower later, never a ban), a long press
//      is "never show me this". Nothing here ever deletes history.
// Only exercises with a sure demo (exact or variant) and gear this gym surely has (`usable`, plus
// a known requirement) ever reach a concept. Fewer than 3 of them: no concept (an honest empty state).
import type { EquipmentId } from '../db/types';
import type { GymKit } from './picker';
import type { GeneratorDeps, GeneratorInput } from './generator';
import type { Range } from './generatorRules';
import { canPair, easyOnAvoids, isCompound, isHeavy, liftWord, muscleWord, patternTargets, type Muscle, type Profile } from './order';
import { finisherId, isStretchName, dayWorkout } from './planWorkout';
import { estimateDayMinutes, itemTarget, blockRest, type Plan, type PlanBlock, type PlanDay } from './plans';
import { adaptDay, requiresOf, supports, swapCandidates, workoutIdOf, type Pattern, type SwapData } from './swap';
import { applyTrim, type DayTrim } from './timeBudget';
import {
  buildCard,
  chooseBatch,
  densityFor,
  quickMinutes,
  SLACK,
  structureOf,
  STYLE_ORDER,
  STYLES,
  styleSpec,
  type Batch,
  type BuildDeps,
  type BuildSpec,
  type GroupedItem,
  type StyleDef,
  type StyleId,
} from './quickStyles';

export { quickDayOf, structureOf, STYLES, STYLE_ORDER, type StyleId } from './quickStyles';

// ---------------------------------------------------------------- How long?

export const QUICK_MINUTES = [15, 30, 45, 60] as const;
export type QuickMinutes = (typeof QUICK_MINUTES)[number];

/** The chip preselected from the intake minutes (or a minutes value from Today): the nearest, a tie goes up. None: 30. */
export function chipFor(minutes: number | undefined): QuickMinutes {
  if (minutes === undefined || !Number.isFinite(minutes)) return 30;
  let best: QuickMinutes = QUICK_MINUTES[0];
  for (const m of QUICK_MINUTES) if (Math.abs(m - minutes) <= Math.abs(best - minutes)) best = m;
  return best;
}

// ---------------------------------------------------------------- concepts

export type QuickItem = {
  /** The exercise done (plan or catalog id). */
  id: string;
  /** The plan exercise this stands in for (plan concepts), else the id it started as. */
  slot: string;
  /** Plan concepts: the exercise the workout gives this slot when it starts (after the gym adapts it). */
  origin: string;
  name: string;
  pattern: Pattern | null;
  sets: number;
  reps?: Range | number;
  seconds?: Range | number;
  eachSide?: boolean;
  restSec: number;
  /** Why it is here, in one true line. */
  why: string;
  /** PLAN 3.5b: items sharing a group are done back to back (2: a superset, 3 or more: a circuit). */
  group?: number;
  /** 3.5b round 4 (M10): the person swapped it in on the deck (the card says "Swapped in" only then). */
  swapped?: true;
};

export type ConceptId = 'plan' | 'fresh' | StyleId;

export type PlanPart = { planId: string; dayIndex: number; weekIndex: number; day: PlanDay; trim: DayTrim | null };

export type Concept = {
  id: ConceptId;
  title: string;
  /** The why line: specific, from logged sets when it names a rest ("Back and biceps rested 4 days"). */
  line: string;
  items: QuickItem[];
  minutes: number;
  /** Still over the minutes picked after the trim (said, never hidden). */
  over: boolean;
  /** A plan day concept: it starts as that plan day, with this trim. */
  plan?: PlanPart;
  /** PLAN 3.5b: the style chip (Supersets, Circuit, Strength, Low impact, Your plan). */
  chip: string;
  /** PLAN 3.5b: 1 to 3 effort dots. */
  effort: 1 | 2 | 3;
  /** PLAN 3.5b: the gear it uses at this gym (each requirement's option this gym has), in order. */
  gear: EquipmentId[];
  /** PLAN 3.5b: the catalog's primary muscles of every exercise (map regions), for the diversity rule. */
  primary: ReadonlySet<string>;
  /**
   * PLAN 3.5b round 2: more than 2 min under the minutes, and why: the gym (or the plan day) has no
   * more sure moves, or every set is at its cap (a newer lifter's). Said on the card, never silent.
   */
  short?: 'moves' | 'caps';
  /** Who the card is for: a newer lifter (the caps reason words). */
  newer?: boolean;
  /** 3.5b round 4 (M12): a style card's body area ("legs and back"): two cards of one style differ by it. */
  variant?: string;
  variantLabel?: string;
};

/** A card's identity on screen (a style can come back in More ideas with another body area). */
export const cardKey = (c: Pick<Concept, 'id' | 'variant'>): string => (c.variant ? `${c.id}:${c.variant}` : c.id);

export type QuickDeps = GeneratorDeps & {
  /** A sure demo (exact or variant): the only exercises Quick workout shows. */
  usable: (id: string) => boolean;
  /** The ordering profile of any id with a name (plan rows). */
  profileOf: (id: string, name?: string) => Profile;
  /** Round 2 (B4): the map regions an exercise's sure muscle map lights (primary or secondary). */
  litRegions?: (id: string) => readonly string[];
  /** Round 2 (B4): the map regions a muscle word covers ("back" covers the upper and lower back). */
  muscleRegions?: (m: Muscle) => readonly string[];
  /** PLAN 3.5b: the map regions of an exercise's sure primary muscles (the catalog's); missing: its targets. */
  primaryOf?: (id: string) => readonly string[];
};

/** Learned soft dislikes (additive on the profile, PLAN 3.5a). */
export type Dislikes = {
  /** Left swipes per exercise id: ranks it lower in later suggestions, never out. */
  soft?: Record<string, number>;
  /** Long press "Never show me this": left out of every later concept, plan and swap. */
  never?: string[];
};

/** The fresh concept's pool, big moves first; only the patterns that train no recent muscle stay. */
const FRESH_POOL: Pattern[] = ['squat', 'hinge', 'horizontal push', 'horizontal pull', 'vertical push', 'vertical pull', 'lunge', 'glutes', 'lateral delt', 'chest isolation', 'rear delt', 'biceps', 'triceps', 'quads isolation', 'hamstrings isolation', 'calves', 'core'];
const LEG_PATTERNS: ReadonlySet<Pattern> = new Set<Pattern>(['squat', 'hinge', 'lunge', 'glutes', 'quads isolation', 'hamstrings isolation', 'calves']);

/** Round 2 (B3): a concept is offered only when its estimate is at or under the minutes picked, 2 more at most. */
export const FIT_SLACK = SLACK;
export const fits = (minutes: number, budget: number): boolean => minutes <= budget + FIT_SLACK;

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** "quads, chest and back": the first `max` words, then "and more". */
export function wordList(words: readonly string[], max = 3): string {
  const w = [...new Set(words)];
  if (w.length <= 1) return w[0] ?? '';
  if (w.length > max) return `${w.slice(0, max).join(', ')} and more`;
  return `${w.slice(0, -1).join(', ')} and ${w[w.length - 1]}`;
}

const targetsOf = (deps: QuickDeps, id: string): readonly Muscle[] => deps.profile(id).targets;

export type QuickInput = {
  /** The intake answers as the generator reads them, with the active gym, never list and soft dislikes merged in. */
  base: GeneratorInput;
  minutes: number;
  /** Muscles with logged working sets in the last 3 days, most trained first. */
  recent: readonly Muscle[];
  /** When the latest of those workouts was, in words ("yesterday"). */
  recentWhen?: string;
  /** The plan day concept, built first (planConcept), or null. */
  plan?: Concept | null;
  /** PLAN 3.5b: when each muscle last had logged working sets (never warm ups, never imports). */
  lastTrained?: Readonly<Partial<Record<Muscle, number>>>;
  /** PLAN 3.5b: the time the batch is worked out for (the why lines' "rested N days"). */
  now?: number;
  /** PLAN 3.5b: the styles of the last 2 quick workouts done, latest first. */
  done?: readonly string[];
  /** PLAN 3.5b: the card ids shown last time. */
  lastShown?: readonly string[];
};

/**
 * Round 2 (P11): one real reason per card, from where it sits in the workout and what it trains
 * (SPEC 22 rules 1 and 4), never the concept's own title again.
 */
export function reasonsFor(ids: readonly string[], deps: Pick<QuickDeps, 'profileOf'>, names?: (id: string) => string): string[] {
  const ps = ids.map((id) => deps.profileOf(id, names?.(id)));
  return ps.map((p, i) => {
    const words = wordList([...new Set(p.targets.map(muscleWord))]);
    if (!words) return 'Part of this workout';
    if (p.role !== 'lift') return `Works your ${words}`;
    if (isCompound(p)) return i === 0 ? `Big lift first, while you're fresh` : `A big lift for your ${words}`;
    const before = ps.slice(0, i).find((q) => isCompound(q) && p.targets.some((m) => q.targets.includes(m) || q.helpers.includes(m)));
    if (before) {
      const shared = p.targets.find((m) => before.targets.includes(m) || before.helpers.includes(m))!;
      return `Finishes the ${muscleWord(shared)} your ${liftWord(before)} warmed up`;
    }
    if (p.tier >= 3) return `A short finish for your ${words}`;
    return `Isolates your ${words}`;
  });
}

/** A built day as Quick workout items (a group: done back to back). */
function itemsOf(deps: QuickDeps, day: readonly GroupedItem[], why?: (it: GroupedItem) => string): QuickItem[] {
  const reasons = reasonsFor(day.map((it) => it.id), deps);
  return day.map((it, i) => ({
    id: it.id,
    slot: it.id,
    origin: it.id,
    name: deps.name(it.id),
    pattern: it.pattern,
    sets: it.sets,
    ...(it.reps ? { reps: it.reps } : {}),
    ...(it.seconds ? { seconds: it.seconds } : {}),
    ...(it.eachSide ? { eachSide: true } : {}),
    restSec: it.restSec,
    why: why ? why(it) : reasons[i]!,
    ...(it.group !== undefined ? { group: it.group } : {}),
  }));
}

// ---------------------------------------------------------------- what a card shows (PLAN 3.5b)

const hasGear = (id: EquipmentId, gym: GymKit) => gym.equipment.includes(id) && (id !== 'dumbbells' || gym.dumbbellRange !== null);

/** The gear a workout uses here: for each requirement the first option this gym has (never both of an either/or). */
export function gearOf(ids: readonly string[], data: SwapData, gym: GymKit): EquipmentId[] {
  const out: EquipmentId[] = [];
  for (const id of ids) for (const g of requiresOf(data, id) ?? []) {
    const pick = g.find((x) => hasGear(x, gym));
    if (pick && !out.includes(pick)) out.push(pick);
  }
  return out;
}

/** The primary muscles of a workout (map regions), for the diversity rule. */
export function primaryOf(ids: readonly string[], deps: Pick<QuickDeps, 'primaryOf' | 'profile'>): Set<string> {
  return new Set(ids.flatMap((id) => (deps.primaryOf ? deps.primaryOf(id) : deps.profile(id).targets)));
}

/** "5 exercises · 2 supersets · ~30 min", "4 exercises · 3 rounds · ~14 min" (every number from the items and the one estimate). */
export function metaLine(items: readonly Pick<QuickItem, 'group' | 'sets'>[], minutes: number): string {
  const n = items.length;
  const st = structureOf(items);
  const parts = [`${n} ${n === 1 ? 'exercise' : 'exercises'}`];
  // 3.5b round 4 (M9, SPEC 13.1): plain words, one of each: "pairs" (never "supersets") and "circuit" (never "rounds").
  if (st.circuits) parts.push(`${st.circuits} ${st.circuits === 1 ? 'circuit' : 'circuits'}`);
  if (st.supersets) parts.push(`${st.supersets} ${st.supersets === 1 ? 'pair' : 'pairs'}`);
  parts.push(`~${minutes} min`);
  return parts.join(' · ');
}

const DAY_MS = 86_400_000;
const localDay = (t: number) => {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};
/** Whole local days between a logged workout and now. */
export const daysSince = (at: number, now: number): number => Math.max(0, Math.round((localDay(now) - localDay(at)) / DAY_MS));

/** The two muscles a workout works most (by sets), in plain words, without repeats. */
function mainWords(items: readonly QuickItem[], deps: QuickDeps): { muscles: Muscle[]; words: string[] } {
  const count = new Map<Muscle, number>();
  for (const it of items) for (const m of targetsOf(deps, it.id)) count.set(m, (count.get(m) ?? 0) + it.sets);
  const muscles: Muscle[] = [];
  const words: string[] = [];
  for (const [m] of [...count.entries()].sort((a, b) => b[1] - a[1])) {
    const w = muscleWord(m);
    if (words.includes(w)) {
      muscles.push(m);
      continue;
    }
    if (words.length >= 2) break;
    words.push(w);
    muscles.push(m);
  }
  return { muscles, words };
}

/**
 * "Back and biceps rested 4 days" (3.5b round 2, tester bug 3): of the muscles the card really
 * trains, the two with the longest logged rest are named, and the number is the shorter rest of
 * those two. Only muscles with a logged date count; none (or under `least` days): null.
 */
export function restedLine(items: readonly QuickItem[], deps: QuickDeps, lastTrained: QuickInput['lastTrained'], now: number, least = 2): string | null {
  if (!lastTrained) return null;
  const byWord = new Map<string, number>();
  for (const it of items)
    for (const m of targetsOf(deps, it.id)) {
      const at = lastTrained[m];
      if (at === undefined || at > now) continue;
      const days = daysSince(at, now);
      const w = muscleWord(m);
      // A word covering two muscles (side and front delts: shoulders) is as rested as its least rested one.
      byWord.set(w, Math.min(byWord.get(w) ?? Infinity, days));
    }
  const named = [...byWord.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2);
  if (!named.length) return null;
  const days = Math.min(...named.map(([, d]) => d));
  if (days < least) return null;
  return `${cap(wordList(named.map(([w]) => w)))} rested ${days} ${days === 1 ? 'day' : 'days'}`;
}

const BLURB: Record<StyleId, string> = {
  circuit: 'Legs, push and pull, one after another',
  pump: 'Moves in pairs, short rest',
  strength: 'Fewer moves, heavier, longer rest',
  cardioCore: 'Cardio and abs, one after another',
  mobility: 'Stretches, nothing heavy',
  armsAbs: 'Arms and abs, back to back',
  easy: 'A light day: no barbell, nothing jumpy',
};

const JOINT_WORD: Record<string, string> = { lower_back: 'lower back', knees: 'knees', shoulders: 'shoulders', wrists: 'wrists', neck: 'neck', hips: 'hips' };

/** The chip a card's structure earns (a style's own chip first). */
function chipOf(style: StyleDef | null, items: readonly QuickItem[]): string {
  if (style?.chip) return style.chip;
  const st = structureOf(items);
  if (st.circuits) return 'Circuit';
  if (st.supersets) return 'Pairs';
  return 'Straight sets';
}

const BUILD = (deps: QuickDeps): BuildDeps => ({ ...deps, requires: (id) => requiresOf(deps.data, id) });

/** A style card, or null when the gym, the never list or the minutes leave too little for its name to be true. */
function styleCard(style: StyleDef, variant: StyleDef['variants'][number], input: QuickInput, deps: QuickDeps): Concept | null {
  if (style.minMinutes !== undefined && input.minutes < style.minMinutes) return null;
  const built = buildCard(styleSpec(style, variant, { ...input.base, minutes: input.minutes }, input.minutes), BUILD(deps), input.minutes);
  if (!built || !fits(built.minutes, input.minutes)) return null;
  if (!style.honest(built.items.map((it) => deps.profile(it.id)), built.items)) return null;
  // 3.5b round 4 (B1): a card holds G's count for the minutes; fewer is never offered as a full card
  // (Strength focus is fewer on purpose, and its 4th and 5th lifts come before extra sets).
  if (!style.maxMoves && built.items.length < densityFor(input.minutes).min) return null;
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
  return {
    id: style.id,
    variant: variant.key,
    variantLabel: variant.label,
    title: style.title,
    line: restedLine(items, deps, input.lastTrained, input.now ?? Date.now()) ?? blurb,
    items,
    minutes: built.minutes,
    over: false,
    chip: chipOf(style, items),
    effort: style.effort,
    gear: gearOf(ids, deps.data, input.base.gym),
    primary: primaryOf(ids, deps),
    ...(built.short ? { short: built.short } : {}),
    ...(newerOf(input.base) ? { newer: true } : {}),
  };
}

const newerOf = (base: Pick<GeneratorInput, 'experience'>) => base.experience === undefined || base.experience === 'new' || base.experience === 'months' || base.experience === 'break';

/** The one plain line a short card shows (PLAN 3.5b round 2), or null. */
export function shortLine(c: Pick<Concept, 'short' | 'newer' | 'id'>): string | null {
  if (!c.short) return null;
  if (c.short === 'caps' && c.newer) return 'Beginner set cap';
  if (c.id === 'plan') return "All of today's plan this gym can do";
  // 3.5b round 4 (B1): never "All this gym can do" while the gym has other moves: say what ran out.
  if (c.id === 'fresh') return c.short === 'caps' ? 'As long as this style goes' : 'No more rested moves here';
  return c.short === 'caps' ? 'As long as this style goes' : 'No more moves of this kind here';
}

const FRESH_REST: StyleDef['rest'] = { group: 60, single: 60, floor: 45, cap: 90 };

/** "Hit what's fresh": muscles with no logged sets in the last 3 days, all of them, then upper or legs only. */
function freshCards(input: QuickInput, deps: QuickDeps): Concept[] {
  const recent = [...new Set(input.recent)];
  const logged = recent.length > 0 || Object.keys(input.lastTrained ?? {}).length > 0;
  if (!logged) return [];
  // Round 2 (B4): nothing on this card may light a muscle the Skips line names, on its map either.
  const blocked = new Set(recent.flatMap((m) => deps.muscleRegions?.(m) ?? []));
  const freshDeps: QuickDeps = { ...deps, usable: (id) => deps.usable(id) && !(deps.litRegions?.(id) ?? []).some((r) => blocked.has(r)) };
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
    const rested = restedLine(items, deps, input.lastTrained, input.now ?? Date.now(), 1);
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
      primary: primaryOf(ids, deps),
      ...(built.short ? { short: built.short } : {}),
      ...(newerOf(input.base) ? { newer: true } : {}),
    });
  }
  return out;
}

/** Beginners and Go easy on always get one Easy start (Low impact) card. */
export const needsEasy = (base: Pick<GeneratorInput, 'experience' | 'easyOn'>): boolean =>
  base.experience === 'new' || base.experience === 'months' || (base.easyOn ?? []).some((j) => j !== 'none');

export type Ideas = Batch<Concept>;

/**
 * PLAN 3.5b: up to 4 cards that differ by style, never sharing more than half their primary muscles
 * (quickStyles.ts chooseBatch): "Your plan, short", "Hit what's fresh", then the styles in rotation;
 * `more` are the other styles that would still keep the cards diverse in place of card `swapAt`.
 */
/** Every style card that can be built for this person, gym and minutes, by style (the batch picks from these). */
export function buildStyleCards(input: QuickInput, deps0: QuickDeps): Map<StyleId, Concept[]> {
  const deps = quickDepsFor(input.base, deps0);
  const styles = new Map<StyleId, Concept[]>();
  for (const id of STYLE_ORDER) {
    const style = STYLES[id];
    // 3.5b round 4 (B3): a brand new lifter is never offered heavy 4 to 6 rep barbell work.
    if (id === 'strength' && input.base.experience === 'new') continue;
    // 3.5b round 4 (B2): sore knees or hips never get a legs only Easy start.
    const sore = (input.base.easyOn ?? []).some((j) => j === 'knees' || j === 'hips');
    const variants = style.variants.filter((v) => !(id === 'easy' && v.key === 'legs' && sore));
    const cards = variants.map((v) => styleCard(style, v, input, deps)).filter((c): c is Concept => c !== null);
    if (cards.length) styles.set(id, cards);
  }
  return styles;
}

export function buildIdeas(input: QuickInput, deps0: QuickDeps): Ideas {
  const deps = quickDepsFor(input.base, deps0);
  const styles = buildStyleCards(input, deps0);
  // 3.5b round 2: card 1 is always the plan when one is active (fitted, or the honest smaller card).
  const plan = input.plan ?? null;
  return chooseBatch({
    plan,
    fresh: freshCards(input, deps),
    styles,
    done: input.done ?? [],
    lastShown: input.lastShown ?? [],
    needEasy: needsEasy(input.base),
  });
}

const KNEE_SAFE_SQUAT = /leg.?press/i;

/**
 * 3.5b round 4 (B2, SPEC 15): what Quick leaves out for a joint on the Go easy on list, on every card,
 * on top of the generator's own rule (order.ts easyOnAvoids). Knees: no leg extension and no deep
 * squat (a leg press stays: SPEC 15 names it the knee friendly squat); lower back: no loaded hinge,
 * no bent over row, no barbell squat (easyOnAvoids), and no back extension either.
 */
export function quickAvoids(easyOn: readonly string[] | undefined, p: Profile): boolean {
  if (easyOnAvoids(easyOn, p)) return true;
  const on = new Set(easyOn ?? []);
  if (on.has('knees') && (p.pattern === 'quads isolation' || (p.pattern === 'squat' && !KNEE_SAFE_SQUAT.test(p.name) && !KNEE_SAFE_SQUAT.test(p.id)))) return true;
  if (on.has('lower_back') && p.pattern === 'hinge') return true;
  return false;
}

/** A pull up hangs your whole bodyweight: Quick offers a pulldown instead, except to 3+ year lifters (B4). */
const bodyweightHang = (requires: readonly (readonly string[])[] | null) => !!requires && requires.length > 0 && requires.every((g) => g.every((id) => id === 'pull_up_bar'));

const barbellOnly = (requires: readonly (readonly string[])[] | null) => !!requires && requires.some((g) => g.every((id) => id === 'barbell_rack'));

/** The deps every Quick card is built with for this person: Go easy on, and no pull ups for newer lifters. */
function quickDepsFor(base: GeneratorInput, deps: QuickDeps): QuickDeps {
  return {
    ...deps,
    usable: (id) =>
      deps.usable(id) &&
      !quickAvoids(base.easyOn, deps.profile(id)) &&
      (base.experience === '3y' || !bodyweightHang(requiresOf(deps.data, id))) &&
      // 3.5b round 4 (B3): a brand new lifter starts on machines and dumbbells, never a heavy barbell lift.
      !(base.experience === 'new' && isHeavy(deps.profile(id)) && barbellOnly(requiresOf(deps.data, id))),
  };
}

/** The cards alone (PLAN 3.5a's entry point, kept). */
export const buildConcepts = (input: QuickInput, deps: QuickDeps): Concept[] => buildIdeas(input, deps).cards;

/** Round 2 (B5): whether anything at all can be built at this gym (the longest chip, nothing learned in the way of it). */
export function canBuild(base: GeneratorInput, deps: QuickDeps): boolean {
  return buildConcepts({ base, minutes: QUICK_MINUTES[QUICK_MINUTES.length - 1]!, recent: [] }, deps).length > 0;
}

// ---------------------------------------------------------------- the plan day concept

export type PlanConceptInput = {
  plan: Plan;
  dayIndex: number;
  weekIndex: number;
  minutes: number;
  gym: GymKit;
  /** "Always use this" picks of this plan (startPlanDay's own), slot → exercise. */
  always?: Readonly<Record<string, string>>;
  /** Never show (intake never list and long presses): never in the concept. */
  never?: readonly string[];
  soft?: Readonly<Record<string, number>>;
  /** PLAN 3.5b: Go easy on joints: a lift they skip is swapped or left out, like the generator does. */
  easyOn?: readonly string[];
  /** PLAN 3.5b round 2: the intake level (a newer lifter's sets stay at 3 at most when the fit adds sets). */
  experience?: string;
};

/** Sure gear: the requirement is known and this gym has it (the deck never shows a maybe). */
export const sureGear = (data: SwapData, id: string, gym: GymKit): boolean => {
  const r = requiresOf(data, id);
  return r !== null && supports(r, gym);
};

const workingBlocks = (d: PlanDay): PlanBlock[] => d.blocks.filter((b) => !b.warmup && !b.mobility);

/**
 * PLAN 3.5b round 2: the plan day fitted to the minutes the way the style cards are (the one
 * estimate, never over the chip, within 2 min under it when it can be). Long: two small moves next
 * to each other become a superset (SPEC 22 rule 5: never a heavy lift, never a shared muscle), then
 * tighter rest (never on a heavy lift, SPEC 22 rule 6), then fewer sets (small moves first, 2 at
 * least), then the last moves go (the first two compound lifts last of all). Short: one more set at
 * a time (3 at most for a newer lifter, 5 otherwise), then a little more rest. Everything is a
 * DayTrim, so the workout starts exactly as the card says. When even one lift cannot fit, the card
 * is the honest smaller one.
 */
export function fitPlanDay(
  day: PlanDay,
  base: DayTrim | null,
  weekIndex: number,
  budget: number,
  profileOf: (id: string, name: string) => Profile,
  newer: boolean,
): { trim: DayTrim | null; short?: 'moves' | 'caps' } {
  const t: DayTrim = { drop: [...(base?.drop ?? [])], sets: {}, rest: {}, pairs: [] };
  const est = () => estimateDayMinutes(applyTrim(day, t, weekIndex), weekIndex);
  const blocks = () => workingBlocks(applyTrim(day, t, weekIndex));
  const prof = (it: PlanBlock['items'][number]) => profileOf(it.exerciseId, it.name);
  const heavy = (b: PlanBlock) => b.items.some((it) => isHeavy(prof(it)));
  const compound = (b: PlanBlock) => b.items.some((it) => isCompound(prof(it)));
  const setsOf = (b: PlanBlock) => Math.max(...b.items.map((it) => itemTarget(b, it, weekIndex).sets));
  const setSets = (b: PlanBlock, n: number) => b.items.forEach((it) => (t.sets[it.exerciseId] = n));
  const setRest = (b: PlanBlock, n: number) => b.items.forEach((it) => (t.rest![it.exerciseId] = n));
  const floor = (b: PlanBlock) => (compound(b) ? 60 : 45);
  const cap = newer ? 3 : 5;
  const firstTwo = new Set(blocks().filter((b) => compound(b)).slice(0, 2).map((b) => b.items[0]!.exerciseId));
  if (budget < 75) {
    for (let guard = 0; est() > budget && guard < 200; guard++) {
      const bs = blocks();
      // A superset of two small moves side by side.
      const at = bs.findIndex((b, i) => {
        const n = bs[i + 1];
        return !!n && b.kind === 'single' && n.kind === 'single' && b.items.length === 1 && n.items.length === 1 && !heavy(b) && !heavy(n) && canPair(prof(b.items[0]!), prof(n.items[0]!));
      });
      if (at !== -1) {
        const [a, b] = [bs[at]!, bs[at + 1]!];
        const sets = Math.max(setsOf(a), setsOf(b));
        setSets(a, sets);
        setSets(b, sets);
        t.pairs!.push([a.items[0]!.exerciseId, b.items[0]!.exerciseId]);
        const rest = compound(a) || compound(b) ? 90 : 60;
        setRest(a, rest);
        setRest(b, rest);
        continue;
      }
      const tighter = bs.filter((b) => !heavy(b) && blockRest(b) - 15 >= floor(b));
      if (tighter.length) {
        for (const b of tighter) setRest(b, blockRest(b) - 15);
        continue;
      }
      const fewer = [...bs].reverse().filter((b) => setsOf(b) > 2).sort((a, b) => Number(compound(a)) - Number(compound(b)) || Number(heavy(a)) - Number(heavy(b)))[0];
      if (fewer) {
        setSets(fewer, setsOf(fewer) - 1);
        continue;
      }
      if (bs.length <= 1) break;
      const last = [...bs].reverse().find((b) => !b.items.some((it) => firstTwo.has(it.exerciseId))) ?? bs[bs.length - 1]!;
      t.drop.push(...last.items.map((it) => it.exerciseId));
      t.pairs = t.pairs!.filter((p) => !p.some((id) => t.drop.includes(id)));
    }
    const fitsNow = (fn: () => void): boolean => {
      const before = JSON.stringify(t);
      fn();
      if (est() <= budget) return true;
      Object.assign(t, JSON.parse(before) as DayTrim);
      return false;
    };
    for (let guard = 0; est() < budget - SLACK && guard < 200; guard++) {
      const bs = blocks();
      const more = bs.find((b) => setsOf(b) < cap && fitsNow(() => setSets(b, setsOf(b) + 1)));
      if (more) continue;
      const rest = bs.find((b) => !heavy(b) && blockRest(b) + 15 <= 120 && fitsNow(() => setRest(b, blockRest(b) + 15)));
      if (!rest) break;
    }
  }
  if (!Object.keys(t.rest!).length) delete t.rest;
  if (!t.pairs!.length) delete t.pairs;
  const trim = t.drop.length || Object.keys(t.sets).length || t.rest || t.pairs ? t : null;
  const m = est();
  if (budget >= 75 || m >= budget - SLACK) return { trim };
  return { trim, short: newer ? 'caps' : 'moves' };
}

/**
 * "Your Pull day, short": the plan day as this gym does it (adaptDay, like Start), only its working
 * lifts with a sure demo and sure gear (one without gets a same pattern swap that has them, else it
 * is left out), then trimmed to the minutes the SPEC 7.4 way. Warm ups and stretches have no demo
 * here: left out. null when fewer than 3 lifts remain.
 */
export function planConcept(input: PlanConceptInput, deps: QuickDeps): Concept | null {
  const { plan, dayIndex, weekIndex, gym } = input;
  const day = plan.days[dayIndex];
  if (!day) return null;
  const data = deps.data;
  const neverKeys = new Set((input.never ?? []).map(data.sameAs));
  const ok = (id: string) => !neverKeys.has(data.sameAs(id)) && deps.usable(id) && sureGear(data, id, gym) && !quickAvoids(input.easyOn, deps.profile(id));
  const entries = dayWorkout(plan, dayIndex, weekIndex);
  const unique = entries.filter((e, i) => entries.findIndex((x) => x.exerciseId === e.exerciseId) === i);
  const adapted = adaptDay(data, unique, gym, input.always ?? {});
  const currentOf = new Map(unique.map((e) => [e.exerciseId, e.exerciseId]));
  const noFit = new Set<string>();
  for (const sw of adapted.swaps) {
    currentOf.set(sw.slot, sw.current);
    if (sw.noFit) noFit.add(sw.slot);
  }
  const drop: string[] = [];
  const swapTo = new Map<string, string>();
  const taken = () => [...currentOf.entries()].filter(([slot]) => !drop.includes(slot)).map(([slot, cur]) => swapTo.get(slot) ?? cur);
  for (const e of unique) {
    if (e.finisher) continue;
    const slot = e.exerciseId;
    const working = !e.warmup && !e.mobility && !isStretchName(e.name) && deps.profileOf(slot, e.name).role === 'lift';
    if (!working || noFit.has(slot)) {
      drop.push(slot);
      continue;
    }
    const cur = currentOf.get(slot)!;
    if (ok(cur)) continue;
    const mode = e.seconds !== undefined && e.reps === undefined ? 'seconds' : 'reps';
    const pick = rankSoft(swapCandidates(data, cur, gym, { mode, exclude: taken().filter((x) => x !== cur) }).map(workoutIdOf).filter(ok), input.soft)[0];
    if (pick) swapTo.set(slot, pick);
    else drop.push(slot);
  }
  // 3.5b round 2: the cardio finisher has no demo and no card: Quick's plan day leaves it out.
  if (day.finisher) drop.push(finisherId(day.finisher.name));
  const base: DayTrim | null = drop.length ? { drop, sets: {} } : null;
  // The gym cannot do the day: fewer than 3 of its lifts with a sure demo and sure gear.
  if (workingBlocks(applyTrim(day, base, weekIndex)).reduce((n, b) => n + b.items.length, 0) < 3) return null;
  const newer = input.experience === undefined || ['new', 'months', 'break'].includes(input.experience);
  const fitted = fitPlanDay(day, base, weekIndex, input.minutes, (id, name) => deps.profileOf(id, name), newer);
  const trim = fitted.trim;
  const part: PlanPart = { planId: plan.id, dayIndex, weekIndex, day, trim };
  const items = planItems(part, deps, (slot) => currentOf.get(slot) ?? slot, (slot) => swapTo.get(slot));
  if (!items.length) return null;
  const reasons = reasonsFor(items.map((it) => it.id), deps, (id) => items.find((it) => it.id === id)!.name);
  items.forEach((it, i) => {
    if (it.id === it.slot) it.why = reasons[i]!;
  });
  const minutes = planMinutes(part);
  const short = !!trim && (trim.drop.length > 0 || Object.keys(trim.sets).length > 0 || Object.keys(trim.rest ?? {}).length > 0 || (trim.pairs ?? []).length > 0);
  const ids = items.map((it) => it.id);
  return {
    ...(fitted.short ? { short: fitted.short } : {}),
    // PLAN 3.5b: card 1 is "Your plan, short" (the day and the plan named on its line).
    id: 'plan',
    title: short ? 'Your plan, short' : 'Your plan',
    line: `${day.name} from your ${plan.name}`,
    items,
    minutes,
    over: input.minutes < 75 && minutes > input.minutes,
    plan: part,
    chip: 'Your plan',
    effort: 2,
    ...(newer ? { newer: true } : {}),
    gear: gearOf(ids, data, gym),
    primary: primaryOf(ids, deps),
  };
}

/** The deck items of a plan part: every working item left after the trim, in day order. */
function planItems(part: PlanPart, deps: QuickDeps, originOf: (slot: string) => string, swappedOf: (slot: string) => string | undefined): QuickItem[] {
  const day = applyTrim(part.day, part.trim, part.weekIndex);
  const out: QuickItem[] = [];
  let group = 0;
  for (const b of day.blocks) {
    if (b.warmup || b.mobility) continue;
    // PLAN 3.5b: a plan pair stays a pair on the card (its line counts it).
    const pair = b.kind === 'pair' && b.items.length > 1 ? group++ : undefined;
    for (const it of b.items) {
      const t = itemTarget(b, it, part.weekIndex);
      const origin = originOf(it.exerciseId);
      const swapped = swappedOf(it.exerciseId);
      const id = swapped ?? origin;
      out.push({
        id,
        slot: it.exerciseId,
        origin,
        name: id === it.exerciseId ? it.name : deps.name(id),
        pattern: deps.profileOf(id).pattern,
        sets: t.sets,
        ...(t.reps !== undefined ? { reps: t.reps } : {}),
        ...(t.seconds !== undefined ? { seconds: t.seconds } : {}),
        ...(it.eachSide ? { eachSide: true } : {}),
        restSec: blockRest(b as PlanBlock),
        // 3.5b round 4 (M10): a move put in for the plan's own says why, in plain words.
        why: swapped || origin !== it.exerciseId ? `Instead of ${it.name}: same movement, gear this gym surely has` : `From your ${part.day.name} day`,
        ...(pair !== undefined ? { group: pair } : {}),
      });
    }
  }
  return out;
}

/** A plan part's estimate: the workout header's own (estimateDayMinutes of the trimmed day). */
export const planMinutes = (part: PlanPart): number => estimateDayMinutes(applyTrim(part.day, part.trim, part.weekIndex), part.weekIndex);

/** A plan part with one more slot left out (long press on its card, with nothing to swap in). */
export function dropSlot(part: PlanPart, slot: string): PlanPart {
  const trim: DayTrim = part.trim ? { ...part.trim, drop: [...new Set([...part.trim.drop, slot])] } : { drop: [slot], sets: {} };
  return { ...part, trim };
}

// ---------------------------------------------------------------- a quick workout's day

/** A concept's estimate now (after the deck's changes). */
export const conceptMinutes = (c: Pick<Concept, 'items' | 'plan'>): number => (c.plan ? planMinutes(c.plan) : quickMinutes(c.items));

/**
 * PLAN 3.5b: a superset whose partners no longer suit each other after a swap (they now share a
 * muscle, or one is a heavy lift) is done as two single moves instead (rest after every set).
 */
export function safePairs(items: readonly QuickItem[], profile: (id: string) => Profile): QuickItem[] {
  const split = new Set<number>();
  const members = new Map<number, QuickItem[]>();
  for (const it of items) if (it.group !== undefined) members.set(it.group, [...(members.get(it.group) ?? []), it]);
  for (const [g, m] of members) {
    if (m.length !== 2) continue;
    const [a, b] = m.map((it) => profile(it.id));
    if (isHeavy(a!) || isHeavy(b!) || !canPair(a!, b!)) split.add(g);
  }
  if (!split.size) return [...items];
  const single = (it: QuickItem): QuickItem => {
    const out = { ...it };
    delete out.group;
    return out;
  };
  return regroup(items.map((it) => (it.group !== undefined && split.has(it.group) ? single(it) : it)));
}

/**
 * PLAN 3.5b: groups after the deck removed an exercise: a group left with one member is a single,
 * and the groups are numbered in order again. Sets never change here (a pair already has equal sets).
 */
export function regroup(items: readonly QuickItem[]): QuickItem[] {
  const size = new Map<number, number>();
  for (const it of items) if (it.group !== undefined) size.set(it.group, (size.get(it.group) ?? 0) + 1);
  const renumber = new Map<number, number>();
  return items.map((it) => {
    if (it.group === undefined) return it;
    if ((size.get(it.group) ?? 0) < 2) {
      const { group: _g, ...rest } = it;
      void _g;
      return rest;
    }
    if (!renumber.has(it.group)) renumber.set(it.group, renumber.size);
    return { ...it, group: renumber.get(it.group)! };
  });
}

// ---------------------------------------------------------------- the deck's swap

/** Fewest left swipes first; ties keep their order (the ladder's best first). */
export function rankSoft(ids: readonly string[], soft: Readonly<Record<string, number>> | undefined): string[] {
  if (!soft) return [...ids];
  return ids
    .map((id, i) => ({ id, i, n: soft[id] ?? 0 }))
    .sort((a, b) => a.n - b.n || a.i - b.i)
    .map((x) => x.id);
}

export type SwapContext = {
  data: SwapData;
  gym: GymKit;
  /** A sure demo and nothing that rules it out (never list, go easy on). */
  ok: (id: string) => boolean;
  soft?: Readonly<Record<string, number>>;
  /** The ordering profile (heavy lifts stay heavy, light slots stay light). */
  profile?: (id: string) => Profile;
  /** Plain names: one option under two names is offered once (round 3, B2). */
  nameOf?: (id: string) => string;
};

/**
 * The exercise a left swipe puts in: same movement pattern, this gym surely has the gear, a sure
 * demo, not already in the workout, the fewest soft dislikes first, and not one this card already
 * showed while an untried one is left. null: nothing else fits (the card stays).
 */
export function nextSwap(item: QuickItem, items: readonly QuickItem[], tried: readonly string[], ctx: SwapContext): string | null {
  const mode = item.seconds !== undefined && item.reps === undefined ? 'seconds' : 'reps';
  const exclude = items.filter((x) => x !== item).map((x) => x.id);
  const pool = swapCandidates(ctx.data, item.slot, ctx.gym, { mode, exclude: [...exclude, item.id] }).map(workoutIdOf);
  // Round 2 (P15, SPEC 7.3): a slot that is not a heavy lift never turns into one, and a conventional
  // deadlift only ever stands in for a deadlift (never a Deadlift at 10 to 12 for an RDL slot).
  const p = ctx.profile;
  const slotP = p?.(item.slot);
  const tooHeavy = (id: string) => !!p && !!slotP && ((!isHeavy(slotP) && isHeavy(p(id))) || (liftWord(p(id)) === 'deadlift' && liftWord(slotP) !== 'deadlift'));
  // Round 3 (B1, B2): each option once per slot. Never the one on the card, one already swiped away
  // or rejected (the slot's own first exercise included), or the same option under another name
  // (Leg Press and Angled Machine Leg Press are one leg press). Nothing new left: null, and the card
  // says "No other option here"; a rejected card never comes back.
  const keyOf = (id: string) => (ctx.nameOf ? optionKey(ctx.nameOf(id)) : ctx.data.sameAs(id));
  const seen = new Set([item.id, item.slot, ...tried, ...exclude].flatMap((id) => [ctx.data.sameAs(id), keyOf(id)]));
  const usable = pool.filter((id) => !seen.has(ctx.data.sameAs(id)) && !seen.has(keyOf(id)) && ctx.ok(id) && sureGear(ctx.data, id, ctx.gym) && !tooHeavy(id));
  // Two names for one option in the same ladder: the first (the ladder's best) stands for both.
  const once = usable.filter((id, i) => usable.findIndex((x) => keyOf(x) === keyOf(id)) === i);
  return rankSoft(once, ctx.soft)[0] ?? null;
}

/**
 * The option an exercise is, by its plain name: "Machine Leg Press", "Angled Machine Leg Press" and
 * "Leg Press" are the same leg press at a gym (the machine words only say how it is built).
 */
export const optionKey = (name: string): string =>
  name
    .toLowerCase()
    .replace(/\b(machine|angled|lever|leverage)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** The card after a swap: the slot's targets stay (sets, reps, rest), only the exercise changes. */
export function swapItem(item: QuickItem, to: string, name: string, eachSide: boolean, slotName?: string): QuickItem {
  // Never "Same movement as X" on X itself (round 3, B1).
  const from = slotName ?? item.name;
  const next: QuickItem = { ...item, id: to, name, why: to === item.slot || optionKey(from) === optionKey(name) ? item.why : `Same movement as ${from}`, swapped: true };
  if (eachSide) next.eachSide = true;
  else delete next.eachSide;
  return next;
}

// ---------------------------------------------------------------- learning (additive, never a ban)

/** A left swipe: one more soft dislike for the exercise swapped away. */
export function learnSwap(d: Dislikes, id: string): Dislikes {
  return { ...d, soft: { ...d.soft, [id]: (d.soft?.[id] ?? 0) + 1 } };
}

/** A long press: never show it again. */
export function learnNever(d: Dislikes, id: string): Dislikes {
  return d.never?.includes(id) ? d : { ...d, never: [...(d.never ?? []), id] };
}

/** Undo of a long press. */
export function unlearnNever(d: Dislikes, id: string): Dislikes {
  return { ...d, never: (d.never ?? []).filter((x) => x !== id) };
}

/** The generator input with the learned dislikes merged in (never list joined, soft counts passed on). */
export function withDislikes(input: GeneratorInput, d: Dislikes | undefined): GeneratorInput {
  if (!d) return input;
  const never = [...new Set([...(input.never ?? []), ...(d.never ?? [])])];
  const out: GeneratorInput = { ...input };
  if (never.length) out.never = never;
  if (d.soft && Object.keys(d.soft).length) out.soft = { ...input.soft, ...d.soft };
  return out;
}

/** Muscles with logged working sets (never warm ups) in workouts started in the last 3 days. Imported workouts carry no date. */
export const RECENT_MS = 3 * 24 * 60 * 60 * 1000;
export function recentMuscles(
  sessions: readonly { id: string; startedAt: number; imported: boolean }[],
  sets: readonly { sessionId: string; exerciseId: string; kind: string }[],
  targets: (id: string) => readonly Muscle[],
  now: number,
): Muscle[] {
  const ids = new Set(sessions.filter((x) => !x.imported && x.startedAt >= now - RECENT_MS && x.startedAt <= now).map((x) => x.id));
  // Most trained first (round 3, P7: the subtitle names the main areas).
  const count = new Map<Muscle, number>();
  for (const st of sets) if (ids.has(st.sessionId) && st.kind !== 'warmup') for (const m of targets(st.exerciseId)) count.set(m, (count.get(m) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([m]) => m);
}

/** "today", "yesterday", "2 days ago": when the last of those workouts was (local days). */
export function whenWords(at: number, now: number): string {
  const day = (t: number) => {
    const d = new Date(t);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  };
  const n = Math.round((day(now) - day(at)) / 86_400_000);
  return n <= 0 ? 'today' : n === 1 ? 'yesterday' : `${n} days ago`;
}
