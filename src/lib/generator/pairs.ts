// Order, pairs: safe pairs of small moves (SPEC 22 rule 5).
import { canPair, heaviestOf, isCompound, type Unit } from '../order';
import type { Day, Item } from './types';

export const unitOf = (items: Item[]): Unit<Item[]> => ({ items: items.map((i) => i.profile), ref: items });

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
export function pairToFit(d: Day): boolean {
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
