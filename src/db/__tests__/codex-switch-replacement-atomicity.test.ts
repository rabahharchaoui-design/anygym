import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnyGymDB } from '../schema';
import { makeGym } from '../gyms';
import { previewGymSwitch, switchGym, undoGymSwitch, SwitchUndoStaleError } from '../gymSwitch';
import { deleteSetToken, finishWorkout, logSet, setsOf, startWorkout, updateSet } from '../workouts';
import { getPastSessions } from '../history';
import type { Gym, Load } from '../types';

let db: AnyGymDB;
let home: Gym;
let away: Gym;
beforeEach(async () => {
  db = new AnyGymDB(`codex-switch-replacement-${Math.random()}`);
  await db.open();
  home = makeGym({ name: 'Home', type: 'full', unit: 'lb', isActive: true }, 1);
  away = makeGym({ name: 'Away', type: 'full', unit: 'kg' }, 2);
  await db.gyms.bulkAdd([home, away]);
});
afterEach(async () => { await db.delete(); });
async function reload() {
  const name = db.name;
  db.close();
  db = new AnyGymDB(name);
  await db.open();
}
const pin: Load = { kind: 'stack', unit: 'lb', total: 52.5, stackValue: 50, added: 2.5 };
const kgPin: Load = { kind: 'stack', unit: 'kg', total: 26.25, stackValue: 25, added: 1.25 };
async function prepare() {
  const s = await startWorkout(home.id, db, 1000);
  await logSet({ id: 'home-pin', sessionId: s.id, exerciseId: 'lat-pulldown', reps: 8, load: pin }, db);
  await updateSet('home-pin', { reps: 9, load: pin }, db);
  const preview = await previewGymSwitch(away.id, db);
  return { s, preview };
}

describe('gym switches and committed sets (SPEC 0, 6, 19; PLAN 3.9)', () => {
  // CODEX FOUND BUG: Gym-switch Undo accepts a replacement set when the count is unchanged and moves its machine history to the wrong gym.
  it('does not move a new machine set home when a stale switch Undo sees the same set count', async () => {
    const { s, preview } = await prepare();
    const receipt = await switchGym(away.id, preview.workout!.fp, db, 1200);
    await deleteSetToken('home-pin', db, 1300);
    await logSet({ id: 'away-pin', sessionId: s.id, exerciseId: 'lat-pulldown', reps: 10, load: kgPin }, db);
    // One removed and one logged: the count matches, but these are different lifts at different gyms.
    const before = await setsOf(s.id, db);
    let refusal: unknown;
    try { await undoGymSwitch(receipt, db); } catch (error) { refusal = error; }
    await finishWorkout(s.id, db, 2000);
    await reload();
    expect(await setsOf(s.id, db)).toEqual(before);
    const history = await getPastSessions('lat-pulldown', away.id, 'stack', 6, { db });
    expect(history).toHaveLength(1);
    expect(history[0]!.sets).toEqual([{ kind: 'work', reps: 10, load: kgPin }]);
    expect(await getPastSessions('lat-pulldown', home.id, 'stack', 6, { db })).toEqual([]);
    expect(refusal).toBeInstanceOf(SwitchUndoStaleError);
  });

  it('a failed final gym write rolls back session changes and set stamps, retaining the exact edited load after reload', async () => {
    const { s, preview } = await prepare();
    const sets = await setsOf(s.id, db);
    const session = await db.sessions.get(s.id);
    const gyms = await db.gyms.toArray();
    const fail = () => { throw new Error('synthetic gym write failure'); };
    db.gyms.hook('updating', fail);
    try {
      await expect(switchGym(away.id, preview.workout!.fp, db, 1200)).rejects.toThrow('synthetic gym write failure');
    } finally { db.gyms.hook('updating').unsubscribe(fail); }
    await reload();
    expect(await db.sessions.get(s.id)).toEqual(session);
    expect(await setsOf(s.id, db)).toEqual(sets);
    expect(await db.gyms.toArray()).toEqual(gyms);
    const retry = await previewGymSwitch(away.id, db);
    await switchGym(away.id, retry.workout!.fp, db, 1400);
    await finishWorkout(s.id, db, 2000);
    await reload();
    expect((await setsOf(s.id, db))).toEqual(sets.map((x) => ({ ...x, gymId: home.id })));
    expect((await getPastSessions('lat-pulldown', home.id, 'stack', 6, { db }))[0]!.sets).toEqual([{ kind: 'work', reps: 9, load: pin }]);
  });

  it('a failed switch Undo rolls back unstamping and can be retried after reload without losing the edited set', async () => {
    const { s, preview } = await prepare();
    const receipt = await switchGym(away.id, preview.workout!.fp, db, 1200);
    const session = await db.sessions.get(s.id);
    const sets = await setsOf(s.id, db);
    const gyms = await db.gyms.toArray();
    const fail = () => { throw new Error('synthetic undo gym failure'); };
    db.gyms.hook('updating', fail);
    try {
      await expect(undoGymSwitch(receipt, db)).rejects.toThrow('synthetic undo gym failure');
    } finally { db.gyms.hook('updating').unsubscribe(fail); }
    await reload();
    expect(await db.sessions.get(s.id)).toEqual(session);
    expect(await setsOf(s.id, db)).toEqual(sets);
    expect(await db.gyms.toArray()).toEqual(gyms);
    await undoGymSwitch(receipt, db);
    await finishWorkout(s.id, db, 2000);
    await reload();
    expect(await setsOf(s.id, db)).toEqual(sets.map(({ gymId: _gym, ...x }) => x));
    expect((await getPastSessions('lat-pulldown', home.id, 'stack', 6, { db }))[0]!.sets).toEqual([{ kind: 'work', reps: 9, load: pin }]);
    expect(await getPastSessions('lat-pulldown', away.id, 'stack', 6, { db })).toEqual([]);
  });
});
