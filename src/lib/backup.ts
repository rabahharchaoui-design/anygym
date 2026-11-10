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
import type { ExerciseSetting, Gym, JournalEntry, OrderCounter, Plan, PlanDay, PlanState, Profile, Run, Session, Submission, Tombstone, WorkoutSet } from '../db/types';
import { RENAMED_PLAN_IDS, SCHEMA_VERSION } from '../db/schema';
import type { DraftsBlob } from './drafts';
import { definitionPlan, planById } from '../data/plans';
import { MAX_EXTRA_SETS } from './extraSets';
import { MAX_ROW_SLOT } from './setTable';
import type { CandidateReviewRow } from './candidates/review';
import { RECORD_CHECKS, isDraft, isMutation, isObj, knownPlates, num, oneOf, recordOf, shape, str, type Check, type Rec } from './backupChecks';

export { RECORD_CHECKS, isDraft, isLoad } from './backupChecks';
export { REMIND_AFTER_MS, REMIND_MIN_SESSIONS, SNOOZE_MS, backedUpIds, onlyOnPhone, reminderReason, shouldRemind, type ReminderInput } from './backupReminder';

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
  /** PLAN 3.5e: G's decisions on candidate moves (schema 11). */
  candidateReviews: CandidateReviewRow[];
};

export type TableName = keyof BackupTables;

/** Every table a backup carries, in write order. */
export const TABLE_NAMES: readonly TableName[] = ['profile', 'gyms', 'plans', 'planDays', 'sessions', 'sets', 'runs', 'exerciseSettings', 'planState', 'orderCounters', 'submissions', 'tombstones', 'journal', 'candidateReviews'];

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
  /**
   * Changes to logged sets of the workout in progress whose journal write failed (PLAN 2.0h,
   * optional, additive): held in memory or the localStorage fallback, never in a table. Each with
   * its id, time and full values, oldest first; restored, they stay pending for Try again.
   */
  pendingChanges?: JournalEntry[];
};

/** At most this many held changes in a backup (one per tap that failed; a real workout has a few). */
export const MAX_PENDING_CHANGES = 500;

