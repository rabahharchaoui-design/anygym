// Smart exercise order and "Up next" (PLAN 3.4a, SPEC 22). Pure: no JSON, no Dexie, no React
// (src/data/order.ts binds the committed data). Used by Quick workout (Up next), the plan Coach tips
// (lib/coachTips.ts) and, from PLAN 3.5, the generator.
//
// Everything works on a Profile: what an exercise is for ordering (its movement pattern, its muscles,
// how big a lift it is). The rules, in SPEC 22's priority order:
//   1. big compounds first while fresh, then secondary compounds, then isolation, then calves, abs
//      and forearms, then stretches (warm ups and dynamic moves open the day, cardio closes it);
//   2. a focus muscle goes earlier (never before the day's big lifts);
//   3. never pre-tire a helper: no isolation of a muscle a compound still to come leans on;
//   4. isolation follows the compound it builds on (bench → fly or triceps, rows → rear delts or
//      biceps, squat → leg extension or curl, overhead press → lateral raises);
//   5. pairs stay together, never two of the same muscle, never with the day's heaviest lift;
//   6. rest by size: heavy compounds 2 to 3 min (3 for strength), other compounds 2, isolation 60 to 90 s.
// Ties keep the order they came in (stable), and the same pattern never runs back to back when
// another one of the same rank is there to go between.

import type { Pattern } from './swap';

export const MUSCLES = [
  'quads',
  'glutes',
  'hamstrings',
  'lower back',
  'adductors',
  'abductors',
  'calves',
  'chest',
  'front delts',
  'side delts',
  'rear delts',
  'back',
  'traps',
  'biceps',
  'triceps',
  'forearms',
  'abs',
] as const;
export type Muscle = (typeof MUSCLES)[number];

/** What a movement is in a day: a lift, or something around the lifting. */
export type Role = 'warmup' | 'dynamic' | 'lift' | 'stretch' | 'cardio';

/** What a lift is loaded with, as sure as the data is ('unknown' when it is not). */
export type Implement = 'barbell' | 'plate machine' | 'dumbbell' | 'kettlebell' | 'machine' | 'cable' | 'band' | 'bodyweight' | 'unknown';

export type Profile = {
  id: string;
  /** Plain name, for the one line reasons. */
  name: string;
  pattern: Pattern | null;
  role: Role;
  /** The muscles it trains hard. */
  targets: readonly Muscle[];
  /** Muscles that, tired, hold it back (only compounds lean on helpers). */
  helpers: readonly Muscle[];
  /** 0 big compound, 1 secondary compound, 2 isolation, 3 calves, abs and forearms; -1 warm up, 4 stretch, 5 cardio. */
  tier: number;
  /** How demanding it is, 1 to 11: within a rank the bigger lift goes first. */
  load: number;
  /** A bodyweight skill that takes years to learn (handstand push ups): only for experienced lifters. */
  advanced?: true;
};

// ---------------------------------------------------------------- profiles

type PatternFacts = { targets: Muscle[]; helpers: Muscle[]; tier: number; load: number };

/** Per pattern: what it trains, what it leans on, its rank with free weights and how big it is. */
const PATTERN_FACTS: Record<Pattern, PatternFacts> = {
  squat: { targets: ['quads', 'glutes'], helpers: ['lower back', 'hamstrings'], tier: 0, load: 9 },
  hinge: { targets: ['hamstrings', 'glutes', 'lower back'], helpers: ['forearms'], tier: 0, load: 9 },
  lunge: { targets: ['quads', 'glutes'], helpers: [], tier: 1, load: 6 },
  'horizontal push': { targets: ['chest'], helpers: ['triceps', 'front delts'], tier: 0, load: 7 },
  'vertical push': { targets: ['front delts', 'side delts'], helpers: ['triceps'], tier: 0, load: 6 },
  'horizontal pull': { targets: ['back'], helpers: ['biceps', 'rear delts', 'forearms'], tier: 0, load: 7 },
  'vertical pull': { targets: ['back'], helpers: ['biceps', 'forearms'], tier: 0, load: 6 },
  'chest isolation': { targets: ['chest'], helpers: [], tier: 2, load: 3 },
  'lateral delt': { targets: ['side delts'], helpers: [], tier: 2, load: 2 },
  'rear delt': { targets: ['rear delts'], helpers: [], tier: 2, load: 2 },
  biceps: { targets: ['biceps'], helpers: [], tier: 2, load: 2 },
  triceps: { targets: ['triceps'], helpers: [], tier: 2, load: 2 },
  'quads isolation': { targets: ['quads'], helpers: [], tier: 2, load: 3 },
  'hamstrings isolation': { targets: ['hamstrings'], helpers: [], tier: 2, load: 3 },
  glutes: { targets: ['glutes'], helpers: [], tier: 1, load: 5 },
  calves: { targets: ['calves'], helpers: [], tier: 3, load: 1 },
  core: { targets: ['abs'], helpers: [], tier: 3, load: 1 },
};

