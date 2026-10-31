// Backup and restore against the database (SPEC 9.1, 9.2). The file format and its checks live in
// src/lib/backup.ts. Restores are refused while a workout is in progress, and each runs in ONE
// transaction over every table: if anything throws, nothing changes.
import { version } from '../../package.json';
import { buildBackup, isActiveSession, keyOf, TABLE_NAMES, type Backup, type BackupLive, type BackupTables, type TableName } from '../lib/backup';
import { EXTRA_SETS_KEY, clearExtraSets, extraSetsValue, restoreExtraSets } from '../lib/extraSets';
import { REST_KEY, loadRest, saveRest } from '../lib/rest';
import { DRAFTS_KEY, draftsValue, exportDrafts, replaceDrafts, type DraftsBlob } from '../lib/drafts';
import { durableRow } from '../lib/durable';
import { resetStartDb } from './bootstrap';
import { db as defaultDb, type AnyGymDB } from './schema';
import { UNDO_PREFIX, readUndoIntents } from './undoIntents';
import { MUTATION_DONE_PREFIX, MUTATION_REV_PREFIX } from './workouts';
import { heldMutations, restoreHeldMutations } from './mutations';
import type { Profile } from './types';

export class ActiveWorkoutError extends Error {
  constructor() {
    super('Finish your workout first');
    this.name = 'ActiveWorkoutError';
  }
}

const tablesOf = (db: AnyGymDB) => TABLE_NAMES.map((t) => db.table(t));

/** Where drafts live (undefined: localStorage, through the drafts module's default; tests pass their own). */
type DraftStorage = Parameters<typeof exportDrafts>[0];

/** Every stored record, read in one transaction so the file is a consistent snapshot. */
export async function readTables(db: AnyGymDB = defaultDb): Promise<BackupTables> {
  return db.transaction('r', tablesOf(db), async () => {
    const out = {} as Record<TableName, unknown[]>;
    for (const t of TABLE_NAMES) out[t] = await db.table(t).toArray();
    return out as BackupTables;
  });
}

/** The whole backup (SPEC 9.1). */
export async function exportBackup(db: AnyGymDB = defaultDb, now = Date.now(), drafts: DraftStorage = undefined): Promise<Backup> {
  const tables = await readTables(db);
  // An Undo asked for whose acceptance only reached its durable intent (PLAN 1.7k) travels as an
  // accepted Undo: restored elsewhere, it is put back and never expires as a plain delete.
  const marked: BackupTables = { ...tables, tombstones: [] };
  for (const t of tables.tombstones) {
    const wanted = !t.undo && (await readUndoIntents(t.sessionId, db).catch(() => [] as string[])).includes(t.id);
    marked.tombstones.push(wanted ? { ...t, undo: true } : t);
  }
  const active = tables.sessions.find(isActiveSession);
  // Changes whose journal write failed (PLAN 2.0h): held in memory or the fallback, not in a table.
  const pendingChanges = active ? await heldMutations(active.id, db, drafts) : [];
  return buildBackup(marked, exportDrafts(drafts), version, now, { ...liveOf(tables, drafts), pendingChanges });
}

/** The running rest and added rows of the workout in progress (PLAN 2.0c), as the app holds them. */
function liveOf(tables: BackupTables, kv: DraftStorage): BackupLive {
  const active = tables.sessions.find(isActiveSession);
  if (!active) return {};
  const extra = extraSetsValue(active.id, kv);
  return { rest: loadRest(active.id, kv), extraSets: extra ? (JSON.parse(extra) as BackupLive['extraSets']) : null };
}

/** The rest and added rows of a backup as their durable values (null: none, a removal). */
function liveValues(backup: Backup): { rest: string | null; extra: string | null } {
  return { rest: backup.rest ? JSON.stringify(backup.rest) : null, extra: backup.extraSets ? JSON.stringify(backup.extraSets) : null };
}

/**
 * After a restore committed (its durable rows are written inside it): the running rest and added
 * rows become the live ones, or are cleared so nothing stale of this phone stays (PLAN 2.0c).
 */
function applyLive(backup: Backup, kv: DraftStorage): void {
  saveRest(backup.rest ? { ...backup.rest } : null, kv);
  if (backup.extraSets) restoreExtraSets(JSON.stringify(backup.extraSets), kv);
  else clearExtraSets(kv);
}

async function refuseIfActive(db: AnyGymDB): Promise<void> {
  if ((await db.sessions.filter(isActiveSession).count()) > 0) throw new ActiveWorkoutError();
}

export type RestoreResult = { workouts: number; sets: number };

/**
 * The restored drafts, stored durably INSIDE the restore transaction (PLAN 1.7i): the IndexedDB
 * copy of anygym-drafts (lib/durable.ts). If it cannot be written the whole restore rolls back;
 * once it committed, localStorage is filled from it (and if localStorage refuses, the next start
 * puts the durable copy back), so a restore never reports success with drafts only in memory.
 */
async function storeDraftsDurably(db: AnyGymDB, blob: DraftsBlob): Promise<void> {
  await db.kv.put(durableRow(DRAFTS_KEY, draftsValue(blob)));
}

/**
 * Replace everything: clear every table, then write the backup's records as they are, and the
 * backup's drafts durably, all in one transaction. localStorage is filled once it committed.
 */
