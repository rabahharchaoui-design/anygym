// Backup files (SPEC 9.1, 9.2): pure building, parsing and checking. No database here
// (src/db/backup.ts reads and writes). Records are copied as they are stored: no unit conversion,
// no rounding, numbers go through JSON unchanged (finite doubles round trip exactly).
//
// submissions, tombstones and journal are transient (one Log set write, one Undo window, one Log
// set write that did not commit, PLAN 1.7i: a failed Log kept only in IndexedDB). They are in a
// backup only when it holds a workout in progress, so restoring a backup made mid workout puts the
// workout back exactly as it was; otherwise they are left out (empty arrays). The same goes for
// `drafts`: the sets being entered in a workout in progress (lib/drafts.ts, kept in localStorage),
// stored per workout and exercise with their ids, revisions, submission markers and stopwatches.
import type { DumbbellRange, ExerciseSetting, Gym, JournalEntry, OrderCounter, Plan, PlanDay, PlanState, Profile, Run, Session, Submission, Tombstone, WorkoutSet } from '../db/types';
import { RENAMED_PLAN_IDS, SCHEMA_VERSION } from '../db/schema';
import type { DraftsBlob } from './drafts';
import { validDumbbellRange } from './load';

export const BACKUP_FORMAT = 'anygym-backup-v1';

export type BackupTables = {
  profile: Profile[];
  gyms: Gym[];
  plans: Plan[];
  planDays: PlanDay[];
  sessions: Session[];
  sets: WorkoutSet[];
  runs: Run[];
  exerciseSettings: ExerciseSetting[];
  planState: PlanState[];
  orderCounters: OrderCounter[];
  submissions: Submission[];
  tombstones: Tombstone[];
  journal: JournalEntry[];
};

export type TableName = keyof BackupTables;

/** Every table a backup carries, in write order. */
export const TABLE_NAMES: readonly TableName[] = ['profile', 'gyms', 'plans', 'planDays', 'sessions', 'sets', 'runs', 'exerciseSettings', 'planState', 'orderCounters', 'submissions', 'tombstones', 'journal'];

export type Backup = {
  format: typeof BACKUP_FORMAT;
  appVersion: string;
  schemaVersion: number;
  exportedAt: number;
  tables: BackupTables;
  /** sessionId → exerciseId → draft, only for workouts in progress. */
  drafts: BackupDrafts;
};

export type BackupDrafts = DraftsBlob;

export const NOT_A_BACKUP = 'This file is not an AnyGym backup.';
export const NEWER_VERSION = 'This backup is from a newer version. Update AnyGym, then try again.';
export const DAMAGED = 'This backup is damaged. Nothing was changed.';

export type ParseResult = { ok: true; backup: Backup } | { ok: false; error: string };

/** A workout in progress: started, not ended, not imported (same rule as getActiveSession). */
export const isActiveSession = (s: Pick<Session, 'endedAt' | 'imported'>): boolean => s.endedAt === undefined && !s.imported;

/** Builds the backup object from the stored tables. Transient tables only with a workout in progress. */
export function buildBackup(tables: BackupTables, drafts: BackupDrafts, appVersion: string, exportedAt: number): Backup {
  const activeIds = new Set(tables.sessions.filter(isActiveSession).map((s) => s.id));
  const active = activeIds.size > 0;
  return {
    format: BACKUP_FORMAT,
    appVersion,
    schemaVersion: SCHEMA_VERSION,
    exportedAt,
    tables: {
      ...tables,
      submissions: active ? tables.submissions : [],
      tombstones: active ? tables.tombstones : [],
      journal: active ? tables.journal.filter((j) => activeIds.has(j.sessionId)) : [],
    },
    drafts: Object.fromEntries(Object.entries(drafts).filter(([id, d]) => activeIds.has(id) && Object.keys(d).length > 0)),
  };
}

export const serializeBackup = (backup: Backup): string => JSON.stringify(backup);

/** anygym-backup-YYYY-MM-DD.json, in the phone's local date. */
export function backupFileName(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `anygym-backup-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`;
}

// ---- checking ----
// Table driven: each record type lists its required fields and, when present, its optional ones.
// A backup with one record that does not match is refused before anything on the phone changes.

