// Quick workout ideas: diverse and full (PLAN 3.5b, G Nov 8, extends 3.5a and SPEC 20.3). Pure: no
// JSON, no Dexie, no React. Three things live here:
//   1. STYLES: how a workout is done, not just what it trains (Full body circuit, Superset pump,
//      Strength focus, Cardio and core, Mobility reset, Arms and abs finisher, Easy start), each with
//      its slots, its prescriptions and the honest test of its name;
//   2. DENSITY: the minutes decide the count (15 min: 3 to 4 moves as a circuit, 30: 5 to 6 with 2
//      supersets, 45: 6 to 7, 60: 7 to 9), and the time is fitted with supersets, rounds, sets and
//      rest through the one estimator (plans.ts estimateDayMinutes over quickDayOf);
//   3. the diversity rule and the rotation: no two cards share more than half their primary muscles
//      (the catalog's primary muscles), a style done in the last 2 quick workouts never comes first,
//      and the same 4 cards never show twice in a row.
// Nothing here pads: fewer sure moves than a style needs is a smaller card or no card.
import type { GoalId } from './intake/options';
import type { Range, Slot } from './generatorRules';
import { generateDay, type DayItem, type GeneratorDeps, type GeneratorInput } from './generator';
import { canPair, isCompound, isHeavy, type Profile } from './order';
import { estimateDayMinutes, type PlanDay } from './plans';
import type { Pattern, Requires } from './swap';

export type StyleId = 'circuit' | 'pump' | 'strength' | 'cardioCore' | 'mobility' | 'armsAbs' | 'easy';

/** The rotation's own order (cards 3 and 4 walk it, the least recently shown and done first). */
export const STYLE_ORDER: readonly StyleId[] = ['circuit', 'pump', 'strength', 'armsAbs', 'easy', 'cardioCore', 'mobility'];

/** A grouped item: items sharing `group` are done back to back (2: a superset, 3 or more: a circuit). */
export type GroupedItem = DayItem & { group?: number };

// ---------------------------------------------------------------- the one estimate

type DayRow = { id: string; name: string; sets: number; reps?: Range | number; seconds?: Range | number; restSec: number; group?: number };

/**
 * Quick items as a plan day, for the one estimator (SPEC 7.4): a run of items sharing a group is one
 * block (a superset or a circuit: its rest once per round), anything else a single.
 */
export function quickDayOf(items: readonly DayRow[]): PlanDay {
  const blocks: PlanDay['blocks'] = [];
  for (let i = 0; i < items.length; ) {
    const g = items[i]!.group;
    const run: DayRow[] = [items[i++]!];
    while (g !== undefined && i < items.length && items[i]!.group === g) run.push(items[i++]!);
    blocks.push({
      kind: run.length > 1 ? 'pair' : 'single',
      sets: Math.max(...run.map((it) => it.sets)),
      restSec: Math.max(...run.map((it) => it.restSec)),
      items: run.map((it) => ({ exerciseId: it.id, name: it.name, ...(it.reps !== undefined ? { reps: it.reps } : {}), ...(it.seconds !== undefined ? { seconds: it.seconds } : {}) })),
    });
  }
  return { n: 1, name: 'Quick workout', blocks };
}

/** Minutes of quick items: the workout header's own estimate. */
export const quickMinutes = (items: readonly DayRow[]): number => estimateDayMinutes(quickDayOf(items));

/** How a card is done: supersets (groups of 2) and circuits (3 or more), from its items. */
export function structureOf(items: readonly { group?: number; sets: number }[]): { supersets: number; circuits: number; rounds: number | null } {
  const sizes = new Map<number, number>();
  for (const it of items) if (it.group !== undefined) sizes.set(it.group, (sizes.get(it.group) ?? 0) + 1);
  const all = [...sizes.values()];
  const supersets = all.filter((n) => n === 2).length;
  const circuits = all.filter((n) => n >= 3).length;
  // One circuit holding the whole workout: its rounds are the workout's.
  const whole = circuits === 1 && supersets === 0 && items.length > 0 && items.every((it) => it.group === items[0]!.group);
  return { supersets, circuits, rounds: whole ? Math.max(...items.map((it) => it.sets)) : null };
}

// ---------------------------------------------------------------- density (G's counts)

export type Density = { min: number; max: number; supersets: number };

/** 15: 3 to 4 moves (a circuit) · 30: 5 to 6 with 2 supersets · 45: 6 to 7 · 60: 7 to 9. */
export function densityFor(minutes: number): Density {
  // A circuit at 15 (the pump does its 4 moves as 2 supersets).
  if (minutes <= 20) return { min: 3, max: 4, supersets: 2 };
  if (minutes <= 37) return { min: 5, max: 6, supersets: 2 };
  if (minutes <= 52) return { min: 6, max: 7, supersets: 3 };
  return { min: 7, max: 9, supersets: 4 };
}

/** A card is within this many minutes of the chip (G: "~30 min" means about 30). */
export const SLACK = 2;

// ---------------------------------------------------------------- styles

type Shape = 'circuit' | 'tri' | 'pairs' | 'straight';

