// Fresh muscles (competitor gap 4): which muscles were worked recently, from logged sets only.
// No recovery science is claimed: it only says how long ago a logged working set last worked a
// muscle as a main muscle.
import { REGION_NAMES, type Region } from '../bodyArt';
import { DAY_MS } from './time';

export type FreshBand = 'day' | 'two' | 'three';

/**
 * THE RULE (stated here, tested): a region is shaded by the time since a logged working set last
 * worked it as a PRIMARY muscle (sure muscles only, SPEC 4.3): under 24 hours 'day', 24 to under 48
 * hours 'two', 48 to under 72 hours 'three'. 72 hours or more, or never: not shaded. Warm ups,
 * drops and exercises without sure muscles count for nothing.
 */
export const FRESH_HOURS: Readonly<Record<FreshBand, readonly [number, number]>> = { day: [0, 24], two: [24, 48], three: [48, 72] };

/** The legend, in plain words (no recovery claims). */
export const FRESH_LABELS: Record<FreshBand, string> = { day: 'Under 24 h', two: '1 to 2 days', three: '2 to 3 days' };

/**
 * `names`: the exercise's own word for a shape that stands for more than one muscle (the front delt
 * shape is the side delts too: "front delts" after an overhead press, PLAN 4.6a 5).
 */
export type TrainedSet = { at: number; regions: readonly Region[]; names?: Partial<Record<Region, string>> };

/** The band one region falls in for a set `ageMs` old, or null when it is 72 h or more. */
export function bandOf(ageMs: number): FreshBand | null {
  const h = Math.max(0, ageMs) / (DAY_MS / 24);
  for (const band of ['day', 'two', 'three'] as const) if (h < FRESH_HOURS[band][1]) return band;
  return null;
}

/** Each region's band from its most recent logged working set. */
export function freshBands(sets: readonly TrainedSet[], now: number): Partial<Record<Region, FreshBand>> {
  const latest = new Map<Region, number>();
  for (const s of sets) for (const r of s.regions) latest.set(r, Math.max(latest.get(r) ?? -Infinity, s.at));
  const out: Partial<Record<Region, FreshBand>> = {};
  for (const [r, at] of latest) {
    const b = bandOf(now - at);
    if (b) out[r] = b;
  }
  return out;
}

/**
 * The muscles worked lately in words, each with its band, by the same rule as freshBands: a shape
 * is named the way the exercise that worked it names it, never a muscle it did not train.
 */
export function freshNames(sets: readonly TrainedSet[], now: number): Array<{ name: string; band: FreshBand }> {
  const latest = new Map<string, number>();
  for (const s of sets)
    for (const r of s.regions) {
      const name = s.names?.[r] ?? REGION_NAMES[r].toLowerCase();
      latest.set(name, Math.max(latest.get(name) ?? -Infinity, s.at));
    }
  const out: Array<{ name: string; band: FreshBand }> = [];
  for (const [name, at] of latest) {
    const band = bandOf(now - at);
    if (band) out.push({ name, band });
  }
  return out;
}
