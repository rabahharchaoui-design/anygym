// PLAN 3.8b (bughunt 1108-0142 #7): the gym captured when Log is tapped travels unchanged through the
// draft and onto the saved set, so a gym switch in the gap before the write cannot re-home it.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnyGymDB } from '../schema';
import { makeGym } from '../gyms';
import { previewGymSwitch, switchGym } from '../gymSwitch';
import { logSet, setsOf, startWorkout } from '../workouts';
import { markSubmitted } from '../../lib/setTable';
import type { Gym, Load } from '../types';

let db: AnyGymDB;
let home: Gym;
let away: Gym;
beforeEach(async () => {
  db = new AnyGymDB(`log-gym-${Math.random()}`);
  await db.open();
  home = makeGym({ name: 'Home', type: 'full', unit: 'lb', isActive: true }, 1);
  away = makeGym({ name: 'Away', type: 'full', unit: 'lb' }, 2);
  await db.gyms.bulkAdd([home, away]);
});
afterEach(async () => {
  await db.delete();
});
const pin: Load = { kind: 'stack', unit: 'lb', total: 50, stackValue: 50, added: 0 };

describe('the gym a set was tapped at (PLAN 3.8b)', () => {
  it('a switch between the tap and the write leaves the set at the gym it was tapped at', async () => {
    const s = await startWorkout(home.id, db, 1000);
    // Log tapped at Home (gym captured), the write not landed yet; the lifter switches to Away.
    const preview = await previewGymSwitch(away.id, db);
    await switchGym(away.id, preview.workout!.fp, db, 1200);
    await logSet({ id: 'late', sessionId: s.id, exerciseId: 'lat-pulldown', reps: 8, load: pin, gymId: home.id }, db);
    // A set tapped at Away after the switch carries nothing extra (it is its workout's gym).
    await logSet({ id: 'later', sessionId: s.id, exerciseId: 'lat-pulldown', reps: 8, load: pin, gymId: away.id }, db);
    const sets = await setsOf(s.id, db);
    expect(sets.find((x) => x.id === 'late')!.gymId).toBe(home.id);
    expect(sets.find((x) => x.id === 'later')!.gymId).toBeUndefined();
  });

  it('with no switch the set carries no stamp (nothing changes for an ordinary workout)', async () => {
    const s = await startWorkout(home.id, db, 1000);
    await logSet({ id: 'a', sessionId: s.id, exerciseId: 'lat-pulldown', reps: 8, load: pin, gymId: home.id }, db);
    expect((await setsOf(s.id, db))[0]!.gymId).toBeUndefined();
  });

  it('markSubmitted stores the captured gym on the submitted draft', () => {
    const { draft } = markSubmitted([], [], 0, { load: pin, reps: 8, type: 'normal', gymId: 'g1' }, () => 'id1');
    expect(draft.gymId).toBe('g1');
  });

  // PLAN 3.6w (3), Codex bughunt 1112-1918 #10: Log at A, the journal write fails, the lifter
  // switches to B, then rechecks the row: the retry is the same submission and keeps A.
  it('rechecking an already submitted draft keeps the gym it was first submitted at', () => {
    const first = markSubmitted([], [], 0, { load: pin, reps: 8, type: 'normal', gymId: 'A' }, () => 'id1');
    expect(first.draft.submitted).toBe(0);
    const again = markSubmitted(first.slots, [], 0, { load: pin, reps: 8, type: 'normal', gymId: 'B' }, () => 'id2');
    expect(again.draft.id).toBe('id1');
    expect(again.draft.gymId).toBe('A');
  });

  it('a fresh submission (a draft never submitted) captures the gym of the tap', () => {
    const typed = { id: 'd1', load: pin, plates: [], unit: 'lb' as const, reps: 8, rev: 2 };
    expect(markSubmitted([typed], [], 0, { load: pin, reps: 8, type: 'normal', gymId: 'B' }, () => 'x').draft.gymId).toBe('B');
  });

  it('db: a failed first Log at Home, a switch to Away, the row rechecked: the set lands at Home', async () => {
    const s = await startWorkout(home.id, db, 1000);
    // Log at Home: the submitted draft is stored; the journal write fails, so nothing is saved.
    const first = markSubmitted([], [], 0, { load: pin, reps: 8, type: 'normal', gymId: home.id }, () => 'set1');
    const preview = await previewGymSwitch(away.id, db);
    await switchGym(away.id, preview.workout!.fp, db, 1200);
    // The row's check at Away: the same draft is marked again and written.
    const { draft } = markSubmitted(first.slots, [], 0, { load: pin, reps: 8, type: 'normal', gymId: away.id }, () => 'set2');
    await logSet({ id: draft.id, sessionId: s.id, exerciseId: 'lat-pulldown', reps: draft.reps!, load: draft.load!, gymId: draft.gymId! }, db);
    const sets = await setsOf(s.id, db);
    expect(sets).toHaveLength(1);
    expect(sets[0]!.gymId).toBe(home.id);
  });
});
