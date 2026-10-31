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
import { planById } from '../data/plans';
import { MAX_EXTRA_SETS } from './extraSets';
import { MAX_ROW_SLOT } from './setTable';
import { isKnownPlate, validDumbbellRange, validStackStep } from './load';

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
  /**
   * The rest of the drafts snapshot (PLAN 2.0c, optional, additive): the workout in progress's
   * running rest (its deadline as it is) and its "+ Add set" counts per exercise. Only for a
   * workout in progress in the same file; absent in older backups and without one.
   */
  rest?: BackupRest;
  extraSets?: BackupExtraSets;
};

export type BackupRest = { sessionId: string; endsAt: number; totalSec: number };
export type BackupExtraSets = { sessionId: string; extra: Record<string, number> };
/** What a backup carries beside the tables and drafts (PLAN 2.0c). */
export type BackupLive = { rest?: BackupRest | null; extraSets?: BackupExtraSets | null };

export type BackupDrafts = DraftsBlob;

export const NOT_A_BACKUP = 'This file is not an AnyGym backup.';
export const NEWER_VERSION = 'This backup is from a newer version. Update AnyGym, then try again.';
export const DAMAGED = 'This backup is damaged. Nothing was changed.';

export type ParseResult = { ok: true; backup: Backup } | { ok: false; error: string };

/** A workout in progress: started, not ended, not imported (same rule as getActiveSession). */
export const isActiveSession = (s: Pick<Session, 'endedAt' | 'imported'>): boolean => s.endedAt === undefined && !s.imported;

