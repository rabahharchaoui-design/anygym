// PLAN M18a: "a 12 set workout showed Time 1 min". The Time of the finish screen and History is
// measured from Start to the save of Finish, through the saved data, whatever happens in between.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { finishedDetail } from '../history';
import { AnyGymDB } from '../schema';
import type { Load } from '../types';
import { finishWorkout, logSet, reopenWorkout, startPlanDay, startWorkout } from '../workouts';
import { sessionTime } from '../../lib/workoutTime';
import { workoutFacts } from '../../screens/history/historyWords';
import { detailMeta } from '../../screens/history/detailMeta';
import { PLANS } from '../../data/plans';

let db: AnyGymDB;
let name = '';
let n = 0;
beforeEach(async () => {
  name = `anygym-time-${n++}`;
  db = new AnyGymDB(name);
  await db.open();
});
afterEach(async () => {
  await db.delete();
});

const min = 60_000;
const t0 = new Date(2026, 10, 20, 18, 0).getTime();
const bar = (total: number): Load => ({ kind: 'barbell', unit: 'lb', total, barWeight: 45, perSide: [] });
let k = 0;
/** 12 working sets, one every `gap` minutes after the start. */
async function twelveSets(sessionId: string, from: number, gap: number, d = db) {
  for (let i = 0; i < 12; i++) await logSet({ id: `t${++k}`, sessionId, exerciseId: 'barbell-back-squat', reps: 5, load: bar(135 + 10 * (i % 3)), kind: 'work' }, d);
  return from + 12 * gap * min;
}
const timeOf = async (id: string) => {
  const d = await finishedDetail(id, db);
  return d ? sessionTime(d.session) : undefined;
};

describe('the workout Time is start to save (PLAN M18a)', () => {
  it('12 sets over 48 minutes read "48 min" on the finish screen and in History, not the time of the last set', async () => {
    const s = await startWorkout('g1', db, t0);
    const last = await twelveSets(s.id, t0, 4);
    await finishWorkout(s.id, db, last);
    expect(await timeOf(s.id)).toEqual({ minutes: 48, words: '48 min' });
    const d = (await finishedDetail(s.id, db))!;
    expect(workoutFacts(d.session, 12).main).toBe('48 min');
    expect(detailMeta(d.session, d.sets, 'lb', last)).toContain('48 min');
  });
  it('a plan day too: the start is the tap on Start, never a later write', async () => {
    const plan = PLANS[0]!;
    const s = await startPlanDay('g1', plan.id, 0, db, t0);
    await twelveSets(s.id, t0, 5);
    await finishWorkout(s.id, db, t0 + 61 * min);
    expect(await timeOf(s.id)).toEqual({ minutes: 61, words: '61 min' });
  });
  it('resumed after a reload (the app closed and opened again): the start is kept', async () => {
    const s = await startWorkout('g1', db, t0);
    await twelveSets(s.id, t0, 2);
    db.close();
    db = new AnyGymDB(name);
    await db.open();
    // Start again while it is open returns the same workout, never a fresh start.
    expect((await startWorkout('g1', db, t0 + 30 * min)).startedAt).toBe(t0);
    await finishWorkout(s.id, db, t0 + 55 * min);
    expect(await timeOf(s.id)).toEqual({ minutes: 55, words: '55 min' });
  });
  it('Finish, Undo, more sets, Finish again: measured to the last save', async () => {
    const s = await startWorkout('g1', db, t0);
    await twelveSets(s.id, t0, 3);
    await finishWorkout(s.id, db, t0 + 36 * min);
    expect(await reopenWorkout(s.id, undefined, db)).toBe(true);
    await logSet({ id: 'after-undo', sessionId: s.id, exerciseId: 'barbell-back-squat', reps: 5, load: bar(155), kind: 'work' }, db);
    await finishWorkout(s.id, db, t0 + 44 * min);
    expect(await timeOf(s.id)).toEqual({ minutes: 44, words: '44 min' });
  });
  it('finishing twice keeps the first save', async () => {
    const s = await startWorkout('g1', db, t0);
    await twelveSets(s.id, t0, 3);
    await finishWorkout(s.id, db, t0 + 40 * min);
    await finishWorkout(s.id, db, t0 + 90 * min);
    expect(await timeOf(s.id)).toEqual({ minutes: 40, words: '40 min' });
  });
  it('left open overnight: "Over 4 h", never a made up number', async () => {
    const s = await startWorkout('g1', db, t0);
    await twelveSets(s.id, t0, 1);
    await finishWorkout(s.id, db, t0 + 14 * 60 * min);
    expect(await timeOf(s.id)).toEqual({ minutes: null, words: 'Over 4 h' });
  });
  it('an imported workout has no start time: no Time at all (never "<1 min")', async () => {
    await db.sessions.put({ id: 'imp', gymId: 'g1', startedAt: 2, importSeq: 2, imported: true });
    await db.sets.put({ id: 'imp-1', sessionId: 'imp', exerciseId: 'barbell-back-squat', order: 0, kind: 'work', reps: 5, uncertain: false, load: bar(135) });
    expect(await timeOf('imp')).toBeNull();
  });
  it('an old workout with an impossible stored time (end before start) shows no Time, and the stored row is not rewritten', async () => {
    await db.sessions.put({ id: 'odd', gymId: 'g1', startedAt: t0, endedAt: t0 - 10 * min, imported: false });
    await db.sets.put({ id: 'odd-1', sessionId: 'odd', exerciseId: 'barbell-back-squat', order: 0, kind: 'work', reps: 5, uncertain: false, load: bar(135) });
    expect(await timeOf('odd')).toBeNull();
    expect((await db.sessions.get('odd'))!.endedAt).toBe(t0 - 10 * min);
  });
});
