// Backup and restore against the database (SPEC 9.1, 9.2). The file format and its checks live in
// src/lib/backup.ts. Restores are refused while a workout is in progress, and each runs in ONE
// transaction over every table: if anything throws, nothing changes.
import { version } from '../../package.json';
import { buildBackup, isActiveSession, keyOf, TABLE_NAMES, type Backup, type BackupTables, type TableName } from '../lib/backup';
import { exportDrafts, replaceDrafts } from '../lib/drafts';
import { resetStartDb } from './bootstrap';
import { db as defaultDb, type AnyGymDB } from './schema';
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
  return buildBackup(tables, exportDrafts(drafts), version, now);
}

async function refuseIfActive(db: AnyGymDB): Promise<void> {
  if ((await db.sessions.filter(isActiveSession).count()) > 0) throw new ActiveWorkoutError();
}

export type RestoreResult = { workouts: number; sets: number };

/**
 * Replace everything: clear every table, then write the backup's records as they are. The drafts
 * are written once the transaction has committed (localStorage is not part of it).
 */
export async function restoreReplace(backup: Backup, db: AnyGymDB = defaultDb, drafts: DraftStorage = undefined): Promise<RestoreResult> {
  const result = await db.transaction('rw', tablesOf(db), async () => {
    await refuseIfActive(db);
    for (const t of TABLE_NAMES) await db.table(t).clear();
    for (const t of TABLE_NAMES) {
      const rows = backup.tables[t];
      if (rows.length) await db.table(t).bulkAdd(rows);
    }
    return { workouts: backup.tables.sessions.length, sets: backup.tables.sets.length };
  });
  replaceDrafts(backup.drafts, drafts);
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
  const result = await db.transaction('rw', tablesOf(db), async () => {
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
      const perSession = t === 'sets' || t === 'orderCounters' || t === 'submissions' || t === 'tombstones';
      let fresh = rows.filter((r) => !have.has(keyOf(t, r)) && (!perSession || added.has(r.sessionId as string)));
      // The phone keeps its own active gym: added gyms come in inactive.
      if (t === 'gyms' && (await db.gyms.filter((g) => g.isActive).count()) > 0) fresh = fresh.map((g) => ({ ...g, isActive: false }));
      if (fresh.length) await table.bulkAdd(fresh);
      if (t === 'sets') sets = fresh.length;
    }
    return { workouts: added.size, sets, added: [...added] };
  });
  // Drafts of the workouts it added come along (the phone has none for them: they were not here).
  const incoming = Object.entries(backup.drafts).filter(([id]) => result.added.includes(id));
  if (incoming.length) {
    const have = exportDrafts(drafts);
    const next = { ...have, ...Object.fromEntries(incoming) };
    replaceDrafts(next, drafts);
  }
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

export const recordBackup = (db: AnyGymDB = defaultDb, now = Date.now()) => updateProfile(db, { lastBackupAt: now }, now);

export const snoozeBackupReminder = (until: number, db: AnyGymDB = defaultDb, now = Date.now()) => updateProfile(db, { backupSnoozeUntil: until }, now);
