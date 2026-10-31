// What the exercise sheet shows (SPEC 4.4) for one plan exercise, decided by the plan to catalog
// match (SPEC 4.3). Pure, so the sheet, the workout block and the tests share one definition:
// match none gets no photos and no muscle map, only text cues the plan itself gives.
import type { MapEntry } from './catalog';
import type { MuscleMapData } from './muscles';

export interface Cue {
  text: string;
  /** Source instruction lines (0 based) in data/catalog.json this cue was condensed from. */
  from: number[];
}

export interface CueEntry {
  cues: Cue[];
  watchOut?: Cue;
  goodFor: string;
}

export interface CueFile {
  exercises: Record<string, CueEntry>;
}

export interface DemoImages {
  /** Start and end position, in order. Paths relative to the app base (ex/<id>/0.webp). */
  webp: [string, string];
  jpg: [string, string];
}

export interface ExerciseInfo {
  match: MapEntry['match'] | 'unknown';
  /** The two photo demo; null means the honest "Demo coming soon" state. */
  demo: DemoImages | null;
  muscles: MuscleMapData | null;
  /** The "How to" lines: catalog cues, or for match none only the plan's own notes. */
  cues: string[];
  /** A variant's difference from the photos (exercise-map.json `cue`), shown first. */
  variantNote: string | null;
  watchOut: string | null;
  goodFor: string | null;
}

export interface CatalogImages {
  id: string;
  instructions: string[];
  images: { jpg: string[]; webp: string[] };
}

export const MAX_CUE_WORDS = 11;
export const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

const pair = (list: string[] | undefined): [string, string] | null => (list && list.length >= 2 ? [list[0]!, list[1]!] : null);

/** The sheet's content for a plan exercise. `planNotes` are the plan's own lines (never guessed). */
export function exerciseInfo(
  entry: MapEntry | undefined,
  catalog: CatalogImages | undefined,
  cues: CueEntry | undefined,
  muscles: MuscleMapData | null,
  planNotes: string[] = [],
): ExerciseInfo {
  const notes = planNotes.map((n) => n.trim()).filter(Boolean);
  const sure = !!entry && entry.match !== 'none' && !!entry.catalogId && !!catalog && catalog.id === entry.catalogId;
  if (!sure) {
    return { match: entry?.match ?? 'unknown', demo: null, muscles: null, cues: notes, variantNote: null, watchOut: null, goodFor: null };
  }
  const webp = pair(catalog.images.webp);
  const jpg = pair(catalog.images.jpg);
  return {
    match: entry.match,
    demo: webp && jpg ? { webp, jpg } : null,
    muscles,
    cues: (cues?.cues ?? []).slice(0, 3).map((c) => c.text),
    variantNote: entry.match === 'variant' ? (entry.cue ?? null) : null,
    watchOut: cues?.watchOut?.text ?? null,
    goodFor: cues?.goodFor ?? null,
  };
}

/** The one line the collapsed workout block shows: a variant's difference first, else the first cue. */
export function firstLine(info: ExerciseInfo): string | null {
  return info.variantNote ?? info.cues[0] ?? null;
}

/** Problems with the cue file against the catalog and the map; an empty list means it is valid. */
export function validateCues(file: CueFile, map: MapEntry[], catalog: Map<string, CatalogImages>): string[] {
  const problems: string[] = [];
  const check = (id: string, c: Cue, what: string) => {
    const lines = catalog.get(id)?.instructions ?? [];
    if (wordCount(c.text) > MAX_CUE_WORDS) problems.push(`${id} ${what}: ${wordCount(c.text)} words`);
    if (!Array.isArray(c.from) || c.from.length === 0) problems.push(`${id} ${what}: no source lines`);
    for (const i of c.from ?? []) if (!Number.isInteger(i) || i < 0 || i >= lines.length) problems.push(`${id} ${what}: line ${i} not in source`);
  };
  for (const [id, e] of Object.entries(file.exercises)) {
    if (!catalog.has(id)) problems.push(`${id}: not in catalog`);
    if (e.cues.length < 1 || e.cues.length > 3) problems.push(`${id}: ${e.cues.length} cues`);
    e.cues.forEach((c, i) => check(id, c, `cue ${i}`));
    if (e.watchOut) check(id, e.watchOut, 'watch out');
    if (!e.goodFor?.trim()) problems.push(`${id}: missing good for`);
  }
  for (const m of map) if (m.match !== 'none' && m.catalogId && !file.exercises[m.catalogId]) problems.push(`${m.planId}: no cues for ${m.catalogId}`);
  return problems;
}
