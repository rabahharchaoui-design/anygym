// PLAN 4.4b (1): a restore never wipes or brings back a run in progress.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnyGymDB } from '../schema';
import { ActiveRunError, ActiveWorkoutError, exportBackup, restoreMerge, restoreReplace } from '../backup';
import { getActiveRun, RUN_LIVE_KEY, startRunRow } from '../runs';
import type { Run } from '../types';

let db: AnyGymDB;
let n = 0;
beforeEach(async () => {
  db = new AnyGymDB(`anygym-backup-run-${n++}`);
  await db.open();
});
afterEach(async () => {
  await db.delete();
});

const run = (patch: Partial<Run> = {}): Run => ({ id: 'r1', startedAt: 1000, type: 'free', movingSec: 60, elapsedSec: 70, distanceM: 200, points: [[45.1, -122.3, 1, 5]], gaps: [], splits: [], ...patch });

describe('restore and a run in progress (PLAN 4.4b 1)', () => {
  it('Replace and Merge are refused while a run is going on, and the run stays', async () => {
    const backup = await exportBackup(db, 1);
    await startRunRow(run({ id: 'live' }), '{"v":1}', db);
    const err = await restoreReplace(backup, db).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ActiveRunError);
    expect(err).toBeInstanceOf(ActiveWorkoutError);
    expect((err as Error).message).toBe('Finish your run first');
    await expect(restoreMerge(backup, db)).rejects.toBeInstanceOf(ActiveRunError);
    expect((await getActiveRun(db))?.id).toBe('live');
    expect(await db.kv.get(RUN_LIVE_KEY)).toBeDefined();
  });

  it('a backup taken mid run never restores as a run in progress (Replace and Merge)', async () => {
    await db.runs.put(run({ id: 'done', endedAt: 5000 }));
    await startRunRow(run({ id: 'open', startedAt: 9000 }), '{"v":1}', db);
    const backup = await exportBackup(db, 1);
    expect(backup.tables.runs.map((r) => r.id).sort()).toEqual(['done', 'open']);
    await db.runs.clear();
    await db.kv.delete(RUN_LIVE_KEY);

    await restoreReplace(backup, db);
    expect(await getActiveRun(db)).toBeUndefined();
    expect((await db.runs.toArray()).map((r) => r.id)).toEqual(['done']);

    await db.runs.clear();
    await restoreMerge(backup, db);
    expect(await getActiveRun(db)).toBeUndefined();
    expect((await db.runs.toArray()).map((r) => r.id)).toEqual(['done']);
  });
});
