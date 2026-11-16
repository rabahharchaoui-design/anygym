// The load kinds an exercise can be (PLAN 3.7a): its catalog equipment through lib/loadKinds.ts.
// A catalog id answers for itself; a plan exercise through its exact catalog match only (a
// variant may use other gear). Anything else (custom, imported, no exact match) keeps every kind.
import catalog from '../../data/catalog.json';
import { allowedLoadKinds, type LoadKind } from '../lib/loadKinds';
import { EXERCISE_MAP } from './muscles';
import { exerciseNameOf } from './importMatch';

const EQUIPMENT = new Map((catalog as { exercises: Array<{ id: string; equipment?: string | null }> }).exercises.map((c) => [c.id, c.equipment ?? null]));
const EXACT = new Map(EXERCISE_MAP.filter((e) => e.match === 'exact' && e.catalogId).map((e) => [e.planId, e.catalogId as string]));

/** The catalog's equipment for an exercise id, or null when the app does not know it for sure. */
export function equipmentOf(id: string): string | null {
  return EQUIPMENT.get(id) ?? EQUIPMENT.get(EXACT.get(id) ?? '') ?? null;
}

/** The answers "How do you load this?" may offer for this exercise, most likely first. Never empty. */
export function loadKindsOf(id: string): readonly LoadKind[] {
  return allowedLoadKinds(equipmentOf(id), exerciseNameOf(id) ?? '');
}

/** The one load kind the equipment allows, when there is exactly one (the question is skipped), else undefined. */
export function onlyLoadKind(id: string): LoadKind | undefined {
  const kinds = loadKindsOf(id);
  return kinds.length === 1 ? kinds[0] : undefined;
}
