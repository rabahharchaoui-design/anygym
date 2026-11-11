// The plan generator (PLAN 3.5, SPEC 7.3, 7.4, 15, 22). Pure: no JSON, no Dexie, no React; the swap
// data, the ordering profiles and the names are passed in (src/data/generator.ts binds them).
//
// From the intake answers and the gym's equipment it writes a plan in the shipped JSON shape
// (data/plans/*.json, read by lib/plans.ts normalizePlan):
//   1. the split by days per week, each day a list of pattern slots, most important first;
//   2. each slot takes the best candidate of its ladder (data/patterns.json) this gym surely has,
//      never one on the never list, never a lift the "go easy on" list skips (order.ts), a loved one
//      first, the training style next; a slot with nothing that fits takes its fallback pattern or
//      stays empty (said, never padded);
//   3. sets, reps and rest by the Main goal and the level (SPEC 7.3; compound rest never below
//      SPEC 22 rule 6), and the Also goal adds its part;
//   4. focus areas add 2 to 4 weekly sets (SPEC 15);
//   5. the day in SPEC 22 order (order.ts orderUnits), safe pairs of small moves (canPair);
//   6. trimmed to the time picked the SPEC 7.4 way (estimateDayMinutes, the workout header's estimate).
// The same inputs always give the same plan: every choice is ranked, ties go to the ladder's order.
// A day with fewer than 3 moves the gym can do is an honest failure, never a padded plan.
import type { EquipmentId } from '../db/types';
import type { GymKit } from './picker';
import { canPair, easyOnAvoids, heaviestOf, isCompound, isHeavy, orderUnits, restFor, type Muscle, type Profile, type Unit } from './order';
import { estimateDayMinutes, type PlanBlock, type PlanDay } from './plans';
import { supports, workoutIdOf, type Candidate, type Pattern, type Requires, type SwapData } from './swap';
import { cardioFor, type CardioMove } from './cardio';
import type { CardioFavoriteId, CardioId, ExperienceId, FocusId, GoalId, PlaceAnswer, StyleId } from './intake/options';
import {
  EFFORT,
  FALLBACK,
  FAMILY_OF,
  FINISHER_MINUTES,
  FOCUS_RULES,
  FOCUS_TARGET,
  FOCUS_TARGET_SPLIT,
  HOLD,
  HOLD_NEW,
  MAX_ITEM_SETS,
  MIN_MOVES,
  movesFor,
  NEWER,
  PRESCRIPTION,
  setsFor,
  maxSetsFor,
  splitFor,
  type GoalFamily,
  type Range,
  type Slot,
} from './generatorRules';

/** Bump when the rules change what comes out: frozen plans and saved plans name the version that made them. */
export const GENERATOR_VERSION = 2;

export type GeneratorInput = {
  /** Main first, Also second (SPEC 14 step 1). None: stay fit. */
  goals: readonly GoalId[];
  experience?: ExperienceId;
  /** 2 to 6; anything else is 3. */
  days?: number;
  /** The time picked; 75 means 75+ (no upper end). */
  minutes?: number;
  focus?: readonly FocusId[];
  easyOn?: readonly string[];
  /** Exercise ids (plan or catalog ids). */
  love?: readonly string[];
  never?: readonly string[];
  style?: StyleId;
  cardio?: CardioId;
  cardioFavorites?: readonly CardioFavoriteId[];
  gym: GymKit;
  place?: PlaceAnswer;
  /** Frozen curated plans: their own id, name, summary and gym type. */
  meta?: { id: string; name: string; summary: string; gymType: string };
  /**
   * PLAN 3.5a: learned soft dislikes (Quick workout left swipes), by exercise id: a higher count ranks
   * the exercise lower among what fits, never out (never a ban).
   */
  soft?: Readonly<Record<string, number>>;
  /** PLAN 3.5a: muscles this workout must not train (Quick workout "Hit what's fresh"). */
  avoidMuscles?: readonly Muscle[];
  /** PLAN 3.5a round 2: a slot takes only its own pattern (a small moves day never falls back to a row). */
  noFallback?: true;
};

export type GeneratorDeps = {
  data: SwapData;
  /** The ordering profile of an exercise id (data/order.ts profileFor). */
  profile: (id: string) => Profile;
  /** The plain name of an exercise id. */
  name: (id: string) => string;
  /** PLAN 3.5a: only these may be picked (Quick workout: a sure demo). Missing: anything that fits. */
  usable?: (id: string) => boolean;
  /**
   * PLAN 3.5j: sure cardio moves (G approved them on this phone), best first, with the machine each
   * needs. A day may open with one as its warm up. Missing or empty: no cardio move, never a guess.
   */
  cardio?: () => readonly CardioMove[];
};

// ---------------------------------------------------------------- the shipped JSON shape

