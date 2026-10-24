import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnyGymDB } from '../schema';
import { ANY_GYM, type Load } from '../types';
import { getPastSessions, historyKeyFor } from '../history';
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

  it('machines only count at this gym; Smith too', async () => {
    await workout('g1', 1000, [{ id: 'a1', load: pin }]);
    await workout('g2', 2000, [{ id: 'b1', load: pin }]);
    expect((await getPastSessions('squat', 'g1', 'stack', 6, { db })).map((s) => s.gymId)).toEqual(['g1']);
    expect((await getPastSessions('squat', 'g2', 'barbell', 6, { db, smith: true })).map((s) => s.gymId)).toEqual(['g2']);
    expect((await getPastSessions('squat', 'g3', 'barbell', 6, { db })).length).toBe(2);
  });

  it('skips uncertain sets, sets without a load and deleted workouts; keeps imported ones and seconds', async () => {
    const s = await workout('g1', 1000, [{ id: 'a1' }, { id: 'a2', seconds: 30, load: { kind: 'timed', unit: 'lb', total: 0 } }]);
    await db.sets.update('a1', { uncertain: true });
    let past = await getPastSessions('squat', 'g1', 'barbell', 6, { db });
    expect(past[0]!.sets).toEqual([{ kind: 'work', seconds: 30, load: { kind: 'timed', unit: 'lb', total: 0 } }]);
    await db.sets.update('a2', { load: undefined });
    expect(await getPastSessions('squat', 'g1', 'barbell', 6, { db })).toEqual([]);
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
    const past = await getPastSessions('band', 'g1', 'barbell', 6, { db });
    expect(past).toHaveLength(1);
    expect(past[0]!.sets.map((x) => x.kind)).toEqual(['warmup']);
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
