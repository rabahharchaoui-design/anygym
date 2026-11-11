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
import type { GeneratorDeps, GeneratorInput } from './generator';
import type { Range } from './generatorRules';
import { isHeavy, sessionTitle, type Muscle, type Profile } from './order';
import type { PlanDay } from './plans';
import { requiresOf, workoutIdOf, type Pattern } from './swap';
import type { DayTrim } from './timeBudget';
import { chooseBatch, hangsBodyweight, realLegs, STYLE_ORDER, STYLES, type Batch, type StyleId } from './quickStyles';
import { freshCards, styleCard } from './quickCards';
import { distinctCards, ownLines } from './quickDistinct';
import { quickAvoids } from './quickShow';
import type { CoachFact } from './coachFacts';
import { sureGear } from './quickDeck';

// PLAN 3.5g (code organization): the parts live in their own files, re-exported here so every caller
// keeps importing from lib/quick: why lines (quickWhy), what a card shows (quickShow), the style and
// fresh cards (quickCards), the plan day card (quickPlan), the deck's swap and learning (quickDeck).
export { quickDayOf, structureOf, STYLES, STYLE_ORDER, type StyleId } from './quickStyles';
export { daysSince, muscleRestLine, restedLine, trainedWithin, whenWords, wordList } from './quickWhy';
export { FIT_SLACK, MAIN_MUSCLES, countLine, fits, gearOf, gearWords, mainMuscles, metaLine, moreLabel, primaryOf, quickAvoids, roundsOf } from './quickShow';
export { restedFirst, shortLine } from './quickCards';
export { distinctCards } from './quickDistinct';
export { focusCard, focusCards, focusOrder } from './quickFocus';
export { type PreviewInput, previewConcept } from './quickPreview';
export { type PlanConceptInput, conceptMinutes, dropSlot, fitPlanDay, planConcept, planMinutes } from './quickPlan';
export { END_LINE, HIDE_ASK_AFTER, SHOW_SIX, SHOW_SIX_AFTER, type Option, learnLeft, sixOf, swapPool } from './curation';
export { RECENT_MS, type SwapContext, dropItem, learnNever, learnSwap, nextSwap, optionKey, rankSoft, recentMuscles, regroup, safePairs, sureGear, swapItem, unlearnNever, withDislikes } from './quickDeck';

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
  /** Why it is here, in one true line: always a fact from data/coach-facts.json (PLAN 3.5f, quickNotes.ts). */
  why: string;
  /** PLAN 3.5f: the id of that fact, and its two sentences behind the info button. */
  fact?: string;
  more?: string;
  /** PLAN 3.5f: the person swapped it in for this move (the slot's first exercise, by name); `close`: another, close movement pattern. */
  from?: string;
  close?: true;
  /** PLAN 3.5f: a plan move replaced for this gym or this person: what it stands in for, and why. */
  standsIn?: { from: string; reason: string };
  /** PLAN 3.5b: items sharing a group are done back to back (2: a superset, 3 or more: a circuit). */
  group?: number;
  /** 3.5b round 4 (M10): the person swapped it in on the deck (the card says "Swapped in" only then). */
  swapped?: true;
};

export type ConceptId = 'plan' | 'fresh' | 'focus' | StyleId;

export type PlanPart = { planId: string; dayIndex: number; weekIndex: number; day: PlanDay; trim: DayTrim | null };

export type Concept = {
  id: ConceptId;
  title: string;
  /** The why line: specific, from logged sets when it names a rest ("Back and biceps rested 4 days"). */
  line: string;
  /** 3.5d (9): other true lines for this card, used when an earlier card already has its line. */
  altLines?: string[];
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
  /** 3.5b round 4: what it mostly trains, in words ("Chest and back"): a More ideas chip of a style already shown says it. */
  focus?: string;
  /** 3.5f round 3 (M8): Preview only: the warm up moves the workout opens with before its lifts (not deck cards). */
  warmUp?: { count: number; stretches: boolean };
};

/** "Warm up · 3 stretches" (3.5f round 3, M8): what a plan day's Start opens with before the lifts. */
export const warmUpLine = (w: { count: number; stretches: boolean }): string => `Warm up · ${w.count} ${w.stretches ? (w.count === 1 ? 'stretch' : 'stretches') : w.count === 1 ? 'move' : 'moves'}`;

