import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnyGymDB } from '../schema';
import { ANY_GYM, type Load } from '../types';
import { finishedDetail, getPastSessions, historyKeyFor, lastSessionSets, listFinished } from '../history';
import { finishWorkout, logSet, startWorkout } from '../workouts';

let db: AnyGymDB;
let n = 0;
beforeEach(async () => {
  db = new AnyGymDB(`anygym-history-${n++}`);
  await db.open();
});
afterEach(async () => {
  await db.delete();
});

const bar185: Load = { kind: 'barbell', unit: 'lb', total: 185, barWeight: 45, perSide: [45, 25] };
const pin: Load = { kind: 'stack', unit: 'lb', total: 100, stackValue: 100 };

async function workout(gymId: string, at: number, sets: Array<{ id: string; ex?: string; reps?: number; seconds?: number; load?: Load }>, finish = true) {
  const s = await startWorkout(gymId, db, at);
  for (const x of sets) await logSet({ id: x.id, sessionId: s.id, exerciseId: x.ex ?? 'squat', reps: x.seconds ? undefined : (x.reps ?? 10), seconds: x.seconds, load: x.load ?? bar185 }, db);
  if (finish) await finishWorkout(s.id, db, at + 1);
  return s;
}

describe('historyKeyFor', () => {
  it('machines, cables and Smith per gym; free weights shared', () => {
    expect(historyKeyFor('stack', 'g1')).toBe('g1');
    expect(historyKeyFor('plate_machine', 'g1')).toBe('g1');
    expect(historyKeyFor('barbell', 'g1', true)).toBe('g1');
    for (const k of ['barbell', 'dumbbell_each', 'single', 'bodyweight', 'timed'] as const) expect(historyKeyFor(k, 'g1')).toBe(ANY_GYM);
  });
});

describe('getPastSessions', () => {
  it('newest first, in set order, without the workout in progress, limited', async () => {
    await workout('g1', 1000, [{ id: 'a1', reps: 8 }, { id: 'a2', reps: 7 }]);
    await workout('g2', 3000, [{ id: 'b1', reps: 12 }, { id: 'b2', ex: 'other' }, { id: 'b3', reps: 11 }]);
    await workout('g1', 5000, [{ id: 'c1', reps: 3 }], false); // in progress
    const past = await getPastSessions('squat', 'g1', 'barbell', 6, { db });
    expect(past).toEqual([
      { date: 3000, gymId: 'g2', unit: 'lb', sets: [{ kind: 'work', reps: 12, load: bar185 }, { kind: 'work', reps: 11, load: bar185 }] },
      { date: 1000, gymId: 'g1', unit: 'lb', sets: [{ kind: 'work', reps: 8, load: bar185 }, { kind: 'work', reps: 7, load: bar185 }] },
    ]);
    expect(await getPastSessions('squat', 'g1', 'barbell', 1, { db })).toHaveLength(1);
    expect(await getPastSessions('never', 'g1', 'barbell', 6, { db })).toEqual([]);
  });

  it('machines only count at this gym; Smith too, and Smith never mixes with free bars (PLAN 1.7c)', async () => {
    const smith: Load = { ...bar185, barId: 'smith' };
    await workout('g1', 1000, [{ id: 'a1', load: pin }, { id: 'a2', load: smith }]);
    await workout('g2', 2000, [{ id: 'b1', load: pin }, { id: 'b2', load: smith }, { id: 'b3', load: bar185 }]);
    expect((await getPastSessions('squat', 'g1', 'stack', 6, { db })).map((s) => s.gymId)).toEqual(['g1']);
    const smithHere = await getPastSessions('squat', 'g2', 'barbell', 6, { db, smith: true });
    expect(smithHere.map((s) => s.gymId)).toEqual(['g2']);
    expect(smithHere[0]!.sets.map((x) => x.load.barId)).toEqual(['smith']);
    // Free bar history: every gym, never a Smith set.
    const free = await getPastSessions('squat', 'g3', 'barbell', 6, { db });
    expect(free.map((s) => s.gymId)).toEqual(['g2']);
    expect(free[0]!.sets.map((x) => x.load.barId)).toEqual([undefined]);
    // Older records without a barId count as the exercise's own bar (a Smith exercise: Smith).
    const legacySmith = await getPastSessions('squat', 'g2', 'barbell', 6, { db, smith: true, defaultBar: 'smith' });
    expect(legacySmith[0]!.sets).toHaveLength(2);
  });

  it('warm up only workouts never hide older working sets (PLAN 1.7c)', async () => {
    await workout('g1', 1000, [{ id: 'old', reps: 10 }]);
    for (let i = 0; i < 7; i++) {
      const s = await startWorkout('g1', db, 2000 + i * 10);
      await logSet({ id: `w${i}`, sessionId: s.id, exerciseId: 'squat', reps: 5, load: bar185, kind: 'warmup' }, db);
      await finishWorkout(s.id, db, 2001 + i * 10);
    }
    const past = await getPastSessions('squat', 'g1', 'barbell', 6, { db });
    expect(past).toHaveLength(1);
    expect(past[0]!.date).toBe(1000);
    // LAST TIME shows the last workout exactly as done, warm ups included.
    const last = await lastSessionSets('squat', 'g1', 'barbell', { db });
    expect(last).toEqual({ date: 2060, sets: [{ kind: 'warmup', reps: 5, load: bar185 }] });
    expect(await lastSessionSets('never', 'g1', 'barbell', { db })).toBeNull();
  });

  it('skips uncertain sets, sets without a load and deleted workouts; keeps imported ones and seconds', async () => {
    const s = await workout('g1', 1000, [{ id: 'a1' }, { id: 'a2', seconds: 30, load: { kind: 'timed', unit: 'lb', total: 0 } }]);
    await db.sets.update('a1', { uncertain: true });
    expect(await getPastSessions('squat', 'g1', 'barbell', 6, { db })).toEqual([]);
    let past = await getPastSessions('squat', 'g1', 'timed', 6, { db });
    expect(past[0]!.sets).toEqual([{ kind: 'work', seconds: 30, load: { kind: 'timed', unit: 'lb', total: 0 } }]);
    await db.sets.update('a2', { load: undefined });
    expect(await getPastSessions('squat', 'g1', 'timed', 6, { db })).toEqual([]);
    await db.sets.update('a1', { uncertain: false });
    await db.sessions.update(s.id, { endedAt: undefined, imported: true });
    past = await getPastSessions('squat', 'g1', 'barbell', 6, { db });
    expect(past).toHaveLength(1);
    await db.sessions.delete(s.id);
    expect(await getPastSessions('squat', 'g1', 'barbell', 6, { db })).toEqual([]);
  });
});

