// PLAN 3.6k (audit A4, SPEC 0 rule 4): which exercise photos to keep for offline. Only the current
// plan's exercises (and the picks "Always use this" made for it), never the whole catalog. Only sure
// demos: `demoOf` is the app's one eligibility lookup (data/exerciseInfo.ts demoFor), so an exercise
// that shows "Demo coming soon" is never downloaded. Pure: plan and lookups in, paths out.
import type { DemoImages } from './exerciseInfo';
import type { Plan } from './plans';

export type PhotoFormat = 'webp' | 'jpg';

/** Every exercise id the plan's days hold, Day 1 first, each once; then the extra ids (swap picks). */
export function planExerciseIds(plan: Pick<Plan, 'days'> | undefined, extra: Iterable<string> = []): string[] {
  const ids = new Set<string>();
  if (!plan) return [];
  for (const day of plan.days) for (const block of day.blocks) for (const item of block.items) ids.add(item.exerciseId);
  for (const id of extra) ids.add(id);
  return [...ids];
}

/**
 * The photo paths (relative to the app base, as the catalog lists them: ex/<id>/0.webp) of these
 * exercises' sure demos, in one format, start frame then end frame, each path once.
 */
export function planPhotoPaths(ids: readonly string[], demoOf: (id: string) => DemoImages | null, format: PhotoFormat = 'webp'): string[] {
  const out = new Set<string>();
  for (const id of ids) {
    const demo = demoOf(id);
    if (!demo) continue;
    for (const p of demo[format]) if (p) out.add(p);
  }
  return [...out];
}

/** The "Always use this" picks saved for one plan (exerciseSettings rows), in slot order. */
export function alwaysPicksFor(planId: string, rows: readonly { alwaysUse?: Record<string, string> }[]): string[] {
  const out: string[] = [];
  for (const r of rows) {
    const pick = r.alwaysUse?.[planId];
    if (pick) out.push(pick);
  }
  return out;
}
