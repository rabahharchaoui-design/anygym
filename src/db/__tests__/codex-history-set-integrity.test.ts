import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnyGymDB } from '../schema';
import type { Load, Session, WorkoutSet } from '../types';
import { finishedDetail, getPastSessions, lastSessionSets, listFinished, workoutRecords } from '../history';
import { deleteSet, finishWorkout, logSet, restoreSet, setsOf, startWorkout, updateSet, updateSetType } from '../workouts';
import { progress } from '../../lib/progression';

let db: AnyGymDB;
let n = 0;
beforeEach(async () => {
  db = new AnyGymDB(`anygym-codex-history-integrity-${n++}`);
  await db.open();
});
afterEach(async () => { await db.delete(); });
async function reopen() {
  const name = db.name;
  db.close();
  db = new AnyGymDB(name);
  await db.open();
}
const free: Load = { kind: 'barbell', unit: 'lb', total: 185, barWeight: 45, perSide: [45, 25], barId: 'olympic' };
async function workout(gym: string, at: number, loads: Load[], reps = 10) {
  const session = await startWorkout(gym, db, at);
  for (const [i, load] of loads.entries()) {
    await logSet({ id: `${at}-${i}`, sessionId: session.id, exerciseId: 'bench', load, reps }, db);
  }
  await finishWorkout(session.id, db, at + 1);
  return session;
}