type Rec = Record<string, unknown>;
type Check = (v: unknown) => boolean;
const isObj = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const str: Check = (v) => typeof v === 'string';
const num: Check = (v) => typeof v === 'number' && Number.isFinite(v);
const bool: Check = (v) => typeof v === 'boolean';
const oneOf = (...xs: unknown[]): Check => (v) => xs.includes(v);
const orNull = (c: Check): Check => (v) => v === null || c(v);
const listOf = (c: Check): Check => (v) => Array.isArray(v) && v.every(c);
const recordOf = (c: Check): Check => (v) => isObj(v) && Object.values(v).every(c);
const tuple = (...cs: Check[]): Check => (v) => Array.isArray(v) && v.length === cs.length && cs.every((c, i) => c(v[i]));

type Shape = { req: Record<string, Check>; opt?: Record<string, Check> };
const shape = ({ req, opt = {} }: Shape): Check => (v) =>
  isObj(v) && Object.entries(req).every(([k, c]) => c(v[k])) && Object.entries(opt).every(([k, c]) => v[k] === undefined || c(v[k]));

const unit = oneOf('lb', 'kg');
const LOAD_KINDS = ['barbell', 'dumbbell_each', 'single', 'stack', 'plate_machine', 'bodyweight', 'timed'] as const;
const BAR_IDS = ['olympic', 'womens', 'ez_curl', 'trap', 'smith'] as const;

/** A stored load (SPEC 5.5): kind, unit and a numeric total; every other number numeric when there. */
export const isLoad = shape({
  req: { kind: oneOf(...LOAD_KINDS), unit, total: num },
  opt: { barWeight: num, barId: oneOf(...BAR_IDS), perSide: listOf(num), collars: num, stackValue: num, added: num },
});

const isSet = shape({
  req: { id: str, sessionId: str, exerciseId: str, order: num, kind: oneOf('warmup', 'work', 'drop'), uncertain: bool },
  opt: { reps: num, seconds: num, load: isLoad, rpe: num, note: str, failure: bool },
});

/** A dumbbell range that makes sense (positive step, min ≥ 0, max ≥ min, a bounded list): never a frozen picker. */
const dumbbellRange: Check = (v) => shape({ req: { min: num, max: num, step: num } })(v) && validDumbbellRange(v as DumbbellRange);

const bars = shape({ req: Object.fromEntries(BAR_IDS.map((b) => [b, orNull(num)])) });

/** What every stored record must look like, per table. Exported for the tests. */
export const RECORD_CHECKS: Record<TableName, Check> = {
  profile: shape({
    req: { id: str, defaultUnit: unit, createdAt: num },
    opt: { name: str, goal: str, level: str, daysPerWeek: num, lastBackupAt: num, backupSnoozeUntil: num },
  }),
  gyms: shape({
    req: {
      id: str,
      name: str,
      type: oneOf('full', 'hotel', 'home', 'none'),
      unit,
      equipment: listOf(str),
      dumbbellRange: orNull(dumbbellRange),
      bars,
      stackStep: num,
      equipmentWeights: recordOf(shape({ req: { kind: oneOf('plates_only', 'starting_resistance', 'stack_step', 'bar_weight'), value: orNull(num) } })),
      plateInventory: listOf(shape({ req: { weight: num, enabled: bool } })),
      collars: oneOf('none', 'competition'),
      plateColors: oneOf('black', 'color'),
      isActive: bool,
      createdAt: num,
    },
  }),
  plans: shape({ req: { id: str, name: str, source: oneOf('curated', 'generated'), createdAt: num } }),
  planDays: shape({ req: { id: str, planId: str, order: num, name: str } }),
  sessions: shape({
    req: { id: str, gymId: str, startedAt: num, imported: bool },
    opt: { planId: str, dayId: str, endedAt: num, timeBudgetMin: num, importSeq: num, importHash: str, note: str, exerciseIds: listOf(str), weekIndex: num },
  }),
  sets: isSet,
  runs: shape({
    req: { id: str, startedAt: num, type: str, movingSec: num, elapsedSec: num, distanceM: num, points: listOf(tuple(num, num, num, num)), gaps: listOf(tuple(num, num)), splits: listOf(num) },
    opt: { endedAt: num, goal: str, city: str, country: str, ghostOfRunId: str, intervalPreset: str },
  }),
  exerciseSettings: shape({ req: { exerciseId: str, gymId: str }, opt: { loadType: oneOf(...LOAD_KINDS), barId: oneOf(...BAR_IDS), restSec: num, note: str } }),
  planState: shape({
    req: { id: oneOf('active'), planId: str, startedAt: num, weekIndex: num, nextDayIndex: num, doneDays: listOf(num) },
    opt: { partial: recordOf(num) },
  }),
  orderCounters: shape({ req: { sessionId: str, next: num } }),
  submissions: shape({ req: { id: str, sessionId: str, exerciseId: str, rev: num } }),
  tombstones: shape({ req: { id: str, sessionId: str, set: isSet, expiresAt: num }, opt: { undo: bool } }),
  // A pending Log set write (PLAN 1.7i): its id, draft key, revision and every value of the row.
  journal: (v) => shape({ req: { id: str, sessionId: str, exerciseId: str, key: str, rev: num, draft: isDraft, at: num } })(v) && (v as Rec).id === ((v as Rec).draft as Rec).id,
};

