import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { shouldApplyUpdateNow } from '../../lib/pwaUpdate';
import { deleteRun, finishRunRow, getActiveRun, readLiveRun, RUN_LIVE_KEY, saveLiveRun, startRunRow } from '../runs';
import { AnyGymDB, SCHEMA_V1, SCHEMA_VERSION } from '../schema';
import type { Run } from '../types';

let db: AnyGymDB;
let n = 0;
beforeEach(async () => {
  db = new AnyGymDB(`anygym-runs-${n++}`);
  await db.open();
});
afterEach(async () => {
  await db.delete();
});

const row = (patch: Partial<Run> = {}): Run => ({ id: 'r1', startedAt: 1000, type: 'free', movingSec: 0, elapsedSec: 0, distanceM: 0, points: [], gaps: [], splits: [], ...patch });

describe('runs storage (PLAN 4.3)', () => {
  it('needs no schema change: the runs table of version 1 holds every SPEC 12.11 field', async () => {
    expect(SCHEMA_V1.runs).toBe('id, startedAt');
    expect(SCHEMA_VERSION).toBe(12); // PLAN M18a added badges, not a runs change
    const full: Run = { ...row(), endedAt: 2000, goal: '5 km', movingSec: 61.5, elapsedSec: 70, distanceM: 201.5, points: [[45.1, -122.3, 1, 5]], gaps: [[1, 2]], splits: [300.2], city: 'Portland', country: 'US', ghostOfRunId: 'r0', intervalPreset: 'speed' };
    await db.runs.put(full);
    expect(await db.runs.get('r1')).toEqual(full);
  });

  it('a started run is the run in progress, with its state beside it', async () => {
    expect(await getActiveRun(db)).toBeUndefined();
    expect(await readLiveRun(db)).toBeNull();
    await startRunRow(row(), '{"v":1}', db);
    expect(await getActiveRun(db)).toEqual(row());
    expect(await readLiveRun(db)).toEqual({ row: row(), snapshot: '{"v":1}' });
    await saveLiveRun(row({ distanceM: 120, points: [[1, 2, 3, 4]] }), '{"v":1,"x":2}', db);
    expect(await readLiveRun(db)).toEqual({ row: row({ distanceM: 120, points: [[1, 2, 3, 4]] }), snapshot: '{"v":1,"x":2}' });
    expect(await db.runs.count()).toBe(1);
  });

  it('a run in progress with no saved state still comes back (null snapshot)', async () => {
    await db.runs.put(row());
    expect(await readLiveRun(db)).toEqual({ row: row(), snapshot: null });
  });

  it('finished runs are never the run in progress; the newest open one wins', async () => {
    await db.runs.bulkPut([row({ id: 'old', endedAt: 500 }), row({ id: 'a', startedAt: 10 }), row({ id: 'b', startedAt: 20 })]);
    expect((await getActiveRun(db))!.id).toBe('b');
  });

  it('ending writes the finished row and drops the live state; a late save never brings the run back', async () => {
    await startRunRow(row(), 's', db);
    await finishRunRow({ ...row({ distanceM: 900 }), endedAt: 5000 }, db);
    expect(await getActiveRun(db)).toBeUndefined();
    expect(await db.kv.get(RUN_LIVE_KEY)).toBeUndefined();
    await saveLiveRun(row({ distanceM: 950 }), 's2', db);
    expect(await db.runs.get('r1')).toMatchObject({ endedAt: 5000, distanceM: 900 });
    expect(await db.kv.get(RUN_LIVE_KEY)).toBeUndefined();
  });

  it('discard removes the row and the live state', async () => {
    await startRunRow(row(), 's', db);
    await deleteRun('r1', db);
    expect(await db.runs.count()).toBe(0);
    expect(await db.kv.get(RUN_LIVE_KEY)).toBeUndefined();
  });

  it('an app update waits while a run is in progress and applies once it has ended (what src/pwa.ts asks)', async () => {
    const mayUpdate = async () => shouldApplyUpdateNow(false, !!(await getActiveRun(db)));
    expect(await mayUpdate()).toBe(true);
    await startRunRow(row(), 's', db);
    expect(await mayUpdate()).toBe(false);
    await finishRunRow({ ...row(), endedAt: 5000 }, db);
    expect(await mayUpdate()).toBe(true);
  });
});