describe('completed logger and history: exact saved evidence (SPEC 0, 5, 6, 13, 20)', () => {
  it('keeps failure, drop and warmup metadata through edit, delete, undo, finish and a fresh connection', async () => {
    const s = await startWorkout('home', db, 1000);
    await logSet({ id: 'failure', sessionId: s.id, exerciseId: 'bench', reps: 8, load: free, failure: true }, db);
    await logSet({ id: 'warm', sessionId: s.id, exerciseId: 'bench', reps: 5, load: free, kind: 'warmup' }, db);
    await updateSetType('warm', 'drop', false, db);
    await updateSet('failure', { reps: 9, load: { ...free, total: 135, perSide: [45] } }, db);
    const expected = await setsOf(s.id, db);
    expect(expected[0]).toMatchObject({ failure: true, kind: 'work', reps: 9, load: { total: 135, barId: 'olympic' } });
    expect(expected[1]).toMatchObject({ kind: 'drop' });
    expect(expected[1]).not.toHaveProperty('failure');
    const removed = await deleteSet('failure', db);
    await reopen();
    await restoreSet(removed!, db);
    await finishWorkout(s.id, db, 2000);
    await reopen();
    expect((await finishedDetail(s.id, db))!.sets).toEqual(expected);
    expect((await getPastSessions('bench', 'other', 'barbell', 6, { db }))[0]!.sets).toEqual([
      { kind: 'work', reps: 9, load: expected[0]!.load },
    ]);
  });

  it('converts cross-gym history onto a women’s kg bar without rewriting the original pounds or plates', async () => {
    const s = await workout('lb-home', 1000, [free]);
    await reopen();
    const before = (await finishedDetail(s.id, db))!;
    const history = await getPastSessions('bench', 'kg-hotel', 'barbell', 6, { db });
    const p = progress({ exerciseId: 'bench', loadKind: 'barbell', unit: 'kg', repRange: [8, 12], history,
      gym: { base: 15, collars: 'none', plates: [25, 20, 15, 10, 5, 2.5, 1.25], dumbbellRange: null, stackStep: 2.5 } });
    expect(p.next.kind).toBe('converted');
    expect(p.next.load).toMatchObject({ unit: 'kg', total: 85, barWeight: 15 });
    expect(p.lastTime!.sets[0]!.load).toEqual(free);
    await reopen();
    expect(await finishedDetail(s.id, db)).toEqual(before);
  });

  it('keeps a machine’s LAST TIME and progression at its own gym after editing and undoing another gym’s set', async () => {
    const a: Load = { kind: 'plate_machine', unit: 'lb', total: 90, barWeight: 0, perSide: [45] };
    const b: Load = { kind: 'plate_machine', unit: 'kg', total: 75, barWeight: 35, perSide: [20] };
    await workout('home', 1000, [a]);
    const s = await startWorkout('hotel', db, 2000);
    await logSet({ id: 'hotel-machine', sessionId: s.id, exerciseId: 'bench', reps: 8, load: b }, db);
    await updateSet('hotel-machine', { reps: 11, load: b }, db);
    const removed = await deleteSet('hotel-machine', db);
    await restoreSet(removed!, db);
    await finishWorkout(s.id, db, 3000);
    await reopen();
    expect(await lastSessionSets('bench', 'home', 'plate_machine', { db })).toEqual({ date: 1000, sets: [{ kind: 'work', reps: 10, load: a }] });
    const hotel = await getPastSessions('bench', 'hotel', 'plate_machine', 6, { db });
    expect(hotel).toEqual([{ date: 2000, gymId: 'hotel', unit: 'kg', sets: [{ kind: 'work', reps: 11, load: b }] }]);
    expect(await getPastSessions('bench', 'new-gym', 'plate_machine', 6, { db })).toEqual([]);
  });

  // CODEX FOUND BUG: A Smith set in the same workout is compared against Olympic history and earns a false heaviest-ever record.
  it('does not award an Olympic record for a heavier Smith set logged in the same workout', async () => {
    await workout('home', 1000, [free]);
    const smith: Load = { kind: 'barbell', unit: 'lb', total: 270, barWeight: 0, perSide: [45, 45, 45], barId: 'smith' };
    const s = await workout('home', 2000, [free, smith]);
    await reopen();
    // Olympic did not improve; Smith has no previous comparable workout (SPEC 6, 21.1).
    expect(await workoutRecords(s.id, () => 'Bench', db)).toEqual([]);
    expect((await finishedDetail(s.id, db))!.sets.map((x) => x.load)).toEqual([free, smith]);
  });

  it('retains all 14,600 sets across two years while newest/oldest details and a new log remain exact', async () => {
    const sessions: Session[] = [];
    const sets: WorkoutSet[] = [];
    for (let day = 0; day < 730; day++) {
      const id = `day-${day}`;
      const startedAt = 1_700_000_000_000 + day * 86_400_000;
      sessions.push({ id, gymId: day % 2 ? 'hotel' : 'home', startedAt, endedAt: startedAt + 3_600_000, imported: false });
      const load: Load = day % 2 ? { kind: 'barbell', unit: 'kg', total: 80, barWeight: 20, perSide: [20, 10], barId: 'olympic' } : free;
      for (let order = 0; order < 20; order++) sets.push({ id: `${id}-${order}`, sessionId: id, exerciseId: 'bench', order, kind: order < 2 ? 'warmup' : 'work', reps: 10, load, uncertain: false });
    }
    await db.transaction('rw', db.sessions, db.sets, async () => {
      await db.sessions.bulkAdd(sessions);
      await db.sets.bulkAdd(sets);
    });
    await reopen();
    const list = await listFinished(db);
    expect(list).toHaveLength(730);
    expect(list[0]).toEqual({ session: sessions[729], sets: 20 });
    expect(list[729]).toEqual({ session: sessions[0], sets: 20 });
    for (const day of [0, 729]) expect((await finishedDetail(`day-${day}`, db))!.sets).toEqual(sets.slice(day * 20, day * 20 + 20));
    const history = await getPastSessions('bench', 'home', 'barbell', 6, { db });
    expect(history.map((x) => x.date)).toEqual(sessions.slice(-6).reverse().map((x) => x.startedAt));
    expect(history.every((x) => x.sets.length === 18)).toBe(true);
    const s = await startWorkout('home', db, sessions[729]!.endedAt! + 1);
    const logged = await logSet({ id: 'new', sessionId: s.id, exerciseId: 'bench', reps: 11, load: free }, db);
    await reopen();
    expect(await db.sets.count()).toBe(14601);
    expect(await setsOf(s.id, db)).toEqual([logged]);
    expect((await finishedDetail('day-0', db))!.sets).toEqual(sets.slice(0, 20));
  }, 15000);
});
