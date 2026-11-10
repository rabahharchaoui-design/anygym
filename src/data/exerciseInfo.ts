// Exercise sheet lookups (SPEC 4.4) over the committed catalog, plan map and cue file.
import catalog from '../../data/catalog.json';
import cueFile from '../../data/exercise-cues.json';
import catalogDemos from '../../data/catalog-demos.json';
import { catalogInfo, eligibleDemos, exerciseInfo, type CatalogImages, type CueFile, type ExerciseInfo } from '../lib/exerciseInfo';
import type { MatchKind } from '../lib/catalog';
import { EXERCISE_MAP, musclesForCatalog, musclesForPlan } from './muscles';
import { approvedCandidate, isApprovedCandidate, onApprovedChange } from './candidateGate';

const CUES = cueFile as CueFile;
const CATALOG = new Map((catalog as { exercises: CatalogImages[] }).exercises.map((e) => [e.id, e]));
const PLAN = new Map(EXERCISE_MAP.map((e) => [e.planId, e]));

/**
 * The one photo eligibility lookup (SPEC 4.3, audit 2.5): a catalog id may show its photos only when
 * a plan entry maps to it as exact or variant. The map already holds the audit's verdicts (the three
 * downgraded entries are match none), so a rejected or unaudited id is "none". PLAN 3.5a round 2:
 * plus catalog only swap candidates whose photos were checked by hand (data/catalog-demos.json).
 * PLAN 3.5e: plus a candidate move G approved on this phone (src/data/candidateGate.ts), never another.
 */
const ELIGIBLE = eligibleDemos(EXERCISE_MAP, (catalogDemos as { exercises: { catalogId: string }[] }).exercises, new Set(CATALOG.keys()));
export function photoEligibility(catalogId: string | null | undefined): MatchKind {
  if (!catalogId) return 'none';
  return ELIGIBLE.get(catalogId) ?? (isApprovedCandidate(catalogId) ? 'exact' : 'none');
}

/** A catalog exercise, or a candidate G approved on this phone (PLAN 3.5e). */
const catalogOf = (id: string): CatalogImages | undefined => CATALOG.get(id) ?? approvedCandidate(id);
const inCatalog = (id: string): boolean => CATALOG.has(id) || isApprovedCandidate(id);

/** The sheet for a plan exercise (by plan id); notes are the plan's own lines for match none. */
export function infoForPlan(planId: string, notes: string[] = []): ExerciseInfo {
  const entry = PLAN.get(planId);
  const cat = entry?.catalogId ? CATALOG.get(entry.catalogId) : undefined;
  const cues = entry?.catalogId ? CUES.exercises[entry.catalogId] : undefined;
  const info = exerciseInfo(entry, cat, cues, musclesForPlan(planId), notes);
  return info.demo && photoEligibility(entry?.catalogId) === 'none' ? { ...info, demo: null } : info;
}

const DEMOS = new Map<string, ExerciseInfo['demo']>();
// An approval changes which photos are sure: worked out again from then on.
onApprovedChange(() => DEMOS.clear());
/**
 * Only the sure demo photos of a plan exercise, worked out once per exercise (round 3: the day list
 * asks for every row on each render, and the same object keeps the photo hooks stable).
 */
export function demoForPlan(planId: string): ExerciseInfo['demo'] {
  if (!DEMOS.has(planId)) DEMOS.set(planId, infoForPlan(planId).demo);
  return DEMOS.get(planId) ?? null;
}

/**
 * The sheet for any exercise id a workout can hold (PLAN 3.4): a plan exercise's, or a bare catalog
 * exercise's (a swap candidate), photos only when eligible either way. Its own notes when it has no cues.
 */
export function infoForExercise(id: string, notes: string[] = []): ExerciseInfo {
  if (PLAN.has(id) || !inCatalog(id)) return infoForPlan(id, notes);
  const info = infoForCatalog(id);
  return info.cues.length ? info : { ...info, cues: notes.map((n) => n.trim()).filter(Boolean) };
}

/** infoForExercise's sure photos, one object per exercise like demoForPlan. */
export function demoFor(id: string): ExerciseInfo['demo'] {
  if (PLAN.has(id) || !inCatalog(id)) return demoForPlan(id);
  if (!DEMOS.has(id)) DEMOS.set(id, infoForCatalog(id).demo);
  return DEMOS.get(id) ?? null;
}

/** Image paths are relative to the app base (/anygym/ on Pages). */
export const assetUrl = (path: string) => `${import.meta.env.BASE_URL}${path}`;

export const CATALOG_SHA = (catalog as { source: { sha: string } }).source.sha;

/** The public sheet for a bare catalog exercise (muscle lists): photos only when eligible. */
export function infoForCatalog(id: string): ExerciseInfo {
  return catalogInfo(photoEligibility(id), catalogOf(id), CUES.exercises[id], musclesForCatalog(id));
}

/** Owner preview (Review, SPEC 9.4 only): every catalog photo, including audit rejects, to inspect them. */
export function ownerPreviewForCatalog(id: string): ExerciseInfo {
  return catalogInfo('exact', CATALOG.get(id), CUES.exercises[id], musclesForCatalog(id));
}