/** A card's identity on screen (a style can come back in More ideas with another body area). */
export const cardKey = (c: Pick<Concept, 'id' | 'variant'>): string => (c.variant ? `${c.id}:${c.variant}` : c.id);

export type QuickDeps = GeneratorDeps & {
  /** PLAN 3.5f: the curated why notes (data/coach-facts.json): the only source of a card's line. */
  facts: readonly CoachFact[];
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
  /** PLAN 3.5f: per exercise, the workouts (at most 3 keys) it was swiped away in. */
  lefts?: Record<string, string[]>;
  /** PLAN 3.5f: exercises "Hide it for good?" was already asked for (once only). */
  asked?: string[];
};

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
  /** PLAN 3.5j: styles built without their cardio warm up (buildIdeas, so no card is lost to one). */
  noCardio?: ReadonlySet<StyleId>;
};

/** 3.5b round 4 (P15): a built Quick workout's day list header: the card's own title. */
export function quickTitleOf(style: string | undefined): string {
  if (style === 'fresh') return "Hit what's fresh";
  // PLAN 3.5f: an area day is saved as "focus:chest".
  if (style?.startsWith('focus:')) return sessionTitle(style.slice(6)) ?? 'Quick workout';
  return style && style in STYLES ? STYLES[style as StyleId].title : 'Quick workout';
}

/** 3.5d: the longest estimate (minutes picked) Arms and abs is offered at: the 15 and 30 chips. */
const ARMS_ABS_MAX_MIN = 37;

/** Beginners and Go easy on always get one Easy start (Low impact) card. */
/** 3.5d: no intake answers (experience unknown) means the beginner rules. */
const noIntake = (base: Pick<GeneratorInput, 'experience'>): boolean => base.experience === undefined;

export const needsEasy = (base: Pick<GeneratorInput, 'experience' | 'easyOn'>): boolean =>
  noIntake(base) || base.experience === 'new' || base.experience === 'months' || (base.easyOn ?? []).some((j) => j !== 'none');

export type Ideas = Batch<Concept> & {
  /** 3.5b round 4 (B1): fewer than 4 cards, and why, in one plain line (never silent). */
  fewer?: string;
};

/** Whether this gym has a sure leg lift for this person (a knee or hip dominant compound with a sure demo and gear). */
export function hasSureLegs(base: GeneratorInput, deps0: QuickDeps): boolean {
  const deps = quickDepsFor(base, deps0);
  for (const ladder of Object.values(deps.data.patterns))
    for (const c of ladder.candidates) {
      const id = workoutIdOf(c);
      if (deps.usable(id) && sureGear(deps.data, id, base.gym) && realLegs(deps.profile(id))) return true;
    }
  return false;
}

/**
 * The line under fewer than 4 cards: what ran out, in plain words. 3.5b round 4 (B1): never "all this
 * gym can do" while More ideas offers other kinds: the cards are the ones different enough to show
 * together, and the row below is pointed to when it has something.
 */
export function fewerLine(count: number, minutes: number, legs: boolean, easyOn: readonly string[] | undefined, more = 0): string | undefined {
  if (count === 0 || count >= 4) return undefined;
  const knees = (easyOn ?? []).some((j) => j === 'knees' || j === 'hips');
  const these = count === 1 ? 'this is the one workout' : 'these are the workouts';
  const why = !legs
    ? knees
      ? `Going easy on your knees leaves no leg lift we can show you here, so ${these} different enough to show together.`
      : `This gym has no leg lift we can show you yet, so ${these} different enough to show together.`
    : `In ${minutes} min ${these} different enough to show together here.`;
  return more > 0 ? `${why} More ideas has other kinds.` : why;
}

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
    if (id === 'strength' && (input.base.experience === 'new' || noIntake(input.base))) continue;
    // 3.5d: Arms and abs is a 15 and 30 minute card only.
    if (id === 'armsAbs' && input.minutes > ARMS_ABS_MAX_MIN) continue;
    // 3.5b round 4 (B2): sore knees or hips never get a legs only Easy start.
    const sore = (input.base.easyOn ?? []).some((j) => j === 'knees' || j === 'hips');
    const variants = style.variants.filter((v) => !(id === 'easy' && v.key === 'legs' && sore));
    const cards = variants.map((v) => styleCard(style, v, input, deps)).filter((c): c is Concept => c !== null);
    if (cards.length) styles.set(id, cards);
  }
  return styles;
}

