// PLAN 2.0c group 6 (Codex 1025 1722 #10, 1814 #10): the server's Retry-After is a minimum the
// queue keeps (persisted), so not even a forced drain (back online, app reopened, Send) asks early.
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnyGymDB } from '../../../db/schema';
import { claimNext, enqueueFeedback, nextDue, retryLater } from '../../../db/reports';
import { createTransport } from '../transport';
import type { CrashPreference } from '../preferences';
import type { FeedbackPayload } from '../types';
import { stubBrowser } from './env';

const device = { model: 'iPhone', os: 'iOS 18.2', viewport: '393x852', dpr: 3, standalone: false };
const feedback = (id: string): FeedbackPayload => ({ requestId: id, message: 'it broke', appVersion: '0.1.0+dev', route: '/', device, unit: 'kg', gymType: 'full', errors: [] });
const prefs: CrashPreference = { enabled: () => true, ready: async () => true, fresh: async () => true, setEnabled: async () => {}, subscribe: () => () => {} };

let db: AnyGymDB;
let clock: number;
let n = 0;
beforeEach(async () => {
  stubBrowser();
  db = new AnyGymDB(`anygym-transport-2.0c-${n++}`);
  await db.open();
  clock = 1_000_000;
});
afterEach(async () => {
  db.close();
  await Dexie.delete(db.name);
  vi.unstubAllGlobals();
});

describe('acceptance F: Retry-After: 120 holds the report at least 120 s, forced drains included', () => {
  it('reproduction: 429 with Retry-After 120, then forced drains before the deadline send nothing; after it, the same request id', async () => {
    const ids: string[] = [];
    let status = 429;
    const fetcher = (async (_url: string, init: RequestInit) => {
      ids.push(JSON.parse(String(init.body)).requestId);
      return new Response('{}', { status, headers: status === 429 ? { 'Retry-After': '120' } : {} });
    }) as unknown as typeof fetch;
    const t = createTransport({ db, fetch: fetcher, base: 'https://api.test', now: () => clock, prefs, schedule: () => {} });
    await enqueueFeedback(feedback('r1'), clock, db);
    await t.drain(true);
    expect(ids).toEqual(['r1']);
    const row = (await db.reportQueue.get('r1'))!;
    expect(row.retryAfterUntil).toBe(1_000_000 + 120_000);
    expect(row.nextAttemptAt).toBe(1_000_000 + 120_000);
    expect(await nextDue(db)).toBe(1_000_000 + 120_000);
    // Back online, foreground, Send: all forced, all before the deadline.
    for (const at of [1_000_500, 1_060_000, 1_119_999]) {
      clock = at;
      await t.drain(true);
    }
    expect(ids).toEqual(['r1']);
    status = 201;
    clock = 1_120_000;
    await t.drain(true);
    expect(ids).toEqual(['r1', 'r1']);
    expect(await db.reportQueue.count()).toBe(0);
  });

  it('a retry without Retry-After clears an old deadline (plain backoff, forced drains go)', async () => {
    await enqueueFeedback(feedback('r2'), clock, db);
    await retryLater('r2', clock + 120_000, db, clock + 120_000);
    await retryLater('r2', clock + 5_000, db);
    expect((await db.reportQueue.get('r2'))!.retryAfterUntil).toBeUndefined();
    expect((await claimNext(Infinity, db, new Set(), clock))?.id).toBe('r2');
  });
});
