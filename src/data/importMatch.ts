// The committed data the import matches names against (PLAN 3.2): plan exercises, the hand
// written exercise map (SPEC 4.3) and the catalog's names. Also the one name lookup for any
// exercise id an import can write (plan id, catalog id or "import:<file name>").
import catalog from '../../data/catalog.json';
import { nameOnlyOf, type CatalogName, type MatchData } from '../lib/import/exerciseMatch';
import { EXERCISE_MAP } from './muscles';
import { PLAN_EXERCISES, planExercise } from './planExercises';
import { approvedCandidate } from './candidateGate';

export const CATALOG_NAMES: readonly CatalogName[] = (catalog as { exercises: CatalogName[] }).exercises.map(({ id, name }) => ({ id, name }));

const CATALOG_BY_ID = new Map(CATALOG_NAMES.map((c) => [c.id, c.name]));

export const MATCH_DATA: MatchData = { planExercises: PLAN_EXERCISES, map: EXERCISE_MAP, catalog: CATALOG_NAMES };

/** The plain name for an exercise id: the plan's, the catalog's (or an approved candidate's, PLAN 3.5e), or an imported name kept as is. */
export function exerciseNameOf(id: string): string | undefined {
  return planExercise(id)?.name ?? CATALOG_BY_ID.get(id) ?? approvedCandidate(id)?.name ?? nameOnlyOf(id);
}
