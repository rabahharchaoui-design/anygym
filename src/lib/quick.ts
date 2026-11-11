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
import { candidateFacts, requiresOf, workoutIdOf, type Pattern } from './swap';
import type { DayTrim } from './timeBudget';
import { diverse, chooseBatch, hangsBodyweight, quickMinutes, realLegs, STYLE_ORDER, STYLES, type Batch, type StyleId } from './quickStyles';
import { mainWords, muscleRestLine } from './quickWhy';
import { chipOf, freshCards, styleCard } from './quickCards';
import { fits, gearOf, mainMuscles, quickAvoids } from './quickShow';
import { withNotes } from './quickNotes';
import type { CoachFact } from './coachFacts';
import { nextSwap, safePairs, sureGear, swapItem } from './quickDeck';

// PLAN 3.5g (code organization): the parts live in their own files, re-exported here so every caller
// keeps importing from lib/quick: why lines (quickWhy), what a card shows (quickShow), the style and
// fresh cards (quickCards), the plan day card (quickPlan), the deck's swap and learning (quickDeck).
export { quickDayOf, structureOf, STYLES, STYLE_ORDER, type StyleId } from './quickStyles';
export { daysSince, muscleRestLine, restedLine, trainedWithin, whenWords, wordList } from './quickWhy';
export { FIT_SLACK, MAIN_MUSCLES, countLine, fits, gearOf, gearWords, mainMuscles, metaLine, moreLabel, primaryOf, quickAvoids, roundsOf } from './quickShow';
export { restedFirst, shortLine } from './quickCards';
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
};

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

/**
 * 3.5d (6): no exercise stands in two of the cards on screen (or in a card and the More ideas card
 * that would sit beside it) when the sure catalog allows: a repeated move takes the next option of its
 * own slot's pattern that no card shows. The plan day and "Hit what's fresh" are never changed. When
 * nothing else fits, the card keeps the move (a slot is never left empty), and a swap that would take
 * the card over its minutes or change the muscles it trains is not made.
 */
export function distinctCards(batch: Batch<Concept>, input: QuickInput, deps: QuickDeps): Batch<Concept> {
  const never = new Set((input.base.never ?? []).map(deps.data.sameAs));
  const ok = (id: string) => deps.usable(id) && !never.has(deps.data.sameAs(id));
  const keys = (c: Concept) => c.items.map((it) => deps.data.sameAs(it.id));
  const fix = (c: Concept, others: readonly Concept[], beside: (c: Concept) => readonly Concept[]): Concept => {
    if (c.id === 'plan' || c.id === 'fresh' || !(c.id in STYLES)) return c;
    const taken = new Set(others.flatMap(keys));
    if (!c.items.some((it) => taken.has(deps.data.sameAs(it.id)))) return c;
    let items = c.items;
    for (const it of c.items) {
      if (!taken.has(deps.data.sameAs(it.id))) continue;
      const to = nextSwap(it, items, [], { data: deps.data, gym: input.base.gym, ok, profile: deps.profile, nameOf: deps.name, avoid: [...taken], ...(input.base.soft ? { soft: input.base.soft } : {}) });
      if (!to) continue;
      // Built this way, not swapped: the card's own exercise now (its slot, so a later swipe can still reach the others).
      const next = { ...swapItem(it, to, deps.name(to), candidateFacts(deps.data, to)?.eachSide === true, undefined, hangsBodyweight(requiresOf(deps.data, to))), slot: to, origin: to };
      delete next.swapped;
      delete next.from;
      delete next.close;
      const tryItems = safePairs(items.map((x) => (x === it ? next : x)), deps.profile);
      const withWhy = tryItems;
      if (!fits(quickMinutes(withWhy), input.minutes)) continue;
      const primary = mainMuscles(withWhy, deps);
      // The card keeps the muscles it showed. Round 2: a replacement that moves one of its three main
      // muscles (a Romanian deadlift for a deadlift: back to hamstrings) is let in only when the card is
      // still named for the same muscles and the diversity rule still holds against every card beside it.
      // 3.5d round 3 (4), why the Romanian deadlift is not always there: at 30 and 60 min the strength card's
      // Deadlift repeats the circuit's, and the replacement is available and fits, but it moves the card's
      // main muscles from lower back to hamstrings and glutes, which the pump card (or the More ideas card
      // beside it) already trains: `diverse` fails, so the card keeps the Deadlift. Two cards training the
      // same muscles is the worse trade, so the rule stays as it is (at 45 the strength card is built with it).
      const same = primary.size === c.primary.size && [...primary].every((m) => c.primary.has(m));
      if (!same && (mainWords(withWhy, deps).words.join() !== mainWords(c.items, deps).words.join() || !beside(c).every((o) => diverse(primary, o.primary)))) continue;
      items = withWhy;
    }
    if (items === c.items) return c;
    // PLAN 3.5f: every why line is a curated fact, true of the card as it is now.
    items = withNotes(items, deps);
    const style = STYLES[c.id as StyleId];
    const ids = items.map((x) => x.id);
    return {
      ...c,
      items,
      minutes: quickMinutes(items),
      chip: chipOf(style, items),
      gear: gearOf(ids, deps.data, input.base.gym),
      primary: mainMuscles(items, deps),
      line: muscleRestLine(items, deps, input.lastTrained, input.now ?? Date.now()) ?? c.altLines?.[c.altLines.length - 1] ?? c.line,
    };
  };
  const cards: Concept[] = [];
  // A card's replacement must stay diverse from the other cards and from every More ideas card that would sit beside it.
  batch.cards.forEach((c, k) => cards.push(fix(c, cards, (x) => [...batch.cards.filter((o) => o !== x), ...batch.more.filter((_, i) => batch.moreAt[i] !== k)])));
  const more = batch.more.map((c, i) => {
    const sit = cards.filter((_, k) => k !== batch.moreAt[i]);
    return fix(c, sit, () => sit);
  });
  return { ...batch, cards, more };
}

/**
 * 3.5d (9): every card on screen has its own why line. A later card whose line an earlier one already
 * shows takes its next true line (what it leaves out, then what it is); a More ideas card is checked
 * against the cards it would sit with.
 */
function ownLines(batch: Batch<Concept>): Batch<Concept> {
  const { cards, more, moreAt } = batch;
  const pick = (c: Concept, taken: ReadonlySet<string>): Concept => {
    if (c.id === 'plan' || !taken.has(c.line)) return c;
    const next = (c.altLines ?? []).find((l) => !taken.has(l));
    return next ? { ...c, line: next } : c;
  };
  const out: Concept[] = [];
  for (const c of cards) out.push(pick(c, new Set(out.map((x) => x.line))));
  const outMore = more.map((c, i) => pick(c, new Set(out.filter((_, k) => k !== moreAt[i]).map((x) => x.line))));
  return { ...batch, cards: out, more: outMore };
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
