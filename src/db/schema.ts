import Dexie, { type EntityTable } from 'dexie';
import type { Gym, Plan, PlanDay, Profile, Run, Session, WorkoutSet } from './types';

export const DB_NAME = 'anygym';

/** SPEC 2 + 12.11. Exercises are static JSON shipped with the app, not a table. */
export class AnyGymDB extends Dexie {
  profile!: EntityTable<Profile, 'id'>;
  gyms!: EntityTable<Gym, 'id'>;
  plans!: EntityTable<Plan, 'id'>;
  planDays!: EntityTable<PlanDay, 'id'>;
  sessions!: EntityTable<Session, 'id'>;
  sets!: EntityTable<WorkoutSet, 'id'>;
  runs!: EntityTable<Run, 'id'>;

  constructor(name = DB_NAME) {
    super(name);
    // Add new versions below; never edit a shipped version.
    this.version(1).stores({
      profile: 'id',
      gyms: 'id, createdAt',
      plans: 'id',
      planDays: 'id, planId',
      sessions: 'id, startedAt, gymId',
      sets: 'id, sessionId, exerciseId, [sessionId+order]',
      runs: 'id, startedAt',
    });
  }
}

export const db = new AnyGymDB();
