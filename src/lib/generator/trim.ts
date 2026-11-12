// The day's minutes as the workout header estimates them, and SPEC 7.4's trim to the time picked.
import { isCompound, isHeavy } from '../order';
import { estimateDayMinutes, type PlanBlock, type PlanDay } from '../plans';
import { MIN_MOVES } from '../generatorRules';
import { warmUpBlock } from './finisher';
import { pairToFit } from './pairs';
import type { Day, Item } from './types';

export const blockOf = (u: Item[]): PlanBlock => ({
  kind: u.length > 1 ? 'pair' : 'single',
  items: u.map((it) => ({ exerciseId: it.id, name: it.id, ...(it.reps ? { reps: it.reps } : {}), ...(it.seconds ? { seconds: it.seconds } : {}) })),
  sets: Math.max(...u.map((it) => it.sets)),
  restSec: Math.max(...u.map((it) => it.rest)),
});

/** The day as the workout header estimates it (SPEC 7.4). */
export function minutesOf(d: Day): number {
  const blocks = [...(d.warmUp ? [warmUpBlock(d.warmUp)] : []), ...d.units.map(blockOf)];
  const day: PlanDay = { n: 1, name: d.name, blocks, ...(d.finisher ? { finisher: { name: d.finisher.name, minutes: d.finisher.minutes } } : {}) };
  return estimateDayMinutes(day);
}

export const moveCount = (d: Day) => d.units.reduce((n, u) => n + u.length, 0);

/**
 * SPEC 7.4's trim, until the day fits the time picked: shorter rest on small moves (SPEC 22 rule 6,
 * never on compounds), accessory sets down to 2 (focus sets last), then the lowest priority moves go,
 * last in the day first. Never the first two compound lifts, never under 3 moves.
 */
export function trim(d: Day, budget: number | undefined, pairs = false, compoundRestFloor?: number): void {
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