export type StyleDef = {
  id: StyleId;
  title: string;
  /** The chip when the structure does not decide it (Strength, Low impact). */
  chip?: 'Strength' | 'Low impact';
  /** 1 to 3 dots: how hard the style is meant to be. */
  effort: 1 | 2 | 3;
  /** Different body areas of the same style; the first one that keeps the cards diverse is used. */
  variants: ReadonlyArray<{ key: string; label: string; slots: readonly Slot[] }>;
  /** Shorter than this, the style is not offered (Strength focus needs its long rest). */
  minMinutes?: number;
  shape: (minutes: number) => Shape;
  /** The goal its prescriptions come from (Strength focus trains like strength). */
  goals?: readonly GoalId[];
  /** Only the slots' own patterns (a small moves style never falls back to a row). */
  noFallback?: true;
  /** Fewer moves than the minutes would allow (Strength focus: fewer, heavier). */
  maxMoves?: (minutes: number) => number;
  /** Reps for every lift that is not timed, compounds and the rest. */
  reps?: { compound: Range; other: Range };
  /** Starting sets (rounds for a circuit); the fit adds or takes from there. */
  sets?: (newer: boolean) => number;
  maxSets: (newer: boolean) => number;
  /** Rest after a round of a group, after a single small move, and the least either may get. */
  rest: { group: number; single: number; floor: number; cap: number };
  /** May this exercise be in it at all (Easy start: low impact only). */
  only?: (p: Profile, requires: Requires | null) => boolean;
  /** Is its name true of what it holds. */
  honest: (ps: readonly Profile[], items: readonly { group?: number }[]) => boolean;
  /** 3.5b round 4: the most heavy lifts on the card. */
  maxHeavy?: number;
};

const s = (pattern: Pattern, variant = false): Slot => (variant ? { pattern, variant: true } : { pattern });

const LEGS: ReadonlySet<Pattern> = new Set<Pattern>(['squat', 'hinge', 'lunge', 'quads isolation', 'hamstrings isolation', 'glutes', 'calves']);
const PUSH: ReadonlySet<Pattern> = new Set<Pattern>(['horizontal push', 'vertical push', 'chest isolation', 'triceps']);
const PULL: ReadonlySet<Pattern> = new Set<Pattern>(['horizontal pull', 'vertical pull', 'rear delt', 'biceps']);
const ARMS: ReadonlySet<Pattern> = new Set<Pattern>(['biceps', 'triceps', 'lateral delt', 'rear delt']);
const has = (ps: readonly Profile[], set: ReadonlySet<Pattern>) => ps.some((p) => p.pattern !== null && set.has(p.pattern));
const grouped = (items: readonly { group?: number }[], size: (n: number) => boolean) => [...structureCounts(items).values()].some(size);
function structureCounts(items: readonly { group?: number }[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const it of items) if (it.group !== undefined) m.set(it.group, (m.get(it.group) ?? 0) + 1);
  return m;
}

/**
 * Low impact: no barbell, nothing hanging from or pressing your own bodyweight, and a big lift only
 * on a machine that holds the path for you (a leg press, never a loaded squat or hinge).
 */
export function lowImpact(p: Profile, requires: Requires | null): boolean {
  if (!requires || p.role !== 'lift' || p.advanced) return false;
  const hard = new Set(['barbell_rack', 'pull_up_bar', 'dip_station']);
  if (!requires.every((g) => !g.every((id) => hard.has(id)))) return false;
  return !isHeavy(p) || requires.some((g) => g.every((id) => id === 'leg_press'));
}

const timedOr = (newer: boolean, a: number, b: number) => (newer ? a : b);

/** Legs, push or pull (null: abs, shoulders' small moves, anything else). */
const bodyArea = (p: Profile): 'legs' | 'push' | 'pull' | null =>
  p.pattern === null ? null : LEGS.has(p.pattern) && p.pattern !== 'calves' ? 'legs' : PUSH.has(p.pattern) ? 'push' : PULL.has(p.pattern) ? 'pull' : null;

/**
 * 3.5b round 4 (M6): a pump is built around a main lift: the card opens on a big lift, and its first
 * pair is that lift with a move of another area (a push with a pull, a leg move with an upper one),
 * never a big lift next to an ab move.
 */
function mainPair(ps: readonly Profile[], items: readonly { group?: number }[]): boolean {
  if (!ps.length || !isCompound(ps[0]!) || items[0]?.group === undefined) return false;
  const g = items[0].group;
  const partner = items.findIndex((it, i) => i > 0 && it.group === g);
  if (partner === -1) return false;
  const a = bodyArea(ps[0]!);
  const b = bodyArea(ps[partner]!);
  return a !== null && b !== null && a !== b;
}

/** 3.5b round 4 (B4): a real leg move: knee or hip dominant and a compound (never a back extension or a leg extension alone). */
export const realLegs = (p: Profile): boolean => p.pattern !== null && ['squat', 'hinge', 'lunge', 'glutes'].includes(p.pattern) && isCompound(p);

