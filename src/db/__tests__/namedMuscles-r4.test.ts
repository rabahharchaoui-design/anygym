// PLAN R4 (2): Quick's Skips and Leaves out lines and Up next read readTraining, which names a muscle
// only after 3 of its own working sets; the group (arms) still counts for recovery and card order.
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { lastTrainedGroups } from '../../lib/recovery';
import { AnyGymDB } from '../schema';
import { readHelped, readRecoveryLog, readTraining } from '../training';
import { readRecentAt, readRecentMuscles } from '../quick';
import type { WorkoutSet } from '../types';

const NOW = new Date(2026, 10, 26, 12).getTime();
const HOUR = 60 * 60 * 1000;
let db: AnyGymDB;
let name: string;
beforeEach(async () => {
  name = `named-r4-${Math.random()}`;
  db = new AnyGymDB(name);
  await db.open();
});
afterEach(async () => {
  db.close();
  await Dexie.delete(name);
});

const set = (sessionId: string, exerciseId: string, order: number): WorkoutSet => ({ id: `${sessionId}-${exerciseId}-${order}`, sessionId, exerciseId, order, kind: 'work', reps: 10, load: { kind: 'bodyweight', unit: 'lb', total: 0 }, uncertain: false });
async function log(sessionId: string, at: number, moves: Array<[string, number]>) {
  await db.sessions.put({ id: sessionId, gymId: 'g', startedAt: at, endedAt: at + HOUR, imported: false });
  let order = 0;
  for (const [exerciseId, count] of moves) await db.sets.bulkPut(Array.from({ length: count }, () => set(sessionId, exerciseId, order++)));
}

describe('R4: a sentence names a muscle only after 3 of its own working sets', () => {
  it('2 curls and 1 pushdown: arms trained for recovery, neither biceps nor triceps named', async () => {
    const at = NOW - 2 * HOUR;
    await log('a', at, [['barbell-bicep-curl', 2], ['cable-tricep-pushdown', 1]]);
    expect(await readTraining(NOW, db)).toEqual({});
    expect(await readRecentMuscles(NOW, db)).toEqual([]);
    expect(await readRecentAt(NOW, db)).toBeNull();
    // Worked, so no suggestion leans on them and no "rested" claim goes past this workout.
    const helped = await readHelped(NOW, db);
    expect(helped.biceps).toBe(at);
    expect(helped.triceps).toBe(at);
    // The group rule is unchanged: arms was trained, for recovery and the card order.
    expect(lastTrainedGroups(await readRecoveryLog(NOW, db), NOW)).toEqual({ arms: at });
  });

  it('3 curls and 1 pushdown: biceps named, triceps only worked', async () => {
    const at = NOW - 2 * HOUR;
    await log('a', at, [['barbell-bicep-curl', 3], ['cable-tricep-pushdown', 1]]);
    expect(await readTraining(NOW, db)).toEqual({ biceps: at });
    expect(await readRecentMuscles(NOW, db)).toEqual(['biceps']);
    expect((await readHelped(NOW, db)).triceps).toBe(at);
  });
});