describe('warm up sets (SPEC 6 rule 1)', () => {
  it('are stored as warm ups and never drive Last time or Next', async () => {
    const { progress, FIRST_TIME } = await import('../../lib/progression');
    const s = await startWorkout('g1', db, 1000);
    const warm = await logSet({ id: 'w1', sessionId: s.id, exerciseId: 'band', reps: 12, load: bar185, kind: 'warmup' }, db);
    expect(warm.kind).toBe('warmup');
    expect((await db.sets.get('w1'))!.kind).toBe('warmup');
    expect((await logSet({ id: 'w2', sessionId: s.id, exerciseId: 'band', reps: 12, load: bar185 }, db)).kind).toBe('work');
    await db.sets.delete('w2');
    await finishWorkout(s.id, db, 2000);
    // PLAN 1.7c: warm ups are left out before sessions are picked, so this workout is no history.
    const past = await getPastSessions('band', 'g1', 'barbell', 6, { db });
    expect(past).toEqual([]);
    const p = progress({
      exerciseId: 'band',
      loadKind: 'barbell',
      unit: 'lb',
      gym: { base: 45, plates: [45, 25, 10, 5, 2.5], collars: 'none', dumbbellRange: null, stackStep: 5 },
      repRange: [10, 12],
      history: past,
    });
    expect(p.lastTime).toBeNull();
    expect(p.next).toMatchObject({ load: null, kind: 'first_time', reason: FIRST_TIME });
  });
});

describe('listFinished and finishedDetail (PLAN 1.10c fix 7: History)', () => {
  it('lists only finished workouts, newest first, with their set counts', async () => {
    const a = await workout('g1', 1000, [{ id: 'a1' }, { id: 'a2' }]);
    const b = await workout('g1', 5000, [{ id: 'b1', ex: 'bench' }]);
    await workout('g1', 9000, [{ id: 'c1' }], false); // still going: not in History
    const list = await listFinished(db);
    expect(list.map((x) => [x.session.id, x.sets])).toEqual([
      [b.id, 1],
      [a.id, 2],
    ]);
  });

  it('includes imported workouts, and is empty only when there truly are none', async () => {
    expect(await listFinished(db)).toEqual([]);
    await db.sessions.add({ id: 'imp', gymId: 'g1', startedAt: 10, imported: true });
    expect((await listFinished(db)).map((x) => [x.session.id, x.sets])).toEqual([['imp', 0]]);
  });

  it('detail: the session and its sets in logged order; nothing for a missing or running workout', async () => {
    const a = await workout('g1', 1000, [{ id: 'a1' }, { id: 'a2', ex: 'bench', reps: 8 }]);
    const open = await workout('g1', 9000, [{ id: 'c1' }], false);
    const d = await finishedDetail(a.id, db);
    expect(d!.session.endedAt).toBe(1001);
    expect(d!.sets.map((s) => [s.id, s.order, s.reps])).toEqual([
      ['a1', 0, 10],
      ['a2', 1, 8],
    ]);
    expect(await finishedDetail(open.id, db)).toBeUndefined();
    expect(await finishedDetail('nope', db)).toBeUndefined();
  });
});