export type RawItem = { exercise: string; id: string; reps?: Range; seconds?: Range; eachSide?: true; note?: string };
export type RawSingle = { type: 'single'; sets: number; restSec: number; warmup?: true } & RawItem;
export type RawPair = { type: 'superset'; sets: number; restSec: number; items: RawItem[] };
export type RawFinisher = { name: string; minutes: number; requires: Requires };
export type RawDay = { n: number; name: string; blocks: Array<RawSingle | RawPair>; finisher?: RawFinisher };
export type RawPlan = {
  id: string;
  name: string;
  summary: string;
  gymType: string;
  goal: GoalFamily;
  level: 'beginner' | 'intermediate';
  daysPerWeek: number;
  source: string;
  generator: number;
  progressionMode: 'double';
  days: RawDay[];
};

/** What the generator did with the answers, so the reveal says only what is true. */
export type Applied = {
  main: GoalId;
  also: GoalId | null;
  /** The Also goal changed the plan. */
  alsoUsed: boolean;
  /** Extra weekly sets per focus area that stayed after the time trim (2 to 4 counts). */
  focus: Array<{ id: FocusId; sets: number }>;
  /** Focus areas asked for that nothing here could add to (or the time trim took away). */
  focusMissed: FocusId[];
  /** Loved exercises in the plan, and those that did not fit. */
  loved: string[];
  lovedMissed: string[];
  /** Never list entries the ladders know (all left out). */
  never: number;
  /** "Go easy on" joints applied. */
  easyOn: string[];
  /** Patterns a day wanted that nothing at this gym does (after fallbacks). */
  gaps: Pattern[];
  finisher: string | null;
  /** PLAN 3.5j: the sure cardio move each day opens with (missing: none). */
  warmUp?: string;
  /** Per day, the workout header's estimate. */
  minutes: number[];
  /** Some day is still over the time picked after the trim. */
  over: boolean;
  /** PLAN 3.5j: a strength plan kept its long rests, so a short time fits fewer than 5 lifts a day. */
  restKept?: boolean;
};

export type GeneratorResult =
  | { ok: true; plan: RawPlan; applied: Applied }
  | { ok: false; reason: string; dayName: string; moves: number; gaps: Pattern[] };

// ---------------------------------------------------------------- working model

export type Item = {
  id: string;
  key: string;
  candidate: Candidate;
  profile: Profile;
  pattern: Pattern;
  sets: number;
  /** Sets added for a focus area (all of them for a move the focus added). */
  extra: number;
  focus?: FocusId;
  reps?: Range;
  seconds?: Range;
  rest: number;
  note?: string;
};

type Day = { name: string; items: Item[]; units: Item[][]; finisher?: RawFinisher; warmUp?: string };

type Ctx = {
  input: GeneratorInput;
  deps: GeneratorDeps;
  main: GoalId;
  also: GoalId | null;
  family: GoalFamily;
  loveKeys: Set<string>;
  neverKeys: Set<string>;
  softOf: Map<string, number>;
  weekUsed: Map<Pattern, Set<string>>;
};

const BENCHES: ReadonlySet<EquipmentId> = new Set<EquipmentId>(['flat_bench', 'adjustable_bench']);
const FREE: ReadonlySet<EquipmentId> = new Set<EquipmentId>(['barbell_rack', 'ez_curl_bar', 'dumbbells', 'kettlebells']);
const BODY: ReadonlySet<EquipmentId> = new Set<EquipmentId>(['pull_up_bar', 'dip_station', 'hyperextension_bench']);

type Kind = 'machine' | 'free' | 'body' | 'band';

/** The most rest a bodyweight compound gets. */
const BODYWEIGHT_REST = 90;