export type BackupRest = { sessionId: string; endsAt: number; totalSec: number };
export type BackupExtraSets = { sessionId: string; extra: Record<string, number>; dropped?: Record<string, string> };
/** What a backup carries beside the tables and drafts (PLAN 2.0c). */
export type BackupLive = { rest?: BackupRest | null; extraSets?: BackupExtraSets | null; pendingChanges?: readonly JournalEntry[] };

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
  const extra = live.extraSets && activeIds.has(live.extraSets.sessionId) && (Object.keys(live.extraSets.extra).length || Object.keys(live.extraSets.dropped ?? {}).length) ? live.extraSets : null;
  // Held changes of a workout in progress whose set is in the file (a set gone needs nothing any more).
  const held = (live.pendingChanges ?? []).filter((e) => activeIds.has(e.sessionId) && heldSetHere(e, tables as unknown as Record<TableName, Rec[]>)).slice(-MAX_PENDING_CHANGES);
  return {
    ...(held.length ? { pendingChanges: held.map((e) => structuredClone(e)) } : {}),
    ...(live.rest && activeIds.has(live.rest.sessionId) ? { rest: { ...live.rest } } : {}),
    ...(extra ? { extraSets: { sessionId: extra.sessionId, extra: { ...extra.extra }, ...(extra.dropped && Object.keys(extra.dropped).length ? { dropped: { ...extra.dropped } } : {}) } } : {}),
    format: BACKUP_FORMAT,
    appVersion,
    schemaVersion: SCHEMA_VERSION,
    exportedAt,
    tables: {
      ...tables,
      submissions: active ? tables.submissions : [],
      tombstones: active ? tables.tombstones : [],
      journal: active ? tables.journal.filter((j) => activeIds.has(j.sessionId)) : [],
      // PLAN 3.5e: tables read before schema 11 have no decisions.
      candidateReviews: tables.candidateReviews ?? [],
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
  candidateReviews: 11,
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
  // PLAN 3.9: a set lifted before its workout moved gyms names a gym in the same file.
  if (!t.sets.every((s) => s.gymId === undefined || gyms.has(s.gymId as string))) return false;
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


// Rows added (positive) or removed (negative, PLAN 2.2d), never zero, never past the limit either way.
const extraCount: Check = (v) => Number.isInteger(v) && (v as number) !== 0 && Math.abs(v as number) <= MAX_EXTRA_SETS;
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
function planStateOk(rows: Rec[], plans: Rec[] = []): boolean {
  // PLAN 3.5: a generated plan in the same file counts as known, by its saved definition.
  const saved = new Map(plans.flatMap((p) => {
    const plan = p.definition ? definitionPlan(p.definition) : undefined;
    return plan ? [[plan.id, plan] as const] : [];
  }));
  return rows.every((r) => {
    const doneDays = r.doneDays as number[];
    const partial = (r.partial ?? {}) as Record<string, number>;
    if (!dayIndex(r.nextDayIndex) || !dayIndex(r.weekIndex) || !doneDays.every(dayIndex)) return false;
    if (!Object.keys(partial).every((k) => dayIndex(Number(k)) && /^\d+$/.test(k))) return false;
    const plan = saved.get(r.planId as string) ?? planById((RENAMED_PLAN_IDS as Record<string, string>)[r.planId as string] ?? (r.planId as string));
    if (!plan) return true;
    const n = plan.days.length;
    return (r.nextDayIndex as number) < n && doneDays.every((d) => d < n) && Object.keys(partial).every((k) => Number(k) < n);
  });
}
const isRest = shape({ req: { sessionId: str, endsAt: num, totalSec: num } });
const isExtraSets = shape({ req: { sessionId: str, extra: recordOf(extraCount) }, opt: { dropped: recordOf(str) } });

/** Rest and added rows (PLAN 2.0c): absent, or valid and for a workout in progress in the same file. */
function liveOk(v: unknown, check: Check, sessions: Rec[]): boolean {
  if (v === undefined) return true;
  if (!check(v)) return false;
  return sessions.some((s) => s.id === (v as Rec).sessionId && isActiveSession(s as Pick<Session, 'endedAt' | 'imported'>));
}

/** A held change's set (logged or deleted within Undo) belongs to the change's own workout in the file. */
function heldSetHere(e: Pick<JournalEntry, 'sessionId' | 'mutation'>, t: Record<TableName, Rec[]>): boolean {
  const setId = e.mutation?.setId;
  return [...t.sets, ...t.tombstones].some((r) => r.id === setId && r.sessionId === e.sessionId);
}

/**
 * A held change (PLAN 2.0h, db/mutations.ts): id `mem:<kind>:<setId>:<at>:<n>` naming its own
 * change and time, revision -1, its key and placeholder draft agreeing, valid values. Since PLAN
 * 2.0k `<n>` is a random UUID (never a per tab counter); older backups' counters stay readable.
 */
const HELD_SUFFIX = /^(?:[1-9]\d{0,15}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;
const isHeld: Check = (v) => {
  if (!shape({ req: { id: str, sessionId: str, exerciseId: str, key: str, rev: oneOf(-1), draft: shape({ req: { id: str, load: oneOf(null) } }), at: num, mutation: isMutation } })(v)) return false;
  const e = v as Rec;
  const m = e.mutation as Rec;
  const base = `mem:${m.kind as string}:${m.setId as string}:${String(e.at)}:`;
  const id = e.id as string;
  const draft = e.draft as Rec;
  return e.key === `${m.kind as string}:${m.setId as string}` && draft.id === id && Object.keys(draft).length === 2 && id.startsWith(base) && HELD_SUFFIX.test(id.slice(base.length));
};

/** Held changes: absent, or a bounded list of distinct valid ones of a workout in progress in the file, oldest first. */
function heldOk(v: unknown, t: Record<TableName, Rec[]>): boolean {
  if (v === undefined) return true;
  if (!Array.isArray(v) || v.length > MAX_PENDING_CHANGES || !v.every(isHeld)) return false;
  const list = v as Array<JournalEntry & Rec>;
  if (new Set(list.map((e) => e.id)).size !== list.length) return false;
  if (!list.every((e, i) => i === 0 || list[i - 1]!.at <= e.at)) return false;
  const active = new Set(t.sessions.filter((s) => isActiveSession(s as Pick<Session, 'endedAt' | 'imported'>)).map((s) => s.id as string));
  return list.every((e) => active.has(e.sessionId) && heldSetHere(e, t));
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
  if (!referencesHold(upgraded) || !planStateOk(upgraded.planState, upgraded.plans as unknown as Rec[])) return { ok: false, error: DAMAGED };

  const drafts = raw.drafts === undefined ? {} : raw.drafts;
  if (!draftsOk(drafts, upgraded.sessions)) return { ok: false, error: DAMAGED };
  if (!draftPlatesHold(upgraded, drafts as Rec)) return { ok: false, error: DAMAGED };
  if (!liveOk(raw.rest, isRest, upgraded.sessions) || !liveOk(raw.extraSets, isExtraSets, upgraded.sessions)) return { ok: false, error: DAMAGED };
  if (!heldOk(raw.pendingChanges, upgraded)) return { ok: false, error: DAMAGED };

  return {
    ok: true,
    backup: { format: BACKUP_FORMAT, appVersion: raw.appVersion as string, schemaVersion: version, exportedAt: raw.exportedAt as number, tables: upgraded as unknown as BackupTables, drafts: drafts as BackupDrafts,
      ...(raw.rest !== undefined ? { rest: raw.rest as BackupRest } : {}),
      ...(raw.extraSets !== undefined ? { extraSets: raw.extraSets as BackupExtraSets } : {}),
      ...(raw.pendingChanges !== undefined ? { pendingChanges: raw.pendingChanges as JournalEntry[] } : {}),
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
