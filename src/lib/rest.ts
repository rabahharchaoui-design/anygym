// Rest timer (SPEC 5.1). Pure: the timer is an end timestamp, so the remaining time is right after
// backgrounding, throttled intervals or a reload.
import { db as defaultDb, type AnyGymDB } from '../db/schema';
import { mirror, mirrorValue } from './durable';

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

/**
 * The rest as the app knows it right now, per storage (PLAN 1.7j): written on every save before
 * storage is touched, so a localStorage that refuses the write (full or blocked) never loses the
 * countdown when the workout screen closes and opens again (minimize and resume). undefined: not
 * set since launch (storage, or the IndexedDB copy handed to hydrateRest, says).
 */
const runtime = new WeakMap<object, Rest | null>();
const NO_STORAGE = {};

export function loadRest(sessionId: string, kv: KV | null = storage()): Rest | null {
  const k = kv ?? NO_STORAGE;
  let r: Rest | null;
  if (runtime.has(k)) r = runtime.get(k)!;
  else {
    try {
      r = parseRest(kv?.getItem(REST_KEY) ?? null);
    } catch {
      // Storage there but unreadable (PLAN 2.0c): never a crash opening the workout. The screen
      // asks the IndexedDB copy (durableRest); until then there is no rest.
      unreadable.add(k);
      r = null;
    }
  }
  return r && r.sessionId === sessionId ? r : null;
}

const unreadable = new WeakSet<object>();

/** True when the last loadRest could not read storage, so the durable copy should be asked. */
export function restUnreadable(kv: KV | null = storage()): boolean {
  return unreadable.has(kv ?? NO_STORAGE);
}

/** The rest's IndexedDB copy (PLAN 2.0c): the fallback when storage cannot be read. Never rejects. */
export async function durableRest(sessionId: string, db: AnyGymDB = defaultDb): Promise<Rest | null> {
  try {
    const r = parseRest((await db.kv.get(REST_KEY))?.value ?? null);
    return r && r.sessionId === sessionId ? r : null;
  } catch {
    return null;
  }
}

export function saveRest(rest: Rest | null, kv: KV | null = storage()): void {
  runtime.set(kv ?? NO_STORAGE, rest);
  const value = rest ? JSON.stringify(rest) : null;
  if (!kv) {
    // No localStorage at all (access throws, PLAN 2.0c): straight to the IndexedDB copy.
    void mirrorValue(null, REST_KEY, value);
    return;
  }
  try {
    if (value !== null) kv.setItem(REST_KEY, value);
    else kv.removeItem(REST_KEY);
  } catch {
    // Storage full or blocked: the runtime copy keeps the timer while the app runs, and the
    // IndexedDB mirror alone keeps it for the next start (with its original end time).
    void mirrorValue(kv, REST_KEY, value);
    return;
  }
  void mirror(kv, REST_KEY, undefined, undefined, value);
}

/** Startup with localStorage refusing the rest (durable.restoreMirrors): its IndexedDB copy is used. */
export function hydrateRest(value: string | null, kv: KV | null = storage()): void {
  runtime.set(kv ?? NO_STORAGE, parseRest(value));
}
