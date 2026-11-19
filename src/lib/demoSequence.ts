// PLAN D1 (G, Nov 19): some exercises show a 3 or 4 frame sequence instead of the catalog's two
// photos (lunges, walking lunges, butterfly, dead bug, dumbbell curl, dumbbell flyes). A sequence is
// declared per exercise in data/demo-sequences.json with ONE source record, and is accepted only
// when every frame comes from that one licensed source and shows the same person and setup. Every
// other exercise keeps its two frames exactly as before. Pure: the app (src/data/exerciseInfo.ts)
// and the tests share one definition. A refused sequence is never shown with a hole or a guess:
// that exercise gets the honest empty state (no bad data, SPEC 4.3).
import type { DemoImages, Frames } from './exerciseInfo';

export const SEQUENCE_FORMAT = 'anygym-demo-sequences-v1';
/** A sequence has 3 or 4 frames; 2 is the catalog pair and needs no declaration. */
export const SEQUENCE_FRAMES = [3, 4] as const;
export const MAX_DEMO_FRAMES = 4;

/** D1's licence rule: public domain, CC0 or CC BY only (never NC, ND or SA). */
export const SEQUENCE_LICENSES = ['Public domain', 'CC0 1.0', 'CC BY 2.0', 'CC BY 2.5', 'CC BY 3.0', 'CC BY 4.0'] as const;
/** D1: sources that are never used, whatever a page says. */
const BANNED_HOSTS = ['wger', 'exercisedb', 'musclewiki', 'bodybuilding.com'];

/** Where a sequence comes from (D1: author, title, file URL and licence URL, credited in Settings). */
export interface DemoSource {
  author: string;
  title: string;
  /** The source file every frame was taken from (no hotlinking: the frames are saved in public/ex/). */
  fileUrl: string;
  licenseUrl: string;
  license: (typeof SEQUENCE_LICENSES)[number];
}

export interface DemoSequence {
  frames: 3 | 4;
  source: DemoSource;
  /** The person who checked the frames confirms they show the same person and the same setup. */
  samePersonAndSetup: true;
}

/** Each declared id: its accepted sequence, or the plain reason it was refused. */
export type SequenceEntry = { ok: true; sequence: DemoSequence } | { ok: false; reason: string };

const text = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const https = (v: unknown): v is string => {
  if (!text(v)) return false;
  try {
    return new URL(v).protocol === 'https:';
  } catch {
    return false;
  }
};

/** Why one declared sequence cannot be shown, or null when it is sound. */
function problem(raw: unknown): string | null {
  const s = raw as { frames?: unknown; source?: unknown; samePersonAndSetup?: unknown } | null;
  if (!s || typeof s !== 'object') return 'not an object';
  if (!SEQUENCE_FRAMES.includes(s.frames as 3 | 4)) return `frames must be 3 or 4, got ${String(s.frames)}`;
  const src = s.source as Partial<Record<keyof DemoSource, unknown>> | undefined;
  if (!src || typeof src !== 'object' || Array.isArray(src)) return 'no single source record';
  if (!text(src.author)) return 'source has no author';
  if (!text(src.title)) return 'source has no title';
  if (!https(src.fileUrl)) return 'source has no https file URL';
  if (!https(src.licenseUrl)) return 'source has no https licence URL';
  if (!SEQUENCE_LICENSES.includes(src.license as DemoSource['license'])) return `licence ${String(src.license)} is not public domain, CC0 or CC BY`;
  const host = new URL(src.fileUrl).hostname.toLowerCase();
  if (BANNED_HOSTS.some((b) => host.includes(b))) return `source ${host} is never used`;
  if (s.samePersonAndSetup !== true) return 'frames not confirmed as the same person and setup';
  return null;
}

/**
 * Reads data/demo-sequences.json. A file of another format is refused whole (throws). Each declared
 * id is then judged on its own: an id not in the catalog, or a sequence without one complete
 * licensed source record, is refused with its reason (and shows no demo at all).
 */
export function parseDemoSequences(raw: unknown, catalogIds: ReadonlySet<string>): Map<string, SequenceEntry> {
  const file = raw as { format?: unknown; sequences?: unknown } | null;
  if (!file || typeof file !== 'object' || file.format !== SEQUENCE_FORMAT) throw new Error(`Demo sequences refused: format is not ${SEQUENCE_FORMAT}.`);
  if (!file.sequences || typeof file.sequences !== 'object' || Array.isArray(file.sequences)) throw new Error('Demo sequences refused: no sequences object.');
  const out = new Map<string, SequenceEntry>();
  for (const [id, s] of Object.entries(file.sequences as Record<string, unknown>)) {
    const why = !catalogIds.has(id) ? 'not in the catalog' : problem(s);
    out.set(id, why ? { ok: false, reason: `${id}: ${why}` } : { ok: true, sequence: s as DemoSequence });
  }
  return out;
}

/** The frame files of a sequence, in order: ex/<id>/0.webp ... and their JPG twins. */
export function sequencePaths(id: string, frames: 3 | 4): DemoImages {
  const at = (ext: string) => Array.from({ length: frames }, (_, i) => `ex/${id}/${i}.${ext}`) as unknown as Frames;
  return { webp: at('webp'), jpg: at('jpg') };
}

/**
 * The table the build ships (vite.config.ts reads data/demo-sequences.json with parseDemoSequences,
 * so the checks above never reach the phone): `id:frames;id:frames`, 0 for a refused sequence.
 */
export function encodeSequences(entries: ReadonlyMap<string, SequenceEntry>): string {
  return [...entries].sort(([a], [b]) => (a < b ? -1 : 1)).map(([id, e]) => `${id}:${e.ok ? e.sequence.frames : 0}`).join(';');
}

/** Reads the build's table back: id to its frame count (0: refused, show no demo). */
export function decodeSequences(table: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const entry of table ? table.split(';') : []) {
    const [id, n] = entry.split(':');
    if (id) out.set(id, n === '3' || n === '4' ? Number(n) : 0);
  }
  return out;
}

/**
 * The demo an exercise shows. `base` is its sure catalog pair (null: hidden or unsure, and a
 * sequence never brings a hidden demo back). `frames` is its declared sequence from the build's
 * table: none keeps the pair, unchanged. A refused declaration (0), or a sequence with any frame
 * file missing (`exists` is the build's file table): null, never a sequence with a hole and never
 * the pair alone.
 */
export function demoWithSequence(id: string, base: DemoImages | null, frames: number | undefined, exists: (path: string) => boolean): DemoImages | null {
  if (!base || frames === undefined) return base;
  if (frames !== 3 && frames !== 4) return null;
  const paths = sequencePaths(id, frames);
  return [...paths.webp, ...paths.jpg].every(exists) ? paths : null;
}

/** How many frames a demo has (2 to 4). */
export const frameCount = (demo: DemoImages): number => Math.min(demo.webp.length, demo.jpg.length, MAX_DEMO_FRAMES);
