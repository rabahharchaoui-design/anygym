// Rest timer (SPEC 5.1). Pure: the timer is an end timestamp, so the remaining time is right after
// backgrounding, throttled intervals or a reload.
import { mirror } from './durable';

export const DEFAULT_REST_SEC = 90;
export const REST_STEP_SEC = 15;

export type Rest = {
  sessionId: string;
  /** Date.now() when the rest is over. */
  endsAt: number;
  /** Full length in seconds, for the ring (grows with +15 s). */
  totalSec: number;
};

export function startRest(sessionId: string, now: number, seconds = DEFAULT_REST_SEC): Rest {
  return { sessionId, endsAt: now + seconds * 1000, totalSec: seconds };
}

/** +15 s: adds to what is left (from now if it already ran out). */
export function extendRest(rest: Rest, now: number, seconds = REST_STEP_SEC): Rest {
  const base = Math.max(rest.endsAt, now);
  const left = (base - now) / 1000 + seconds;
  return { ...rest, endsAt: base + seconds * 1000, totalSec: Math.max(rest.totalSec, Math.ceil(left)) };
}

/** −15 s: takes from what is left, never below now (then the rest is over). The ring keeps its length. */
export function shortenRest(rest: Rest, now: number, seconds = REST_STEP_SEC): Rest {
  return { ...rest, endsAt: Math.max(now, rest.endsAt - seconds * 1000) };
}

export function remainingMs(rest: Rest, now: number): number {
  return Math.max(0, rest.endsAt - now);
}

/** Whole seconds shown: rounds up, so "0:01" shows until the very end and 0 means done. */
export function remainingSec(rest: Rest, now: number): number {
  return Math.ceil(remainingMs(rest, now) / 1000);
}

/** Fraction of the ring still left, 1 → 0. */
export function restFraction(rest: Rest, now: number): number {
  if (rest.totalSec <= 0) return 0;
  return Math.min(1, remainingMs(rest, now) / (rest.totalSec * 1000));
}

export function isRestDone(rest: Rest, now: number): boolean {
  return remainingMs(rest, now) === 0;
}

// ---------------------------------------------------------------- persistence

export const REST_KEY = 'anygym-rest';

type KV = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function storage(): KV | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function parseRest(text: string | null): Rest | null {
  if (!text) return null;
  try {
    const r = JSON.parse(text) as Partial<Rest>;
    if (typeof r.sessionId === 'string' && Number.isFinite(r.endsAt) && Number.isFinite(r.totalSec)) {
      return { sessionId: r.sessionId, endsAt: r.endsAt!, totalSec: r.totalSec! };
    }
  } catch {
    /* corrupt: treat as no rest */
  }
  return null;
}

export function loadRest(sessionId: string, kv: KV | null = storage()): Rest | null {
  const r = parseRest(kv?.getItem(REST_KEY) ?? null);
  return r && r.sessionId === sessionId ? r : null;
}

export function saveRest(rest: Rest | null, kv: KV | null = storage()): void {
  try {
    if (rest) kv?.setItem(REST_KEY, JSON.stringify(rest));
    else kv?.removeItem(REST_KEY);
    void mirror(kv, REST_KEY);
  } catch {
    /* storage full or blocked: the timer still runs in memory */
  }
}