/** A pending set draft (lib/drafts.ts): ids, revisions, submission marker and stopwatch kept as they are. */
export const isDraft = shape({
  req: { id: str, load: orNull(isLoad) },
  opt: {
    plates: listOf(num),
    reps: num,
    seconds: num,
    type: oneOf('normal', 'warmup', 'drop', 'failure'),
    watch: shape({ req: { startedAt: orNull(num), accumulated: num } }),
    rev: num,
    submitted: num,
    unit,
  },
});

/** The schema version each table first appeared in (db/schema.ts). */
export const TABLE_SINCE: Record<TableName, number> = {
  profile: 1,
  gyms: 1,
  plans: 1,
  planDays: 1,
  sessions: 1,
  sets: 1,
  runs: 1,
  exerciseSettings: 2,
  planState: 3,
  orderCounters: 4,
  submissions: 6,
  tombstones: 6,
  journal: 8,
};

/** The primary key of a record, as a string, so duplicates can be found. */
export function keyOf(table: TableName, r: Rec): string {
  if (table === 'exerciseSettings') return `${String(r.exerciseId)}\u0000${String(r.gymId)}`;
  if (table === 'orderCounters') return String(r.sessionId);
  return String(r.id);
}

/**
 * Tables that did not exist in an older schema start empty, and data written before a version's
 * upgrade gets that upgrade (the same rules as the Dexie upgraders in db/schema.ts):
 * v2 exerciseSettings, v3 planState, v4 orderCounters, v5 renamed plan ids, v6 submissions and tombstones,
 * v8 journal.
 */
export function upgradeTables(raw: Partial<Record<TableName, Rec[]>>, fromVersion: number): Record<TableName, Rec[]> {
  const out = {} as Record<TableName, Rec[]>;
  for (const t of TABLE_NAMES) out[t] = raw[t] ?? [];
  if (fromVersion < 5) {
    const rename = (id: unknown) => (typeof id === 'string' && RENAMED_PLAN_IDS[id]) || id;
    out.planState = out.planState.map((s) => (s.planId === undefined ? s : { ...s, planId: rename(s.planId) }));
    out.sessions = out.sessions.map((s) => (s.planId === undefined ? s : { ...s, planId: rename(s.planId) }));
    out.planDays = out.planDays.map((d) => ({ ...d, planId: rename(d.planId) }));
  }
  return out;
}

/**
 * Every reference points at a record in the same file: sets, counters, submissions and tombstones
 * at a workout, every workout at a gym, and each tombstone's set agrees with its own ids.
 */
function referencesHold(t: Record<TableName, Rec[]>): boolean {
  const sessions = new Set(t.sessions.map((s) => s.id as string));
  const gyms = new Set(t.gyms.map((g) => g.id as string));
  if (!t.sessions.every((s) => gyms.has(s.gymId as string))) return false;
  for (const name of ['sets', 'orderCounters', 'submissions', 'tombstones', 'journal'] as const) {
    if (!t[name].every((r) => sessions.has(r.sessionId as string))) return false;
  }
  return t.tombstones.every((x) => {
    const set = x.set as Rec;
    return set.id === x.id && set.sessionId === x.sessionId;
  });
}

