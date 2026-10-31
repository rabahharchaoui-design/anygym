// Exercise sheet lookups (SPEC 4.4) over the committed catalog, plan map and cue file.
import catalog from '../../data/catalog.json';
import cueFile from '../../data/exercise-cues.json';
import { exerciseInfo, type CatalogImages, type CueFile, type ExerciseInfo } from '../lib/exerciseInfo';
import { EXERCISE_MAP, musclesForCatalog, musclesForPlan } from './muscles';

const CUES = cueFile as CueFile;
const CATALOG = new Map((catalog as { exercises: CatalogImages[] }).exercises.map((e) => [e.id, e]));
const PLAN = new Map(EXERCISE_MAP.map((e) => [e.planId, e]));

/** The sheet for a plan exercise (by plan id); notes are the plan's own lines for match none. */
export function infoForPlan(planId: string, notes: string[] = []): ExerciseInfo {
  const entry = PLAN.get(planId);
  const cat = entry?.catalogId ? CATALOG.get(entry.catalogId) : undefined;
  const cues = entry?.catalogId ? CUES.exercises[entry.catalogId] : undefined;
  return exerciseInfo(entry, cat, cues, musclesForPlan(planId), notes);
}

/** Image paths are relative to the app base (/anygym/ on Pages). */
export const assetUrl = (path: string) => `${import.meta.env.BASE_URL}${path}`;

export const CATALOG_SHA = (catalog as { source: { sha: string } }).source.sha;

/** The sheet content for a bare catalog exercise (the Review screen): photos, muscles, cues if written. */
export function infoForCatalog(id: string): ExerciseInfo {
  const cat = CATALOG.get(id);
  const entry = { planId: id, name: id, match: 'exact' as const, catalogId: id, reason: 'review' };
  return exerciseInfo(entry, cat, CUES.exercises[id], musclesForCatalog(id));
}
