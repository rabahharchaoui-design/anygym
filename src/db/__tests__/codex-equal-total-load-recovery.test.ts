import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnyGymDB } from '../schema';
import type { Load } from '../types';
import { deleteSet, finishWorkout, logSet, restoreSet, setsOf, startWorkout, updateSet } from '../workouts';
import { saveDraft, type Draft } from '../../lib/drafts';
import { createLogQueue } from '../../lib/logQueue';
import { rowKey } from '../../lib/setTable';
import { reconcileSession, rowsOf, submitRow } from '../../screens/workout/rowLog';

let db: AnyGymDB;
let sequence = 0;
beforeEach(async () => {
  db = new AnyGymDB(`anygym-codex-equal-loads-${sequence++}`);
  await db.open();
});
afterEach(async () => { await db.delete(); });
async function reopen() {
  const name = db.name;
  db.close();
  db = new AnyGymDB(name);
  await db.open();
}

describe('equal displayed totals retain different loading evidence (SPEC 0, 5.4, 5.5)', () => {
  const cases: Array<{ name: string; first: Load; second: Load }> = [
    { name: 'kg stack pin plus add-on versus a different pin',
      first: { kind: 'stack', unit: 'kg', total: 52.5, stackValue: 50, added: 2.5 },
      second: { kind: 'stack', unit: 'kg', total: 52.5, stackValue: 52.5, added: 0 } },
    { name: 'lb machine starting resistance versus plates only',
      first: { kind: 'plate_machine', unit: 'lb', total: 140, barWeight: 50, perSide: [45], collars: 0 },
      second: { kind: 'plate_machine', unit: 'lb', total: 140, barWeight: 0, perSide: [45, 25], collars: 0 } },
  ];
  for (const c of cases) it(`keeps both ${c.name} through conflict, reload, edit, Undo and Finish`, async () => {
    const disk = new Map<string, string>();
    const storage = () => ({ getItem: (k: string) => disk.get(k) ?? null,
      setItem: (k: string, v: string) => void disk.set(k, v), removeItem: (k: string) => void disk.delete(k) });
    const s = await startWorkout('synthetic-gym', db, 1000);
    const first = await logSet({ id: 'shared', sessionId: s.id, exerciseId: 'press', reps: 8, load: c.first, rev: 1 }, db);
    const mine: Draft = { id: 'shared', load: c.second, reps: 8, rev: 1, submitted: 1 };
    let deps = { db, storage: storage(), queue: createLogQueue() };
    saveDraft(s.id, rowKey('press', 0), mine, deps.storage);
    let landed = 0;
    expect(await submitRow(s.id, 'press', mine, { ...deps, onLanded: () => landed++ })).toBe(true);
    expect(landed).toBe(0); // Same number is not evidence that this loading was saved.
    await reopen();
    deps = { db, storage: storage(), queue: createLogQueue() };
    await reconcileSession(s.id, deps);
    const remaining = rowsOf(s.id, 'press', deps);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toMatchObject({ load: c.second, reps: 8 });
    expect(remaining[0]!.id).not.toBe('shared');
    expect(await setsOf(s.id, db)).toEqual([first]);
    const retry = { ...remaining[0]!, submitted: remaining[0]!.rev ?? 0 };
    saveDraft(s.id, rowKey('press', 0), retry, deps.storage);
    expect(await submitRow(s.id, 'press', retry, deps)).toBe(true);
    await updateSet(retry.id, { reps: 9, load: c.second }, db);
    const expected = await setsOf(s.id, db);
    const removed = await deleteSet(first.id, db);
    await reopen();
    await restoreSet(removed!, db);
    expect(await finishWorkout(s.id, db, 2000)).toMatchObject({ saved: true, sets: 2 });
    await reopen();
    expect(await setsOf(s.id, db)).toEqual(expected);
    expect(expected.map((x) => x.load)).toEqual([c.first, c.second]);
    expect(expected.map((x) => x.reps)).toEqual([8, 9]);
  });
});
