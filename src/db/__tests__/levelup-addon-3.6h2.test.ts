// PLAN 3.6h2 (2): from the Level up decision to the stored target to the workout row, a stack's
// add-on stays: Level up gives 105 pin + 50 (155 lb), Not now keeps 100 pin + 50 (150 lb).
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnyGymDB } from '../schema';
import { applyChanges, coachTargets } from '../coach';
import { holdChanges, liftVerdict, withTarget } from '../../lib/coach';
import { loadAt, stackLoad, type LoadSetup } from '../../lib/load';
import type { Progression } from '../../lib/progression';
import { KG, LB, NOW, lift, nov, sess } from '../../lib/__tests__/coach/fixtures';

let db: AnyGymDB;
let name: string;
beforeEach(async () => {
  name = `levelup-addon-${Math.random()}`;
  db = new AnyGymDB(name);
  await db.open();
});
afterEach(async () => {
  db.close();
  await Dexie.delete(name);
});

const KEY = 'lat-pulldown|g1|stack';
const raiseOf = (setup: LoadSetup, pin: number, added: number) => {
  const l = lift({ key: KEY, exerciseId: 'lat-pulldown', name: 'Lat Pulldown', loadKind: 'stack', pattern: 'vertical pull', setup, sessions: [sess(nov(5), [12, 12, 12], stackLoad(pin, setup.unit, added))] });
  const v = liftVerdict(l, [], NOW);
  if (!v || !('raise' in v)) throw new Error('expected a raise');
  return v.raise;
};
const empty: Progression = { lastTime: null, next: { load: null, reps: [8, 12], reason: '', kind: 'first_time' }, perSet: [{}, {}, {}] } as unknown as Progression;

/** What the exercise screen builds from the stored target (useWorkout: loadAt with the add-on, withTarget). */
async function workoutRow(setup: LoadSetup) {
  const t = (await coachTargets(db)).get(KEY)!;
  const load = loadAt('stack', t.value, setup, t.added ?? 0)!;
  return withTarget(empty, t, load, [8, 12]).perSet[0]!.target!.load;
}

describe('Level up and Not now keep the add-on down to the workout row', () => {
  it('lb Level up: stored 105 + 50, the row is 155 lb', async () => {
    const raise = raiseOf(LB, 100, 50);
    await applyChanges('levelup:x', 'x', [raise], db, NOW);
    expect((await coachTargets(db)).get(KEY)).toMatchObject({ value: 105, added: 50, source: 'level_up' });
    expect(await workoutRow(LB)).toEqual({ kind: 'stack', unit: 'lb', total: 155, stackValue: 105, added: 50 });
  });

  it('lb Not now: stored 100 + 50, the row is 150 lb (never the 100 lb pin alone)', async () => {
    await applyChanges('levelup:x', 'x', holdChanges({ earned: [raiseOf(LB, 100, 50)] }, NOW), db, NOW);
    expect((await coachTargets(db)).get(KEY)).toMatchObject({ value: 100, added: 50, source: 'hold' });
    expect(await workoutRow(LB)).toEqual({ kind: 'stack', unit: 'lb', total: 150, stackValue: 100, added: 50 });
  });

  it('kg Level up and Not now: 52.5 + 25 = 77.5 kg, 50 + 25 = 75 kg', async () => {
    await applyChanges('levelup:k', 'k', [raiseOf(KG, 50, 25)], db, NOW);
    expect((await workoutRow(KG))?.total).toBe(77.5);
    await applyChanges('levelup:k2', 'k2', holdChanges({ earned: [raiseOf(KG, 50, 25)] }, NOW), db, NOW + 1);
    expect(await workoutRow(KG)).toEqual({ kind: 'stack', unit: 'kg', total: 75, stackValue: 50, added: 25 });
  });
});