/** What a candidate is done with, from its requirement (a bench alone is not the implement). */
function kindOf(r: Requires): Kind {
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

/** Can this gym do it, and may this person get it? */
function allowed(ctx: Ctx, c: Candidate, timedOk: boolean): boolean {
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
function pickFrom(ctx: Ctx, pattern: Pattern, variant: boolean, dayKeys: ReadonlySet<string>): Candidate | undefined {
  const ladder = ctx.deps.data.patterns[pattern]?.candidates ?? [];
  const used = ctx.weekUsed.get(pattern) ?? new Set<string>();
  const style = ctx.input.style ? STYLE_RANK[ctx.input.style] : undefined;
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

function makeItem(ctx: Ctx, c: Candidate, pattern: Pattern): Item {
  const id = workoutIdOf(c);
  return { id, key: ctx.deps.data.sameAs(id), candidate: c, profile: ctx.deps.profile(id), pattern, sets: 0, extra: 0, rest: 0 };
}

/** Fills a slot: its pattern, else a fallback the day does not have yet (never a second of the same). Records what it took. */
function fill(ctx: Ctx, slot: Slot, dayKeys: Set<string>, dayPatterns: ReadonlySet<Pattern>): Item | undefined {
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

// ---------------------------------------------------------------- prescriptions (SPEC 7.3, 22)

const ruleGoal = (f: GoalFamily) => (f === 'strength' ? 'strength' : 'muscle');

/** SPEC 7.3's ceiling for this lifter (every rule that adds sets stays under it). */
const setCap = (ctx: Ctx): number => maxSetsFor(ctx.input.experience, ctx.main === 'comeback' || ctx.also === 'comeback');

/** SPEC 15 may lift an item past its usual sets (to MAX_ITEM_SETS), but a new lifter or a comeback keeps SPEC 7.3's ceiling. */
const focusCap = (ctx: Ctx): number => (ctx.input.experience === 'new' || ctx.main === 'comeback' || ctx.also === 'comeback' ? Math.min(MAX_ITEM_SETS, setCap(ctx)) : MAX_ITEM_SETS);

/** Sets, reps or hold, rest and the effort words of one item. `lead`: the day's heaviest lift. */
function prescribe(ctx: Ctx, it: Item, lead: boolean): void {
  const { family, also } = ctx;
  const exp = ctx.input.experience;
  const compound = isCompound(it.profile);
  const comeback = ctx.main === 'comeback' || also === 'comeback';
  const alsoFamily = also ? FAMILY_OF[also] : null;
  const rx = PRESCRIPTION[family];
  it.sets = setsFor(exp, compound, comeback);
  if (it.candidate.timed) {
    it.seconds = NEWER.has(exp as ExperienceId) || exp === undefined ? [...HOLD_NEW] : [...HOLD];
    it.rest = rx.accessoryRest;
    return;
  }
  if (compound) {
    // Also strength: the day's first big lift trains heavy (SPEC 14: the Also goal adds to the plan).
    const strong = family === 'strength' || (lead && alsoFamily === 'strength');
    const r = strong ? PRESCRIPTION.strength : rx;
    it.reps = [...r.compoundReps];
    // A bodyweight compound is never a heavy lift: about 90 s at most (SPEC 22 rule 6 is for loaded lifts).
    const rule = restFor(it.profile, ruleGoal(strong ? 'strength' : family));
    it.rest = Math.max(r.compoundRest, kindOf(it.candidate.requires) === 'body' ? Math.min(rule, BODYWEIGHT_REST) : rule);
  } else {
    // Also muscle (or tone) on another Main goal: the small moves use the muscle range.
    const reps = alsoFamily === 'muscle' && family !== 'muscle' ? PRESCRIPTION.muscle.accessoryReps : rx.accessoryReps;
    it.reps = [...reps];
    it.rest = rx.accessoryRest;
  }
  it.note = NEWER.has(exp as ExperienceId) || exp === undefined ? EFFORT.newer : compound ? EFFORT.compound : EFFORT.isolation;
}

/** Whether the Also goal changes anything in this plan (the reveal never claims more). */
function alsoChanges(ctx: Ctx, finisher: RawFinisher | undefined): boolean {
  if (!ctx.also) return false;
  const fam = FAMILY_OF[ctx.also];
  if (ctx.also === 'comeback') return ctx.input.experience === '3y';
  if (fam === ctx.family) return false;
  if (fam === 'strength' || fam === 'muscle') return true;
  return finisher !== undefined;
}

// ---------------------------------------------------------------- finisher

type CardioPick = { name: string; requires: Requires };

const MACHINE_CARDIO: Array<{ fav?: CardioFavoriteId; gear: EquipmentId; name: string; sprint: string }> = [
  { fav: 'treadmill', gear: 'treadmill', name: 'Treadmill', sprint: 'Treadmill intervals' },
  // PLAN 3.5j: no favourite names it (SPEC 14 step 9), so it comes after the ones that can be loved.
  { fav: 'bike', gear: 'bike', name: 'Bike', sprint: 'Bike sprints' },
  { fav: 'rower', gear: 'rower', name: 'Rower', sprint: 'Rower sprints' },
  { fav: 'stairs', gear: 'stair_climber', name: 'Stair climber', sprint: 'Stair climber intervals' },
  { fav: 'jump_rope', gear: 'jump_rope', name: 'Jump rope', sprint: 'Jump rope intervals' },
  { gear: 'elliptical', name: 'Elliptical', sprint: 'Elliptical intervals' },
];

/**
 * The 10 minute finisher (SPEC 7.3): fat loss a circuit or cardio, athletic a conditioning one, an
 * easy cardio block for a health or race Also goal. Only gear the gym has; the favorites first.
 */
function finisherFor(ctx: Ctx): RawFinisher | undefined {
  const goals = [ctx.main, ctx.also].filter((g): g is GoalId => !!g);
  const wants = (fam: GoalFamily) => goals.some((g) => FAMILY_OF[g] === fam);
  const fat = wants('fat_loss');
  const athletic = wants('athletic');
  // Health and race as the Also goal add easy cardio; as Main they train like stay fit, no finisher.
  const easy = !!ctx.also && (ctx.also === 'health' || ctx.also === 'race') && FAMILY_OF[ctx.main] !== 'health';
  if (!fat && !athletic && !easy) return undefined;
  const noCardio = ctx.input.cardio === 'none';
  const gear = ctx.input.gym.equipment;
  const favs = ctx.input.cardioFavorites ?? [];
  const machines = MACHINE_CARDIO.filter((m) => gear.includes(m.gear));
  const machine = machines.find((m) => m.fav !== undefined && favs.includes(m.fav)) ?? machines[0];
  let pick: CardioPick;
  if (athletic && !fat) pick = machine && !noCardio ? { name: machine.sprint, requires: [[machine.gear]] } : { name: 'Bodyweight circuit', requires: [] };
  else if (fat) pick = machine && !noCardio ? { name: machine.name, requires: [[machine.gear]] } : { name: 'Bodyweight circuit', requires: [] };
  else if (noCardio) return undefined;
  else if (machine) pick = { name: machine.name, requires: [[machine.gear]] };
  else pick = { name: favs.includes('running') ? 'Easy run' : 'Brisk walk', requires: [] };
  return { name: pick.name, minutes: FINISHER_MINUTES, requires: pick.requires };
}

/** PLAN 3.5j: a sure cardio warm up opens a day this long (5 min, one exercise change). */
export const WARM_UP_SEC = 300;
/** Shorter days keep their minutes for the lifts (a 30 min day still holds 5 moves). */
export const WARM_UP_MIN_MINUTES = 45;

/**
 * PLAN 3.5j: the day's cardio warm up, only from a sure move (approved on this phone) on a machine
 * this gym has, never with "no cardio" answered, never on a day that already ends with cardio.
 */
function warmUpFor(ctx: Ctx, finisher: RawFinisher | undefined): string | undefined {
  if (finisher || ctx.input.cardio === 'none') return undefined;
  if (ctx.input.minutes !== undefined && ctx.input.minutes < WARM_UP_MIN_MINUTES) return undefined;
  return cardioFor(ctx.deps.cardio?.() ?? [], ctx.input.gym, ctx.input.cardio)?.id;
}

const warmUpBlock = (id: string): PlanBlock => ({ kind: 'single', warmup: true, items: [{ exerciseId: id, name: id, seconds: [WARM_UP_SEC, WARM_UP_SEC] }], sets: 1, restSec: 0 });

// ---------------------------------------------------------------- focus (SPEC 15)

/** Adds 2 to 4 weekly sets per focus area: on the moves that train it, else a move of its own. */
function applyFocus(ctx: Ctx, days: Day[]): void {
  for (const f of ctx.input.focus ?? []) {
    if (f === 'balance') continue;
    const rule = FOCUS_RULES[f];
    for (const group of rule.groups) {
      const target = rule.groups.length > 1 ? FOCUS_TARGET_SPLIT : FOCUS_TARGET;
      const inGroup = (it: Item) => group.includes(it.pattern);
      let items = days.flatMap((d) => d.items.filter(inGroup));
      if (!items.length) {
        // Nothing trains it yet: one move of its own on the days with the fewest moves (two at most).
        const order = days.map((d, i) => ({ d, i })).sort((a, b) => a.d.items.length - b.d.items.length || a.i - b.i);
        let added = 0;
        for (const { d } of order) {
          if (added >= target) break;
          const keys = new Set(d.items.map((x) => x.key));
          const it = group.map((pattern) => {
            const c = pickFrom(ctx, pattern, false, keys);
            return c ? makeItem(ctx, c, pattern) : undefined;
          }).find((x): x is Item => !!x);
          if (!it) continue;
          prescribe(ctx, it, false);
          if (added > 0 && added + it.sets > 4) it.sets = Math.max(1, 4 - added);
          it.extra = it.sets;
          it.focus = f;
          d.items.push(it);
          added += it.sets;
        }
        continue;
      }
      // Small moves take the extra sets first, then the compounds; one at a time around the week.
      items = [...items.filter((it) => !isCompound(it.profile)), ...items.filter((it) => isCompound(it.profile))];
      let added = 0;
      let grew = true;
      while (added < target && grew) {
        grew = false;
        for (const it of items) {
          if (added >= target) break;
          if (it.sets >= focusCap(ctx) || it.extra >= 2) continue;
          it.sets++;
          it.extra++;
          it.focus ??= f;
          added++;
          grew = true;
        }
      }
    }
  }
}

// ---------------------------------------------------------------- order, pairs and time

const unitOf = (items: Item[]): Unit<Item[]> => ({ items: items.map((i) => i.profile), ref: items });

/** SPEC 22 rule 5 (and 3.6a: only equal set counts, so no partner gets sets it was not given): small moves next to each other pair up when they share no muscle (never the heaviest lift). */
export function pairUp(units: Item[][], all: Item[]): Item[][] {
  const heaviest = heaviestOf(all.map((i) => i.profile));
  const heavy = new Set(heaviest ? [heaviest.id] : []);
  const small = (u: Item[]) => u.length === 1 && u[0]!.profile.role === 'lift' && !isCompound(u[0]!.profile);
  const out: Item[][] = [];
  for (let i = 0; i < units.length; i++) {
    const a = units[i]!;
    const b = units[i + 1];
    if (b && small(a) && small(b) && a[0]!.sets === b[0]!.sets && canPair(a[0]!.profile, b[0]!.profile, heavy)) {
      out.push([a[0]!, b[0]!]);
      i++;
    } else out.push(a);
  }
  return out;
}

/**
 * PLAN 3.5j: when a day is over its minutes, two big lifts of different areas next to each other
 * pair up before any move is dropped (SPEC 22 rule 5: chest with back is a time saving pair). Never
 * the day's heaviest lift, never two that share a muscle (canPair), only equal set counts. Returns
 * whether it paired one.
 */
function pairToFit(d: Day): boolean {
  const all = d.units.flat();
  const heaviest = heaviestOf(all.map((i) => i.profile));
  const heavy = new Set(heaviest ? [heaviest.id] : []);
  for (let i = 0; i + 1 < d.units.length; i++) {
    const a = d.units[i]!;
    const b = d.units[i + 1]!;
    if (a.length !== 1 || b.length !== 1 || a[0]!.sets !== b[0]!.sets || !canPair(a[0]!.profile, b[0]!.profile, heavy)) continue;
    d.units.splice(i, 2, [a[0]!, b[0]!]);
    return true;
  }
  return false;
}

/** A pair whose partners no longer have the same set count (trimming) becomes two single moves. */
export function splitUnequalPairs(units: Item[][]): Item[][] {
  return units.flatMap((u) => (u.length > 1 && u.some((it) => it.sets !== u[0]!.sets) ? u.map((it) => [it]) : [u]));
}

const blockOf = (u: Item[]): PlanBlock => ({
  kind: u.length > 1 ? 'pair' : 'single',
  items: u.map((it) => ({ exerciseId: it.id, name: it.id, ...(it.reps ? { reps: it.reps } : {}), ...(it.seconds ? { seconds: it.seconds } : {}) })),
  sets: Math.max(...u.map((it) => it.sets)),
  restSec: Math.max(...u.map((it) => it.rest)),
});

/** The day as the workout header estimates it (SPEC 7.4). */
function minutesOf(d: Day): number {
  const blocks = [...(d.warmUp ? [warmUpBlock(d.warmUp)] : []), ...d.units.map(blockOf)];
  const day: PlanDay = { n: 1, name: d.name, blocks, ...(d.finisher ? { finisher: { name: d.finisher.name, minutes: d.finisher.minutes } } : {}) };
  return estimateDayMinutes(day);
}

const moveCount = (d: Day) => d.units.reduce((n, u) => n + u.length, 0);

/**
 * SPEC 7.4's trim, until the day fits the time picked: shorter rest on small moves (SPEC 22 rule 6,
 * never on compounds), accessory sets down to 2 (focus sets last), then the lowest priority moves go,
 * last in the day first. Never the first two compound lifts, never under 3 moves.
 */
function trim(d: Day, budget: number | undefined, pairs = false, compoundRestFloor?: number): void {
  if (budget === undefined || budget >= 75) return;
  const over = () => minutesOf(d) > budget;
  const items = () => d.units.flat();
  if (!over()) return;
  for (const it of items()) if (!isCompound(it.profile) && it.rest > 60) it.rest = 60;
  // PLAN 3.5j round 2: a compound that is not heavy (SPEC 22 rule 6 keeps the heavy rest) may rest down to the goal's own floor (SPEC 7.3), never a strength day's.
  if (compoundRestFloor !== undefined) for (const it of items()) if (isCompound(it.profile) && !isHeavy(it.profile) && !it.candidate.timed && it.rest > compoundRestFloor) it.rest = compoundRestFloor;
  for (const focusPass of [false, true]) {
    for (const it of [...items()].reverse()) {
      if (!over()) return;
      if (isCompound(it.profile) || it.sets <= 2 || !!it.focus !== focusPass) continue;
      const cut = it.sets - 2;
      it.sets = 2;
      it.extra = Math.max(0, it.extra - cut);
    }
  }
  // PLAN 3.5j: a 2+ year lifter's 4 sets on a big lift go to 3 (SPEC 7.3: 3 to 4) before a move goes,
  // the day's heaviest lift last; then pairs (not for a strength day: its big lifts get straight sets).
  for (const it of [...items()].reverse()) {
    if (!over()) return;
    if (isCompound(it.profile) && it.sets > 3) it.sets = 3;
  }
  while (pairs && over() && pairToFit(d));
  if (!over()) return;
  const protectedIds = new Set(items().filter((it) => isCompound(it.profile)).slice(0, 2).map((it) => it.id));
  // PLAN 3.5j round 2: a short day keeps its moves (G: 5 to 7 at 30 and 45 min). The big lifts after
  // the first two go to 2 sets, last first, before any move is dropped; the long rests stay.
  for (const it of [...items()].reverse()) {
    if (!over()) return;
    if (isCompound(it.profile) && !protectedIds.has(it.id) && it.sets > 2) it.sets = 2;
  }
  if (!over()) return;
  while (over() && moveCount(d) > MIN_MOVES) {
    let at = -1;
    for (let i = d.units.length - 1; i >= 0; i--) {
      if (!d.units[i]!.some((it) => protectedIds.has(it.id))) {
        at = i;
        break;
      }
    }
    if (at === -1) break;
    const u = d.units[at]!;
    if (u.length > 1) d.units[at] = u.slice(0, -1);
    else d.units.splice(at, 1);
  }
}

/** PLAN 3.5j: a day is "about" its minutes within this many (G: ~30 min means about 30). */
export const FIT_SLACK = 2;
/** The most sets a small move gets from filling the time. */
const FILL_MAX_SETS = 4;

/** PLAN 3.5j: the small moves a short day may add at its end, after its own slots that did not make it. */
const FILL_PATTERNS: readonly Pattern[] = ['lateral delt', 'biceps', 'triceps', 'hamstrings isolation', 'quads isolation', 'rear delt', 'chest isolation', 'calves', 'core'];
/** The most moves a day holds (G: 5 to 7 at 30 and 45 min). */
const MAX_MOVES = 7;

/**
 * PLAN 3.5j: a day the trim left more than 2 min under the time picked gets small moves at its end
 * (the day's own slots first, then FILL_PATTERNS), each only while it still fits: never a big lift
 * after the small ones (SPEC 22 rule 1), never a second of a pattern, never past 7 moves. The plan
 * generator's own pick (gear, never, go easy on, loved, style, week variety).
 */
function addMoves(ctx: Ctx, d: Day, slots: readonly Slot[], budget: number | undefined): void {
  if (budget === undefined || budget >= 75) return;
  const order = [...slots.map((x) => x.pattern), ...FILL_PATTERNS].filter((p, i, all) => all.indexOf(p) === i);
  for (const pattern of order) {
    if (minutesOf(d) >= budget - FIT_SLACK || moveCount(d) >= MAX_MOVES) return;
    const all = d.units.flat();
    if (all.some((it) => it.pattern === pattern)) continue;
    const keys = new Set(all.map((it) => it.key));
    const c = pickFrom(ctx, pattern, true, keys);
    if (!c) continue;
    const it = makeItem(ctx, c, pattern);
    if (isCompound(it.profile) || it.profile.role !== 'lift') continue;
    prescribe(ctx, it, false);
    it.sets = 2;
    if (!isCompound(it.profile) && it.rest > 60) it.rest = 60;
    d.units.push([it]);
    if (minutesOf(d) > budget) {
      d.units.pop();
      continue;
    }
    const used = ctx.weekUsed.get(pattern) ?? new Set<string>();
    used.add(it.key);
    ctx.weekUsed.set(pattern, used);
  }
}

/** G: a day holds at least this many moves at 30 and 45 min when the gym has them. */
const DENSE_MOVES = 5;

/**
 * PLAN 3.5j round 2: a short day still under 5 moves (all big lifts with long rests) lets the big
 * lifts after the day's first go to 2 sets, last first, and re adds small moves each time (pairs
 * again, the long rests kept) until it holds 5 moves. Never over the minutes (addMoves only adds
 * what fits); if nothing helps the day stays as it is.
 */
function densify(ctx: Ctx, d: Day, slots: readonly Slot[], budget: number | undefined): void {
  if (budget === undefined || budget > 45 || moveCount(d) >= DENSE_MOVES) return;
  const lead = d.units.flat().find((it) => isCompound(it.profile));
  // The day's first big lift keeps its sets unless every other big lift is already at 2 and the day is still short.
  const order = [...d.units.flat().filter((x) => x !== lead).reverse(), ...(lead ? [lead] : [])];
  for (const it of order) {
    if (moveCount(d) >= DENSE_MOVES) return;
    if (!isCompound(it.profile) || it.sets <= 2) continue;
    it.sets = 2;
    d.units = splitUnequalPairs(d.units);
    d.units = pairUp(d.units, d.items);
    addMoves(ctx, d, slots, budget);
  }
}

/**
 * PLAN 3.5j: a day more than 2 min under the time picked gets one more set on a small move (the
 * last in the day first, a pair's partners together) while it still fits; never a compound, never
 * past 4 sets, never over the minutes.
 */
function fillUp(ctx: Ctx, d: Day, budget: number | undefined): void {
  const cap = Math.min(FILL_MAX_SETS, setCap(ctx));
  if (budget === undefined || budget >= 75) return;
  for (let guard = 0; guard < 40 && minutesOf(d) < budget - FIT_SLACK; guard++) {
    const unit = [...d.units].reverse().find((u) => {
      if (!u.every((it) => !isCompound(it.profile) && it.profile.role === 'lift' && it.sets < cap)) return false;
      for (const it of u) it.sets++;
      const ok = minutesOf(d) <= budget;
      for (const it of u) it.sets--;
      return ok;
    });
    if (!unit) return;
    for (const it of unit) it.sets++;
  }
}

// ---------------------------------------------------------------- the plan

/** FNV-1a: a short stable id for the same plan. */
export function hashText(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

const GYM_TYPE: Record<PlaceAnswer, string> = { full: 'full', mix: 'full', hotel: 'hotel', home: 'home', outdoors: 'none' };

const rawItem = (ctx: Ctx, it: Item): RawItem => {
  const out: RawItem = { exercise: ctx.deps.name(it.id), id: it.id };
  if (it.reps) out.reps = it.reps;
  if (it.seconds) out.seconds = it.seconds;
  if (it.candidate.eachSide) out.eachSide = true;
  if (it.note) out.note = it.note;
  return out;
};

function rawBlock(ctx: Ctx, u: Item[]): RawSingle | RawPair {
  const sets = Math.max(...u.map((it) => it.sets));
  const restSec = Math.max(...u.map((it) => it.rest));
  if (u.length === 1) return { type: 'single', ...rawItem(ctx, u[0]!), sets, restSec };
  return { type: 'superset', sets, restSec, items: u.map((it) => rawItem(ctx, it)) };
}

/** The working context of one generation: goals, and the love, never and soft lists by sameAs key. */
function contextOf(input: GeneratorInput, deps: GeneratorDeps): Ctx {
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

/** One day's item as the Quick workout holds it (PLAN 3.5a). */
export type DayItem = { id: string; pattern: Pattern; sets: number; reps?: Range; seconds?: Range; restSec: number; eachSide?: true; compound: boolean };

export type DayResult = { ok: true; name: string; items: DayItem[]; minutes: number; over: boolean } | { ok: false; name: string; moves: number };

/**
 * PLAN 3.5a: one day from a slot template, for a Quick workout. The plan's own rules: the slots
 * filled the same way (gear, never, go easy on, loved, soft dislikes, style, `usable`), the same
 * prescriptions, SPEC 22 order and the SPEC 7.4 trim to the minutes. Straight sets only (a quick
 * workout has no pairs) and no finisher. Fewer than 3 moves is an honest failure.
 */
export function generateDay(input: GeneratorInput, deps: GeneratorDeps, template: { name: string; slots: readonly Slot[]; want?: number }): DayResult {
  const ctx = contextOf(input, deps);
  // PLAN 3.5b: Quick workout's styles ask for G's move counts themselves (and fit the time with
  // supersets and rest, lib/quickStyles.ts), so they pass `want` and no minutes (no plan trim).
  const want = template.want ?? movesFor(input.minutes);
  const dayKeys = new Set<string>();
  const items: Item[] = [];
  for (const slot of template.slots) {
    if (items.length >= want) break;
    const it = fill(ctx, slot, dayKeys, new Set(items.map((x) => x.pattern)));
    if (it) items.push(it);
  }
  if (items.length < MIN_MOVES) return { ok: false, name: template.name, moves: items.length };
  const lead = heaviestOf(items.map((it) => it.profile));
  for (const it of items) prescribe(ctx, it, it.profile.id === lead?.id);
  const focusMuscles: Muscle[] = (input.focus ?? []).flatMap((f) => (f === 'balance' ? [] : FOCUS_RULES[f].muscles));
  const d: Day = { name: template.name, items, units: orderUnits(items.map((it) => unitOf([it])), { focus: focusMuscles }).map((u) => u.ref) };
  trim(d, input.minutes);
  const minutes = minutesOf(d);
  const out: DayItem[] = d.units.flat().map((it) => ({
    id: it.id,
    pattern: it.pattern,
    sets: it.sets,
    ...(it.reps ? { reps: it.reps } : {}),
    ...(it.seconds ? { seconds: it.seconds } : {}),
    restSec: it.rest,
    ...(it.candidate.eachSide ? { eachSide: true as const } : {}),
    compound: isCompound(it.profile),
  }));
  return { ok: true, name: template.name, items: out, minutes, over: input.minutes !== undefined && input.minutes < 75 && minutes > input.minutes };
}

/** Builds the plan, or says plainly which day cannot be built here. */
export function generatePlan(input: GeneratorInput, deps: GeneratorDeps): GeneratorResult {
  const daysPerWeek = input.days !== undefined && Number.isInteger(input.days) && input.days >= 2 && input.days <= 6 ? input.days : 3;
  const key = (id: string) => deps.data.sameAs(id);
  const ctx = contextOf(input, deps);
  const { main, also } = ctx;
  const split = splitFor(daysPerWeek);
  const want = movesFor(input.minutes);
  const gaps = new Set<Pattern>();

  const days: Day[] = [];
  const templates: Slot[][] = [];
  for (const t of split.days) {
    templates.push(t.slots);
    const dayKeys = new Set<string>();
    const items: Item[] = [];
    for (const slot of t.slots) {
      if (items.length >= want) break;
      const it = fill(ctx, slot, dayKeys, new Set(items.map((x) => x.pattern)));
      if (it) items.push(it);
      else gaps.add(slot.pattern);
    }
    if (items.length < MIN_MOVES) {
      return { ok: false, reason: `Not enough moves fit your equipment for ${t.name}: ${items.length} of ${MIN_MOVES}.`, dayName: t.name, moves: items.length, gaps: [...gaps] };
    }
    // The day's heaviest lift comes first (SPEC 22 rule 1): an Also strength goal trains it heavy.
    const lead = heaviestOf(items.map((it) => it.profile));
    for (const it of items) prescribe(ctx, it, it.profile.id === lead?.id);
    days.push({ name: t.name, items, units: [] });
  }

  applyFocus(ctx, days);

  const focusMuscles: Muscle[] = (input.focus ?? []).flatMap((f) => (f === 'balance' ? [] : FOCUS_RULES[f].muscles));
  const finisher = finisherFor(ctx);
  const warmUp = warmUpFor(ctx, finisher);
  const strength = FAMILY_OF[main] === 'strength';
  for (const [i, d] of days.entries()) {
    const ordered = orderUnits(d.items.map((it) => unitOf([it])), { focus: focusMuscles }).map((u) => u.ref);
    d.units = strength ? ordered : pairUp(ordered, d.items);
    if (finisher) d.finisher = finisher;
    if (warmUp) d.warmUp = warmUp;
    trim(d, input.minutes, !strength, strength ? undefined : PRESCRIPTION[ctx.family].compoundRest);
    d.units = splitUnequalPairs(d.units);
    if (!strength) d.units = pairUp(d.units, d.items);
    addMoves(ctx, d, templates[i]!, input.minutes);
    if (!strength) densify(ctx, d, templates[i]!, input.minutes);
    fillUp(ctx, d, input.minutes);
  }

  const kept = days.flatMap((d) => d.units.flat());
  const focus: Applied['focus'] = [];
  const focusMissed: FocusId[] = [];
  for (const f of input.focus ?? []) {
    if (f === 'balance') continue;
    const sets = kept.filter((it) => it.focus === f).reduce((n, it) => n + it.extra, 0);
    if (sets >= 2) focus.push({ id: f, sets });
    else focusMissed.push(f);
  }
  const keptKeys = new Set(kept.map((it) => it.key));
  const loved = (input.love ?? []).filter((id) => keptKeys.has(key(id)) && ctx.loveKeys.has(key(id)));
  const lovedMissed = (input.love ?? []).filter((id) => !loved.includes(id));
  const ladderKeys = new Set(Object.values(deps.data.patterns).flatMap((l) => l.candidates.map((c) => key(workoutIdOf(c)))));
  const minutes = days.map(minutesOf);
  const level = input.experience === 'new' || input.experience === 'months' ? 'beginner' : 'intermediate';

  const rawDays: RawDay[] = days.map((d, i) => {
    const head: RawSingle[] = d.warmUp ? [{ type: 'single', exercise: deps.name(d.warmUp), id: d.warmUp, seconds: [WARM_UP_SEC, WARM_UP_SEC], sets: 1, restSec: 0, warmup: true }] : [];
    const out: RawDay = { n: i + 1, name: d.name, blocks: [...head, ...d.units.map((u) => rawBlock(ctx, u))] };
    if (d.finisher) out.finisher = d.finisher;
    return out;
  });
  const gymType = input.meta?.gymType ?? (input.place ? GYM_TYPE[input.place] : 'full');
  const body = { daysPerWeek, goal: ctx.family, level, gymType, days: rawDays };
  const plan: RawPlan = {
    id: input.meta?.id ?? `mine-${hashText(JSON.stringify(body))}`,
    name: input.meta?.name ?? `${daysPerWeek} Day ${split.name}`,
    summary: input.meta?.summary ?? `Built from your answers: ${daysPerWeek} days a week, ${split.name.toLowerCase()}.`,
    gymType,
    goal: ctx.family,
    level,
    daysPerWeek,
    source: 'Generated from movement patterns',
    generator: GENERATOR_VERSION,
    progressionMode: 'double',
    days: rawDays,
  };
  const timed = input.minutes !== undefined && input.minutes < 75;
  return {
    ok: true,
    plan,
    applied: {
      main,
      also,
      alsoUsed: alsoChanges(ctx, finisher),
      focus,
      focusMissed,
      loved,
      lovedMissed,
      never: (input.never ?? []).filter((id) => ladderKeys.has(key(id))).length,
      easyOn: (input.easyOn ?? []).filter((j) => j !== 'none'),
      gaps: [...gaps],
      finisher: finisher?.name ?? null,
      ...(warmUp ? { warmUp: deps.name(warmUp) } : {}),
      minutes,
      over: timed && minutes.some((m) => m > input.minutes!),
      ...(timed && main === 'strength' && days.some((d) => d.units.length < 5) ? { restKept: true } : {}),
    },
  };
}