/** Fill patterns after a variant's own slots: the card reaches the minutes with what the gym surely has (3.5b round 4, B1). */
const UPPER_FILL: Slot[] = [s('horizontal push', true), s('horizontal pull', true), s('vertical push', true), s('vertical pull', true), s('lateral delt', true), s('biceps', true), s('triceps', true), s('chest isolation', true), s('rear delt', true)];
const LOWER_FILL: Slot[] = [s('squat', true), s('hinge', true), s('glutes', true), s('lunge', true), s('hamstrings isolation', true), s('quads isolation', true), s('calves', true)];
const CORE_FILL: Slot[] = [s('core', true), s('core', true)];
/** Big lifts of another kind (a second row, a second press): Strength focus's 4th and 5th lift where a gym has few. */
const COMPOUND_FILL: Slot[] = [s('horizontal pull', true), s('horizontal push', true), s('vertical pull', true), s('vertical push', true), s('squat', true)];

export const STYLES: Record<StyleId, StyleDef> = {
  circuit: {
    id: 'circuit',
    title: 'Full body circuit',
    effort: 3,
    // Round 4 (B4): a big leg lift leads (on its own, at its own rest), then legs, a push and a pull take turns.
    variants: [
      { key: 'a', label: 'squat first', slots: [s('squat'), s('horizontal push'), s('horizontal pull'), s('hinge'), s('vertical push'), s('vertical pull'), s('core'), s('glutes'), s('lateral delt'), s('hamstrings isolation'), s('biceps'), s('triceps')] },
      { key: 'b', label: 'hinge first', slots: [s('hinge'), s('vertical push'), s('vertical pull'), s('squat'), s('horizontal push'), s('horizontal pull'), s('core'), s('calves'), s('lateral delt'), s('triceps'), s('biceps')] },
      { key: 'c', label: 'glutes first', slots: [s('glutes'), s('horizontal push'), s('vertical pull'), s('hamstrings isolation'), s('vertical push'), s('horizontal pull'), s('core'), s('quads isolation'), s('rear delt')] },
    ],
    shape: (m) => (m <= 20 ? 'circuit' : 'tri'),
    reps: { compound: [8, 12], other: [10, 15] },
    sets: (newer) => timedOr(newer, 2, 3),
    maxSets: (newer) => timedOr(newer, 3, 5),
    rest: { group: 60, single: 60, floor: 45, cap: 120 },
    // Round 4 (B4): one heavy lift at most, and only a leg lift (it leads, on its own, at full rest).
    only: (p) => !isHeavy(p) || realLegs(p),
    maxHeavy: 1,
    honest: (ps, items) => ps.some(realLegs) && has(ps, PUSH) && has(ps, PULL) && isCompound(ps[0]!) && grouped(items, (n) => n >= 3),
  },
  pump: {
    id: 'pump',
    title: 'Pairs, back to back',
    effort: 2,
    // Round 4 (M6): pairs built around a main push and pull (or a hip and a pull), one calf move at most.
    variants: [
      { key: 'upper', label: 'chest and back', slots: [s('horizontal push'), s('horizontal pull'), s('vertical push'), s('vertical pull'), s('lateral delt'), s('rear delt'), s('biceps'), s('triceps'), s('chest isolation'), s('biceps', true), s('triceps', true), ...CORE_FILL] },
      { key: 'lower', label: 'legs and back', slots: [s('glutes'), s('vertical pull'), s('hamstrings isolation'), s('horizontal pull'), s('quads isolation'), s('lateral delt'), s('calves'), s('rear delt'), ...CORE_FILL] },
      { key: 'shoulders', label: 'shoulders and legs', slots: [s('vertical push'), s('hamstrings isolation'), s('lateral delt'), s('quads isolation'), s('rear delt'), s('calves'), s('glutes'), ...CORE_FILL] },
    ],
    shape: () => 'pairs',
    noFallback: true,
    reps: { compound: [8, 12], other: [10, 15] },
    maxSets: (newer) => timedOr(newer, 3, 5),
    rest: { group: 60, single: 60, floor: 45, cap: 90 },
    only: (p) => !isHeavy(p),
    honest: (ps, items) => mainPair(ps, items) && ps.filter((p) => p.pattern === 'calves').length <= 1,
  },
  strength: {
    id: 'strength',
    title: 'Strength focus',
    chip: 'Strength',
    effort: 3,
    // Round 4 (B5): a 4th and a 5th lift (an upper press and a pull) come before any extra set.
    // A second press or row of another kind fills a gym with few big lifts (a hotel: dumbbell and cable).
    variants: [
      { key: 'legs', label: 'legs first', slots: [s('squat'), s('hinge'), s('horizontal push'), s('horizontal pull'), s('glutes'), s('vertical push'), s('vertical pull'), ...COMPOUND_FILL] },
      { key: 'upper', label: 'upper first', slots: [s('horizontal push'), s('horizontal pull'), s('vertical push'), s('vertical pull'), s('squat'), s('hinge'), ...COMPOUND_FILL] },
      { key: 'posterior', label: 'hips first', slots: [s('hinge'), s('glutes'), s('vertical push'), s('vertical pull'), s('hinge', true), s('horizontal push'), ...COMPOUND_FILL] },
    ],
    minMinutes: 30,
    shape: () => 'straight',
    goals: ['strength'],
    noFallback: true,
    // Fewer moves, heavier, longer rest: never more than this, whatever the minutes.
    maxMoves: (m) => (m <= 37 ? 3 : m <= 52 ? 4 : 5),
    maxSets: () => 5,
    rest: { group: 150, single: 150, floor: 150, cap: 180 },
    honest: (ps) => ps.length >= 3 && ps.every((p) => isCompound(p)),
  },
  cardioCore: {
    id: 'cardioCore',
    title: 'Cardio and core',
    effort: 2,
    // No cardio move has a demo we are sure of yet: with only abs moves the name would not be true.
    variants: [{ key: 'a', label: 'cardio and abs', slots: [s('core'), s('core', true), s('core', true), s('core', true)] }],
    shape: () => 'circuit',
    noFallback: true,
    maxSets: () => 4,
    rest: { group: 60, single: 45, floor: 30, cap: 90 },
    honest: (ps) => ps.some((p) => p.role === 'cardio') && ps.some((p) => p.pattern === 'core'),
  },
  mobility: {
    id: 'mobility',
    title: 'Mobility reset',
    chip: 'Low impact',
    effort: 1,
    // Stretches only, and none has a demo we are sure of yet: never offered until one has.
    variants: [{ key: 'a', label: 'stretches', slots: [s('core')] }],
    shape: () => 'circuit',
    noFallback: true,
    maxSets: () => 3,
    rest: { group: 30, single: 30, floor: 15, cap: 60 },
    honest: (ps) => ps.length >= 3 && ps.every((p) => p.role === 'stretch' || p.role === 'dynamic'),
  },
  armsAbs: {
    id: 'armsAbs',
    title: 'Arms and abs',
    effort: 2,
    // Arms (biceps and triceps) and abs only: true to its name, and clear of a pump's shoulders and chest.
    variants: [
      { key: 'a', label: 'arms and abs', slots: [s('biceps'), s('triceps'), s('core'), s('biceps', true), s('triceps', true), s('core', true), s('biceps', true), s('triceps', true)] },
      { key: 'b', label: 'arms, shoulders and abs', slots: [s('biceps'), s('triceps'), s('core'), s('lateral delt'), s('rear delt'), s('core', true), s('biceps', true), s('triceps', true)] },
    ],
    shape: (m) => (m <= 20 ? 'circuit' : 'pairs'),
    noFallback: true,
    reps: { compound: [8, 12], other: [10, 15] },
    maxSets: (newer) => timedOr(newer, 3, 5),
    rest: { group: 45, single: 45, floor: 30, cap: 90 },
    honest: (ps, items) =>
      ps.every((p) => p.pattern !== null && (ARMS.has(p.pattern) || p.pattern === 'core')) && ps.some((p) => p.pattern === 'core') && ps.some((p) => p.pattern === 'biceps' || p.pattern === 'triceps') && grouped(items, (n) => n >= 2),
  },
  easy: {
    id: 'easy',
    title: 'Easy start',
    chip: 'Low impact',
    effort: 1,
    variants: [
      { key: 'full', label: 'whole body', slots: [s('squat'), s('horizontal pull'), s('horizontal push'), s('vertical pull'), s('hamstrings isolation'), s('lateral delt'), s('core'), s('quads isolation'), s('core', true), ...UPPER_FILL] },
      { key: 'upper', label: 'upper body', slots: [s('horizontal pull'), s('horizontal push'), s('vertical pull'), s('lateral delt'), s('biceps'), s('triceps'), s('core'), s('rear delt'), s('core', true), ...UPPER_FILL] },
      { key: 'legs', label: 'legs', slots: [s('squat'), s('hamstrings isolation'), s('glutes'), s('quads isolation'), s('calves'), s('core'), s('core', true), ...LOWER_FILL] },
    ],
    shape: (m) => (m <= 20 ? 'circuit' : 'straight'),
    reps: { compound: [10, 12], other: [10, 15] },
    sets: () => 2,
    maxSets: () => 3,
    rest: { group: 60, single: 60, floor: 45, cap: 90 },
    only: lowImpact,
    maxHeavy: 1,
    honest: (ps) => ps.length >= 3,
  },
};