/** What a pattern trains hard (PLAN 3.5a: Quick workout concepts). */
export const patternTargets = (p: Pattern): readonly Muscle[] => PATTERN_FACTS[p].targets;

/** Machine (and one kettlebell) versions of a big pattern are secondary compounds (rule 1); bars, dumbbells and bodyweight lead. */
const SECONDARY_IMPLEMENTS: ReadonlySet<Implement> = new Set(['plate machine', 'machine', 'cable', 'kettlebell']);

const IMPLEMENT_LOAD: Record<Implement, number> = {
  barbell: 1,
  'plate machine': 0,
  dumbbell: 0,
  kettlebell: -1,
  machine: -1,
  cable: -1,
  band: -2,
  bodyweight: -1,
  unknown: 0,
};

/** What the data says about one exercise, for profileOf. */
export type ProfileInput = {
  id: string;
  name: string;
  pattern: Pattern | null;
  implement: Implement;
  /** Exercises no pattern describes (stretches, shrugs, forearm work): their own facts. */
  override?: Partial<Omit<Profile, 'id' | 'name' | 'pattern'>>;
};

/** The ordering profile of an exercise: its pattern's facts, ranked by its implement, then any override. */
export function profileOf({ id, name, pattern, implement, override }: ProfileInput): Profile {
  const facts = pattern ? PATTERN_FACTS[pattern] : { targets: [], helpers: [], tier: 2, load: 2 };
  const machine = facts.tier === 0 && SECONDARY_IMPLEMENTS.has(implement);
  const base: Profile = {
    id,
    name,
    pattern,
    role: 'lift',
    targets: facts.targets,
    // A machine squat holds the back: it leans on no lower back or hamstrings.
    helpers: machine && pattern === 'squat' ? [] : facts.helpers,
    tier: machine ? 1 : facts.tier,
    load: Math.max(1, facts.load + (pattern ? IMPLEMENT_LOAD[implement] : 0)),
  };
  return { ...base, ...override };
}

/** A compound: something that leans on helpers (rule 3). */
export const isCompound = (p: Pick<Profile, 'role' | 'tier'>): boolean => p.role === 'lift' && p.tier <= 1;

// ---------------------------------------------------------------- units (a block: one exercise, or a pair)

/** One block of a day: a single exercise or a pair done back to back. Pairs move as one (rule 5). */
export type Unit<T = unknown> = { items: readonly Profile[]; ref: T };

const unitRole = (u: Unit): Role => {
  const roles = u.items.map((p) => p.role);
  if (roles.includes('lift')) return 'lift';
  return roles[0] ?? 'lift';
};

const unitTier = (u: Unit): number => {
  const lifts = u.items.filter((p) => p.role === 'lift');
  if (lifts.length) return Math.min(...lifts.map((p) => p.tier));
  const role = unitRole(u);
  return role === 'stretch' ? 4 : role === 'cardio' ? 5 : -1;
};

const unitLoad = (u: Unit): number => Math.max(0, ...u.items.map((p) => p.load));
const unitTargets = (u: Unit): Set<Muscle> => new Set(u.items.flatMap((p) => p.targets));
const unitHelpers = (u: Unit): Set<Muscle> => new Set(u.items.flatMap((p) => p.helpers));
const unitPatterns = (u: Unit): Set<Pattern> => new Set(u.items.flatMap((p) => (p.pattern ? [p.pattern] : [])));
const overlaps = <T>(a: Set<T>, b: Iterable<T>) => [...b].some((x) => a.has(x));

export type OrderOptions = {
  /** Priority muscles (an intake focus or the plan's stated focus): earlier in the day (rule 2). */
  focus?: readonly Muscle[];
};

/**
 * The day in SPEC 22 order. Greedy: each step takes the best ranked unit that pre-tires nothing
 * still to come, preferring, within the same rank, one whose pattern differs from the one before.
 * Every unit comes out exactly once; pairs stay whole; equal units keep their order.
 */
