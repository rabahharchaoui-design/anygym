import Dexie, { type EntityTable, type Table } from 'dexie';
import type { ExerciseSetting, Gym, OrderCounter, Plan, PlanDay, PlanState, Profile, Run, Session, Submission, Tombstone, WorkoutSet } from './types';

export const DB_NAME = 'anygym';

/** Version 1 as shipped. Frozen: the migration test opens data written with exactly this. */
export const SCHEMA_V1 = {
  profile: 'id',
  gyms: 'id, createdAt',
  plans: 'id',
  planDays: 'id, planId',
  sessions: 'id, startedAt, gymId',
  sets: 'id, sessionId, exerciseId, [sessionId+order]',
  runs: 'id, startedAt',
} as const;

/** Version 2 (PLAN 1.7), additive: how each exercise is loaded, per gym for machines. */
export const SCHEMA_V2 = {
  exerciseSettings: '[exerciseId+gymId], exerciseId',
} as const;

/**
 * Version 3 (PLAN 1.10), additive: where the user is in their curated plan. One row, id 'active'.
 * The plans themselves are static JSON (src/data/plans.ts), never stored.
 */
export const SCHEMA_V3 = {
  planState: 'id',
} as const;

/**
 * Version 4 (PLAN 1.10c), additive: per workout set order counter, the highest order ever used
 * (deleted sets included). A new set never reuses the order of a deleted one, so Undo can put a
 * set back at its own order without a clash. One row per session, { sessionId, next }.
 */
export const SCHEMA_V4 = {
  orderCounters: 'sessionId',
} as const;

/**
 * Version 5 (PLAN 1.10f): no store changes. The curated split was renamed and its id changed, so
 * the upgrade rewrites every stored reference to the old id: the active plan state (day position
 * and done days kept), the sessions that started a day of it (ids and sets untouched) and any
 * legacy planDays rows. Exercise settings are keyed per exercise and need nothing.
 */
export const SCHEMA_V5 = {} as const;

/**
 * Version 6 (PLAN 1.7h), additive:
 * - submissions: one row per Log set write, committed in the same transaction as its set
 *   ({ id: the set id, sessionId, exerciseId, rev }). The pending row drafts in localStorage are a
 *   mirror reconciled against it (screens/workout/rowLog.ts), so an app kill between the commit
 *   and the draft cleanup can neither lose a draft nor log the same row twice.
 * - tombstones: a deleted set and the end of its Undo window, written in the delete's own
 *   transaction, plus an accepted Undo still to restore (db/tombstones.ts).
 */
export const SCHEMA_V6 = {
  submissions: 'id, sessionId',
  tombstones: 'id, sessionId',
} as const;

/**
 * Version 7 (PLAN 1.12), additive: kv, an IndexedDB mirror of the live workout state kept in
 * localStorage (row drafts, the rest deadline, added rows: lib/durable.ts). Chromium writes
 * localStorage to disk seconds late, so an app killed right after an edit lost it; IndexedDB
 * writes survive. Never backed up (not in lib/backup.ts TABLE_NAMES): it is only a mirror.
 */
export const SCHEMA_V7 = {
  kv: 'key',
} as const;

/** One mirrored localStorage key (lib/durable.ts): its value (null = removed) and write stamp. */
export type KvRow = { key: string; value: string | null; at: number };

/** The current schema version (the highest this.version below). Backups record it (lib/backup.ts). */
export const SCHEMA_VERSION = 7;

/** Plan ids that were renamed, old → new. Only the migration reads this. */
export const RENAMED_PLAN_IDS: Readonly<Record<string, string>> = { 'ohrabah-split': 'five-day-split' };

/** SPEC 2 + 12.11. Exercises are static JSON shipped with the app, not a table. */
export class AnyGymDB extends Dexie {
  profile!: EntityTable<Profile, 'id'>;
  gyms!: EntityTable<Gym, 'id'>;
  plans!: EntityTable<Plan, 'id'>;
  planDays!: EntityTable<PlanDay, 'id'>;
  sessions!: EntityTable<Session, 'id'>;
  sets!: EntityTable<WorkoutSet, 'id'>;
  runs!: EntityTable<Run, 'id'>;
  exerciseSettings!: Table<ExerciseSetting, [string, string]>;
  planState!: EntityTable<PlanState, 'id'>;
  orderCounters!: EntityTable<OrderCounter, 'sessionId'>;
  submissions!: EntityTable<Submission, 'id'>;
  tombstones!: EntityTable<Tombstone, 'id'>;
  kv!: EntityTable<KvRow, 'key'>;

  constructor(name = DB_NAME) {
    super(name);
    // Add new versions below; never edit a shipped version.
    this.version(1).stores(SCHEMA_V1);
    this.version(2).stores(SCHEMA_V2);
    this.version(3).stores(SCHEMA_V3);
    this.version(4).stores(SCHEMA_V4);
    this.version(5)
      .stores(SCHEMA_V5)
      .upgrade(async (tx) => {
        for (const [from, to] of Object.entries(RENAMED_PLAN_IDS)) {
          await tx.table('planState').toCollection().modify((s: { planId?: string }) => {
            if (s.planId === from) s.planId = to;
          });
          await tx.table('sessions').toCollection().modify((s: { planId?: string }) => {
            if (s.planId === from) s.planId = to;
          });
          await tx.table('planDays').where('planId').equals(from).modify({ planId: to });
        }
      });
    this.version(6).stores(SCHEMA_V6);
    this.version(7).stores(SCHEMA_V7);
  }
}

export const db = new AnyGymDB();