// ---------------------------------------------------------------- building one card

export type BuildDeps = GeneratorDeps & {
  usable: (id: string) => boolean;
  requires: (id: string) => Requires | null;
};

/** The option an exercise is, by its plain name (machine words dropped): quick.ts optionKey's rule. */
const optionWord = (name: string): string =>
  name
    .toLowerCase()
    .replace(/\b(machine|angled|lever|leverage)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export type BuildSpec = {
  /** 3.5b round 4: the most heavy lifts the card may hold. */
  maxHeavy?: number;
  name: string;
  slots: readonly Slot[];
  shape: Shape;
  input: GeneratorInput;
  /** The most moves to start from. */
  want: number;
  density: Density;
  reps?: StyleDef['reps'];
  sets?: number;
  maxSets: number;
  rest: StyleDef['rest'];
  /** Rest after a heavy or big compound done on its own is never shortened (SPEC 22 rule 6). */
  only?: (p: Profile, requires: Requires | null) => boolean;
};

type Work = GroupedItem & { profile: Profile; keepRest: boolean };

const minutesOfWork = (items: readonly Work[], deps: BuildDeps) => quickMinutes(items.map((it) => ({ ...it, name: deps.name(it.id) })));

const areaOf = (p: Profile): number => (p.pattern === null ? 3 : LEGS.has(p.pattern) ? 0 : PUSH.has(p.pattern) ? 1 : PULL.has(p.pattern) ? 2 : 3);

/** Legs, push, pull, legs, push, pull... then the rest (abs, shoulders), each area in its own order. */
function interleave<T extends { profile: Profile }>(items: readonly T[]): T[] {
  const buckets: T[][] = [[], [], [], []];
  for (const it of items) buckets[areaOf(it.profile)]!.push(it);
  const out: T[] = [];
  while (buckets.slice(0, 3).some((b) => b.length)) for (const b of buckets.slice(0, 3)) if (b.length) out.push(b.shift()!);
  return [...out, ...buckets[3]!];
}

/** Groups the items the style's way; a group's members get the same sets and the group's rest. */
function groupUp(items: Work[], shape: Shape, spec: BuildSpec): Work[] {
  for (const it of items) delete it.group;
  if (shape === 'straight') return items;
  if (shape === 'circuit' || shape === 'tri') {
    // 3.5b round 2 (Codex #1): a heavy lift is never in a circuit: it goes first, on its own, at its own rest.
    const heavy = items.filter((x) => isHeavy(x.profile));
    const rest = items.filter((x) => !isHeavy(x.profile));
    if (heavy.length) return [...heavy, ...groupUp(rest, shape, spec)];
    // Legs, a push and a pull take turns, so every round works the whole body and no muscle goes twice in a row.
    items = interleave(items);
    const sizes: number[] = [];
    if (shape === 'circuit') sizes.push(items.length);
    else {
      // Circuits of 3; a leftover of 1 or 2 joins the last one (3.5b round 4, M9: a circuit card is all
      // rounds, never "3 rounds · 1 pair"); 2 alone is a pair.
      let n = items.length;
      while (n > 0) {
        if (n === 4) {
          sizes.push(4);
          n = 0;
        } else if (n === 2) {
          if (sizes.length) sizes[sizes.length - 1]! += 2;
          else sizes.push(2);
          n = 0;
        } else {
          sizes.push(Math.min(3, n));
          n -= Math.min(3, n);
        }
      }
    }
    let at = 0;
    sizes.forEach((size, g) => {
      const run = items.slice(at, at + size);
      at += size;
      if (run.length < 2) return;
      const rounds = Math.max(...run.map((x) => x.sets));
      for (const it of run) {
        it.group = g;
        it.sets = rounds;
        it.restSec = spec.rest.group;
      }
    });
    return items;
  }
  // Supersets: two moves that share no muscle, never a heavy lift, as many as the minutes ask for.
  const out: Work[] = [];
  const used = new Set<number>();
  let g = 0;
  for (let i = 0; i < items.length; i++) {
    if (used.has(i)) continue;
    const a = items[i]!;
    used.add(i);
    out.push(a);
    if (g >= spec.density.supersets || isHeavy(a.profile)) continue;
    const j = items.findIndex((b, k) => k > i && !used.has(k) && !isHeavy(b.profile) && canPair(a.profile, b.profile));
    if (j === -1) continue;
    const b = items[j]!;
    used.add(j);
    const sets = Math.max(a.sets, b.sets);
    a.sets = sets;
    b.sets = sets;
    a.group = g;
    b.group = g;
    const rest = isCompound(a.profile) || isCompound(b.profile) ? Math.max(spec.rest.group, 90) : spec.rest.group;
    a.restSec = rest;
    b.restSec = rest;
    out.push(b);
    g++;
  }
  return out;
}

/** The units of a grouped list: each group once, each single once, in order. */
function unitsOf(items: readonly Work[]): Work[][] {
  const out: Work[][] = [];
  for (const it of items) {
    const last = out[out.length - 1];
    if (it.group !== undefined && last && last[0]!.group === it.group) last.push(it);
    else out.push([it]);
  }
  return out;
}

const restMovable = (u: readonly Work[]) => u.length > 1 || !u[0]!.keepRest;

/** Only a pull up bar: the lift hangs your whole bodyweight (pull ups, chin ups). */
export const hangsBodyweight = (requires: Requires | null): boolean => !!requires && requires.length > 0 && requires.every((g) => g.every((id) => id === 'pull_up_bar'));

/**
 * One card: the slots filled the plan generator's way (gear, never, go easy on, loved, soft dislikes,
 * a sure demo), grouped the style's way, then fitted to the minutes through the one estimate: rest
 * first, then sets, then the last moves (never under 3) when it is long; sets, then rest when it is
 * short. null when fewer than 3 sure moves fit, or it still cannot fit.
 */
export type Built = {
  items: GroupedItem[];
  minutes: number;
  /** Still more than 2 min under the minutes: the gym had no more sure moves, or every set and rest is at its cap. */
  short?: 'moves' | 'caps';
};

export function buildCard(spec: BuildSpec, deps: BuildDeps, budget: number): Built | null {
  const left = new Set<string>();
  const usable = (id: string) => !left.has(id) && deps.usable(id) && (!spec.only || spec.only(deps.profile(id), deps.requires(id)));
  // 3.5b round 4: one option once ("Leg Press" and "Machine Leg Press" are one leg press at a gym).
  const sameAs = (id: string) => optionWord(deps.name(id));
  const gen = { ...deps, usable, data: { ...deps.data, sameAs } };
  let r = generateDay({ ...spec.input, minutes: undefined }, gen, { name: spec.name, slots: spec.slots, want: spec.want });
  // At most `maxHeavy` heavy lifts: the later ones make room for lighter moves (a circuit leads with one big leg lift).
  for (let guard = 0; r.ok && spec.maxHeavy !== undefined && guard < 6; guard++) {
    const extra = r.items.filter((it) => isHeavy(deps.profile(it.id))).slice(spec.maxHeavy);
    if (!extra.length) break;
    for (const it of extra) left.add(it.id);
    r = generateDay({ ...spec.input, minutes: undefined }, gen, { name: spec.name, slots: spec.slots, want: spec.want });
  }
  if (!r.ok) return null;
  let items: Work[] = r.items.map((it) => {
    const profile = deps.profile(it.id);
    // A heavy lift keeps its prescribed rest always (SPEC 22 rule 6); other compounds keep theirs outside circuits.
    const w: Work = { ...it, profile, keepRest: isHeavy(profile) || (isCompound(profile) && spec.shape !== 'circuit' && spec.shape !== 'tri') };
    if (spec.reps && w.reps) w.reps = isCompound(profile) ? [...spec.reps.compound] : [...spec.reps.other];
    // 3.5b round 4 (B4): a bodyweight pull up is a reachable 5 to 8 reps, never 8 to 12 (or a pulldown: quick.ts).
    if (w.reps && hangsBodyweight(deps.requires(it.id))) w.reps = [5, 8];
    if (spec.sets !== undefined) w.sets = spec.sets;
    w.sets = Math.min(w.sets, spec.maxSets);
    if (!w.keepRest) w.restSec = spec.rest.single;
    return w;
  });
  items = groupUp(items, spec.shape, spec);
  // A card never says more than the minutes picked ("~17 min" on the 15 chip reads wrong).
  const over = () => minutesOfWork(items, deps) > budget;
  const fits = (fn: () => void): boolean => {
    const before = items.map((it) => ({ ...it }));
    fn();
    if (over()) {
      items = before;
      return false;
    }
    return true;
  };

  // Long: tighter rest, then fewer sets (small moves first), then the last moves go.
  for (let guard = 0; over() && guard < 200; guard++) {
    const units = unitsOf(items);
    const rest = units.filter((u) => restMovable(u) && u[0]!.restSec - 15 >= spec.rest.floor);
    if (rest.length) {
      for (const u of rest) for (const it of u) it.restSec -= 15;
      continue;
    }
    const cut = [...units].reverse().filter((u) => u[0]!.sets > 2).sort((a, b) => Number(isCompound(a[0]!.profile)) - Number(isCompound(b[0]!.profile)) || b[0]!.sets - a[0]!.sets)[0];
    if (cut) {
      for (const it of cut) it.sets--;
      continue;
    }
    if (items.length <= 3) break;
    // 3.5b round 2: one heavy lift is plenty for a short workout: a second one goes before any light
    // move (its long rest would cost two light moves that pair up).
    const heavy = items.filter((x) => isHeavy(x.profile));
    const out = heavy.length > 1 ? heavy[heavy.length - 1]! : items[items.length - 1]!;
    items = groupUp(items.filter((x) => x !== out), spec.shape, spec);
  }
  if (over()) return null;

  // Short: one more set or round where it still fits, then a little more rest.
  for (let guard = 0; minutesOfWork(items, deps) < budget - SLACK && guard < 200; guard++) {
    const units = unitsOf(items);
    let grew = false;
    for (const u of units) {
      if (u[0]!.sets >= spec.maxSets) continue;
      if (fits(() => unitsOf(items).find((x) => x[0]!.id === u[0]!.id)!.forEach((it) => it.sets++))) {
        grew = true;
        break;
      }
    }
    if (grew) continue;
    for (const u of units) {
      if (!restMovable(u) || u[0]!.restSec + 15 > spec.rest.cap) continue;
      if (fits(() => unitsOf(items).find((x) => x[0]!.id === u[0]!.id)!.forEach((it) => (it.restSec += 15)))) {
        grew = true;
        break;
      }
    }
    if (!grew) break;
  }

  // Groups numbered in order; a group of one is a single.
  const sizes = structureCounts(items);
  const renumber = new Map<number, number>();
  const out: GroupedItem[] = items.map((w) => {
    const { profile: _p, keepRest: _k, ...it } = w;
    void _p;
    void _k;
    if (it.group === undefined || (sizes.get(it.group) ?? 0) < 2) {
      delete it.group;
      return it;
    }
    if (!renumber.has(it.group)) renumber.set(it.group, renumber.size);
    it.group = renumber.get(it.group)!;
    return it;
  });
  const minutes = quickMinutes(out.map((it) => ({ ...it, name: deps.name(it.id) })));
  if (minutes >= budget - SLACK) return { items: out, minutes };
  return { items: out, minutes, short: r.items.length < spec.want ? 'moves' : 'caps' };
}

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

// ---------------------------------------------------------------- diversity and rotation

/**
 * The diversity rule (G, PLAN 3.5b round 2: the strict reading): two cards may share at most half
 * the primary muscles of either one (shared × 2 ≤ the smaller card's count). A card with no sure
 * primary muscle cannot show it is different: never next to another. Under this rule some gyms can
 * only fill 3 cards honestly (chooseBatch shows 3 then, never a near copy).
 */
export function diverse(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size === 0 || b.size === 0) return false;
  let shared = 0;
  for (const m of a) if (b.has(m)) shared++;
  return 2 * shared <= Math.min(a.size, b.size);
}

