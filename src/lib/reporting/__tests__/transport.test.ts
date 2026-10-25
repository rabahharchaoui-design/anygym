import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnyGymDB } from '../../../db/schema';
import { enqueueCrash, enqueueFeedback, LEASE_MS } from '../../../db/reports';
import { backoff, classify, createTransport } from '../transport';
import type { CrashPreference } from '../preferences';
import type { CrashPayload, FeedbackPayload } from '../types';
import { stubBrowser } from './env';

const BASE = 'https://api.test';
const device = { model: 'iPhone', os: 'iOS 18.2', viewport: '393x852', dpr: 3, standalone: false };
const feedback = (id: string): FeedbackPayload => ({ requestId: id, message: 'it broke', appVersion: '0.1.0+dev', route: '/', device, unit: 'kg', gymType: 'full', errors: [] });
const crash = (id: string, signature = id): CrashPayload => ({ requestId: id, signature, message: 'boom', stack: '', route: '/', appVersion: '0.1.0+dev', device });
const prefs = (on: boolean): CrashPreference => ({ enabled: () => on, ready: async () => on, fresh: async () => on, setEnabled: async () => {}, subscribe: () => () => {} });

type Call = { url: string; body: Record<string, unknown> };
let db: AnyGymDB;
let calls: Call[];
let clock: number;
let n = 0;

/** A fetch answering each call with the next status (or throwing for 'offline'). */
function server(...answers: Array<number | 'offline' | [number, string]>) {
  return (async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)) });
    const a = answers.length > 1 ? answers.shift()! : answers[0]!;
    if (a === 'offline') throw new TypeError('Load failed');
    const [status, retry] = Array.isArray(a) ? a : [a, null];
    return new Response(status === 204 ? null : '{}', { status, headers: retry ? { 'Retry-After': retry } : {} });
  }) as unknown as typeof fetch;
}

const make = (fetcher: typeof globalThis.fetch, on = true) => createTransport({ db, fetch: fetcher, base: BASE, now: () => clock, prefs: prefs(on), schedule: () => {} });

beforeEach(async () => {
  stubBrowser();
  db = new AnyGymDB(`anygym-transport-${n++}`);
  await db.open();
  calls = [];
  clock = 1_000_000;
});
afterEach(async () => {
  db.close();
  await Dexie.delete(db.name);
  vi.unstubAllGlobals();
});

describe('classify and backoff', () => {
  it('2xx done; 409, 429 and 5xx retry; other 4xx are refused for good', () => {
    expect(classify(201, null)).toEqual({ kind: 'done', accepted: true });
    expect(classify(200, null)).toEqual({ kind: 'done', accepted: true });
    expect(classify(429, '60')).toEqual({ kind: 'retry', offline: false, retryAfterMs: 60_000 });
    expect(classify(503, null)).toEqual({ kind: 'retry', offline: false, retryAfterMs: undefined });
    expect(classify(409, '2')).toMatchObject({ kind: 'retry' });
    for (const s of [400, 403, 404, 405, 413]) expect(classify(s, null)).toEqual({ kind: 'done', accepted: false });
  });

  it('doubles from 5 s up to an hour, or follows Retry-After', () => {
    expect([0, 1, 2, 3].map((a) => backoff(a))).toEqual([5000, 10_000, 20_000, 40_000]);
    expect(backoff(30)).toBe(3_600_000);
    expect(backoff(0, 90_000)).toBe(90_000);
    expect(backoff(0, 9e9)).toBe(3_600_000);
  });
});

