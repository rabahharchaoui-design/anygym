// PLAN 3.4a: switching between a plan and its coach tuned copy keeps the place in the plan.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnyGymDB } from '../schema';
import { choosePlan, choosePlanUndoable, undoChoosePlan } from '../planState';
import { tunedId } from '../../lib/coachTips';

let db: AnyGymDB;
let name: string;
beforeEach(async () => {
  name = `plan-34a-${Math.random()}`;
  db = new AnyGymDB(name);
  await db.open();
});
afterEach(async () => {
  db.close();
  await new AnyGymDB(name).delete();
});

describe('coach tuned copy as the plan in use', () => {
  it('keeps the next day, week and done marks; Undo puts the original back', async () => {
    await choosePlan('five-day-split', db, 1);
    await db.planState.put({ id: 'active', planId: 'five-day-split', startedAt: 1, weekIndex: 0, nextDayIndex: 2, doneDays: [0, 1] });
    const tuned = tunedId('five-day-split', ['rest']);
    const chosen = await choosePlanUndoable(tuned, db, 5);
    expect(chosen.changed).toBe(true);
    expect(chosen.state).toEqual({ id: 'active', planId: tuned, startedAt: 1, weekIndex: 0, nextDayIndex: 2, doneDays: [0, 1] });
    expect(await undoChoosePlan(chosen.state, chosen.previous, db)).toBe(true);
    expect((await db.planState.get('active'))?.planId).toBe('five-day-split');
  });

  it('another plan still starts at Day 1', async () => {
    await db.planState.put({ id: 'active', planId: tunedId('five-day-split', ['rest']), startedAt: 1, weekIndex: 0, nextDayIndex: 3, doneDays: [0, 1, 2] });
    const s = await choosePlan('six-week-volume', db, 9);
    expect(s).toEqual({ id: 'active', planId: 'six-week-volume', startedAt: 9, weekIndex: 0, nextDayIndex: 0, doneDays: [] });
  });

  it('a made up copy id is refused like any unknown plan', async () => {
    await expect(choosePlan('five-day-split~coach-nope', db, 1)).rejects.toThrow('Plan not found');
  });
});

describe('PLAN 3.4a round 2: an Up next lift keeps its suggested rest', () => {
  it('addSuggested adds the exercise and keeps its rest on the session; a second add changes nothing', async () => {
    const { addSuggested } = await import('../workouts');
    await db.sessions.put({ id: 's', gymId: 'g', startedAt: 1, imported: false, exerciseIds: ['barbell-back-squat'] });
    const s = await addSuggested('s', 'deadlift', 150, db);
    expect(s.exerciseIds).toEqual(['barbell-back-squat', 'deadlift']);
    expect((await db.sessions.get('s'))?.suggestedRest).toEqual({ deadlift: 150 });
    await addSuggested('s', 'deadlift', 75, db);
    expect((await db.sessions.get('s'))?.suggestedRest).toEqual({ deadlift: 150 });
  });

  it('refuses a missing or finished workout', async () => {
    const { addSuggested, WorkoutFinishedError } = await import('../workouts');
    await expect(addSuggested('nope', 'deadlift', 150, db)).rejects.toThrow('Workout not found');
    await db.sessions.put({ id: 'f', gymId: 'g', startedAt: 1, endedAt: 2, imported: false, exerciseIds: [] });
    await expect(addSuggested('f', 'deadlift', 150, db)).rejects.toBeInstanceOf(WorkoutFinishedError);
  });

  it('a backup keeps it', async () => {
    const { RECORD_CHECKS } = await import('../../lib/backup');
    expect(RECORD_CHECKS.sessions({ id: 's', gymId: 'g', startedAt: 1, imported: false, suggestedRest: { deadlift: 150 } })).toBe(true);
    expect(RECORD_CHECKS.sessions({ id: 's', gymId: 'g', startedAt: 1, imported: false, suggestedRest: { deadlift: 'x' } })).toBe(false);
  });
});
