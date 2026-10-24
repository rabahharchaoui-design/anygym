import Dexie, { type EntityTable, type Table } from 'dexie';
import type { ExerciseSetting, Gym, OrderCounter, Plan, PlanDay, PlanState, Profile, Run, Session, WorkoutSet } from './types';

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

  constructor(name = DB_NAME) {
    super(name);
    // Add new versions below; never edit a shipped version.
    this.version(1).stores(SCHEMA_V1);
    this.version(2).stores(SCHEMA_V2);
    this.version(3).stores(SCHEMA_V3);
    this.version(4).stores(SCHEMA_V4);
  }
}

export const db = new AnyGymDB();
