import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { AnyGymDB } from '../schema';
import { makeGym } from '../gyms';
import { previewGymSwitch, switchGym } from '../gymSwitch';
import { getPastSessions } from '../history';
import { finishWorkout, setsOf, startWorkout } from '../workouts';
import { saveDraft, type Draft } from '../../lib/drafts';
import { stackLoad } from '../../lib/load';
import { createLogQueue } from '../../lib/logQueue';
import { markSubmitted, rowKey } from '../../lib/setTable';
import { retryFailed, submitRow } from '../../screens/workout/rowLog';

let db: AnyGymDB;
let seq = 0;
beforeEach(async () => { db = new AnyGymDB(`codex-rechecked-gym-${seq++}`); await db.open(); });
afterEach(async () => { await db.delete(); });
async function reload() {
  const name = db.name;
  db.close();
  db = new AnyGymDB(name);
  await db.open();
}
function phone() {
  const disk = new Map<string, string>();
  return { getItem: (key: string) => disk.get(key) ?? null,
    setItem: (key: string, value: string) => { disk.set(key, value); },
    removeItem: (key: string) => { disk.delete(key); } };
}

// SPEC 6/13; completed PLAN 3.8b. Existing gym-of-tap tests retry the
// original draft directly; none recheck the row through markSubmitted.
// CODEX FOUND BUG: Rechecking a failed Log after switching gyms replaces the captured gym and moves machine history to the wrong gym.
it.each([0, 1])('rechecking failed revision %i keeps the original gym through restart, Retry twice and Finish', async (rev) => {
  const home = makeGym({ name: 'Home', type: 'full', unit: 'lb', isActive: true }, 1);
  const away = makeGym({ name: 'Away', type: 'full', unit: 'lb' }, 2);
  await db.gyms.bulkAdd([home, away]);
  const s = await startWorkout(home.id, db, 1000);
  const storage = phone();
  const load = stackLoad(50, 'lb', 2.5);
  const values = { load, reps: 19, type: 'normal' as const, gymId: home.id };
  const picked: Draft = { id: 'lift', load, reps: 19, rev };
  const first = markSubmitted([picked], [], 0, values, () => 'unused').draft;
  expect(first).toMatchObject({ submitted: rev, gymId: home.id });
  saveDraft(s.id, rowKey('lat-pulldown', 0), first, storage);
  const fail = () => { throw new Error('synthetic first journal failure'); };
  db.journal.hook('creating', fail);
  try {
    expect(await submitRow(s.id, 'lat-pulldown', first, { db, storage, queue: createLogQueue() })).toBe(false);
  } finally { db.journal.hook('creating').unsubscribe(fail); }
  expect(await db.journal.count()).toBe(0);
  expect(await setsOf(s.id, db)).toEqual([]);
  const preview = await previewGymSwitch(away.id, db);
  await switchGym(away.id, preview.workout!.fp, db, 1200);
  // The same failed row is checked again, rather than a new lift at Away.
  const again = markSubmitted([first], [], 0, { ...values, gymId: away.id }, () => 'unused').draft;
  expect.soft(again.gymId).toBe(home.id);
  saveDraft(s.id, rowKey('lat-pulldown', 0), again, storage);
  await reload();
  const deps = { db, storage, queue: createLogQueue() };
  expect(await retryFailed(s.id, deps)).toBe(true);
  expect(await retryFailed(s.id, deps)).toBe(true);
  const saved = await setsOf(s.id, db);
  expect(saved).toHaveLength(1);
  expect.soft(saved[0]).toMatchObject({ id: 'lift', gymId: home.id, reps: 19, load });
  expect(await finishWorkout(s.id, db, 2000)).toEqual({ saved: true, sets: 1 });
  await reload();
  expect(await setsOf(s.id, db)).toEqual(saved);
  expect.soft((await getPastSessions('lat-pulldown', home.id, 'stack', 6, { db })).map((p) => p.sets))
    .toEqual([[{ kind: 'work', reps: 19, load }]]);
  expect.soft(await getPastSessions('lat-pulldown', away.id, 'stack', 6, { db })).toEqual([]);
});

it('an unsubmitted row captures the current gym rather than a stale gym on the pick', () => {
  const load = stackLoad(50, 'lb', 2.5);
  const picked: Draft = { id: 'fresh', load, reps: 19, rev: 1, gymId: 'old-gym' };
  const { draft } = markSubmitted([picked], [], 0,
    { load, reps: 19, type: 'normal', gymId: 'current-gym' }, () => 'unused');
  expect(draft).toMatchObject({ id: 'fresh', submitted: 1, gymId: 'current-gym', load, reps: 19 });
});
