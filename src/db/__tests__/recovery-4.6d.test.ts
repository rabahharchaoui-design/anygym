import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { AnyGymDB } from '../schema';
import { coachData } from '../coachData';
import { recoveryLine } from '../../lib/coach';

const db = new AnyGymDB('recovery-46d');
const now = new Date(2026, 10, 11, 12).getTime();
afterEach(async () => { db.close(); await Dexie.delete('recovery-46d'); });

describe('recovery from saved evidence', () => {
  it('only uses certain work sets from yesterday and matches the next day', async () => {
    await db.open();
    await db.planState.put({ id: 'active', planId: 'five-day-split', startedAt: 1, weekIndex: 0, nextDayIndex: 0, doneDays: [] });
    const yesterday = new Date(2026, 10, 10, 12).getTime();
    await db.sessions.put({ id: 'y', gymId: 'g', startedAt: yesterday, endedAt: yesterday + 1000, imported: false });
    const set = { id: 's', sessionId: 'y', exerciseId: 'barbell-back-squat', order: 0, kind: 'work' as const, reps: 8, load: { kind: 'bodyweight' as const, unit: 'lb' as const, total: 0 }, uncertain: false };
    await db.sets.put({ ...set, kind: 'warmup' });
    await db.sets.put({ ...set, id: 'uncertain', uncertain: true });
    let data = await coachData(now, db);
    expect(data.recovery?.yesterday).toEqual([]);
    expect(recoveryLine({ activeWorkout: false, recovery: data.recovery })).toBeNull();
    await db.sets.put(set);
    data = await coachData(now, db);
    expect(data.recovery?.yesterday).toContain('quads');
    expect(data.recovery?.next).toContain('quads');
    expect(recoveryLine({ activeWorkout: false, recovery: data.recovery })).toContain('quads');
  });
});
