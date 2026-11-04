// Which exercise an imported name is (PLAN 3.2, SPEC 9.3 and 4.3). Pure: the plan list, the
// hand written exercise map and the catalog names come in as data.
//
// A file name becomes, in this order and nothing looser:
//   1. a plan exercise with the same name (exact, or the same letters and digits), so "Last time"
//      and "Next" work; its catalog id and match kind come from data/exercise-map.json;
//   2. a catalog exercise with the same name. When exactly one plan exercise is mapped to that
//      catalog id as `exact` (same movement, same implement: SPEC 4.3) it is that plan exercise;
//      a `variant` or several plan exercises are not the same exercise, so it stays the catalog one;
//   3. otherwise nothing: the review asks, and the user may keep it by its own name (match none:
//      no demo, no muscles, never a guess).
import type { MapEntry, MatchKind } from '../catalog';
import type { ExerciseLoadType, PlanExercise } from '../loadTypeRule';
import type { BarId, ImportMapping } from '../../db/types';
import { mapPlanExercise, normalizeName } from './anygymImportV1';

export type CatalogName = { id: string; name: string };

export type MatchData = {
  planExercises: readonly PlanExercise[];
  map: readonly MapEntry[];
  catalog: readonly CatalogName[];
};

export type TargetSource = 'plan' | 'catalog' | 'name';

/** What an imported exercise is written as. `id` is the exercise id its sets are stored under. */
export type ImportTarget = {
  id: string;
  name: string;
  source: TargetSource;
  /** The plan's own load type ('unknown' off the plan) and bar, as PlanExercise has them. */
  loadType: ExerciseLoadType;
  bar?: BarId;
  catalogId: string | null;
  catalogName: string | null;
  match: MatchKind;
};

export type { ImportMapping };

/** Exercise ids for names kept as they are: "import:" plus the file's name. */
export const NAME_PREFIX = 'import:';
export const nameOnlyId = (name: string): string => `${NAME_PREFIX}${name.trim()}`;
export const nameOnlyOf = (id: string): string | undefined => (id.startsWith(NAME_PREFIX) && id.length > NAME_PREFIX.length ? id.slice(NAME_PREFIX.length) : undefined);

/** Review answers (ReviewChoices.picks) besides a plan id: a catalog exercise, or keep the file's name. */
export const CATALOG_PICK = 'catalog:';
export const KEEP_NAME = 'keep-name';
export const catalogPick = (catalogId: string): string => `${CATALOG_PICK}${catalogId}`;

export function planTarget(plan: PlanExercise, data: MatchData): ImportTarget {
  const entry = data.map.find((m) => m.planId === plan.id);
  const catalogId = entry && entry.match !== 'none' ? entry.catalogId : null;
  const catalogName = catalogId ? (data.catalog.find((c) => c.id === catalogId)?.name ?? null) : null;
  const t: ImportTarget = {
    id: plan.id,
    name: plan.name,
    source: 'plan',
    loadType: plan.loadType,
    catalogId: catalogName ? catalogId : null,
    catalogName,
    match: catalogName && entry ? entry.match : 'none',
  };
  if (plan.bar) t.bar = plan.bar;
  return t;
}

export function catalogTarget(catalogId: string, data: MatchData): ImportTarget | undefined {
  const c = data.catalog.find((x) => x.id === catalogId);
  if (!c) return undefined;
  return { id: c.id, name: c.name, source: 'catalog', loadType: 'unknown', catalogId: c.id, catalogName: c.name, match: 'exact' };
}

export function nameTarget(name: string): ImportTarget {
  return { id: nameOnlyId(name), name: name.trim(), source: 'name', loadType: 'unknown', catalogId: null, catalogName: null, match: 'none' };
}

/** The one catalog exercise with this name (exact, then same letters and digits); two alike: none. */
function catalogByName(name: string, data: MatchData): CatalogName | undefined {
  const exact = data.catalog.filter((c) => c.name === name);
  if (exact.length === 1) return exact[0];
  const n = normalizeName(name);
  if (!n) return undefined;
  const same = data.catalog.filter((c) => normalizeName(c.name) === n);
  return same.length === 1 ? same[0] : undefined;
}

/** What the app matches by itself for the file's names (planExercise first, then name); undefined asks. */
export function autoTarget(names: readonly string[], data: MatchData): ImportTarget | undefined {
  const list = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  for (const name of list) {
    const plan = mapPlanExercise(name, data.planExercises);
    if (plan) return planTarget(plan, data);
    const cat = catalogByName(name, data);
    if (cat) {
      const exact = data.map.filter((m) => m.match === 'exact' && m.catalogId === cat.id);
      const only = exact.length === 1 ? data.planExercises.find((p) => p.id === exact[0]!.planId) : undefined;
      return only ? planTarget(only, data) : catalogTarget(cat.id, data);
    }
  }
  return undefined;
}

/** The target for a review answer; undefined for skip, an unknown id or no answer. */
export function pickedTarget(pick: string | undefined, fileName: string, data: MatchData): ImportTarget | undefined {
  if (!pick) return undefined;
  if (pick === KEEP_NAME) return nameTarget(fileName);
  if (pick.startsWith(CATALOG_PICK)) return catalogTarget(pick.slice(CATALOG_PICK.length), data);
  const plan = data.planExercises.find((p) => p.id === pick);
  return plan ? planTarget(plan, data) : undefined;
}

/** The review's quiet line: "Matched: Leg Press" (a variant says so), else "Not in the catalog yet". */
export function matchLine(t: Pick<ImportTarget, 'catalogName' | 'match'>): string {
  if (!t.catalogName || t.match === 'none') return 'Not in the catalog yet';
  return t.match === 'variant' ? `Matched: ${t.catalogName} (a close variant)` : `Matched: ${t.catalogName}`;
}
