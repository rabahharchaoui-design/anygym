// Pure checks for the exercise catalog and the plan to catalog map (SPEC 4.3). No I/O here, so the
// build script and the tests share one definition of "valid".

export type MatchKind = 'exact' | 'variant' | 'none';

export interface MapEntry {
  planId: string;
  name: string;
  match: MatchKind;
  catalogId: string | null;
  reason: string;
  cue?: string;
}

/** Catalog ids become folder names under public/ex/, so keep them to a safe alphabet. */
export const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

/** Problems with the map; an empty list means it is valid. */
export function validateExerciseMap(map: MapEntry[], planIds: string[], catalogIds: Set<string>): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const e of map) {
    if (seen.has(e.planId)) problems.push(`duplicate entry ${e.planId}`);
    seen.add(e.planId);
    if (!['exact', 'variant', 'none'].includes(e.match)) problems.push(`${e.planId}: bad match ${e.match}`);
    if (!e.reason || !e.reason.trim()) problems.push(`${e.planId}: missing reason`);
    if (e.match === 'none') {
      if (e.catalogId !== null) problems.push(`${e.planId}: none must not have a catalog id`);
      if (e.cue) problems.push(`${e.planId}: none must not have a cue`);
    } else {
      if (!e.catalogId || !catalogIds.has(e.catalogId)) problems.push(`${e.planId}: unknown catalog id ${e.catalogId}`);
      if (e.match === 'variant' && !e.cue?.trim()) problems.push(`${e.planId}: variant needs a cue`);
      if (e.match === 'exact' && e.cue) problems.push(`${e.planId}: exact must not have a cue`);
    }
  }
  for (const id of planIds) if (!seen.has(id)) problems.push(`no entry for plan exercise ${id}`);
  for (const id of seen) if (!planIds.includes(id)) problems.push(`entry for unknown plan exercise ${id}`);
  return problems;
}

/** Catalog ids the app needs: every mapped target plus the pattern ladder candidates. */
export function selectedCatalogIds(map: MapEntry[], ladder: Record<string, string[]>): string[] {
  const ids = new Set<string>();
  for (const e of map) if (e.catalogId) ids.add(e.catalogId);
  for (const list of Object.values(ladder)) for (const id of list) ids.add(id);
  return [...ids].sort();
}
