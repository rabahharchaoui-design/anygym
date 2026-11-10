// PLAN 3.5g: the stores behind the gate critic's fixes. Not now on the Level up card stores a hold the
// workout reads (and Undo takes it back), an empty abandoned workout can be discarded with Undo, and
// Today's coach read names today's lifts, when cards were answered and the unmapped exercises.
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnyGymDB } from '../schema';
import { makeGym } from '../gyms';
import { applyChanges, coachRows, coachTargets, undoApplied } from '../coach';
import { coachData } from '../coachData';
import { discardEmptyWorkout, undoDiscard } from '../discard';
import { startWorkout } from '../workouts';
import { HOLD_REASON, coachToday, holdChanges, targetActive } from '../../lib/coach';
import { dayWorkout } from '../../lib/planWorkout';
import { PLANS } from '../../data/plans';
import { loadAt, type LoadSetup } from '../../lib/load';
import type { Gym, Load, Session } from '../types';

const LB: LoadSetup = { unit: 'lb', base: 45, plates: [45, 35, 25, 10, 5, 2.5], collars: 'none', dumbbellRange: { min: 5, max: 50, step: 5 }, stackStep: 5 };
const bar = (t: number): Load => loadAt('barbell', t, LB)!;
const NOW = new Date(2026, 10, 11, 12).getTime();
const nov = (d: number, h = 18) => new Date(2026, 10, d, h).getTime();

let db: AnyGymDB;
let name: string;
let gym: Gym;
beforeEach(async () => {
  name = `gate-35g-${Math.random()}`;
  db = new AnyGymDB(name);
  await db.open();
  gym = makeGym({ name: 'Home', type: 'full', unit: 'lb', isActive: true }, 1);
  await db.gyms.add(gym);
});
afterEach(async () => {
  db.close();
  await Dexie.delete(name);
});

let n = 0;
async function workout(date: number, sets: Array<[exerciseId: string, reps: number, load: Load]>): Promise<Session> {
  const s: Session = { id: `w${n++}`, gymId: gym.id, startedAt: date, endedAt: date + 3_600_000, imported: false, exerciseIds: [...new Set(sets.map((x) => x[0]))] };
  await db.sessions.add(s);
  await db.sets.bulkAdd(sets.map(([exerciseId, reps, load], i) => ({ id: `${s.id}-${i}`, sessionId: s.id, exerciseId, order: i, kind: 'work' as const, reps, load, uncertain: false })));
  return s;
}

describe('3.5g (1) Not now is stored and honoured', () => {
  it('the hold becomes the lift\'s target, the card is answered (dismissed), Undo brings both back', async () => {
    await workout(nov(5), [
      ['barbell-back-squat', 12, bar(200)],
      ['barbell-back-squat', 12, bar(200)],
      ['barbell-back-squat', 12, bar(200)],
    ]);
    const d = await coachData(NOW, db);
    const t = coachToday({ now: NOW, lifts: d.lifts, dates: d.dates, changes: d.changes, closed: d.closed, autoLevelUp: false, activeWorkout: d.active });
    if (t.card?.kind !== 'level_up') throw new Error('expected the Level up card');
    const applied = await applyChanges(t.card.id, t.card.decision.weekKey, holdChanges(t.card.decision, NOW), db, NOW, {}, 'dismissed');
    const rows = await coachRows(db);
    expect(rows.cards).toEqual([{ id: t.card.id, state: 'dismissed', at: NOW }]);
    const target = (await coachTargets(db)).get('barbell-back-squat||barbell')!;
    expect(target).toMatchObject({ value: 200, source: 'hold', reason: HOLD_REASON, reps: 'high' });
    expect(targetActive(target, nov(5), NOW, 'lb', 'barbell')).toBe(true);
    const after = await coachData(NOW + 1, db);
    expect(coachToday({ now: NOW, lifts: after.lifts, dates: after.dates, changes: after.changes, closed: after.closed, autoLevelUp: false, activeWorkout: false }).card).toBeNull();
    expect(after.answeredAt).toEqual([NOW]);
    await undoApplied(applied, db);
    expect((await coachTargets(db)).size).toBe(0);
    const back = await coachData(NOW + 2, db);
    expect(coachToday({ now: NOW, lifts: back.lifts, dates: back.dates, changes: back.changes, closed: back.closed, autoLevelUp: false, activeWorkout: false }).card?.kind).toBe('level_up');
  });
});

describe('3.5g (8, 7) Today\'s coach read', () => {
  it('today\'s lifts are the next plan day\'s working exercises; nothing without a plan', async () => {
    expect((await coachData(NOW, db)).todayIds).toEqual([]);
    const plan = PLANS.find((p) => p.id === 'five-day-split')!;
    await db.planState.put({ id: 'active', planId: plan.id, startedAt: 1, weekIndex: 0, nextDayIndex: 1, doneDays: [0] });
    const want = dayWorkout(plan, 1, 0).filter((e) => !e.warmup && !e.finisher).map((e) => e.exerciseId);
    expect((await coachData(NOW, db)).todayIds).toEqual(want);
    expect(want.length).toBeGreaterThan(2);
  });
  it('a logged exercise without sure muscles is named, never drawn', async () => {
    await workout(NOW - 5 * 60 * 60 * 1000, [['barbell-back-squat', 5, bar(200)], ['no-such-exercise', 10, bar(95)]]);
    const d = await coachData(NOW, db);
    expect(d.fresh).toHaveLength(1);
    expect(d.unmapped).toEqual(['no-such-exercise']);
  });
});

describe('3.5g (9) an empty abandoned workout', () => {
  it('is discarded and comes back with Undo; one with a set is never discarded', async () => {
    const s = await startWorkout(gym.id, db, NOW);
    const d = await discardEmptyWorkout(s.id, db);
    expect(d?.session.id).toBe(s.id);
    expect(await db.sessions.get(s.id)).toBeUndefined();
    expect(await undoDiscard(d!, db)).toBe(true);
    expect(await db.sessions.get(s.id)).toMatchObject({ id: s.id, startedAt: NOW });
    await db.sets.add({ id: 'x', sessionId: s.id, exerciseId: 'barbell-back-squat', order: 0, kind: 'warmup', reps: 10, load: bar(45), uncertain: false });
    expect(await discardEmptyWorkout(s.id, db)).toBeNull();
    expect(await db.sessions.get(s.id)).toBeDefined();
  });
  it('Undo never brings it back over another workout started meanwhile', async () => {
    const s = await startWorkout(gym.id, db, NOW);
    const d = (await discardEmptyWorkout(s.id, db))!;
    await startWorkout(gym.id, db, NOW + 1);
    expect(await undoDiscard(d, db)).toBe(false);
    expect(await db.sessions.get(s.id)).toBeUndefined();
  });
});
