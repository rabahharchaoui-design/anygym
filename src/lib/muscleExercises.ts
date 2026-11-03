// Exercises for a tapped muscle (PLAN 2.2c, SPEC 4.5). Pure: the list is built from the same
// resolveMuscles() the map draws with (same region table, same shoulder overrides), so a muscle
// lights up primary on an exercise's map exactly when that exercise is listed under it.
import type { Region } from './bodyArt';
import type { MapEntry } from './catalog';
import type { Plan } from './plans';
import { resolveMuscles, type CatalogMuscles, type MuscleOverrides } from './muscles';

export interface NamedCatalogMuscles extends CatalogMuscles {
  name: string;
}

export interface MuscleExercise {
  id: string;
  name: string;
  /** "Also works triceps +1": the first secondary muscle plus how many more (gate P6), null when none. */
  also: string | null;
  /** In the user's current plan (an exact or variant match of one of its exercises). */
  inPlan: boolean;
}

/**
 * Catalog exercises that work `region` as a primary muscle: the plan's first, then A to Z.
 * Exercises without sure muscles (resolveMuscles null) are never listed.
 */
export function exercisesForRegion(
  region: Region,
  catalog: readonly NamedCatalogMuscles[],
  overrides: MuscleOverrides,
  planIds: ReadonlySet<string> = new Set(),
): MuscleExercise[] {
  const out: MuscleExercise[] = [];
  for (const e of catalog) {
    const data = resolveMuscles(e, overrides);
    if (!data || !data.primary.some((t) => t.regions.includes(region))) continue;
    const labels = [...new Set(data.secondary.map((t) => t.label))];
    const also = labels.length ? `Also works ${labels[0]}${labels.length > 1 ? ` +${labels.length - 1}` : ''}` : null;
    out.push({ id: e.id, name: e.name, also, inPlan: planIds.has(e.id) });
  }
  return out.sort((a, b) => Number(b.inPlan) - Number(a.inPlan) || a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
}

/** Catalog ids of a plan's exercises, through the plan to catalog map (match none has no id, so it never counts). */
export function planCatalogIds(plan: Pick<Plan, 'days'> | undefined, map: readonly MapEntry[]): Set<string> {
  const ids = new Set<string>();
  if (!plan) return ids;
  const byPlanId = new Map(map.map((m) => [m.planId, m]));
  for (const day of plan.days)
    for (const block of day.blocks)
      for (const item of block.items) {
        const m = byPlanId.get(item.exerciseId);
        if (m && m.match !== 'none' && m.catalogId) ids.add(m.catalogId);
      }
  return ids;
}

/** The link under a tapped muscle: "12 exercises", "1 exercise", or just "Exercises" for none. */
export function exercisesLinkText(count: number): string {
  if (count === 0) return 'Exercises';
  return `${count} ${count === 1 ? 'exercise' : 'exercises'}`;
}
