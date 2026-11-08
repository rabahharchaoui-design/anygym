import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnyGymDB } from '../schema';
import { makeGym } from '../gyms';
import { setEquipmentWeight, setGymUnit } from '../equipment';
import { finishedDetail, getPastSessions } from '../history';
import { undoDelete } from '../tombstones';
import { deleteSetToken, finishWorkout, logSet, setsOf, startWorkout, updateSet } from '../workouts';
import type { Gym, Load } from '../types';

let db: AnyGymDB;
let gym: Gym;
let n = 0;
beforeEach(async () => {
  db = new AnyGymDB(`anygym-codex-equipment-rollback-${n++}`);
  await db.open();
  const full = makeGym({ name: 'Synthetic home', type: 'full', unit: 'lb', isActive: true });
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

// SPEC 0, 2, 5, 6; completed PLAN 3.8a: preservation of live AND deleted
// legacy bars must commit with the equipment answer, never ahead of it.
describe('equipment migration failures preserve live lifts and the exact Delete Undo evidence', () => {
  for (const operation of ['units', 'smith answer'] as const) {
    it.each(['tombstone', 'gym'] as const)(`${operation}: failure writing %s rolls everything back, then retry survives Undo and Finish`, async (boundary) => {
      const s = await startWorkout(gym.id, db, 1000);
      const smith: Load = { kind: 'barbell', unit: 'lb', total: 90, barWeight: 0, perSide: [45] };
      const olympic: Load = { kind: 'barbell', unit: 'lb', total: 135, barWeight: 45, perSide: [45] };
      await logSet({ id: 'live', sessionId: s.id, exerciseId: 'barbell-bench-press', reps: 8, load: smith }, db);
      await logSet({ id: 'deleted', sessionId: s.id, exerciseId: 'barbell-bench-press', reps: 8, load: smith }, db);
      await updateSet('deleted', { reps: 11, load: smith }, db);
      await logSet({ id: 'free', sessionId: s.id, exerciseId: 'barbell-bench-press', reps: 9, load: olympic }, db);
      const deletion = (await deleteSetToken('deleted', db, 1500))!;
      const before = {
        sets: await setsOf(s.id, db), tomb: await db.tombstones.get('deleted'),
        receipts: await db.submissions.toArray(), counter: await db.orderCounters.get(s.id),
        session: await db.sessions.get(s.id),
      };
      const migrate = () => operation === 'units'
        ? setGymUnit(gym.id, 'kg', db)
        : setEquipmentWeight(gym.id, 'smith_machine', { kind: 'bar_weight', value: 25 }, db, 'lb');
      // The tombstone write follows live-set preservation; the gym write follows both.
      // Throw at each boundary to detect partial commits, rather than failing before work starts.
      const fail = () => { throw new Error(`synthetic ${boundary} write failure`); };
      if (boundary === 'tombstone') db.tombstones.hook('updating', fail);
      else db.gyms.hook('updating', fail);
      try {
        await expect(migrate()).rejects.toThrow(`synthetic ${boundary} write failure`);
      } finally {
        if (boundary === 'tombstone') db.tombstones.hook('updating').unsubscribe(fail);
        else db.gyms.hook('updating').unsubscribe(fail);
      }
      await reopen();
      expect(await db.gyms.get(gym.id)).toEqual(gym);
      expect(await setsOf(s.id, db)).toEqual(before.sets);
      expect(await db.tombstones.get('deleted')).toEqual(before.tomb);
      expect(await db.submissions.toArray()).toEqual(before.receipts);
      expect(await db.orderCounters.get(s.id)).toEqual(before.counter);
      expect(await db.sessions.get(s.id)).toEqual(before.session);

      await migrate();
      await reopen();
      expect((await db.tombstones.get('deleted'))!.token).toBe(deletion.token);
      await undoDelete('deleted', db, deletion.token);
      await finishWorkout(s.id, db, 3000);
      await reopen();
      const detail = (await finishedDetail(s.id, db))!;
      expect(detail.sets).toEqual([
        { ...before.sets[0]!, load: { ...smith, barId: 'smith' } },
        { ...deletion.set, load: { ...smith, barId: 'smith' } },
        { ...before.sets[1]!, load: { ...olympic, barId: 'olympic' } },
      ]);
      expect(detail.sets.map((row) => row.order)).toEqual([0, 1, 2]);
      expect(await db.tombstones.count()).toBe(0);
      const pastSmith = await getPastSessions('barbell-bench-press', gym.id, 'barbell', 6, { db, smith: true, defaultBar: 'olympic' });
      expect(pastSmith[0]!.sets).toEqual([
        { kind: 'work', reps: 8, load: { ...smith, barId: 'smith' } },
        { kind: 'work', reps: 11, load: { ...smith, barId: 'smith' } },
      ]);
      const pastFree = await getPastSessions('barbell-bench-press', 'another-gym', 'barbell', 6, { db, defaultBar: 'olympic' });
      expect(pastFree[0]!.sets).toEqual([{ kind: 'work', reps: 9, load: { ...olympic, barId: 'olympic' } }]);
    });
  }
});
