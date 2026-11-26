// PLAN Q3a0 (SPEC 20.3): the log reader that feeds Quick's target menu. The trained rule is
// src/lib/recovery's own; these check the facts handed to it and the menu that comes out.
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnyGymDB } from '../schema';
import { readRecoveryLog } from '../training';
import { targetMenu } from '../../lib/quickCards';
import type { WorkoutSet } from '../types';

const NOW = new Date(2026, 10, 22, 12).getTime();
const HOUR = 60 * 60 * 1000;
let db: AnyGymDB;
let name: string;
beforeEach(async () => {
  name = `recovery-q3a0-${Math.random()}`;
  db = new AnyGymDB(name);
  await db.open();
});
afterEach(async () => {
  db.close();
  await Dexie.delete(name);
});

const set = (sessionId: string, exerciseId: string, order: number, extra: Partial<WorkoutSet> = {}): WorkoutSet => ({ id: `${sessionId}-${exerciseId}-${order}`, sessionId, exerciseId, order, kind: 'work', reps: 8, load: { kind: 'bodyweight', unit: 'lb', total: 0 }, uncertain: false, ...extra });
async function workout(id: string, hoursAgo: number, exerciseId: string, n: number, extra: Partial<WorkoutSet> = {}, imported = false) {
  await db.sessions.put({ id, gymId: 'g', startedAt: NOW - hoursAgo * HOUR, endedAt: NOW - hoursAgo * HOUR + HOUR, imported });
  await db.sets.bulkPut(Array.from({ length: n }, (_, i) => set(id, exerciseId, i, extra)));
}
const entry = async (id: string) => targetMenu(await readRecoveryLog(NOW, db), NOW).targets.find((t) => t.id === id)!;

describe('Q3a0: readRecoveryLog', () => {
  it('no workouts: an empty log, and the menu makes no claim', async () => {
    expect(await readRecoveryLog(NOW, db)).toEqual([]);
    const menu = targetMenu([], NOW).targets;
    expect(menu.every((t) => !t.recommended && !t.fact)).toBe(true);
  });

  it('a workout with its sets, the primary muscles from the exercise', async () => {
    await workout('a', 26, 'dumbbell-bench-press', 3);
    const log = await readRecoveryLog(NOW, db);
    expect(log).toHaveLength(1);
    expect(log[0]!.at).toBe(NOW - 26 * HOUR);
    expect(log[0]!.sets).toHaveLength(3);
    expect(log[0]!.sets[0]!.primary).toContain('chest');
    expect(log[0]!.sets[0]!.primary).not.toContain('triceps');
  });

  it('chest yesterday (3 work sets): Chest says "Trained yesterday", dimmed, never Recommended', async () => {
    await workout('a', 26, 'dumbbell-bench-press', 3);
    expect(await entry('chest')).toMatchObject({ fact: 'Trained yesterday', dimmed: true, recommended: false });
    // Something else is fresh, so the menu recommends it (history exists).
    const menu = targetMenu(await readRecoveryLog(NOW, db), NOW).targets;
    expect(menu.some((t) => t.recommended)).toBe(true);
  });

  it('2 work sets, warm ups, unsure sets or nothing logged: not trained (the rule is lib/recovery\'s)', async () => {
    await workout('a', 26, 'dumbbell-bench-press', 2);
    await workout('b', 25, 'dumbbell-bench-press', 3, { kind: 'warmup' });
    await workout('c', 24, 'dumbbell-bench-press', 3, { uncertain: true });
    await workout('d', 23, 'dumbbell-bench-press', 3, { reps: undefined });
    expect((await entry('chest')).fact).toBeNull();
  });

  it('imported history and workouts after now never count', async () => {
    await workout('a', 26, 'dumbbell-bench-press', 3, {}, true);
    await workout('b', -2, 'dumbbell-bench-press', 3);
    expect(await readRecoveryLog(NOW, db)).toEqual([]);
  });
});
