// Time budget (PLAN 3.6, SPEC 7.4): "How much time today?" before a workout. Pure: no Dexie, no
// React, no JSON. The plan and its saved JSON are never changed: a trim is a small record of what
// this one workout leaves out (DayTrim), stored on the session, and applyTrim turns the plan's day
// into the trimmed day from it. Every estimate is the workout header's (plans.estimateDayMinutes).
//
// The trim order, exactly as SPEC 7.4 lists it, each step only while the day is still too long:
//   1. the stretches become one combined mobility block (done back to back, one set each, no rest);
//   2. accessory sets go down to 2, last in the day first;
//   3. the lowest priority accessories go, last in the day first;
//   then, only if the day still does not fit, later compounds, last first. The first two compound
//   lifts are never dropped, a pair stays whole (SPEC 22 rule 5), the day's order (order.ts) is kept,
//   and nothing is ever added. Warm ups and the finisher are left as the plan has them. Never fewer
//   than MIN_MOVES working moves. An exercise with sets logged is never dropped, and never set below
//   the sets it already has.

import { MIN_MOVES } from './generatorRules';
import { isCompound, type Profile } from './order';
import { isStretchName } from './planWorkout';
import { estimateDayMinutes, itemTarget, type Plan, type PlanBlock, type PlanDay } from './plans';

/** The chips (SPEC 7.4). 75 is "75+ min": the day as planned. */
export const BUDGETS = [20, 30, 45, 60, 75] as const;
export type Budget = (typeof BUDGETS)[number];
/** At or over this the day is never trimmed. */
export const AS_PLANNED = 75;
/** Accessory sets go down to this (SPEC 7.4). */
export const ACCESSORY_SETS = 2;

export const budgetLabel = (m: number): string => (m >= AS_PLANNED ? '75+ min' : `${m} min`);

/**
 * What one workout leaves out of its plan day, by plan exercise id (the slot). Additive on the
 * session; missing = the day as planned.
 */
export type DayTrim = {
  /** Blocks left out (a pair goes whole: every id of it is here). */
  drop: string[];
  /** New set count per exercise (a pair's items share one). */
  sets: Record<string, number>;
  /** The stretches combined into one mobility block, in day order. */
  mobility?: string[];
};

export type TrimChange =
  | { kind: 'mobility'; names: string[] }
  | { kind: 'sets'; names: string[]; from: number; to: number }
  | { kind: 'cut'; names: string[] };

export type TrimResult = {
  /** The estimate as planned. */
  before: number;
  /** The estimate after the trim. */
  minutes: number;
  /** The trimmed day fits the budget. */
  fits: boolean;
  /** null: nothing to change (the day already fits, or the budget is 75+). */
  trim: DayTrim | null;
  day: PlanDay;
  /** What changed, in day order within each kind (mobility, sets, cuts). */
  changes: TrimChange[];
};

export type TrimInput = {
  /** Minutes picked; 75 or more: as planned. */
  budget: number;
  weekIndex?: number;
  /** The ordering profile of a plan exercise (src/data/order.ts profileFor). */
  profileOf: (id: string, name: string) => Pick<Profile, 'role' | 'tier'>;
  /** Sets already logged per plan exercise (its slot): never dropped, never set below this. */
  logged?: Readonly<Record<string, number>>;
};

type Kind = 'compound' | 'accessory' | 'stretch' | 'other';

function kindOf(p: Pick<Profile, 'role' | 'tier'>, name: string): Kind {
  if (p.role === 'stretch') return 'stretch';
  if (p.role === 'lift' && isStretchName(name)) return 'stretch';
  if (p.role !== 'lift') return 'other';
  return isCompound(p) ? 'compound' : 'accessory';
}

const clone = (day: PlanDay): PlanDay => JSON.parse(JSON.stringify(day)) as PlanDay;

/** A block's sets this week (a pair: its rounds). */
const blockSets = (b: PlanBlock, weekIndex: number): number => Math.max(...b.items.map((it) => itemTarget(b, it, weekIndex).sets));

