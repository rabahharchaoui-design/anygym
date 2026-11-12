// Filling a short day's time (PLAN 3.5j): small moves at its end, denser days, one more set.
import { isCompound } from '../order';
import type { Pattern } from '../swap';
import type { Slot } from '../generatorRules';
import { pairUp, splitUnequalPairs } from './pairs';
import { makeItem, pickFrom } from './pick';
import { prescribe, setCap } from './prescribe';
import { minutesOf, moveCount } from './trim';
import type { Ctx, Day } from './types';

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
export function addMoves(ctx: Ctx, d: Day, slots: readonly Slot[], budget: number | undefined): void {
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
export function densify(ctx: Ctx, d: Day, slots: readonly Slot[], budget: number | undefined): void {
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
export function fillUp(ctx: Ctx, d: Day, budget: number | undefined): void {
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
