// The report queue and crash reporting preference on this phone (SPEC 24, schema v9). Reports wait
// here until the Worker confirms them, so a report written in a basement goes out once there is
// signal. Network calls never happen inside these transactions (lib/reporting/transport.ts).
import { db as defaultDb, type AnyGymDB } from './schema';
import type { CrashPayload, FeedbackPayload, ReportQueueRow } from '../lib/reporting/types';

/** How long a claimed report is reserved for one sender (another tab or a reload waits it out). */
export const LEASE_MS = 30_000;

/** Local calendar day, YYYY-MM-DD: a crash signature is reported at most once per day. */
export function localDay(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function enqueueFeedback(payload: FeedbackPayload, now = Date.now(), db: AnyGymDB = defaultDb): Promise<void> {
  await db.reportQueue.put({ id: payload.requestId, kind: 'feedback', payload, createdAt: now, attempts: 0, nextAttemptAt: now, leaseUntil: 0 });
}

/**
 * Queues a crash unless its signature was already reported today on this phone. The signature is
 * reserved in the same transaction, so two crashes at once still queue one report. Signatures from
 * before yesterday are dropped on the way.
 */
export async function enqueueCrash(payload: CrashPayload, now = Date.now(), db: AnyGymDB = defaultDb): Promise<boolean> {
  const day = localDay(now);
  return db.transaction('rw', db.reportQueue, db.crashSignatures, async () => {
    if (await db.crashSignatures.get([payload.signature, day])) return false;
    await db.crashSignatures.where('day').below(localDay(now - 86_400_000)).delete();
    await db.crashSignatures.add({ signature: payload.signature, day, reportId: payload.requestId });
    await db.reportQueue.add({ id: payload.requestId, kind: 'crash', payload, createdAt: now, attempts: 0, nextAttemptAt: now, leaseUntil: 0 });
    return true;
  });
}

/**
 * Reserves the oldest report due by `dueBy` (Infinity: also those waiting out a backoff) that no
 * other sender holds at `now`, skipping the ids in `skip`.
 */
export async function claimNext(dueBy = Date.now(), db: AnyGymDB = defaultDb, skip: ReadonlySet<string> = new Set(), now = Math.min(dueBy, Date.now())): Promise<ReportQueueRow | undefined> {
  return db.transaction('rw', db.reportQueue, async () => {
    const row = await db.reportQueue
      .orderBy('createdAt')
      .filter((r) => r.nextAttemptAt <= dueBy && r.leaseUntil <= now && !skip.has(r.id))
      .first();
    if (!row) return undefined;
    const leased = { ...row, leaseUntil: now + LEASE_MS };
    await db.reportQueue.put(leased);
    return leased;
  });
}

/** Delivered (or refused for good): the report leaves the phone's queue. */
export async function removeReport(id: string, db: AnyGymDB = defaultDb): Promise<void> {
  await db.reportQueue.delete(id);
}

/** Not delivered: try again at `at`, keeping the same request id. */
export async function retryLater(id: string, at: number, db: AnyGymDB = defaultDb): Promise<void> {
  await db.transaction('rw', db.reportQueue, async () => {
    const row = await db.reportQueue.get(id);
    if (row) await db.reportQueue.put({ ...row, attempts: row.attempts + 1, nextAttemptAt: at, leaseUntil: 0 });
  });
}

export const hasReport = async (id: string, db: AnyGymDB = defaultDb): Promise<boolean> => (await db.reportQueue.get(id)) !== undefined;

/** When the next waiting report is due (undefined: nothing waiting). */
export async function nextDue(db: AnyGymDB = defaultDb): Promise<number | undefined> {
  const rows = await db.reportQueue.toArray();
  if (rows.length === 0) return undefined;
  return Math.min(...rows.map((r) => Math.max(r.nextAttemptAt, r.leaseUntil)));
}

/** Crash reports turned off: the crashes still waiting are deleted, never sent. */
export async function dropQueuedCrashes(db: AnyGymDB = defaultDb): Promise<void> {
  await db.reportQueue.filter((r) => r.kind === 'crash').delete();
}

/** Send crash reports: on unless the user turned it off. */
export async function readCrashPreference(db: AnyGymDB = defaultDb): Promise<boolean> {
  const row = await db.reportPreferences.get('privacy');
  return row?.sendCrashReports ?? true;
}

export async function writeCrashPreference(on: boolean, db: AnyGymDB = defaultDb): Promise<void> {
  await db.reportPreferences.put({ id: 'privacy', sendCrashReports: on });
  if (!on) await dropQueuedCrashes(db);
}