/** Sets a block becomes: every item of it, and the week's row of a weekly table item. */
function setBlockSets(b: PlanBlock, n: number): void {
  b.sets = n;
  for (const it of b.items) if (it.weeks?.length) it.weeks = it.weeks.map((w) => ({ ...w, sets: n }));
}

/**
 * The trimmed day: the plan's day with `trim` applied, for `weekIndex`. A weekly table item keeps only
 * this week's row (the trimmed day is only ever used for this one workout). Order is the day's own.
 */
export function applyTrim(day: PlanDay, trim: DayTrim | null | undefined, weekIndex = 0): PlanDay {
  if (!trim) return day;
  const out = clone(day);
  const drop = new Set(trim.drop);
  const mobility = new Set(trim.mobility ?? []);
  const blocks: PlanBlock[] = [];
  let merged: PlanBlock | null = null;
  for (const b of out.blocks) {
    if (b.items.some((it) => drop.has(it.exerciseId))) continue;
    for (const it of b.items) {
      if (!it.weeks?.length) continue;
      const row = it.weeks[Math.max(0, Math.min(it.weeks.length - 1, Math.floor(weekIndex)))]!;
      it.weeks = [row];
    }
    const set = b.items.map((it) => trim.sets[it.exerciseId]).find((n) => n !== undefined);
    if (set !== undefined) setBlockSets(b, set);
    if (b.items.length === 1 && mobility.has(b.items[0]!.exerciseId) && !b.warmup) {
      if (!merged) {
        merged = { kind: 'single', mobility: true, items: [], sets: 1, restSec: 0 };
        blocks.push(merged);
      }
      const it = b.items[0]!;
      if (it.weeks?.length) it.weeks = it.weeks.map((w) => ({ ...w, sets: 1 }));
      merged.items.push(it);
      merged.kind = merged.items.length > 1 ? 'pair' : 'single';
      continue;
    }
    blocks.push(b);
  }
  out.blocks = blocks;
  return out;
}

/** The plan with this workout's day trimmed (every other day as it is). */
export function trimmedPlan(plan: Plan, dayIndex: number, trim: DayTrim | null | undefined, weekIndex = 0): Plan {
  const day = plan.days[dayIndex];
  if (!trim || !day) return plan;
  return { ...plan, days: plan.days.map((d, i) => (i === dayIndex ? applyTrim(d, trim, weekIndex) : d)) };
}

const isEmpty = (t: DayTrim): boolean => !t.drop.length && !Object.keys(t.sets).length && !t.mobility?.length;

/**
 * Trims a plan day to the budget, the SPEC 7.4 way (see the top of this file). Deterministic: the same
 * day, budget and logged sets always give the same trim. When the day cannot fit, it is trimmed as far
 * as the rules allow and `fits` is false.
 */