/** Builds the backup object from the stored tables. Transient tables only with a workout in progress. */
export function buildBackup(tables: BackupTables, drafts: BackupDrafts, appVersion: string, exportedAt: number, live: BackupLive = {}): Backup {
  const activeIds = new Set(tables.sessions.filter(isActiveSession).map((s) => s.id));
  const active = activeIds.size > 0;
  const extra = live.extraSets && activeIds.has(live.extraSets.sessionId) && Object.keys(live.extraSets.extra).length ? live.extraSets : null;
  return {
    ...(live.rest && activeIds.has(live.rest.sessionId) ? { rest: { ...live.rest } } : {}),
    ...(extra ? { extraSets: { sessionId: extra.sessionId, extra: { ...extra.extra } } } : {}),
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

/** Plates per side that are all real plates of that unit (PLATE_SPECS): an unknown size would crash drawing and solving. */
const knownPlates = (u: unknown): Check => (v) => listOf(num)(v) && (u === 'lb' || u === 'kg') && (v as number[]).every((w) => isKnownPlate(w, u));

/**
 * A stored load (SPEC 5.5): kind, unit and a numeric total; every other number numeric when there,
 * and its plates per side real plates of the load's own unit (PLAN 1.7k).
 */
export const isLoad: Check = (v) =>
  shape({
    req: { kind: oneOf(...LOAD_KINDS), unit, total: num },
    opt: { barWeight: num, barId: oneOf(...BAR_IDS), legacyBarUnresolved: oneOf(true), perSide: listOf(num), collars: num, stackValue: num, added: num },
  })(v) &&
  ((v as Rec).perSide === undefined || knownPlates((v as Rec).unit)((v as Rec).perSide)) &&
  // An unresolved legacy bar (PLAN 2.0c) is a barbell set without a barId: never both.
  ((v as Rec).legacyBarUnresolved === undefined || ((v as Rec).kind === 'barbell' && (v as Rec).barId === undefined));

const isSet = shape({
  req: { id: str, sessionId: str, exerciseId: str, order: num, kind: oneOf('warmup', 'work', 'drop'), uncertain: bool },
  opt: { reps: num, seconds: num, load: isLoad, rpe: num, note: str, failure: bool },
});

/** A dumbbell range that makes sense (positive step, min ≥ 0, max ≥ min, a bounded list): never a frozen picker. */
const dumbbellRange: Check = (v) => shape({ req: { min: num, max: num, step: num } })(v) && validDumbbellRange(v as DumbbellRange);

/** A machine's saved answer: a stack step that makes sense, any other weight a finite number ≥ 0. */
const equipmentWeight: Check = (v) => {
  if (!shape({ req: { kind: oneOf('plates_only', 'starting_resistance', 'stack_step', 'bar_weight'), value: orNull(num) } })(v)) return false;
  const { kind, value } = v as { kind: string; value: number | null };
  if (value === null) return true;
  return kind === 'stack_step' ? validStackStep(value) : value >= 0;
};

const bars = shape({ req: Object.fromEntries(BAR_IDS.map((b) => [b, orNull(num)])) });

const gymShape = shape({
  req: {
    id: str,
    name: str,
    type: oneOf('full', 'hotel', 'home', 'none'),
    unit,
    equipment: listOf(str),
    dumbbellRange: orNull(dumbbellRange),
    bars,
    // A step that would break the pin list (0, negative, 1e-12) is refused before anything is replaced (PLAN 1.7j).
    stackStep: (v) => num(v) && validStackStep(v as number),
    equipmentWeights: recordOf(equipmentWeight),
    plateInventory: listOf(shape({ req: { weight: num, enabled: bool } })),
    collars: oneOf('none', 'competition'),
    plateColors: oneOf('black', 'color'),
    isActive: bool,
    createdAt: num,
  },
});

/** Every plate in a gym's inventory, enabled or not, is a real plate of the gym's unit (PLAN 1.7k: a 999 kg plate crashed loading). */
const inventoryKnown = (g: Rec): boolean => (g.plateInventory as Array<{ weight: number }>).every((p) => isKnownPlate(p.weight, g.unit as 'lb' | 'kg'));

/** What every stored record must look like, per table. Exported for the tests. */
export const RECORD_CHECKS: Record<TableName, Check> = {
  profile: shape({
    req: { id: str, defaultUnit: unit, createdAt: num },
    opt: { name: str, goal: str, level: str, daysPerWeek: num, lastBackupAt: num, backedUpSessionIds: listOf(str), backupSnoozeUntil: num },
  }),
  gyms: (v) => gymShape(v) && inventoryKnown(v as Rec),
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
  tombstones: shape({ req: { id: str, sessionId: str, set: isSet, expiresAt: num }, opt: { undo: bool, token: str } }),
  // A pending Log set write (PLAN 1.7i): its id, draft key, revision and every value of the row.
  // With `mutation` (PLAN 2.0c): a change to a logged set not landed yet (db/mutations.ts).
  journal: (v) =>
    shape({ req: { id: str, sessionId: str, exerciseId: str, key: str, rev: num, draft: isDraft, at: num }, opt: { mutation: isMutation } })(v) &&
    (v as Rec).id === ((v as Rec).draft as Rec).id &&
    ((v as Rec).mutation === undefined || mutationIdOk(v as Rec)),
};

/**
 * A change's id names its own set, kind and revision (PLAN 2.0e): `mut:<kind>:<setId>:<rev>` with
 * the entry's whole revision 1 or more, or `mut:<kind>:<setId>` with revision 0 (before 2.0e).
 */
function mutationIdOk(j: Rec): boolean {
  const m = j.mutation as Rec;
  const base = `mut:${m.kind as string}:${m.setId as string}`;
  const rev = j.rev as number;
  if (j.id === base) return rev === 0;
  return Number.isInteger(rev) && rev >= 1 && j.id === `${base}:${rev}`;
}

/** A change to a logged set (PLAN 2.0c, db/types.ts MutationIntent): an edit's values or a set type. */
const isMutation: Check = (v) =>
  shape({ req: { kind: oneOf('edit'), setId: str, change: shape({ req: { load: (x) => isLoad(x) }, opt: { reps: num, seconds: num } }) } })(v) ||
  shape({ req: { kind: oneOf('type'), setId: str, setKind: oneOf('warmup', 'work', 'drop'), failure: bool } })(v);

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

/**
 * A draft's plates (kept even while the bar weight is unknown) are real plates of the unit they
 * were picked in: the load's unit, else the draft's unit, else its workout's gym unit (older drafts).
 */
function draftPlatesKnown(draft: Rec, gymUnit: unknown): boolean {
  if (draft.plates === undefined) return true;
  const u = (isObj(draft.load) ? draft.load.unit : undefined) ?? draft.unit ?? gymUnit;
  return knownPlates(u)(draft.plates);
}

/** Every draft (journal and per workout) has plates known for its unit (PLAN 1.7k). */
function draftPlatesHold(t: Record<TableName, Rec[]>, drafts: Rec): boolean {
  const gymUnit = new Map(t.gyms.map((g) => [g.id as string, g.unit]));
  const unitOf = new Map(t.sessions.map((s) => [s.id as string, gymUnit.get(s.gymId as string)]));
  if (!t.journal.every((j) => draftPlatesKnown(j.draft as Rec, unitOf.get(j.sessionId as string)))) return false;
  return Object.entries(drafts).every(([sessionId, perExercise]) => Object.values(perExercise as Rec).every((d) => draftPlatesKnown(d as Rec, unitOf.get(sessionId))));
}

/** Drafts: only for workouts in progress in the same file, each a valid draft. */
function draftsOk(drafts: unknown, sessions: Rec[]): boolean {
  if (!isObj(drafts)) return false;
  const active = new Set(sessions.filter((s) => isActiveSession(s as Pick<Session, 'endedAt' | 'imported'>)).map((s) => s.id as string));
  return Object.entries(drafts).every(([sessionId, perExercise]) => active.has(sessionId) && recordOf(isDraft)(perExercise) && Object.keys(perExercise as Rec).every(draftKeyOk));
}


const positiveInt: Check = (v) => Number.isInteger(v) && (v as number) > 0 && (v as number) <= MAX_EXTRA_SETS;
const dayIndex: Check = (v) => Number.isInteger(v) && (v as number) >= 0;

/** A pending row's draft key is `exercise@slot` (or the older `exercise#index`) with a sane position. */
function draftKeyOk(key: string): boolean {
  const m = /^(.+)[@#](\d+)$/.exec(key);
  return !m || Number(m[2]) <= MAX_ROW_SLOT;
}

/**
 * The plan pointer (PLAN 2.0f): whole day positions, and for a plan this app knows, inside that
 * plan, so Replace never leaves Today pointing at a day that is not there. A plan it does not
 * know keeps its numbers (a newer app's plan), only whole and not negative.
 */
function planStateOk(rows: Rec[]): boolean {
  return rows.every((r) => {
    const doneDays = r.doneDays as number[];
    const partial = (r.partial ?? {}) as Record<string, number>;
    if (!dayIndex(r.nextDayIndex) || !dayIndex(r.weekIndex) || !doneDays.every(dayIndex)) return false;
    if (!Object.keys(partial).every((k) => dayIndex(Number(k)) && /^\d+$/.test(k))) return false;
    const plan = planById((RENAMED_PLAN_IDS as Record<string, string>)[r.planId as string] ?? (r.planId as string));
    if (!plan) return true;
    const n = plan.days.length;
    return (r.nextDayIndex as number) < n && doneDays.every((d) => d < n) && Object.keys(partial).every((k) => Number(k) < n);
  });
}
const isRest = shape({ req: { sessionId: str, endsAt: num, totalSec: num } });
const isExtraSets = shape({ req: { sessionId: str, extra: recordOf(positiveInt) } });

/** Rest and added rows (PLAN 2.0c): absent, or valid and for a workout in progress in the same file. */
function liveOk(v: unknown, check: Check, sessions: Rec[]): boolean {
  if (v === undefined) return true;
  if (!check(v)) return false;
  return sessions.some((s) => s.id === (v as Rec).sessionId && isActiveSession(s as Pick<Session, 'endedAt' | 'imported'>));
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
  if (!referencesHold(upgraded) || !planStateOk(upgraded.planState)) return { ok: false, error: DAMAGED };

  const drafts = raw.drafts === undefined ? {} : raw.drafts;
  if (!draftsOk(drafts, upgraded.sessions)) return { ok: false, error: DAMAGED };
  if (!draftPlatesHold(upgraded, drafts as Rec)) return { ok: false, error: DAMAGED };
  if (!liveOk(raw.rest, isRest, upgraded.sessions) || !liveOk(raw.extraSets, isExtraSets, upgraded.sessions)) return { ok: false, error: DAMAGED };

  return {
    ok: true,
    backup: { format: BACKUP_FORMAT, appVersion: raw.appVersion as string, schemaVersion: version, exportedAt: raw.exportedAt as number, tables: upgraded as unknown as BackupTables, drafts: drafts as BackupDrafts,
      ...(raw.rest !== undefined ? { rest: raw.rest as BackupRest } : {}),
      ...(raw.extraSets !== undefined ? { extraSets: raw.extraSets as BackupExtraSets } : {}),
    },
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

/**
 * The reason line under "Back up your workouts": "6 workouts are only on this phone. Last backup
 * 15 days ago." or "… No backup yet." `onlyHere` counts finished workouts newer than the last
 * backup (all of them when there is none).
 */
export function reminderReason({ onlyHere, lastBackupAt, now }: { onlyHere: number; lastBackupAt?: number; now: number }): string {
  const count = onlyHere <= 0 ? '' : onlyHere === 1 ? '1 workout is only on this phone. ' : `${onlyHere} workouts are only on this phone. `;
  if (lastBackupAt === undefined) return `${count}No backup yet.`;
  const days = Math.max(0, Math.floor((now - lastBackupAt) / DAY));
  const ago = days === 0 ? 'today' : days === 1 ? '1 day ago' : `${days} days ago`;
  return `${count}Last backup ${ago}.`;
}

/** The finished (or imported) workouts a backup holds, by id: what "only on this phone" is measured against. */
export function backedUpIds(backup: Pick<Backup, 'tables'>): string[] {
  return backup.tables.sessions.filter((s) => s.endedAt !== undefined || s.imported).map((s) => s.id);
}

/** Finished workouts not in the last successful backup (all of them when no backup recorded which). */
export function onlyOnPhone(finishedIds: readonly string[], backedUp: readonly string[] | undefined): number {
  const held = new Set(backedUp ?? []);
  return finishedIds.filter((id) => !held.has(id)).length;
}
