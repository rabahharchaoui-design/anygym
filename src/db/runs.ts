// Runs on the phone (SPEC 12.11, PLAN 4.3): the run that is going on, saved every few seconds with
// the rest of its state (one kv row), and its end. A run row with no endedAt is the run in progress;
// src/pwa.ts holds app updates back while one exists.
import { durableRow } from '../lib/durable';
import { db as defaultDb, type AnyGymDB } from './schema';
import type { Run } from './types';

/** The live run's state beside its row (lib/run/snapshot.ts), as JSON text. */
export const RUN_LIVE_KEY = 'anygym-run-live';

/** The run in progress, or undefined. If several were ever left open, the newest. */
export async function getActiveRun(db: AnyGymDB = defaultDb): Promise<Run | undefined> {
  const open = await db.runs.filter((r) => r.endedAt === undefined).toArray();
  return open.sort((a, b) => b.startedAt - a.startedAt)[0];
}

/** The run in progress with its saved state (null text when there is none). */
export async function readLiveRun(db: AnyGymDB = defaultDb): Promise<{ row: Run; snapshot: string | null } | null> {
  const row = await getActiveRun(db);
  if (!row) return null;
  const kv = await db.kv.get(RUN_LIVE_KEY);
  return { row, snapshot: kv?.value ?? null };
}

/** Saves the run in progress and its state together, so they always fit each other. */
export async function saveLiveRun(row: Run, snapshot: string, db: AnyGymDB = defaultDb): Promise<void> {
  await db.transaction('rw', db.runs, db.kv, async () => {
    // A run that was ended or discarded meanwhile is never brought back by a late save.
    const now = await db.runs.get(row.id);
    if (now && now.endedAt !== undefined) return;
    await db.runs.put(row);
    await db.kv.put(durableRow(RUN_LIVE_KEY, snapshot));
  });
}

/** Creates the row of a run that just started. */
export async function startRunRow(row: Run, snapshot: string, db: AnyGymDB = defaultDb): Promise<void> {
  await db.transaction('rw', db.runs, db.kv, async () => {
    await db.runs.put(row);
    await db.kv.put(durableRow(RUN_LIVE_KEY, snapshot));
  });
}

/** Ends a run: the finished row replaces the one in progress, the live state goes. */
export async function finishRunRow(row: Run & { endedAt: number }, db: AnyGymDB = defaultDb): Promise<void> {
  await db.transaction('rw', db.runs, db.kv, async () => {
    await db.runs.put(row);
    await db.kv.delete(RUN_LIVE_KEY);
  });
}

/** Finished runs, newest start first. A run still going is not history. */
export async function listFinishedRuns(db: AnyGymDB = defaultDb): Promise<Run[]> {
  const all = await db.runs.orderBy('startedAt').reverse().toArray();
  return all.filter((r) => r.endedAt !== undefined);
}

/** One run, finished or not. Undefined when there is no such id. */
export const getRun = (id: string, db: AnyGymDB = defaultDb): Promise<Run | undefined> => db.runs.get(id);

/** Removes a run for good (Discard on a run with nothing to show). */
export async function deleteRun(id: string, db: AnyGymDB = defaultDb): Promise<void> {
  await db.transaction('rw', db.runs, db.kv, async () => {
    await db.runs.delete(id);
    await db.kv.delete(RUN_LIVE_KEY);
  });
}
