import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnyGymDB } from '../schema';
import { makeGym } from '../gyms';
import { setEquipmentWeight, setGymUnit } from '../equipment';
import { previewGymSwitch, switchGym } from '../gymSwitch';
import { finishedDetail, getPastSessions } from '../history';
import { undoDelete } from '../tombstones';
import { deleteSetToken, finishWorkout, logSet, setsOf, startWorkout, updateSet } from '../workouts';
import type { Gym, Load } from '../types';

let db: AnyGymDB;
let gym: Gym;
let n = 0;
beforeEach(async () => {
  db = new AnyGymDB(`anygym-codex-equipment-undo-${n++}`);
  await db.open();
  const full = makeGym({ name: 'Home', type: 'full', unit: 'lb', isActive: true });
  gym = { ...full, bars: { ...full.bars, smith: 0 } };
  await db.gyms.add(gym);
});
afterEach(async () => { await db.delete(); });
async function reopen() {
  const name = db.name;
  db.close();
  db = new AnyGymDB(name);
  await db.open();
}
const smith: Load = { kind: 'barbell', unit: 'lb', total: 90, barWeight: 0, perSide: [45] };
const history = (gymId: string, smithOnly: boolean) =>
  getPastSessions('barbell-bench-press', gymId, 'barbell', 6, { db, smith: smithOnly, defaultBar: 'olympic' });

describe('equipment changes preserve the evidence held by Undo (SPEC 0, 5, 6; PLAN 2.0c, 3.9)', () => {
  // CODEX FOUND BUG: Changing gym units while a legacy Smith set is deleted loses its Smith history after Undo.
  it('keeps deleted legacy Smith history after a unit change, restart, Undo and Finish', async () => {
    const s = await startWorkout(gym.id, db, 1000);
    await logSet({ id: 'old-smith', sessionId: s.id, exerciseId: 'barbell-bench-press', reps: 8, load: smith }, db);
    const deleted = (await deleteSetToken('old-smith', db, 1100))!;
    await setGymUnit(gym.id, 'kg', db);
    await reopen();
    await undoDelete(deleted.set.id, db, deleted.token);
    await finishWorkout(s.id, db, 2000);
    await reopen();
    expect((await setsOf(s.id, db))[0]).toMatchObject({ id: 'old-smith', order: 0, reps: 8,
      load: { unit: 'lb', total: 90, barWeight: 0, perSide: [45] } });
    expect(await history(gym.id, false)).toEqual([]);
    expect((await history(gym.id, true)).map((p) => p.sets[0]!.load.total)).toEqual([90]);
  });

  // CODEX FOUND BUG: Changing the Smith bar answer while a legacy Smith set is deleted reclassifies it as Olympic after Undo.
  it('does not turn a deleted Smith set into Olympic history when the Smith answer changes before Undo', async () => {
    const s = await startWorkout(gym.id, db, 1000);
    await logSet({ id: 'old-smith', sessionId: s.id, exerciseId: 'barbell-bench-press', reps: 8, load: smith }, db);
    const deleted = (await deleteSetToken('old-smith', db, 1100))!;
    await setEquipmentWeight(gym.id, 'smith_machine', { kind: 'bar_weight', value: 25 }, db, 'lb');
    await reopen();
    await undoDelete(deleted.set.id, db, deleted.token);
    await finishWorkout(s.id, db, 2000);
    await reopen();
    expect(await history(gym.id, false)).toEqual([]);
    expect((await history(gym.id, true)).map((p) => p.sets[0]!.load)).toMatchObject([smith]);
  });

  // CODEX FOUND BUG: A gym unit change skips legacy sets stamped with that gym when their session has moved to another gym.
  it('preserves legacy bar identity when its original gym changes units after the workout moved gyms', async () => {
    const other = makeGym({ name: 'Away', type: 'full', unit: 'kg' });
    await db.gyms.add(other);
    const s = await startWorkout(gym.id, db, 1000);
    await logSet({ id: 'home-smith', sessionId: s.id, exerciseId: 'barbell-bench-press', reps: 8, load: smith }, db);
    const preview = await previewGymSwitch(other.id, db);
    await switchGym(other.id, preview.workout!.fp, db, 1200);
    expect((await db.sets.get('home-smith'))!.gymId).toBe(gym.id);
    await setGymUnit(gym.id, 'kg', db);
    await finishWorkout(s.id, db, 2000);
    await reopen();
    expect(await history(other.id, true)).toEqual([]);
    expect((await history(gym.id, true)).map((p) => p.sets[0]!.load.total)).toEqual([90]);
  });

  // CODEX FOUND BUG: Switching gyms while a machine set is deleted assigns its restored history to the destination gym.
  it('keeps a deleted machine set at its original gym when switching gyms before Undo', async () => {
    const other = makeGym({ name: 'Away', type: 'full', unit: 'kg' });
    await db.gyms.add(other);
    const s = await startWorkout(gym.id, db, 1000);
    const load: Load = { kind: 'stack', unit: 'lb', total: 52.5, stackValue: 50, added: 2.5 };
    await logSet({ id: 'home-pin', sessionId: s.id, exerciseId: 'lat-pulldown', reps: 10, load }, db);
    const deleted = (await deleteSetToken('home-pin', db, 1100))!;
    const preview = await previewGymSwitch(other.id, db);
    await switchGym(other.id, preview.workout!.fp, db, 1200);
    await reopen();
    await undoDelete('home-pin', db, deleted.token);
    await finishWorkout(s.id, db, 2000);
    await reopen();
    expect((await finishedDetail(s.id, db))!.sets).toMatchObject([{ id: 'home-pin', reps: 10, load }]);
    expect(await getPastSessions('lat-pulldown', other.id, 'stack', 6, { db })).toEqual([]);
    const past = await getPastSessions('lat-pulldown', gym.id, 'stack', 6, { db });
    expect(past).toHaveLength(1);
    expect(past[0]!.sets).toEqual([{ kind: 'work', reps: 10, load }]);
  });

  it('retains explicit mixed-unit machine loads and each gym through switch, edit, delete Undo and Finish', async () => {
    const other = makeGym({ name: 'Away', type: 'full', unit: 'kg' });
    await db.gyms.add(other);
    const s = await startWorkout(gym.id, db, 1000);
    const home: Load = { kind: 'plate_machine', unit: 'lb', total: 140, barWeight: 50, perSide: [45], collars: 0 };
    const away: Load = { kind: 'plate_machine', unit: 'kg', total: 67.5, barWeight: 25, perSide: [20, 1.25], collars: 0 };
    await logSet({ id: 'home', sessionId: s.id, exerciseId: 'leg-press', reps: 8, load: home }, db);
    const preview = await previewGymSwitch(other.id, db);
    await switchGym(other.id, preview.workout!.fp, db, 1200);
    await logSet({ id: 'away', sessionId: s.id, exerciseId: 'leg-press', reps: 10, load: away }, db);
    await updateSet('home', { reps: 9, load: home }, db);
    const expected = await setsOf(s.id, db);
    const deleted = (await deleteSetToken('home', db, 1300))!;
    await reopen();
    await undoDelete('home', db, deleted.token);
    await finishWorkout(s.id, db, 2000);
    await reopen();
    expect((await finishedDetail(s.id, db))!.sets).toEqual(expected);
    for (const [gymId, load, reps] of [[gym.id, home, 9], [other.id, away, 10]] as const) {
      const past = await getPastSessions('leg-press', gymId, 'plate_machine', 6, { db });
      expect(past).toHaveLength(1);
      expect(past[0]!.sets).toEqual([{ kind: 'work', reps, load }]);
    }
  });
});