export function trimDay(day: PlanDay, input: TrimInput): TrimResult {
  const weekIndex = input.weekIndex ?? 0;
  const logged = input.logged ?? {};
  const before = estimateDayMinutes(day, weekIndex);
  const none: TrimResult = { before, minutes: before, fits: before <= input.budget, trim: null, day, changes: [] };
  if (input.budget >= AS_PLANNED || before <= input.budget) return { ...none, fits: true };

  const trim: DayTrim = { drop: [], sets: {} };
  const est = () => estimateDayMinutes(applyTrim(day, trim, weekIndex), weekIndex);
  const over = () => est() > input.budget;
  const kinds = day.blocks.map((b) => b.items.map((it) => kindOf(input.profileOf(it.exerciseId, it.name), it.name)));
  const all = (bi: number, k: Kind) => !day.blocks[bi]!.warmup && kinds[bi]!.every((x) => x === k);
  const loggedIn = (b: PlanBlock) => Math.max(0, ...b.items.map((it) => logged[it.exerciseId] ?? 0));
  const order = day.blocks.map((_, i) => i).reverse();

  // 1. Stretches: one combined mobility block (kept only when it saves time).
  const stretches = day.blocks.flatMap((b, bi) => (b.items.length === 1 && all(bi, 'stretch') && loggedIn(b) <= 1 ? [b.items[0]!.exerciseId] : []));
  if (stretches.length > 1) {
    const was = est();
    trim.mobility = stretches;
    if (est() >= was) delete trim.mobility;
  }

  // 2. Accessory sets down to 2, last in the day first.
  for (const bi of order) {
    if (!over()) break;
    const b = day.blocks[bi]!;
    if (!all(bi, 'accessory')) continue;
    const now = blockSets(b, weekIndex);
    const to = Math.max(ACCESSORY_SETS, loggedIn(b));
    if (to < now) for (const it of b.items) trim.sets[it.exerciseId] = to;
  }

  // 3. The lowest priority accessories go, last in the day first; then later compounds, last first.
  const compounds = day.blocks.flatMap((b, bi) => (kinds[bi]!.includes('compound') && !b.warmup ? [bi] : []));
  const protectedBlocks = new Set(compounds.slice(0, 2));
  const working = () =>
    applyTrim(day, trim, weekIndex).blocks.filter((b) => !b.warmup && !b.mobility).reduce((n, b) => n + b.items.filter((it) => kindOf(input.profileOf(it.exerciseId, it.name), it.name) !== 'stretch').length, 0);
  // What step 2 set, so a block that comes back keeps it (never a third set back while anything is cut).
  const reduced: Record<string, number> = {};
  const cutOrder: number[] = [];
  const tryDrop = (bi: number) => {
    const b = day.blocks[bi]!;
    if (loggedIn(b) > 0 || protectedBlocks.has(bi)) return;
    const ids = b.items.map((it) => it.exerciseId);
    if (working() - ids.length < MIN_MOVES) return;
    trim.drop.push(...ids);
    for (const id of ids) {
      if (trim.sets[id] !== undefined) reduced[id] = trim.sets[id]!;
      delete trim.sets[id];
    }
    cutOrder.push(bi);
  };
  for (const bi of order) {
    if (!over()) break;
    if (all(bi, 'accessory')) tryDrop(bi);
  }
  for (const bi of order) {
    if (!over()) break;
    if (!day.blocks[bi]!.warmup && kinds[bi]!.includes('compound')) tryDrop(bi);
  }
  // The block cut last may have overshot: blocks come back in the reverse of the cut order, with the
  // sets step 2 gave them, while the day still fits; the first one that does not fit stays cut, and
  // so does everything cut before it (the cuts stay "last in the day first").
  for (const bi of [...cutOrder].reverse()) {
    const ids = new Set(day.blocks[bi]!.items.map((it) => it.exerciseId));
    const was = trim.drop;
    trim.drop = was.filter((id) => !ids.has(id));
    for (const id of ids) if (reduced[id] !== undefined) trim.sets[id] = reduced[id]!;
    if (!over()) continue;
    trim.drop = was;
    for (const id of ids) delete trim.sets[id];
    break;
  }
  trim.drop = day.blocks.flatMap((b) => b.items.map((it) => it.exerciseId)).filter((id) => trim.drop.includes(id));

  if (isEmpty(trim)) return none;
  const trimmed = applyTrim(day, trim, weekIndex);
  const minutes = estimateDayMinutes(trimmed, weekIndex);
  return { before, minutes, fits: minutes <= input.budget, trim, day: trimmed, changes: changesOf(day, trim, weekIndex) };
}

/** What a trim changes, in day order (mobility, then fewer sets, then cuts). */
export function changesOf(day: PlanDay, trim: DayTrim, weekIndex = 0): TrimChange[] {
  const out: TrimChange[] = [];
  const mob = new Set(trim.mobility ?? []);
  const drop = new Set(trim.drop);
  const items = day.blocks.flatMap((b) => b.items.map((it) => ({ b, it })));
  const mobility = items.filter(({ it }) => mob.has(it.exerciseId) && !drop.has(it.exerciseId)).map(({ it }) => it.name);
  if (mobility.length) out.push({ kind: 'mobility', names: mobility });
  for (const b of day.blocks) {
    const to = b.items.map((it) => trim.sets[it.exerciseId]).find((n) => n !== undefined);
    if (to === undefined || b.items.some((it) => drop.has(it.exerciseId))) continue;
    const from = blockSets(b, weekIndex);
    if (from === to) continue;
    const last = out[out.length - 1];
    if (last?.kind === 'sets' && last.from === from && last.to === to) last.names.push(...b.items.map((it) => it.name));
    else out.push({ kind: 'sets', names: b.items.map((it) => it.name), from, to });
  }
  const cut = items.filter(({ it }) => drop.has(it.exerciseId)).map(({ it }) => it.name);
  if (cut.length) out.push({ kind: 'cut', names: cut });
  return out;
}

