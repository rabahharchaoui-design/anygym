import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnyGymDB } from '../schema';
import { makeGym } from '../gyms';
import { setGymUnit } from '../equipment';
import { previewGymSwitch, switchGym, undoGymSwitch } from '../gymSwitch';
import { getPastSessions } from '../history';
import { undoDelete } from '../tombstones';
import { deleteSetToken, finishWorkout, logSet, setsOf, startWorkout } from '../workouts';
import type { Gym, Load } from '../types';

let db: AnyGymDB;
let gym: Gym;
let n = 0;
beforeEach(async () => {
  db = new AnyGymDB(`anygym-verify-38a-${n++}`);
  await db.open();
  const full = makeGym({ name: 'Home', type: 'full', unit: 'lb', isActive: true });
  gym = { ...full, bars: { ...full.bars, smith: 0 } };
  await db.gyms.add(gym);
});
afterEach(async () => { await db.delete(); });
async function reopen() { const name = db.name; db.close(); db = new AnyGymDB(name); await db.open(); }
const smith: Load = { kind: 'barbell', unit: 'lb', total: 90, barWeight: 0, perSide: [45] };
const hist = (gymId: string, smithOnly: boolean) =>
  getPastSessions('barbell-bench-press', gymId, 'barbell', 6, { db, smith: smithOnly, defaultBar: 'olympic' });

describe('3.8a verify', () => {
  it('a: deleted legacy Smith set, lb->kg, Undo, Finish, reopen', async () => {
    const s = await startWorkout(gym.id, db, 1000);
    await logSet({ id: 'o', sessionId: s.id, exerciseId: 'barbell-bench-press', reps: 8, load: smith }, db);
    const d = (await deleteSetToken('o', db, 1100))!;
    await setGymUnit(gym.id, 'kg', db);
    await undoDelete('o', db, d.token);
    await finishWorkout(s.id, db, 2000);
    await reopen();
    const row = (await setsOf(s.id, db))[0]!;
    expect(row.load).toMatchObject({ barWeight: 0, barId: expect.any(String) });
    expect(await hist(gym.id, false)).toEqual([]);
    const h = await hist(gym.id, true);
    expect(h).toHaveLength(1);
    // converted through load.ts: stored lb load kept; history reports its unit
    expect(h[0]!.sets[0]!.load.total).toBe(90);
    expect(h[0]!.sets[0]!.load.unit).toBe('lb');
  });

  it('b: deleted machine set, switch A->B, Undo, then undo switch: no double stamp', async () => {
    const other = makeGym({ name: 'Away', type: 'full', unit: 'kg' });
    await db.gyms.add(other);
    const s = await startWorkout(gym.id, db, 1000);
    const load: Load = { kind: 'stack', unit: 'lb', total: 52.5, stackValue: 50, added: 2.5 };
    await logSet({ id: 'p', sessionId: s.id, exerciseId: 'lat-pulldown', reps: 10, load }, db);
    const d = (await deleteSetToken('p', db, 1100))!;
    const pv = await previewGymSwitch(other.id, db);
    const rc = await switchGym(other.id, pv.workout!.fp, db, 1200);
    expect((await db.tombstones.get('p'))!.set.gymId).toBe(gym.id);
    // undo the switch BEFORE restoring: tombstone stamp removed
    await undoGymSwitch(rc, db);
    expect((await db.tombstones.get('p'))!.set.gymId).toBeUndefined();
    expect((await db.sessions.get(s.id))!.gymId).toBe(gym.id);
    // switch again, Undo delete, finish
    const pv2 = await previewGymSwitch(other.id, db);
    await switchGym(other.id, pv2.workout!.fp, db, 1300);
    await undoDelete('p', db, d.token);
    expect((await db.sets.get('p'))!.gymId).toBe(gym.id);
    await finishWorkout(s.id, db, 2000);
    expect(await getPastSessions('lat-pulldown', other.id, 'stack', 6, { db })).toEqual([]);
    expect(await getPastSessions('lat-pulldown', gym.id, 'stack', 6, { db })).toHaveLength(1);
  });

  it('b2: machine set deleted, switch, Undo delete first, then undo switch', async () => {
    const other = makeGym({ name: 'Away', type: 'full', unit: 'kg' });
    await db.gyms.add(other);
    const s = await startWorkout(gym.id, db, 1000);
    const load: Load = { kind: 'stack', unit: 'lb', total: 52.5, stackValue: 50, added: 2.5 };
    await logSet({ id: 'p', sessionId: s.id, exerciseId: 'lat-pulldown', reps: 10, load }, db);
    const d = (await deleteSetToken('p', db, 1100))!;
    const pv = await previewGymSwitch(other.id, db);
    const rc = await switchGym(other.id, pv.workout!.fp, db, 1200);
    await undoDelete('p', db, d.token);
    let err: unknown;
    try { await undoGymSwitch(rc, db); } catch (e) { err = e; }
    // either a clean stale refusal or a clean revert: never a lost/duplicated set
    const all = await db.sets.toArray();
    expect(all.filter((x) => x.id === 'p')).toHaveLength(1);
    expect(await db.tombstones.get('p')).toBeUndefined();
    if (!err) expect((await db.sets.get('p'))!.gymId).toBeUndefined();
    else expect((await db.sets.get('p'))!.gymId).toBe(gym.id);
  });

  it('c: legacy set stamped A, session moved to B, A changes units', async () => {
    const other = makeGym({ name: 'Away', type: 'full', unit: 'kg' });
    await db.gyms.add(other);
    const s = await startWorkout(gym.id, db, 1000);
    await logSet({ id: 'h', sessionId: s.id, exerciseId: 'barbell-bench-press', reps: 8, load: smith }, db);
    const pv = await previewGymSwitch(other.id, db);
    await switchGym(other.id, pv.workout!.fp, db, 1200);
    await setGymUnit(gym.id, 'kg', db);
    const x = (await db.sets.get('h'))!;
    expect(x.gymId).toBe(gym.id);
    expect((x.load as { barId?: string }).barId).toBeDefined();
    await finishWorkout(s.id, db, 2000);
    expect(await hist(other.id, true)).toEqual([]);
    expect((await hist(gym.id, true)).map((p) => p.sets[0]!.load.total)).toEqual([90]);
  });

  it('c2: unit change of B must not touch A-stamped set', async () => {
    const other = makeGym({ name: 'Away', type: 'full', unit: 'kg' });
    await db.gyms.add(other);
    const s = await startWorkout(gym.id, db, 1000);
    await logSet({ id: 'h', sessionId: s.id, exerciseId: 'barbell-bench-press', reps: 8, load: smith }, db);
    const pv = await previewGymSwitch(other.id, db);
    await switchGym(other.id, pv.workout!.fp, db, 1200);
    await setGymUnit(other.id, 'lb', db);
    expect((await db.sets.get('h'))!.load).toEqual(smith);
  });

  it('d: live legacy set, unit change stamps bar as before', async () => {
    const s = await startWorkout(gym.id, db, 1000);
    await logSet({ id: 'l', sessionId: s.id, exerciseId: 'barbell-bench-press', reps: 8, load: smith }, db);
    await setGymUnit(gym.id, 'kg', db);
    expect((await db.sets.get('l'))!.load).toMatchObject({ barId: expect.any(String) });
    await finishWorkout(s.id, db, 2000);
    expect((await hist(gym.id, true)).map((p) => p.sets[0]!.load.total)).toEqual([90]);
  });
});