export function buildIdeas(input: QuickInput, deps0: QuickDeps): Ideas {
  const ideas = ideasOnce(input, deps0);
  // PLAN 3.5j: a cardio warm up never costs a card (it changes what a card trains most, so the
  // diversity rule may drop a card that has one): then as few cards as can lose theirs.
  if (ideas.cards.length >= 4 || !deps0.cardio?.().length) return ideas;
  const without = (styles: readonly StyleId[]) => ideasOnce({ ...input, noCardio: new Set(styles) }, deps0);
  const plain = without(WARM_UP_STYLES);
  if (plain.cards.length <= ideas.cards.length) return ideas;
  for (const n of [1, 2]) for (const drop of combos(WARM_UP_STYLES, n)) {
    const tried = without(drop);
    if (tried.cards.length >= plain.cards.length) return tried;
  }
  return plain;
}

/** The styles whose warm up may go (Cardio and core is its cardio). */
const WARM_UP_STYLES: readonly StyleId[] = ['circuit', 'pump', 'easy'];
const combos = <T,>(xs: readonly T[], n: number): T[][] => (n === 0 ? [[]] : xs.flatMap((x, i) => combos(xs.slice(i + 1), n - 1).map((c) => [x, ...c])));

function ideasOnce(input: QuickInput, deps0: QuickDeps): Ideas {
  const deps = quickDepsFor(input.base, deps0);
  const styles = buildStyleCards(input, deps0);
  // 3.5b round 2: card 1 is always the plan when one is active (fitted, or the honest smaller card).
  const plan = input.plan ?? null;
  const batch = chooseBatch({
    plan,
    fresh: freshCards(input, deps),
    styles,
    done: input.done ?? [],
    lastShown: input.lastShown ?? [],
    needEasy: needsEasy(input.base),
  });
  const owned = ownLines(distinctCards(batch, input, deps));
  const fewer = fewerLine(batch.cards.length, input.minutes, hasSureLegs(input.base, deps0), input.base.easyOn, batch.more.length);
  return fewer ? { ...owned, fewer } : owned;
}

/** A pull up hangs your whole bodyweight: Quick offers a pulldown instead, except to 3+ year lifters (B4). */
const bodyweightHang = hangsBodyweight;

const barbellOnly = (requires: readonly (readonly string[])[] | null) => !!requires && requires.some((g) => g.every((id) => id === 'barbell_rack'));

/** The deps every Quick card is built with for this person: Go easy on, and no pull ups for newer lifters. */
export function quickDepsFor(base: GeneratorInput, deps: QuickDeps): QuickDeps {
  return {
    ...deps,
    usable: (id) =>
      deps.usable(id) &&
      !quickAvoids(base.easyOn, deps.profile(id)) &&
      (base.experience === '3y' || !bodyweightHang(requiresOf(deps.data, id))) &&
      // 3.5b round 4 (B3): a brand new lifter starts on machines and dumbbells, never a heavy barbell lift.
      !((base.experience === 'new' || noIntake(base)) && isHeavy(deps.profile(id)) && barbellOnly(requiresOf(deps.data, id))),
  };
}

/** The cards alone (PLAN 3.5a's entry point, kept). */
export const buildConcepts = (input: QuickInput, deps: QuickDeps): Concept[] => buildIdeas(input, deps).cards;

/** Round 2 (B5): whether anything at all can be built at this gym (the longest chip, nothing learned in the way of it). */
export function canBuild(base: GeneratorInput, deps: QuickDeps): boolean {
  return buildConcepts({ base, minutes: QUICK_MINUTES[QUICK_MINUTES.length - 1]!, recent: [] }, deps).length > 0;
}

// ---------------------------------------------------------------- the plan day concept