const list = (names: readonly string[]): string => names.join(', ');

/** One plain line per change: "Cut: Wrist Twist, Calf Raise", "Fewer sets: Curl, Fly · 4 → 2". */
export function changeWords(changes: readonly TrimChange[]): string[] {
  return changes.map((c) => {
    if (c.kind === 'mobility') return `Stretches in one quick block: ${list(c.names)}`;
    if (c.kind === 'sets') return `Fewer sets: ${list(c.names)} · ${c.from} → ${c.to}`;
    return `Cut: ${list(c.names)}`;
  });
}

/** "Fits in ~42 min", or, when the rules cannot get it under the budget, the shortest it goes. */
export function fitWords(r: Pick<TrimResult, 'minutes' | 'fits'>): string {
  return r.fits ? `Fits in ~${r.minutes} min` : `Shortest it goes: ~${r.minutes} min`;
}

/**
 * The workout's exercise order after a trim changes (PLAN 3.6). `current`: the session's order now;
 * `slotOf` maps a row to its plan exercise and `currentOf` the other way (PLAN 3.4 swaps); `plan`:
 * the plan day's exercise ids in order. Blocks newly dropped leave; blocks no longer dropped come
 * back at their plan place; a new mobility block's stretches move together to the first one's place.
 * Rows added by hand stay where they are. Nothing else moves.
 */
export function idsForTrim(
  current: readonly string[],
  plan: readonly string[],
  prev: DayTrim | null | undefined,
  next: DayTrim | null | undefined,
  slotOf: (id: string) => string = (id) => id,
  currentOf: (slot: string) => string = (s) => s,
): string[] {
  const prevDrop = new Set(prev?.drop ?? []);
  const nextDrop = new Set(next?.drop ?? []);
  const at = (id: string) => plan.indexOf(slotOf(id));
  /** Puts a row back at its plan place: before the first plan row that comes after it. */
  const place = (ids: string[], id: string) => {
    const mine = at(id);
    const after = ids.findIndex((x) => at(x) > mine);
    if (after !== -1) return void ids.splice(after, 0, id);
    let lastPlan = -1;
    ids.forEach((x, i) => {
      if (at(x) !== -1) lastPlan = i;
    });
    ids.splice(lastPlan + 1, 0, id);
  };
  let ids = current.filter((id) => !nextDrop.has(slotOf(id)));
  for (const slot of plan.filter((s) => prevDrop.has(s) && !nextDrop.has(s))) {
    const id = currentOf(slot);
    if (!ids.includes(id)) place(ids, id);
  }
  const nextMob = new Set(next?.mobility ?? []);
  const prevMob = (prev?.mobility ?? []).map(currentOf).filter((id) => ids.includes(id));
  // Stretches no longer in one block go back to their plan places (the block's first stays put).
  const loose = prevMob.filter((id) => !nextMob.has(slotOf(id)));
  if (loose.length && prevMob.length > 1) {
    const anchor = [...prevMob].sort((a, b) => ids.indexOf(a) - ids.indexOf(b))[0]!;
    const moving = loose.filter((id) => id !== anchor).sort((a, b) => at(a) - at(b));
    ids = ids.filter((id) => !moving.includes(id));
    for (const id of moving) place(ids, id);
  }
  const mob = (next?.mobility ?? []).filter((s) => !nextDrop.has(s)).map(currentOf).filter((id) => ids.includes(id));
  if (mob.length > 1 && !mob.every((id) => prevMob.includes(id) && !loose.includes(id))) {
    const first = Math.min(...mob.map((id) => ids.indexOf(id)));
    const anchor = ids[first]!;
    const rest = ids.filter((id) => !mob.includes(id) || id === anchor);
    rest.splice(rest.indexOf(anchor), 1, ...mob.sort((a, b) => at(a) - at(b)));
    ids = rest;
  }
  return ids;
}
