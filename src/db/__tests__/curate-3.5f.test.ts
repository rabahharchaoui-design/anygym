// PLAN 3.5f: what the decks learn is additive on the profile (no schema bump): a left ranks a move
// lower and remembers the workout, the third different workout asks once "Hide it for good?", an
// older profile opens unchanged, and the new fields are valid backup data.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnyGymDB } from '../schema';
import { getDislikes, recordLeft, recordNever, recordSwapAway, startBuilt } from '../quick';
import { RECORD_CHECKS } from '../../lib/backup';
import type { QuickItem } from '../../lib/quick';
import type { Profile } from '../types';

let db: AnyGymDB;
let name: string;
beforeEach(async () => {
  name = `curate-35f-${Math.random()}`;
  db = new AnyGymDB(name);
  await db.open();
});
afterEach(async () => {
  db.close();
  await new AnyGymDB(name).delete();
});

const OLD: Profile = { id: 'me', defaultUnit: 'lb', createdAt: 1, dislikes: { soft: { a: 2 }, never: ['b'] } };

describe('3.5f lefts across workouts', () => {
  it('an older profile (3.5a dislikes) opens unchanged and keeps what it learned', async () => {
    await db.profile.put(OLD);
    expect(await getDislikes(db)).toEqual({ soft: { a: 2 }, never: ['b'] });
    // The older soft count never stands in for workouts: two lefts before 3.5f do not ask on the next one.
    expect(await recordLeft('a', 'w1', db)).toEqual({ ask: false });
    expect(await getDislikes(db)).toEqual({ soft: { a: 3 }, never: ['b'], lefts: { a: ['w1'] } });
  });

  it('the third different workout asks once; the same workout never counts twice', async () => {
    await db.profile.put({ id: 'me', defaultUnit: 'lb', createdAt: 1 });
    const asks: boolean[] = [];
    for (const w of ['w1', 'w1', 'w2', 'w2', 'w3', 'w4', 'w5']) asks.push((await recordLeft('x', w, db)).ask);
    expect(asks).toEqual([false, false, false, false, true, false, false]);
    const d = await getDislikes(db);
    expect(d.soft).toEqual({ x: 7 });
    expect(d.lefts!.x).toHaveLength(3);
    expect(d.asked).toEqual(['x']);
    expect(d.never, 'asking never hides').toBeUndefined();
    // Hide it: the same never list a hold fills.
    await recordNever('x', db);
    expect((await getDislikes(db)).never).toEqual(['x']);
    // The 3.5a way of learning a left still works beside it.
    await recordSwapAway('y', db);
    expect((await getDislikes(db)).soft).toEqual({ x: 7, y: 1 });
  });

  it('no profile yet: nothing is learned and nothing is asked', async () => {
    expect(await recordLeft('x', 'w1', db)).toEqual({ ask: false });
    expect(await db.profile.count()).toBe(0);
  });

  it('the new fields are valid backup data, and wrong shapes are refused', async () => {
    await db.profile.put({ id: 'me', defaultUnit: 'lb', createdAt: 1 });
    for (const w of ['w1', 'w2', 'w3']) await recordLeft('x', w, db);
    const saved = await db.profile.get('me');
    expect(RECORD_CHECKS.profile(saved)).toBe(true);
    expect(RECORD_CHECKS.profile({ ...saved, dislikes: { lefts: { x: 'w1' } } })).toBe(false);
    expect(RECORD_CHECKS.profile({ ...saved, dislikes: { asked: [1] } })).toBe(false);
  });
});

describe('3.5f an area day keeps its name', () => {
  it('"focus:chest" is saved as the style of the built workout', async () => {
    const item = (id: string): QuickItem => ({ id, slot: id, origin: id, name: id, pattern: null, sets: 3, reps: [8, 12], restSec: 120, why: 'x' });
    const s = await startBuilt('g1', { id: 'focus', variant: 'chest', items: [item('dumbbell-bench-press'), item('cable-tricep-pushdown')] }, 30, db, 1000);
    expect(s.quickStyle).toBe('focus:chest');
    expect(RECORD_CHECKS.sessions(await db.sessions.get(s.id))).toBe(true);
  });
});