/** Drafts: only for workouts in progress in the same file, each a valid draft. */
function draftsOk(drafts: unknown, sessions: Rec[]): boolean {
  if (!isObj(drafts)) return false;
  const active = new Set(sessions.filter((s) => isActiveSession(s as Pick<Session, 'endedAt' | 'imported'>)).map((s) => s.id as string));
  return Object.entries(drafts).every(([sessionId, perExercise]) => active.has(sessionId) && recordOf(isDraft)(perExercise));
}

/** Reads a backup file's text. Strict: anything off is refused with one plain sentence. */
export function parseBackup(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: NOT_A_BACKUP };
  }
  if (!isObj(raw) || raw.format !== BACKUP_FORMAT || !isObj(raw.tables)) return { ok: false, error: NOT_A_BACKUP };
  if (!Number.isInteger(raw.schemaVersion) || (raw.schemaVersion as number) < 1) return { ok: false, error: NOT_A_BACKUP };
  if ((raw.schemaVersion as number) > SCHEMA_VERSION) return { ok: false, error: NEWER_VERSION };
  if (!num(raw.exportedAt) || !str(raw.appVersion)) return { ok: false, error: DAMAGED };

  const version = raw.schemaVersion as number;
  const given = raw.tables;
  const tables: Partial<Record<TableName, Rec[]>> = {};
  for (const t of TABLE_NAMES) {
    const rows = given[t];
    // Every table of the backup's own schema must be there: a missing one would wipe that data on Replace.
    if (rows === undefined) {
      if (TABLE_SINCE[t] <= version) return { ok: false, error: DAMAGED };
      continue;
    }
    if (!Array.isArray(rows) || !rows.every(isObj)) return { ok: false, error: DAMAGED };
    tables[t] = rows;
  }

  const upgraded = upgradeTables(tables, version);
  for (const t of TABLE_NAMES) {
    const seen = new Set<string>();
    for (const r of upgraded[t]) {
      if (!RECORD_CHECKS[t](r)) return { ok: false, error: DAMAGED };
      const k = keyOf(t, r);
      if (seen.has(k)) return { ok: false, error: DAMAGED };
      seen.add(k);
    }
  }
  if (!referencesHold(upgraded)) return { ok: false, error: DAMAGED };

  const drafts = raw.drafts === undefined ? {} : raw.drafts;
  if (!draftsOk(drafts, upgraded.sessions)) return { ok: false, error: DAMAGED };

  return {
    ok: true,
    backup: { format: BACKUP_FORMAT, appVersion: raw.appVersion as string, schemaVersion: version, exportedAt: raw.exportedAt as number, tables: upgraded as unknown as BackupTables, drafts: drafts as BackupDrafts },
  };
}

/** What the restore sheet says: "This backup has 12 workouts, 140 sets, 2 gyms". */
export type BackupSummary = { workouts: number; sets: number; gyms: number; exportedAt: number };

export const summarize = (b: Backup): BackupSummary => ({ workouts: b.tables.sessions.length, sets: b.tables.sets.length, gyms: b.tables.gyms.length, exportedAt: b.exportedAt });

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
export const workoutCount = (n: number) => plural(n, 'workout', 'workouts');

export function summaryLine(s: BackupSummary): string {
  const date = new Date(s.exportedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `This backup has ${workoutCount(s.workouts)}, ${plural(s.sets, 'set', 'sets')}, ${plural(s.gyms, 'gym', 'gyms')}, from ${date}.`;
}

// ---- reminder (SPEC 9.1) ----

const DAY = 24 * 60 * 60 * 1000;
export const REMIND_AFTER_MS = 14 * DAY;
export const SNOOZE_MS = 7 * DAY;
export const REMIND_MIN_SESSIONS = 6;

export type ReminderInput = {
  /** Finished workouts on the phone (ended or imported). */
  sessions: number;
  lastBackupAt?: number;
  snoozeUntil?: number;
  activeWorkout: boolean;
  now: number;
};

/** "Back up your workouts": more than 5 workouts, no backup in 14 days, not snoozed, never mid workout. */
export function shouldRemind({ sessions, lastBackupAt, snoozeUntil, activeWorkout, now }: ReminderInput): boolean {
  if (activeWorkout || sessions < REMIND_MIN_SESSIONS) return false;
  if (snoozeUntil !== undefined && now < snoozeUntil) return false;
  return lastBackupAt === undefined || now - lastBackupAt >= REMIND_AFTER_MS;
}
