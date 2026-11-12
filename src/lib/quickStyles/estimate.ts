// The one estimate, and the density (G's counts) of a card.
import type { Range } from '../generatorRules';
import { estimateDayMinutes, type PlanDay } from '../plans';

// ---------------------------------------------------------------- the one estimate

export type DayRow = { id: string; name: string; sets: number; reps?: Range | number; seconds?: Range | number; restSec: number; group?: number };

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