export type Pickable = { id: string; primary: ReadonlySet<string> };

export type BatchInput<T extends Pickable> = {
  plan: T | null;
  /** "Hit what's fresh", variants in order (the first that keeps the cards diverse). */
  fresh: readonly T[];
  styles: ReadonlyMap<StyleId, readonly T[]>;
  /** Styles of the last 2 quick workouts done (logged sets), latest first. */
  done: readonly string[];
  /** The card ids shown last time, in order. */
  lastShown: readonly string[];
  /** Beginner or Go easy on: one Easy start (Low impact) card always. */
  needEasy: boolean;
  max?: number;
};

export type Batch<T> = {
  cards: T[];
  more: T[];
  /** Where each More ideas card goes: the card it replaces (or cards.length: it is added). */
  moreAt: number[];
  /** Card 4, the one a More ideas card replaces when it is diverse from all the others. */
  swapAt: number;
};

const sameIds = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x) => b.includes(x));

/** Styles least recently done first, then the ones not shown last time, then the rotation order. */
export function rankStyles(available: readonly StyleId[], done: readonly string[], lastShown: readonly string[]): StyleId[] {
  return [...available].sort((a, b) => Number(done.includes(a)) - Number(done.includes(b)) || Number(lastShown.includes(a)) - Number(lastShown.includes(b)) || STYLE_ORDER.indexOf(a) - STYLE_ORDER.indexOf(b));
}

