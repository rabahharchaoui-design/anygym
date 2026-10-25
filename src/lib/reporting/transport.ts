// Sends queued reports to the Worker (SPEC 24). One drain at a time; every report keeps its request
// id through retries (the Worker returns the same row for a repeat), so nothing is ever duplicated.
// Retries back off (5 s doubling, at most 1 hour) or follow Retry-After. Offline is detected by
// the failed request itself; coming back online, returning to the app or starting it drains again.
import { db as defaultDb, type AnyGymDB } from '../../db/schema';
import { claimNext, enqueueFeedback, hasReport, nextDue, removeReport, retryLater } from '../../db/reports';
import { API_BASE } from './config';
import { crashReports, type CrashPreference } from './preferences';
import type { FeedbackPayload, ReportKind } from './types';

export type Outcome = { kind: 'done'; accepted: boolean } | { kind: 'retry'; offline: boolean; retryAfterMs?: number };

const MAX_PER_DRAIN = 10;
const BACKOFF_BASE_MS = 5_000;
const BACKOFF_MAX_MS = 3_600_000;

export function backoff(attempts: number, retryAfterMs?: number): number {
  if (retryAfterMs !== undefined && retryAfterMs > 0) return Math.min(retryAfterMs, BACKOFF_MAX_MS);
  return Math.min(BACKOFF_BASE_MS * 2 ** Math.min(attempts, 20), BACKOFF_MAX_MS);
}

/** What a Worker answer means for the queue. */
export function classify(status: number, retryAfter: string | null): Outcome {
  if (status >= 200 && status < 300) return { kind: 'done', accepted: true };
  const after = retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter) * 1000 : undefined;
  if (status === 408 || status === 409 || status === 425 || status === 429 || status >= 500) return { kind: 'retry', offline: false, retryAfterMs: after };
  // Refused for good (bad request, wrong origin, too large): retrying would never help.
  return { kind: 'done', accepted: false };
}

type Options = {
  db?: AnyGymDB;
  fetch?: typeof fetch;
  base?: string;
  now?: () => number;
  timeoutMs?: number;
  prefs?: CrashPreference;
  /** Waits until a retry is due (setTimeout in the app; tests pass a no-op). */
  schedule?: (fn: () => void, ms: number) => void;
};

export type SendResult = 'sent' | 'queued' | 'error';

export function createTransport(opts: Options = {}) {
  const db = opts.db ?? defaultDb;
  const now = opts.now ?? Date.now;
  const base = opts.base ?? API_BASE;
  const prefs = opts.prefs ?? crashReports;
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const fetcher = (...a: Parameters<typeof fetch>) => (opts.fetch ?? globalThis.fetch)(...a);
  const schedule = opts.schedule ?? ((fn, ms) => void globalThis.setTimeout(fn, ms));
  const refused = new Set<string>();
  let running: Promise<void> | null = null;
  let again = false;
  let againForce = false;
  let timerAt = Infinity;

  async function post(kind: ReportKind, payload: unknown): Promise<Outcome> {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return { kind: 'retry', offline: true };
    const body = JSON.stringify(payload);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      // text/plain keeps it a simple CORS request: no preflight round trip on a weak gym signal.
      const res = await fetcher(`${base}/${kind}`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body,
        signal: ctrl.signal,
        keepalive: body.length < 60_000,
        credentials: 'omit',
      });
      return classify(res.status, res.headers.get('Retry-After'));
    } catch {
      return { kind: 'retry', offline: true };
    } finally {
      clearTimeout(t);
    }
  }

  async function loop(force: boolean): Promise<void> {
    const tried = new Set<string>();
    for (let i = 0; i < MAX_PER_DRAIN; i++) {
      const row = await claimNext(force ? Infinity : now(), db, tried, now());
      if (!row) return;
      tried.add(row.id);
      // Re-read right before sending: turned off here or in another tab, the crash is deleted unsent.
      if (row.kind === 'crash' && !(await prefs.fresh())) {
        await removeReport(row.id, db);
        continue;
      }
      const out = await post(row.kind, row.payload);
      if (out.kind === 'done') {
        if (!out.accepted) refused.add(row.id);
        await removeReport(row.id, db);
      } else {
        await retryLater(row.id, now() + backoff(row.attempts, out.retryAfterMs), db);
        if (out.offline) return;
      }
    }
  }

  async function arm(): Promise<void> {
    const due = await nextDue(db).catch(() => undefined);
    if (due === undefined) return;
    const at = Math.max(due, now() + 1000);
    if (at >= timerAt) return;
    timerAt = at;
    schedule(() => {
      timerAt = Infinity;
      void drain();
    }, at - now());
  }

  /** Sends what is due. `force`: also what is waiting out a backoff (back online, app reopened). */
  function drain(force = false): Promise<void> {
    if (running) {
      again = true;
      againForce ||= force;
      return running;
    }
    running = (async () => {
      let f = force;
      try {
        do {
          again = false;
          await loop(f);
          f = againForce;
          againForce = false;
        } while (again);
      } catch {
        // Storage unavailable: nothing to send now.
      } finally {
        running = null;
      }
      await arm();
    })();
    return running;
  }

  /** Queues a report from Report a problem and tries to send it at once. */
  async function sendFeedback(payload: FeedbackPayload): Promise<SendResult> {
    try {
      await enqueueFeedback(payload, now(), db);
    } catch {
      // No storage: one direct try, nothing to keep it in.
      const out = await post('feedback', payload);
      return out.kind === 'done' && out.accepted ? 'sent' : 'error';
    }
    await drain(true);
    if (refused.has(payload.requestId)) return 'error';
    try {
      return (await hasReport(payload.requestId, db)) ? 'queued' : 'sent';
    } catch {
      return 'queued';
    }
  }

  return { drain, sendFeedback, post };
}

export type Transport = ReturnType<typeof createTransport>;

export const transport = createTransport();