export function orderUnits<T>(units: readonly Unit<T>[], opts: OrderOptions = {}): Unit<T>[] {
  const focus = new Set(opts.focus ?? []);
  const info = units.map((u, index) => {
    const tier = unitTier(u);
    const isFocus = unitRole(u) === 'lift' && overlaps(focus, unitTargets(u));
    // Rule 2: a focus lift goes ahead of everything after the big compounds, never before them.
    const band = tier <= 0 ? tier : isFocus && tier <= 3 ? 1 : tier;
    return { u, index, tier, band, sub: band === 1 && isFocus ? 0 : 1, load: unitLoad(u), targets: unitTargets(u), helpers: unitHelpers(u), patterns: unitPatterns(u) };
  });
  type Info = (typeof info)[number];
  const left = [...info];
  const out: Info[] = [];
  // Rule 4: an isolation follows the compound it builds on, so it ranks by where that one went.
  const anchor = (x: Info): number => {
    if (x.tier < 2) return 0;
    const at = out.findIndex((o) => o.tier <= 1 && (overlaps(o.targets, x.targets) || overlaps(o.helpers, x.targets)));
    return at === -1 ? out.length + 1 : at;
  };
  const rank = (a: Info, b: Info) => a.band - b.band || a.sub - b.sub || anchor(a) - anchor(b) || b.load - a.load || a.index - b.index;
  // Rule 3: nothing that tires a muscle a compound still to come needs.
  const pretires = (x: Info) => x.tier >= 2 && left.some((y) => y !== x && y.tier <= 1 && unitRole(y.u) === 'lift' && overlaps(y.helpers, x.targets));
  while (left.length) {
    left.sort(rank);
    const ok = left.filter((x) => !pretires(x));
    const pool = ok.length ? ok : left;
    let pick = pool[0]!;
    const prev = out[out.length - 1];
    if (prev && overlaps(prev.patterns, pick.patterns)) {
      const other = pool.find((x) => x.band === pick.band && x.sub === pick.sub && !overlaps(prev.patterns, x.patterns));
      if (other) pick = other;
    }
    out.push(pick);
    left.splice(left.indexOf(pick), 1);
  }
  return out.map((x) => x.u);
}

/**
 * The day's heaviest lift: its biggest compound of any pattern, pulls included (rule 5: it gets full
 * rest and is never paired). First wins a tie. `patterns` narrows it (the Coach tips rest check
 * looks only at squats, hinges and presses, SPEC 22 flag 3).
 */
export function heaviestOf(profiles: readonly Profile[], patterns?: ReadonlySet<Pattern>): Profile | undefined {
  let best: Profile | undefined;
  for (const p of profiles) if (isCompound(p) && p.pattern && (!patterns || patterns.has(p.pattern)) && (!best || p.load > best.load)) best = p;
  return best;
}

/** SPEC 22 flag 3 and rule 5's examples: heavy squats, deadlifts and presses. */
export const SQUAT_HINGE_PRESS: ReadonlySet<Pattern> = new Set<Pattern>(['squat', 'hinge', 'horizontal push', 'vertical push']);

// ---------------------------------------------------------------- pairs (rule 5)

/**
 * Can these two be done back to back? Only when they share no muscle (opposing or unrelated),
 * neither leans on what the other trains, and neither is the day's heaviest lift.
 */
export function canPair(a: Profile, b: Profile, heaviestIds: ReadonlySet<string> = new Set()): boolean {
  if (a.role !== 'lift' || b.role !== 'lift' || a.id === b.id) return false;
  if (heaviestIds.has(a.id) || heaviestIds.has(b.id)) return false;
  const at = new Set(a.targets);
  const bt = new Set(b.targets);
  if (overlaps(at, bt)) return false;
  if (overlaps(new Set(a.helpers), bt) || overlaps(new Set(b.helpers), at)) return false;
  return true;
}

/** Two items of a pair that work the same muscle (rule 5), or null. */
export function sameMusclePair(items: readonly Profile[]): Muscle | null {
  const lifts = items.filter((p) => p.role === 'lift');
  for (let i = 0; i < lifts.length; i++) {
    for (let j = i + 1; j < lifts.length; j++) {
      const shared = lifts[i]!.targets.find((m) => lifts[j]!.targets.includes(m));
      if (shared) return shared;
    }
  }
  return null;
}

// ---------------------------------------------------------------- rest (rule 6)

export type Goal = 'muscle' | 'strength' | 'fat_loss' | 'tone' | 'health' | 'athletic' | 'race' | 'comeback';

/** A heavy compound: big pattern, free weight or plate loaded, high load. */
export const isHeavy = (p: Profile): boolean => isCompound(p) && p.load >= 8;

/** Suggested rest in seconds (rule 6): heavy compounds 150 (180 for strength), other compounds 120, isolation 75. */
export function restFor(p: Profile, goal: Goal = 'muscle'): number {
  if (p.role !== 'lift') return 0;
  if (isHeavy(p)) return goal === 'strength' ? 180 : 150;
  if (isCompound(p)) return 120;
  return 75;
}

// ---------------------------------------------------------------- the rest of the rules (split, PLAN 3.5f)
// Up next and its plain words live in upNext.ts, a whole session's structure in orderSession.ts;
// everyone keeps importing from lib/order.
export * from './upNext';
export * from './orderSession';