describe('drain', () => {
  it('sends a queued report to its endpoint and removes it', async () => {
    await enqueueFeedback(feedback('fb-00000001'), clock - 2, db);
    await enqueueCrash(crash('cr-00000001'), clock - 1, db);
    await make(server(201)).drain();
    expect(calls.map((c) => c.url)).toEqual([`${BASE}/feedback`, `${BASE}/crash`]);
    expect(calls[0]!.body).toEqual(feedback('fb-00000001'));
    expect(await db.reportQueue.count()).toBe(0);
  });

  it('offline: keeps the report with a backoff, stops after the first failure, and retries with the same request id', async () => {
    await enqueueFeedback(feedback('fb-00000002'), clock, db);
    await enqueueFeedback(feedback('fb-00000003'), clock + 1, db);
    const t = make(server('offline'));
    await t.drain();
    expect(calls).toHaveLength(1);
    const row = await db.reportQueue.get('fb-00000002');
    expect(row).toMatchObject({ attempts: 1, nextAttemptAt: clock + 5000, leaseUntil: 0 });
    // Not due yet: nothing is sent; forced (back online): it goes now.
    await t.drain();
    expect(calls).toHaveLength(1);
    const online = make(server(201));
    await online.drain(true);
    expect(calls.map((c) => c.body.requestId)).toEqual(['fb-00000002', 'fb-00000002', 'fb-00000003']);
    expect(await db.reportQueue.count()).toBe(0);
  });

  it('a response lost after the server stored it: the retry carries the same request id (the Worker returns the same row)', async () => {
    await enqueueFeedback(feedback('fb-00000004'), clock, db);
    await make(server('offline', 200)).drain();
    clock += 5000;
    await make(server(200)).drain();
    expect(new Set(calls.map((c) => c.body.requestId))).toEqual(new Set(['fb-00000004']));
    expect(await db.reportQueue.count()).toBe(0);
  });

  it('429 waits for Retry-After', async () => {
    await enqueueFeedback(feedback('fb-00000005'), clock, db);
    await make(server([429, '120'])).drain();
    expect(await db.reportQueue.get('fb-00000005')).toMatchObject({ nextAttemptAt: clock + 120_000 });
  });

  it('a 5xx retries each report once per forced drain, never in a tight loop', async () => {
    await enqueueFeedback(feedback('fb-00000006'), clock, db);
    await make(server(503)).drain(true);
    expect(calls).toHaveLength(1);
  });

  it('a refused report is removed and never retried', async () => {
    await enqueueFeedback(feedback('fb-00000007'), clock, db);
    await make(server(400)).drain();
    expect(await db.reportQueue.count()).toBe(0);
  });

  it('two drains at once, or two tabs, send a report once', async () => {
    await enqueueFeedback(feedback('fb-00000008'), clock, db);
    const a = make(server(201));
    const b = make(server(201));
    await Promise.all([a.drain(), a.drain(), b.drain()]);
    expect(calls).toHaveLength(1);
  });

  it('a lease held by another sender is respected until it runs out', async () => {
    await enqueueFeedback(feedback('fb-00000009'), clock, db);
    await db.reportQueue.update('fb-00000009', { leaseUntil: clock + LEASE_MS });
    await make(server(201)).drain(true);
    expect(calls).toHaveLength(0);
    clock += LEASE_MS;
    await make(server(201)).drain();
    expect(calls).toHaveLength(1);
  });

  it('queued crashes are dropped, not sent, once crash reports are off', async () => {
    await enqueueCrash(crash('cr-00000002'), clock, db);
    await make(server(201), false).drain();
    expect(calls).toHaveLength(0);
    expect(await db.reportQueue.count()).toBe(0);
  });

  it('schedules the next try when something is still waiting', async () => {
    const waits: number[] = [];
    await enqueueFeedback(feedback('fb-00000010'), clock, db);
    await createTransport({ db, fetch: server('offline'), base: BASE, now: () => clock, prefs: prefs(true), schedule: (_f, ms) => waits.push(ms) }).drain();
    expect(waits).toEqual([5000]);
  });
});

describe('sendFeedback', () => {
  it('sent when the Worker confirms it', async () => {
    expect(await make(server(201)).sendFeedback(feedback('fb-00000011'))).toBe('sent');
  });

  it('queued when offline, then sent once when back online', async () => {
    const t = make(server('offline'));
    expect(await t.sendFeedback(feedback('fb-00000012'))).toBe('queued');
    expect(await db.reportQueue.count()).toBe(1);
    await make(server(201)).drain(true);
    expect(await db.reportQueue.count()).toBe(0);
    expect(calls.filter((c) => c.body.requestId === 'fb-00000012')).toHaveLength(2);
  });

  it('error when the Worker refuses it', async () => {
    expect(await make(server(400)).sendFeedback(feedback('fb-00000013'))).toBe('error');
  });

  it('navigator.onLine false: queued without trying the network', async () => {
    vi.stubGlobal('navigator', { userAgent: 'x', onLine: false });
    expect(await make(server(201)).sendFeedback(feedback('fb-00000014'))).toBe('queued');
    expect(calls).toHaveLength(0);
  });
});
