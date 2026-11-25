// PLAN D0 (SPEC 9.4): which exercises show a demo photo. G's hand review decides: a catalog id shows its
// demo unless it is in src/data/demoHidden.json. Before D0 the tests read data/exercise-map.json and
// data/catalog-demos.json (exact and variant only); that old rule no longer holds.
import { readFileSync } from 'node:fs';

const hidden = new Set((JSON.parse(readFileSync('src/data/demoHidden.json', 'utf8')) as { hidden: string[] }).hidden);
const catalogIds = new Set((JSON.parse(readFileSync('data/catalog.json', 'utf8')) as { exercises: { id: string }[] }).exercises.map((e) => e.id));
const planToCatalog = new Map((JSON.parse(readFileSync('data/exercise-map.json', 'utf8')) as { planId: string; catalogId: string | null }[]).map((e) => [e.planId, e.catalogId]));

/** True when this catalog id shows its demo photos (in the catalog and not hidden by the review). */
export const catalogDemoShown = (catalogId: string): boolean => catalogIds.has(catalogId) && !hidden.has(catalogId);

/** True when a plan id or a catalog id shows a demo photo in the app. */
export function sureDemo(id: string): boolean {
  if (catalogIds.has(id)) return catalogDemoShown(id);
  const catalogId = planToCatalog.get(id);
  return !!catalogId && catalogDemoShown(catalogId);
}
