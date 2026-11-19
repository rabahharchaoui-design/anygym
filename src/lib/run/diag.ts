// The run diagnostics log (PLAN 4.4d (2)): every position the phone reported during a run, with
// what the run did with it, so a run that felt wrong can be replayed exactly (tests/fixtures/gps).
// Pure: the engine records, src/db/runDiag.ts keeps, the run detail screen exports. It never leaves
// the phone unless G exports it, and it is not in a backup (it is large and only for diagnosis).
//
// Size: one entry is seven numbers, about 50 bytes as JSON. A 2 hour run at one fix a second is
// 7200 entries, about 360 KB; the log stops at MAX_DIAG_ENTRIES (4 hours) and only the last
// KEEP_DIAG_RUNS runs keep theirs, so the whole log stays under about 4 MB.
import { addPoint, type RawPoint, type TrackerEvent, type TrackerState } from '../gps';

/** What happened to a reported position, or what else the watch did. */
export const DIAG_FATES = [
  'kept',
  'held:paused',
  'held:still',
  'rejected:no-time',
  'rejected:time-backwards',
  'rejected:bad-position',
  'rejected:accuracy',
  'rejected:speed',
  'rejected:jump',
  'error:denied',
  'error:unavailable',
  'watch:restarted',
  'watch:replay-dropped',
  'before-run',
  'held:short',
  'held:checking',
  'held:settling',
] as const;
export type DiagFate = (typeof DIAG_FATES)[number];

/** One entry: [ms since the run started (arrival), stamp minus arrival in ms, lat, lng, accuracy m, speed m/s or null, fate, distance frozen by stillness 1/0]. */
export type DiagEntry = [number, number, number | null, number | null, number | null, number | null, number, 0 | 1];

export const DIAG_FIELDS = ['t', 'lag', 'lat', 'lng', 'accuracy', 'speed', 'fate', 'still'] as const;

/** Four hours at one fix a second. Past it the log stops (`truncated`); the run goes on. */
export const MAX_DIAG_ENTRIES = 14_400;

/** Only the newest runs keep a log. */
export const KEEP_DIAG_RUNS = 5;

export const DIAG_FORMAT = 'anygym-run-diag-v1';

const round = (n: number | null | undefined, digits: number): number | null => (typeof n === 'number' && Number.isFinite(n) ? Math.round(n * 10 ** digits) / 10 ** digits : null);

/** The fate of a reported position from the tracker's event for it. */
export function fateOf(event: TrackerEvent): DiagFate {
  if (event.type === 'recorded') return 'kept';
  if (event.type === 'held') return `held:${event.reason}`;
  return `rejected:${event.reason}`;
}

/** What the run will do with a position (the same judgement liveStep makes), for the log. */
export const fixFate = (tracker: TrackerState, point: RawPoint): DiagFate => fateOf(addPoint(tracker, point).event);

export type RawFix = { lat: number | null; lng: number | null; accuracy: number | null; speed: number | null; stamp: number | null };

/**
 * One entry. `startedAt`: the run's start; `arrival`: when the position reached the app; `tracker`:
 * the state after it (whether standing froze the distance).
 */
export function diagEntry(startedAt: number, arrival: number, fix: RawFix, fate: DiagFate, tracker: Pick<TrackerState, 'still'> | null): DiagEntry {
  const lag = typeof fix.stamp === 'number' && Number.isFinite(fix.stamp) ? Math.round(fix.stamp - arrival) : 0;
  return [Math.round(arrival - startedAt), lag, round(fix.lat, 7), round(fix.lng, 7), round(fix.accuracy, 1), round(fix.speed, 2), DIAG_FATES.indexOf(fate), tracker?.still ? 1 : 0];
}

/** An event with no position (a watch error, a restart). */
export const diagNote = (startedAt: number, arrival: number, fate: DiagFate): DiagEntry => [Math.round(arrival - startedAt), 0, null, null, null, null, DIAG_FATES.indexOf(fate), 0];

export type DiagDocument = {
  format: typeof DIAG_FORMAT;
  runId: string;
  startedAt: number;
  fields: typeof DIAG_FIELDS;
  fates: typeof DIAG_FATES;
  truncated: boolean;
  entries: DiagEntry[];
};

/** The export: the whole log of one run as JSON text. */
export function diagDocument(runId: string, startedAt: number, entries: readonly DiagEntry[]): string {
  const doc: DiagDocument = { format: DIAG_FORMAT, runId, startedAt, fields: DIAG_FIELDS, fates: DIAG_FATES, truncated: entries.length >= MAX_DIAG_ENTRIES, entries: entries.slice(0, MAX_DIAG_ENTRIES) };
  return JSON.stringify(doc);
}

/** A reported position read back from an export: stamp and arrival in ms, what it said. */
export type DiagFix = { stamp: number; arrival: number; lat: number; lng: number; accuracy: number; speed: number | null; fate: string };

/** The positions of an export, in the order they arrived. Null when the text is no diagnostics export. */
export function parseDiag(text: string): { runId: string; startedAt: number; fixes: DiagFix[] } | null {
  try {
    const doc = JSON.parse(text) as Partial<DiagDocument>;
    if (doc.format !== DIAG_FORMAT || typeof doc.startedAt !== 'number' || !Array.isArray(doc.entries)) return null;
    const fates = Array.isArray(doc.fates) ? doc.fates : DIAG_FATES;
    const fixes: DiagFix[] = [];
    for (const e of doc.entries) {
      const [t, lag, lat, lng, accuracy, speed, fate] = e;
      if (typeof lat !== 'number' || typeof lng !== 'number' || typeof accuracy !== 'number') continue;
      const name = String(fates[fate] ?? 'unknown');
      if (name === 'before-run' || name.startsWith('watch:')) continue;
      const arrival = doc.startedAt + t;
      fixes.push({ stamp: arrival + lag, arrival, lat, lng, accuracy, speed, fate: name });
    }
    return { runId: String(doc.runId ?? ''), startedAt: doc.startedAt, fixes };
  } catch {
    return null;
  }
}

/** The file name of an export: the run's start, to the second. */
export function diagFileName(startedAt: number): string {
  const d = new Date(startedAt);
  const p = (n: number) => String(n).padStart(2, '0');
  return `AnyGym-run-diagnostics-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.json`;
}
