// PLAN M18a, the "12 set workout showed Time 1 min" hunt: every way a workout starts and ends, on
// the phone's real clock (Date.now() defaults, faked here), through the real save path. If any of
// these read the start late (Quick, plan preview, a reload, a refused Finish, Undo), the Time is short.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { finishedDetail } from '../history';
import { AnyGymDB, db as appDb } from '../schema';
import type { Load } from '../types';
import { finishWorkout, getActiveSession, logSet, reopenWorkout, startPlanDay, startWorkout } from '../workouts';
import { discardEmptyWorkout, undoDiscard } from '../discard';
import { startBuilt } from '../quick';
import { sessionTime } from '../../lib/workoutTime';
import { workoutFacts } from '../../screens/history/historyWords';
import { startPreviewedDay } from '../../screens/today/startPreview';
import { PLANS } from '../../data/plans';
import { UnsavedWritesError } from '../workoutErrors';

const MIN = 60_000;
const T0 = new Date(2026, 10, 20, 18, 0).getTime();
let db: AnyGymDB;
let n = 0;
let name = '';
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
  name = `anygym-clock-${n++}`;
  db = new AnyGymDB(name);
  await db.open();
});
afterEach(async () => {
  vi.useRealTimers();
  await db.delete();
  await appDb.sessions.clear();
  await appDb.sets.clear();
});
const tick = (minutes: number) => vi.setSystemTime(Date.now() + minutes * MIN);
const bar = (total: number): Load => ({ kind: 'barbell', unit: 'lb', total, barWeight: 45, perSide: [] });
let k = 0;
/** 12 working sets, one every `gap` minutes on the clock, through logSet. */
async function twelve(sessionId: string, exerciseId: string, gap: number, d: AnyGymDB = db) {
  for (let i = 0; i < 12; i++) {
    tick(gap);
    await logSet({ id: `c${++k}`, sessionId, exerciseId, reps: 8, load: bar(135), kind: 'work' }, d);
  }
}
const timeOf = async (id: string, d: AnyGymDB = db) => sessionTime((await finishedDetail(id, d))!.session);

describe('Time on the real clock (PLAN M18a hunt)', () => {
  it('Start from Today, 12 sets over 38 min with a reload in the middle, Finish: "38 min"', async () => {
    const s = await startWorkout('g1', db);
    for (let i = 0; i < 6; i++) {
      tick(3);
      await logSet({ id: `r${++k}`, sessionId: s.id, exerciseId: 'barbell-back-squat', reps: 8, load: bar(135), kind: 'work' }, db);
    }
    db.close();
    db = new AnyGymDB(name);
    await db.open();
    expect((await getActiveSession(db))!.startedAt).toBe(T0);
    for (let i = 0; i < 6; i++) {
      tick(i === 5 ? 4 : 3);
      await logSet({ id: `r${++k}`, sessionId: s.id, exerciseId: 'barbell-back-squat', reps: 8, load: bar(135), kind: 'work' }, db);
    }
    tick(1);
    await finishWorkout(s.id, db);
    expect(await timeOf(s.id)).toEqual({ minutes: 38, words: '38 min' });
    expect(workoutFacts((await finishedDetail(s.id, db))!.session, 12).main).toBe('38 min');
  });
  it('a Quick workout (built deck) started, then 12 sets over 36 min: "36 min"', async () => {
    const item = { id: 'barbell-back-squat', slot: 'barbell-back-squat', origin: 'barbell-back-squat', name: 'Squat', pattern: null, sets: 12, reps: 8, restSec: 90, why: 'x' };
    const s = await startBuilt('g1', { id: 'strength', items: [item] } as never, 45, db);
    await twelve(s.id, 'barbell-back-squat', 3);
    await finishWorkout(s.id, db);
    expect(await timeOf(s.id)).toEqual({ minutes: 36, words: '36 min' });
  });
  it('a plan day, and a plan day from Preview: the start is the tap on Start', async () => {
    const plan = PLANS[0]!;
    const s = await startPlanDay('g1', plan.id, 0, db);
    await twelve(s.id, s.exerciseIds![0]!, 4);
    await finishWorkout(s.id, db);
    expect(await timeOf(s.id)).toEqual({ minutes: 48, words: '48 min' });
    tick(60 * 24);
    const at = Date.now();
    const p = await startPreviewedDay('g1', { planId: plan.id, dayIndex: 1 }, { items: [], removed: [] });
    expect(p.startedAt).toBe(at);
    await twelve(p.id, p.exerciseIds![0]!, 3, appDb);
    await finishWorkout(p.id, appDb);
    expect(await timeOf(p.id, appDb)).toEqual({ minutes: 36, words: '36 min' });
  });
  it('a Finish refused (a write not landed) and tapped again later: measured to the save that worked', async () => {
    const s = await startWorkout('g1', db);
    await twelve(s.id, 'barbell-back-squat', 3);
    await db.journal.put({ id: 'pending', sessionId: s.id, exerciseId: 'barbell-back-squat', key: 'k', rev: 1, draft: { id: 'pending', load: null }, at: Date.now() } as never);
    await expect(finishWorkout(s.id, db)).rejects.toBeInstanceOf(UnsavedWritesError);
    expect((await db.sessions.get(s.id))!.endedAt).toBeUndefined();
    await db.journal.clear();
    tick(5);
    await finishWorkout(s.id, db);
    expect(await timeOf(s.id)).toEqual({ minutes: 41, words: '41 min' });
  });
  it('Finish, Undo on Today, two more sets, Finish: to the second save', async () => {
    const s = await startWorkout('g1', db);
    await twelve(s.id, 'barbell-back-squat', 3);
    await finishWorkout(s.id, db);
    tick(1);
    expect(await reopenWorkout(s.id, undefined, db)).toBe(true);
    tick(4);
    await logSet({ id: 'more', sessionId: s.id, exerciseId: 'barbell-back-squat', reps: 8, load: bar(135), kind: 'work' }, db);
    await finishWorkout(s.id, db);
    expect(await timeOf(s.id)).toEqual({ minutes: 41, words: '41 min' });
  });
  it('an empty workout discarded then put back by Undo keeps its start', async () => {
    const s = await startWorkout('g1', db);
    tick(2);
    const d = (await discardEmptyWorkout(s.id, db))!;
    tick(1);
    expect(await undoDiscard(d, db)).toBe(true);
    await twelve(s.id, 'barbell-back-squat', 3);
    await finishWorkout(s.id, db);
    expect(await timeOf(s.id)).toEqual({ minutes: 39, words: '39 min' });
  });
});
