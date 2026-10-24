import Dexie, { type EntityTable, type Table } from 'dexie';
import type { ExerciseSetting, Gym, Plan, PlanDay, Profile, Run, Session, WorkoutSet } from './types';

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

  constructor(name = DB_NAME) {
    super(name);
    // Add new versions below; never edit a shipped version.
    this.version(1).stores(SCHEMA_V1);
    this.version(2).stores(SCHEMA_V2);
  }
}

export const db = new AnyGymDB();
