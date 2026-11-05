import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnyGymDB } from '../schema';
import { finishedDetail, getPastSessions } from '../history';
import { deleteSet, finishWorkout, logSet, reopenWorkout, setsOf, startWorkout, updateSet, updateSetType } from '../workouts';
import { acceptUndo, recoverDeletes } from '../tombstones';
import { barbellLoad, stackLoad, type LoadSetup } from '../../lib/load';
import { progress } from '../../lib/progression';
import type { Load } from '../types';

// Built PLAN 1.7c, 1.7h, 1.9, 2.0c: corrections must change the next workout's
// coaching, while the actual logged load and its breakdown remain literal evidence.
let db: AnyGymDB;
let n = 0;
beforeEach(async () => {
  db = new AnyGymDB(`anygym-codex-corrected-history-${n++}`);
  await db.open();
});
afterEach(async () => { await db.delete(); });
async function reload() {
  const name = db.name;
  db.close();
  db = new AnyGymDB(name);
  await db.open();
}
const setup: LoadSetup = {
  unit: 'lb', base: 45, plates: [45, 35, 25, 10, 5, 2.5],
  collars: 'none', dumbbellRange: null, stackStep: 5,
};
const bar = barbellLoad(45, [45, 25], 'none', 'lb', 'olympic')!;
async function logWorkout(at: number, reps: number[], load: Load = bar) {
  const session = await startWorkout('home', db, at);
  for (const [i, r] of reps.entries()) {
    await logSet({ id: `${at}-${i}`, sessionId: session.id, exerciseId: 'bench', reps: r, load }, db);
  }
  return session;
}
async function next(kind: Load['kind'] = 'barbell', gym = setup) {
  return progress({ exerciseId: 'bench', loadKind: kind, unit: gym.unit, gym,
    repRange: [8, 12], history: await getPastSessions('bench', 'home', kind, 6, { db }) });
}

describe('SPEC 0, 5, 6: coaching reads corrected durable history', () => {
  it('Undo Finish and a set-type correction replace a false increase with the actual reps to beat', async () => {
    const s = await logWorkout(1000, [12, 7]);
    await updateSetType('1000-1', 'warmup', false, db);
    await finishWorkout(s.id, db, 2000);
    await reload();
    expect((await next()).next.load?.total).toBe(190);
    expect(await reopenWorkout(s.id, undefined, db)).toBe(true);
    await updateSetType('1000-1', 'work', true, db);
    const expected = await setsOf(s.id, db);
    await finishWorkout(s.id, db, 3000);
    await reload();
    const p = await next();
    expect(p.next.kind).toBe('beat_reps');
    expect(p.next.load?.total).toBe(185);
    expect(p.perSet.map((r) => r.target.reps)).toEqual([12, 8]);
    expect((await finishedDetail(s.id, db))!.sets).toEqual(expected);
    expect(expected[1]).toMatchObject({ id: '1000-1', order: 1, kind: 'work', failure: true, reps: 7, load: bar });
  });

  it('an accepted delete Undo restores the missed set before Finish and prevents an unsafe increase', async () => {
    const s = await logWorkout(1000, [12, 12, 7]);
    const expected = await setsOf(s.id, db);
    await deleteSet('1000-2', db, 1500);
    expect(await acceptUndo('1000-2', db)).toBe(true);
    await reload();
    expect(await recoverDeletes(s.id, db, 999999)).toEqual({ restored: ['1000-2'], expired: [], failed: [] });
    await finishWorkout(s.id, db, 2000);
    await reload();
    const p = await next();
    expect(p.next.kind).toBe('beat_reps');
    expect(p.next.load?.total).toBe(185);
    expect(p.perSet.map((r) => r.target.reps)).toEqual([12, 12, 8]);
    expect((await finishedDetail(s.id, db))!.sets).toEqual(expected);
    expect(await db.tombstones.count()).toBe(0);
  });

  it('an edited stack miss triggers the two-session reset using pin plus added weight, without rewriting either session', async () => {
    // 100 pin + 100 added = 200; the reset is 180, with the same 100 added.
    const load = stackLoad(100, 'lb', 100);
    const old = await logWorkout(1000, [7, 10], load);
    await finishWorkout(old.id, db, 2000);
    const s = await logWorkout(3000, [12, 12], load);
    await updateSet('3000-1', { reps: 7, load }, db);
    const expected = await setsOf(s.id, db);
    const previous = await finishedDetail(old.id, db);
    await finishWorkout(s.id, db, 4000);
    await reload();
    const p = await next('stack');
    expect(p.next.kind).toBe('reset');
    expect(p.next.reason).toBe('Reset and build back up');
    expect(p.next.load).toEqual(stackLoad(80, 'lb', 100));
    expect(p.perSet.map((r) => r.target.reps)).toEqual([12, 12]);
    expect(p.lastTime!.sets.map((x) => x.load)).toEqual([load, load]);
    expect((await finishedDetail(s.id, db))!.sets).toEqual(expected);
    expect(await finishedDetail(old.id, db)).toEqual(previous);
    expect(await getPastSessions('bench', 'other-gym', 'stack', 6, { db })).toEqual([]);
  });
});
