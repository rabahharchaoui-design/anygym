// History import, format "anygym-import-v1" (SPEC 9.3). Pure: reads and checks the file, keeps
// every number exactly as written and invents nothing (no dates, no weights, no load types).
//
// The file: { format, owner, unit, source, conventions, exercises }. `exercises` is a list (a
// keyed object is read in key order too) of { name, planExercise, loadType, note?, gymNote?,
// sessions }. Each session is { sets, note? }, oldest first; there are no dates. Each set is
// { reps, weight?, unit?, plates?, warmup?, uncertain?, why?, note?, split?, dropTo? }.
//
// Out: one ImportedSession per exercise session, in file order (importSeq 1, 2, 3...), each set
// marked uncertain with a reason when the file says so, or when a weighted exercise has no weight.
import type { SetKind, Unit } from '../../db/types';

export const IMPORT_FORMAT = 'anygym-import-v1';

/** How the file says a weight is meant (its `conventions.loadTypes`). Anything else reads as unknown. */
export const FILE_LOAD_TYPES = [
  'dumbbell_each',
  'single_weight',
  'stack',
  'barbell_per_side',
  'smith_per_side',
  'plate_machine_per_side',
  'fixed_bar_total',
  'held_weight',
  'bodyweight',
  'unknown',
] as const;
export type FileLoadType = (typeof FILE_LOAD_TYPES)[number];

export const NO_WEIGHT = 'No weight in the file';
export const MARKED_UNSURE = 'Marked unsure in the file';

export type ImportedSet = {
  kind: SetKind;
  reps: number;
  /** The file's number, as written. Missing = reps only. */
  weight?: number;
  /** Plates on one side, when the file lists them. */
  plates?: number[];
  unit: Unit;
  loadType: FileLoadType;
  note?: string;
  uncertain: boolean;
  reason?: string;
};

export type ImportedSession = {
  imported: true;
  /** 1 based position in the file: the only order there is (no dates, SPEC 9.3). */
  importSeq: number;
  exerciseIndex: number;
  /** 0 based, oldest first within its exercise. */
  sessionIndex: number;
  planExercise: string;
  /** The exercise's own name in the file. */
  name: string;
  loadType: FileLoadType;
  note?: string;
  sets: ImportedSet[];
  /** Content hash: the same session imported twice is written once. */
  hash: string;
};

export type ImportedExercise = {
  index: number;
  planExercise: string;
  name: string;
  loadType: FileLoadType;
  note?: string;
  gymNote?: string;
};

export type ImportIssue = { where: string; problem: string };

export type ParsedImport = {
  ok: true;
  unit: Unit;
  exercises: ImportedExercise[];
  sessions: ImportedSession[];
  issues: ImportIssue[];
};

export type ParseFailure = { ok: false; error: string };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const count = (v: unknown): number | undefined => (typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : undefined);
const weightOf = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined);
const unitOf = (v: unknown): Unit | undefined => (v === 'lb' || v === 'kg' ? v : undefined);

export const NOT_OURS = 'This is not an AnyGym history file.';

/** Reads the file text. A file that is not this format fails with one plain sentence. */
export function parseImportText(text: string): ParsedImport | ParseFailure {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: NOT_OURS };
  }
  return parseImport(data);
}

