import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeGym } from '../gyms';
import { previewGymSwitch, switchGym } from '../gymSwitch';
import { finishedDetail, getPastSessions } from '../history';
import { AnyGymDB } from '../schema';
import { acceptUndo } from '../tombstones';
import type { Gym, Load } from '../types';
import { deleteSetToken, finishWorkout, logSet, reopenWorkout, setsOf, startWorkout, updateSet } from '../workouts';

let db: AnyGymDB;
let gyms: Gym[];
let seq = 0;
beforeEach(async () => {
  db = new AnyGymDB(`anygym-codex-multi-gym-delete-${seq++}`);
  await db.open();
  gyms = [makeGym({ name: 'Home', type: 'full', unit: 'lb', isActive: true }, 1),
    makeGym({ name: 'Away', type: 'full', unit: 'kg' }, 2),
    makeGym({ name: 'Third gym', type: 'full', unit: 'lb' }, 3)];
  await db.gyms.bulkAdd(gyms);
});
afterEach(async () => { await db.delete(); });
async function reload() {
  const name = db.name;
  db.close();
  db = new AnyGymDB(name);
  await db.open();
}
async function move(gym: Gym) {
  const preview = await previewGymSwitch(gym.id, db);
  return switchGym(gym.id, preview.workout!.fp, db, 1500);
}
const pin: Load = { kind: 'stack', unit: 'lb', total: 52.5, stackValue: 50, added: 2.5 };
const smith: Load = { kind: 'barbell', unit: 'lb', total: 95, barWeight: 5, perSide: [45], collars: 0, barId: 'smith' };

// SPEC 0, 5, 6; completed PLAN 1.7h, 2.0c, 3.8a and 3.9.
// Single-switch Undo is covered elsewhere; here Finish itself restores accepted
// deletions after TWO switches, then Undo Finish must retain the original provenance.
describe('accepted deletion evidence across multiple gyms', () => {
  it('Finish restores corrected pin and Smith sets at their original gym after two switches and survives Undo Finish', async () => {
    const home = gyms[0]!;
    const s = await startWorkout(home.id, db, 1000);
    const expected = [];
    for (const [id, load] of [['pin', pin], ['smith', smith]] as const) {
      await logSet({ id, sessionId: s.id, exerciseId: 'barbell-bench-press', reps: 8, load }, db);
      const corrected = await updateSet(id, { reps: 9, load }, db);
      expected.push({ ...corrected, gymId: home.id });
      const deletion = (await deleteSetToken(id, db, 1100))!;
      expect(await acceptUndo(id, db, deletion.token)).toBe(true);
    }
    await move(gyms[1]!);
    await reload();
    await move(gyms[2]!);
    await reload();
    expect(await setsOf(s.id, db)).toEqual([]);
    expect((await db.tombstones.toArray()).every((t) => t.undo && t.set.gymId === home.id)).toBe(true);
    expect(await finishWorkout(s.id, db, 2000)).toEqual({ saved: true, sets: 2 });
    await reload();
    expect((await finishedDetail(s.id, db))!.sets).toEqual(expected);
    expect(await reopenWorkout(s.id, undefined, db)).toBe(true);
    await finishWorkout(s.id, db, 3000);
    await reload();
    expect((await finishedDetail(s.id, db))!.sets).toEqual(expected);
    expect(await db.tombstones.count()).toBe(0);
    for (const load of [pin, smith]) {
      const opts = { db, smith: load === smith, defaultBar: 'olympic' as const };
      expect((await getPastSessions('barbell-bench-press', home.id, load.kind, 6, opts))[0]!.sets)
        .toEqual([{ kind: 'work', reps: 9, load }]);
      for (const gym of gyms.slice(1)) expect(await getPastSessions('barbell-bench-press', gym.id, load.kind, 6, opts)).toEqual([]);
    }
  });

  it('a failed tombstone gym stamp rolls back the live set stamp too, then Retry and Finish restore both exact loads', async () => {
    const home = gyms[0]!;
    const s = await startWorkout(home.id, db, 1000);
    await logSet({ id: 'live', sessionId: s.id, exerciseId: 'lat-pulldown', reps: 8, load: pin }, db);
    await logSet({ id: 'deleted', sessionId: s.id, exerciseId: 'barbell-bench-press', reps: 9, load: smith }, db);
    const deletion = (await deleteSetToken('deleted', db, 1100))!;
    await acceptUndo('deleted', db, deletion.token);
    const before = { session: await db.sessions.get(s.id), sets: await setsOf(s.id, db),
      gyms: await db.gyms.toArray(), tomb: await db.tombstones.get('deleted') };
    const fail = () => { throw new Error('synthetic tombstone stamp failure'); };
    db.tombstones.hook('updating', fail);
    try {
      await expect(move(gyms[1]!)).rejects.toThrow('synthetic tombstone stamp failure');
    } finally { db.tombstones.hook('updating').unsubscribe(fail); }
    await reload();
    expect(await db.sessions.get(s.id)).toEqual(before.session);
    expect(await setsOf(s.id, db)).toEqual(before.sets);
    expect(await db.gyms.toArray()).toEqual(before.gyms);
    expect(await db.tombstones.get('deleted')).toEqual(before.tomb);
    await move(gyms[1]!);
    await finishWorkout(s.id, db, 2000);
    await reload();
    expect((await finishedDetail(s.id, db))!.sets).toEqual([
      { ...before.sets[0]!, gymId: home.id }, { ...deletion.set, gymId: home.id },
    ]);
    expect(await db.tombstones.count()).toBe(0);
  });
});