export async function restoreReplace(backup: Backup, db: AnyGymDB = defaultDb, drafts: DraftStorage = undefined): Promise<RestoreResult> {
  const result = await db.transaction('rw', [...tablesOf(db), db.kv], async () => {
    await refuseIfActive(db);
    for (const t of TABLE_NAMES) await db.table(t).clear();
    // Undo intents of workouts that are gone with the old data (PLAN 1.7k); other kv rows stay.
    await db.kv.where('key').startsWith(UNDO_PREFIX).delete();
    // The change revision counters of the old data (PLAN 2.0e): the restored journal's own revisions count from here.
    await db.kv.where('key').startsWith(MUTATION_REV_PREFIX).delete();
    // And their supersession markers (PLAN 2.0f): a restored held change is never hidden by the old data's.
    await db.kv.where('key').startsWith(MUTATION_DONE_PREFIX).delete();
    for (const t of TABLE_NAMES) {
      const rows = backup.tables[t];
      if (rows.length) await db.table(t).bulkAdd(rows);
    }
    await storeDraftsDurably(db, backup.drafts);
    // The rest and added rows too (PLAN 2.0c), also as removals: a stale one never stays.
    const live = liveValues(backup);
    await db.kv.put(durableRow(REST_KEY, live.rest));
    await db.kv.put(durableRow(EXTRA_SETS_KEY, live.extra));
    return { workouts: backup.tables.sessions.length, sets: backup.tables.sets.length };
  });
  replaceDrafts(backup.drafts, drafts);
  applyLive(backup, drafts);
  // Before anything can Try again or Finish (PLAN 2.0h): the backup's held changes are pending here.
  restoreHeldMutations(backup.pendingChanges ?? [], db, drafts, true);
  resetStartDb();
  return result;
}

/**
 * Merge: adds only what is not on the phone. Workouts, gyms, runs, settings and counters by their
 * key; a workout already here is kept as it is (its sets are never added to or brought back).
 * The plan position and the profile only when the phone has none. Added gyms come in inactive
 * when the phone already has an active gym.
 */
export async function restoreMerge(backup: Backup, db: AnyGymDB = defaultDb, drafts: DraftStorage = undefined): Promise<RestoreResult> {
  const result = await db.transaction('rw', [...tablesOf(db), db.kv], async () => {
    await refuseIfActive(db);
    const added = new Set<string>();
    for (const s of backup.tables.sessions) {
      if (await db.sessions.get(s.id)) continue;
      added.add(s.id);
    }
    let sets = 0;
    for (const t of TABLE_NAMES) {
      const rows = backup.tables[t] as unknown as Array<Record<string, unknown>>;
      if (rows.length === 0) continue;
      if ((t === 'profile' || t === 'planState') && (await db.table(t).count()) > 0) continue;
      const table = db.table(t);
      const have = new Set((await table.toArray()).map((r: Record<string, unknown>) => keyOf(t, r)));
      const perSession = t === 'sets' || t === 'orderCounters' || t === 'submissions' || t === 'tombstones' || t === 'journal';
      let fresh = rows.filter((r) => !have.has(keyOf(t, r)) && (!perSession || added.has(r.sessionId as string)));
      // The phone keeps its own active gym: added gyms come in inactive.
      if (t === 'gyms' && (await db.gyms.filter((g) => g.isActive).count()) > 0) fresh = fresh.map((g) => ({ ...g, isActive: false }));
      if (fresh.length) await table.bulkAdd(fresh);
      if (t === 'sets') sets = fresh.length;
    }
    // Drafts of the workouts it added come along (the phone has none for them: they were not
    // here), stored durably in this same transaction (PLAN 1.7i).
    const incoming = Object.entries(backup.drafts).filter(([id]) => added.has(id));
    const next = incoming.length ? { ...exportDrafts(drafts), ...Object.fromEntries(incoming) } : null;
    if (next) await storeDraftsDurably(db, next);
    // The added workout's running rest and added rows (PLAN 2.0c). The phone has no workout in
    // progress (refused above), so they replace whatever stale copy it has.
    const live = (backup.rest && added.has(backup.rest.sessionId)) || (backup.extraSets && added.has(backup.extraSets.sessionId));
    if (live) {
      const v = liveValues(backup);
      await db.kv.put(durableRow(REST_KEY, v.rest));
      await db.kv.put(durableRow(EXTRA_SETS_KEY, v.extra));
    }
    return { workouts: added.size, sets, next, live, added };
  });
  if (result.next) replaceDrafts(result.next, drafts);
  if (result.live) applyLive(backup, drafts);
  const held = (backup.pendingChanges ?? []).filter((e) => result.added.has(e.sessionId));
  if (held.length) restoreHeldMutations(held, db, drafts);
  resetStartDb();
  return { workouts: result.workouts, sets: result.sets };
}

// ---- profile: last backup and the reminder snooze ----

async function updateProfile(db: AnyGymDB, change: Partial<Profile>, now: number): Promise<void> {
  await db.transaction('rw', db.profile, db.gyms, async () => {
    const had = await db.profile.toCollection().first();
    if (had) {
      await db.profile.update(had.id, change);
      return;
    }
    const gym = (await db.gyms.toArray()).find((g) => g.isActive);
    await db.profile.add({ id: 'me', defaultUnit: gym?.unit ?? 'lb', createdAt: now, ...change });
  });
}

/** A backup went out: when, and which finished workouts it holds (ids only). */
export const recordBackup = (sessionIds: string[], db: AnyGymDB = defaultDb, now = Date.now()) => updateProfile(db, { lastBackupAt: now, backedUpSessionIds: sessionIds }, now);

export const snoozeBackupReminder = (until: number, db: AnyGymDB = defaultDb, now = Date.now()) => updateProfile(db, { backupSnoozeUntil: until }, now);