export function parseImport(data: unknown): ParsedImport | ParseFailure {
  if (!isObj(data) || data.format !== IMPORT_FORMAT) return { ok: false, error: NOT_OURS };
  const unit = unitOf(data.unit);
  if (!unit) return { ok: false, error: 'The file does not say lb or kg.' };
  const raw = data.exercises;
  const list: Array<[string | undefined, unknown]> = Array.isArray(raw)
    ? raw.map((e) => [undefined, e])
    : isObj(raw)
      ? Object.entries(raw)
      : [];
  if (list.length === 0) return { ok: false, error: 'The file has no exercises.' };

  const issues: ImportIssue[] = [];
  const exercises: ImportedExercise[] = [];
  const sessions: ImportedSession[] = [];
  list.forEach(([key, e], index) => {
    const where = `Exercise ${index + 1}`;
    if (!isObj(e)) return void issues.push({ where, problem: 'Not readable' });
    const planExercise = str(e.planExercise) ?? str(e.name) ?? str(key);
    if (!planExercise) return void issues.push({ where, problem: 'No exercise name' });
    const name = str(e.name) ?? planExercise;
    const loadType = (FILE_LOAD_TYPES as readonly string[]).includes(e.loadType as string) ? (e.loadType as FileLoadType) : 'unknown';
    if (e.loadType !== undefined && loadType === 'unknown' && e.loadType !== 'unknown') issues.push({ where, problem: 'Load type not known: asked on import' });
    const ex: ImportedExercise = { index, planExercise, name, loadType };
    if (str(e.note)) ex.note = str(e.note);
    if (str(e.gymNote)) ex.gymNote = str(e.gymNote);
    exercises.push(ex);
    const rawSessions = Array.isArray(e.sessions) ? e.sessions : [];
    rawSessions.forEach((s, sessionIndex) => {
      const sWhere = `${where}, session ${sessionIndex + 1}`;
      const rawSets = Array.isArray(s) ? s : isObj(s) && Array.isArray(s.sets) ? s.sets : undefined;
      if (!rawSets) return void issues.push({ where: sWhere, problem: 'No sets' });
      const sets: ImportedSet[] = [];
      rawSets.forEach((x, i) => {
        const read = readSet(x, unit, loadType);
        if (!read) return void issues.push({ where: `${sWhere}, set ${i + 1}`, problem: 'No reps: left out' });
        sets.push(...read);
      });
      if (sets.length === 0) return;
      const session: ImportedSession = {
        imported: true,
        importSeq: sessions.length + 1,
        exerciseIndex: index,
        sessionIndex,
        planExercise,
        name,
        loadType,
        sets,
        hash: '',
      };
      if (isObj(s) && str(s.note)) session.note = str(s.note);
      session.hash = contentHash({ p: planExercise, i: sessionIndex, t: loadType, u: unit, s: sets });
      sessions.push(session);
    });
  });
  return { ok: true, unit, exercises, sessions, issues };
}

/** One file set, plus its drop set when it has one. undefined when it has no reps. */
function readSet(x: unknown, fileUnit: Unit, loadType: FileLoadType): ImportedSet[] | undefined {
  if (!isObj(x)) return undefined;
  const reps = count(x.reps);
  if (reps === undefined) return undefined;
  const unit = unitOf(x.unit) ?? fileUnit;
  const set: ImportedSet = { kind: x.warmup === true ? 'warmup' : 'work', reps, unit, loadType, uncertain: false };
  const weight = weightOf(x.weight);
  if (weight !== undefined) set.weight = weight;
  if (Array.isArray(x.plates) && x.plates.length > 0 && x.plates.every((p) => weightOf(p) !== undefined && p > 0)) set.plates = [...(x.plates as number[])];
  const notes = [str(x.note), str(x.split)].filter(Boolean);
  if (notes.length) set.note = notes.join(' · ');
  if (x.uncertain === true) {
    set.uncertain = true;
    set.reason = str(x.why) ?? MARKED_UNSURE;
  } else if (weight === undefined && loadType !== 'bodyweight') {
    set.uncertain = true;
    set.reason = NO_WEIGHT;
  }
  const out = [set];
  if (isObj(x.dropTo)) {
    const dReps = count(x.dropTo.reps);
    if (dReps !== undefined) {
      const drop: ImportedSet = { kind: 'drop', reps: dReps, unit: unitOf(x.dropTo.unit) ?? unit, loadType, uncertain: set.uncertain };
      const dWeight = weightOf(x.dropTo.weight);
      if (dWeight !== undefined) drop.weight = dWeight;
      if (set.reason) drop.reason = set.reason;
      if (dWeight === undefined && loadType !== 'bodyweight') {
        drop.uncertain = true;
        drop.reason = NO_WEIGHT;
      }
      out.push(drop);
    }
  }
  return out;
}

/** Every set in the file (drop sets count as their own set), for the summary and the tests. */
export const setsIn = (sessions: readonly ImportedSession[]): number => sessions.reduce((n, s) => n + s.sets.length, 0);

// ---------------------------------------------------------------- exercise names

/** Lower case letters and digits only: "Lat Pull-Down" and "lat pulldown" match. */
export const normalizeName = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]+/g, '');

/** The plan exercise for a file name: exact name first, then the normalized match. Nothing looser. */
export function mapPlanExercise<T extends { id: string; name: string }>(name: string, list: readonly T[]): T | undefined {
  const exact = list.find((e) => e.name === name);
  if (exact) return exact;
  const n = normalizeName(name);
  return n ? list.find((e) => normalizeName(e.name) === n) : undefined;
}

// ---------------------------------------------------------------- hash

/** Stable JSON: object keys sorted, so the same content always hashes the same. */
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (isObj(v)) return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  return JSON.stringify(v) ?? 'null';
}

/** 64 bit FNV-1a (two 32 bit lanes) as 16 hex characters. Not for security; for "seen this before". */
export function contentHash(v: unknown): string {
  const text = canonical(v);
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x01000193 + 0x100) >>> 0;
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}