/**
 * The 4 cards: the plan day first (when a plan is active), then "Hit what's fresh" (when there are
 * logged sets), then styles in rotation, each kept only when it is diverse from every card before it.
 * Beginners and Go easy on always get an Easy start; a style done in the last 2 quick workouts never
 * leads the styles; the same 4 never show twice in a row while another diverse 4 exists.
 */
export function chooseBatch<T extends Pickable>(input: BatchInput<T>): Batch<T> {
  const max = input.max ?? 4;
  const okWith = (c: T, others: readonly T[]) => others.every((o) => o === c || diverse(c.primary, o.primary));
  const fixed: T[] = [];
  if (input.plan) fixed.push(input.plan);
  // 3.5b round 4 (B3): beginners and Go easy on: an Easy start that fits next to the plan wins over
  // "Hit what's fresh" (fresh only when one of its variants leaves room for it).
  const easyOk = input.needEasy ? (input.styles.get('easy') ?? []).filter((v) => okWith(v, fixed)) : [];
  const fresh = input.fresh.find((f) => okWith(f, fixed) && (!easyOk.length || easyOk.some((e) => okWith(e, [...fixed, f]))));
  if (fresh) fixed.push(fresh);
  const available = STYLE_ORDER.filter((id) => (input.styles.get(id) ?? []).length > 0);
  const ranked = rankStyles(available, input.done, input.lastShown);
  const variantFor = (id: StyleId, others: readonly T[]) => (input.styles.get(id) ?? []).find((v) => okWith(v, others));

  // Every combination is tried (a greedy pick can block a valid fourth card): the most cards first,
  // then the styles in rank order, each style's variants in order.
  type Accept = (cards: readonly T[]) => boolean;
  // 3.5b round 2: among the largest diverse sets that keep the rotation's first style, the one that
  // leaves the most styles for More ideas wins (so the row below the cards has something to offer).
  const moreCount = (combo: readonly T[]): number => {
    const others = combo.length >= max && combo.length > fixed.length ? combo.slice(0, -1) : combo;
    return ranked.filter((id) => !combo.some((c) => c.id === id) && !!variantFor(id, others)).length;
  };
  const search = (accept: Accept): T[] => {
    let size = fixed.length;
    let found: T[][] = [];
    const cur = [...fixed];
    const rec = (i: number) => {
      if (found.length >= 400) return;
      if (cur.length === max || i === ranked.length) {
        if (!accept(cur)) return;
        if (cur.length > size || !found.length) {
          size = Math.max(size, cur.length);
          found = cur.length >= size ? [[...cur]] : found;
        } else if (cur.length === size) found.push([...cur]);
        return;
      }
      if (found.length && cur.length + (ranked.length - i) < size) return;
      for (const v of input.styles.get(ranked[i]!) ?? []) {
        if (!okWith(v, cur)) continue;
        cur.push(v);
        rec(i + 1);
        cur.pop();
      }
      rec(i + 1);
    };
    rec(0);
    if (!found.length) return [...fixed];
    let best = found[0]!;
    let bestMore = moreCount(best);
    // With no plan and no fresh card the rotation's first style keeps card 1. With them only cards 3
    // and 4 rotate, and More ideas is the way to every other style: room for it wins.
    const lead = fixed.length ? undefined : best[0]?.id;
    for (const f of found.slice(1)) {
      if (lead !== undefined && f[0]?.id !== lead) continue;
      const n = moreCount(f);
      if (n > bestMore) {
        best = f;
        bestMore = n;
      }
    }
    return best;
  };
  const easyIn = (cs: readonly T[]) => cs.some((c) => c.id === 'easy');
  const any: Accept = () => true;
  let cards = search(any);
  // Beginners and Go easy on: one Easy start whenever one fits with the rest.
  const easyRule: Accept = input.needEasy && easyIn(search((cs) => easyIn(cs))) ? easyIn : any;
  if (easyRule !== any) cards = search(easyRule);
  // Never the same 4 twice in a row, while another set of as many diverse cards exists.
  if (sameIds(cards.map((c) => c.id), input.lastShown)) {
    const next = search((cs) => easyRule(cs) && !sameIds(cs.map((c) => c.id), input.lastShown));
    if (next.length >= cards.length) cards = next;
  }
  // A style done in the last 2 quick workouts never leads the styles (the order otherwise stays).
  const styles = cards.slice(fixed.length);
  styles.sort((a, b) => Number(input.done.includes(a.id)) - Number(input.done.includes(b.id)));
  cards = [...fixed, ...styles];
  // 3.5b round 4 (B3): beginners and Go easy on see Easy start first (right after the plan, when there is one).
  const easy = input.needEasy ? cards.find((c) => c.id === 'easy') : undefined;
  if (easy) {
    const lead = cards[0]?.id === 'plan' ? [cards[0]] : [];
    cards = [...lead, easy, ...cards.filter((c) => c !== easy && !lead.includes(c))];
  }

  // 3.5d: Arms and abs is a finishing card: never the first one shown (slot 1), unless it is the only card.
  if (cards.length > 1 && cards[0]!.id === 'armsAbs') cards = [...cards.slice(1), cards[0]!];

  // More ideas (3.5b round 4, M12): every other style, and the other body areas of a style on screen
  // ("Superset pump: legs and back"), each in the place it can take: added when there is room, else
  // in place of card 4 when it is diverse from all the others, else in place of the one card it is
  // too close to (never the plan, fresh or a beginner's Easy start). The cards stay diverse either way.
  const swappable = (c: T) => c.id !== 'plan' && c.id !== 'fresh' && !(input.needEasy && c.id === 'easy');
  let swapAt = cards.length;
  if (cards.length >= max) {
    const at = cards.findLastIndex(swappable);
    swapAt = at === -1 ? cards.length : at;
  }
  const placeFor = (v: T): number => {
    if (cards.length < max && okWith(v, cards)) return cards.length;
    const without = (i: number) => cards.filter((_, k) => k !== i);
    if (swapAt < cards.length && okWith(v, without(swapAt))) return swapAt;
    const close = cards.map((c, i) => (diverse(v.primary, c.primary) ? -1 : i)).filter((i) => i !== -1);
    if (close.length === 1 && swappable(cards[close[0]!]!) && okWith(v, without(close[0]!))) return close[0]!;
    return -1;
  };
  const more: T[] = [];
  const moreAt: number[] = [];
  for (const id of STYLE_ORDER) {
    const shown = cards.findIndex((c) => c.id === id);
    for (const v of input.styles.get(id) ?? []) {
      if (cards.includes(v)) continue;
      // Another body area of a style on screen takes that card's place (one card per style).
      let at = shown === -1 ? placeFor(v) : swappable(cards[shown]!) && okWith(v, cards.filter((_, k) => k !== shown)) ? shown : -1;
      // 3.5d: and never put in as the first card.
      if (v.id === 'armsAbs' && at === 0) at = -1;
      if (at === -1 || (shown !== -1 && sameMuscles(v.primary, cards[shown]!.primary))) continue;
      more.push(v);
      moreAt.push(at);
      // One chip per style not on screen (its first variant that fits).
      if (shown === -1) break;
    }
  }
  return { cards, more, moreAt, swapAt };
}

const sameMuscles = (a: ReadonlySet<string>, b: ReadonlySet<string>) => a.size === b.size && [...a].every((x) => b.has(x));
