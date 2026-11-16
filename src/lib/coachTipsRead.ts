// Coach tips (PLAN 3.4a, SPEC 22): the shared parts of the checks: the tip's shape, how a plan day is
// read (lift blocks, hard sets, upper or lower), the words, and the transforms Apply uses. Pure.
import type { Plan, PlanBlock, PlanDay } from './plans';
import { itemTarget } from './plans';
import { isCompound, orderUnits, type Muscle, type Profile } from './order';

export const TIP_IDS = ['hinge', 'stretch', 'rest', 'pair', 'freq', 'core'] as const;
export type TipId = (typeof TIP_IDS)[number];

export type Tip = {
  id: TipId;
  /** One plain line: what is off. */
  title: string;
  /** One plain line: why, and what Apply does. */
  why: string;
  /** The days it touches (day numbers). */
  days: number[];
  /** What Apply changes, exactly, when one line is not enough ("Dumbbell Bench Press → Day 5"). */
  detail?: string[];
};

export type ProfileOf = (id: string) => Profile;

/** Heavy lifts rest this long once tuned (SPEC 22 rule 6: 2 to 3 min). */
export const HEAVY_REST_SEC = 150;
/** A muscle's day counts as a session with at least this many hard sets on it. */
export const SESSION_SETS = 4;
/** A tuned core block keeps this many exercises. */
export const CORE_KEEP = 3;
/** Sets a frequency tip adds for a muscle on another day (SPEC 22: 3 to 4). */
export const FREQ_SETS = 3;

export const UPPER: ReadonlySet<Muscle> = new Set<Muscle>(['chest', 'back', 'front delts', 'side delts', 'rear delts', 'biceps', 'triceps', 'traps', 'forearms']);
export const LOWER: ReadonlySet<Muscle> = new Set<Muscle>(['quads', 'glutes', 'hamstrings', 'calves', 'adductors', 'abductors', 'lower back']);

// ---------------------------------------------------------------- reading a day

export const itemsOf = (b: PlanBlock, profile: ProfileOf) => b.items.map((it) => profile(it.exerciseId));
export const isLiftBlock = (b: PlanBlock, profile: ProfileOf) => !b.warmup && itemsOf(b, profile).some((p) => p.role === 'lift');
export const isCoreBlock = (b: PlanBlock, profile: ProfileOf) => isLiftBlock(b, profile) && itemsOf(b, profile).every((p) => p.role !== 'lift' || (p.tier === 3 && p.targets.includes('abs')));
export const isStaticStretch = (b: PlanBlock, profile: ProfileOf) => itemsOf(b, profile).every((p) => p.role === 'stretch');
/** Lifts that are not the abs block (the day's real work). */
export const isMainLift = (b: PlanBlock, profile: ProfileOf) => isLiftBlock(b, profile) && !isCoreBlock(b, profile);

/** Hard sets per muscle on a day (week 1): working sets of lifts, counted on their targets. */
export function hardSets(day: PlanDay, profile: ProfileOf): Map<Muscle, number> {
  const out = new Map<Muscle, number>();
  for (const b of day.blocks) {
    if (b.warmup) continue;
    for (const it of b.items) {
      const p = profile(it.exerciseId);
      if (p.role !== 'lift') continue;
      const sets = itemTarget(b, it, 0).sets;
      for (const m of p.targets) out.set(m, (out.get(m) ?? 0) + sets);
    }
  }
  return out;
}

export const totalSets = (sets: Map<Muscle, number>) => [...sets.values()].reduce((a, n) => a + n, 0);

/** Upper, lower or neither, by where most of the day's hard sets go. */
export function halfOf(day: PlanDay, profile: ProfileOf): 'upper' | 'lower' | null {
  const sets = hardSets(day, profile);
  let up = 0;
  let low = 0;
  for (const [m, n] of sets) {
    if (UPPER.has(m)) up += n;
    if (LOWER.has(m)) low += n;
  }
  return up > low ? 'upper' : low > up ? 'lower' : null;
}

export const listWords = (words: string[]) => (words.length <= 1 ? (words[0] ?? '') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`);
export const dayWords = (days: number[]) => (days.length === 1 ? `Day ${days[0]}` : `Days ${listWords(days.map(String))}`);
export const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;

export type Found = { tip: Tip; apply: (plan: Plan) => Plan };

// ---------------------------------------------------------------- transforms

export function mapDays(plan: Plan, days: readonly number[], f: (day: PlanDay) => PlanDay): Plan {
  return { ...plan, days: plan.days.map((d) => (days.includes(d.n) ? f(d) : d)) };
}

/** The day's main lifts in SPEC 22 order (order.ts), in the slots they had; everything else stays put. */
export function reorderLifts(day: PlanDay, profile: ProfileOf, focus: Muscle | null): PlanDay {
  const slots = day.blocks.map((b, i) => (isMainLift(b, profile) ? i : -1)).filter((i) => i >= 0);
  const ordered = orderUnits(
    slots.map((i) => ({ items: itemsOf(day.blocks[i]!, profile), ref: day.blocks[i]! })),
    focus ? { focus: [focus] } : {},
  );
  const blocks = [...day.blocks];
  slots.forEach((slot, k) => (blocks[slot] = ordered[k]!.ref));
  return { ...day, blocks };
}

/** A lift goes after the last compound before the day's first isolation (or after its first lift). */
export function insertLift(day: PlanDay, block: PlanBlock, profile: ProfileOf): PlanDay {
  const blocks = [...day.blocks];
  const firstIso = blocks.findIndex((b) => isMainLift(b, profile) && !itemsOf(b, profile).some(isCompound));
  const end = firstIso === -1 ? blocks.length : firstIso;
  let at = -1;
  for (let i = 0; i < end; i++) if (isMainLift(blocks[i]!, profile)) at = i;
  if (at === -1) at = blocks.findIndex((b) => isMainLift(b, profile));
  blocks.splice(at + 1, 0, block);
  return { ...day, blocks };
}
