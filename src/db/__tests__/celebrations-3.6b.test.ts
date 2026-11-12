// PLAN 3.6b: the gym's celebration moments read from saved data, and the once only claim.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { selectCelebrations } from '../../ui/celebrate/select';
import { CELEBRATED_PREFIX, claimBig, workoutMoments } from '../celebrations';
import { AnyGymDB } from '../schema';
import type { Load, SetKind } from '../types';
import { finishWorkout, logSet, startWorkout } from '../workouts';

let db: AnyGymDB;
let n = 0;
beforeEach(async () => {
  db = new AnyGymDB(`anygym-celebrate-${n++}`);
  await db.open();
});
afterEach(async () => {
  await db.delete();
});

const bar = (total: number): Load => ({ kind: 'barbell', unit: 'lb', total, barWeight: 45, perSide: [] });
const each = (w: number): Load => ({ kind: 'dumbbell_each', unit: 'lb', total: w * 2, each: w } as Load);
const SQUAT = 'barbell-back-squat';
const CURL = 'dumbbell-biceps-curl';
const nameOf = (id: string) => (id === SQUAT ? 'Barbell Back Squat' : id === CURL ? 'Dumbbell Biceps Curl' : id);
type S = { ex?: string; reps?: number; load?: Load; kind?: SetKind };
let k = 0;
async function workout(at: number, sets: S[], finish = true) {
  const s = await startWorkout('g1', db, at);
  for (const x of sets) await logSet({ id: `set${++k}`, sessionId: s.id, exerciseId: x.ex ?? SQUAT, reps: x.reps ?? 5, load: x.load ?? bar(185), kind: x.kind ?? 'work' }, db);
  if (finish) await finishWorkout(s.id, db, at + 1);
  return s;
}
const moments = (id: string) => workoutMoments(id, nameOf, 'lb', db);

describe('workoutMoments', () => {
  it('the first finished workout: one moment, the total lifted, and no record (there is no history)', async () => {
    const s = await workout(1000, [{ reps: 5 }, { reps: 5 }, { reps: 5, kind: 'warmup', load: bar(45) }]);
    expect(await moments(s.id)).toEqual([{ id: `first:${s.id}`, kind: 'first_workout', big: true, weight: 0, title: 'First workout', hero: '1,850 lb', caption: 'lifted today', detail: '1,850 lb lifted today' }]);
  });
  it('not while it is still going, and not for warm ups alone', async () => {
    const going = await workout(1000, [{ reps: 5 }], false);
    expect(await moments(going.id)).toEqual([]);
    await finishWorkout(going.id, db, 1001);
    const warm = await workout(5000, [{ kind: 'warmup', load: bar(45) }]);
    expect(await moments(warm.id)).toEqual([]);
  });
  it('the second workout is not a first; a warm up only workout before it does not count as one', async () => {
    await workout(1000, [{ kind: 'warmup', load: bar(45) }]);
    const first = await workout(2000, [{ ex: CURL, load: each(20), reps: 10 }]);
    expect((await moments(first.id)).map((m) => m.kind)).toEqual(['first_workout']);
    const second = await workout(3000, [{ ex: CURL, load: each(20), reps: 10 }]);
    expect(await moments(second.id)).toEqual([]); // a tie: nothing
  });
  it('imported history means it is not the first workout', async () => {
    await db.sessions.put({ id: 'imp', gymId: 'g1', startedAt: 10, imported: true } as never);
    await db.sets.put({ id: 'imp-1', sessionId: 'imp', exerciseId: 'other', order: 0, kind: 'work', reps: 5, uncertain: false, load: bar(100) });
    const s = await workout(2000, [{ reps: 5 }]);
    expect(await moments(s.id)).toEqual([]);
  });
  it('a heavier set on a main lift asks for the full screen; an accessory record is a card', async () => {
    await workout(1000, [{ reps: 5, load: bar(185) }, { ex: CURL, load: each(20), reps: 10 }]);
    const s = await workout(5000, [{ reps: 5, load: bar(195) }, { ex: CURL, load: each(25), reps: 10 }]);
    const ms = await moments(s.id);
    expect(ms.map((m) => [m.title, m.big, m.detail, m.plus])).toEqual([
      ['Barbell Back Squat', true, '195 lb × 5, heaviest ever', '+10 lb'],
      ['Dumbbell Biceps Curl', false, '25 lb each × 10, your best yet', '+5 lb each'],
    ]);
    const sel = selectCelebrations(ms, 'summary');
    expect(sel.big?.title).toBe('Barbell Back Squat');
    expect(sel.medium.map((m) => m.title)).toEqual(['Dumbbell Biceps Curl']);
  });
  it('a tie and a heavier warm up celebrate nothing', async () => {
    await workout(1000, [{ reps: 5, load: bar(185) }]);
    const s = await workout(5000, [{ reps: 5, load: bar(225), kind: 'warmup' }, { reps: 5, load: bar(185) }]);
    expect(await moments(s.id)).toEqual([]);
  });
});

describe('claimBig', () => {
  it('true once, then never again: a reload or Finish → Undo → Finish cannot replay it', async () => {
    expect(await claimBig('s1', 'first:s1', db)).toBe(true);
    expect(await claimBig('s1', 'first:s1', db)).toBe(false);
    expect(await claimBig('s1', 'lift:x', db)).toBe(false);
    expect(await claimBig('s2', 'first:s2', db)).toBe(true);
    expect((await db.kv.get(`${CELEBRATED_PREFIX}s1`))?.value).toBe('first:s1');
  });
  it('two claims at once: one owner', async () => {
    const got = await Promise.all([claimBig('s1', 'a', db), claimBig('s1', 'a', db)]);
    expect(got.filter(Boolean)).toHaveLength(1);
  });
  it('a failed write is not a claim (the screen shows its cards)', async () => {
    db.close();
    expect(await claimBig('s1', 'a', db)).toBe(false);
  });
});
