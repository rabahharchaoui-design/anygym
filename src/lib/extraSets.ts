// "+ Add set" (PLAN 1.7c): rows added to an exercise beyond the plan's sets, per workout, so a
// reload shows the same table (SPEC 13.3). Only one workout is in progress, so only one is kept.
// When localStorage refuses the write (full or blocked, PLAN 1.7k) the value goes to its IndexedDB
// mirror alone (lib/durable.ts mirrorValue) and startup hydrates it back (hydrateExtraSets).
import { db } from '../db/schema';
import { durableRow, mirror, mirrorValue } from './durable';
export const EXTRA_SETS_KEY = 'anygym-extra-sets';
const KEY = EXTRA_SETS_KEY;
/** Most rows one exercise can have beyond its plan (PLAN 2.0f): a restored or corrupt count never builds more. */
export const MAX_EXTRA_SETS = 100;

type KV = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
/**
 * `dropped` (PLAN 2.2d round 2): logged sets removed together with their row (swipe or Remove set),
 * set id → exercise id. Such a row stays removed only while its set is deleted, so every way the set
 * comes back (the toast's Undo, recovery after a restart, Finish's retry) brings the row back too,
 * exactly once, with nothing to undo here.
 */
type Stored = { sessionId: string; extra: Record<string, number>; dropped?: Record<string, string> };

const storage = (): KV | null => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

/**
 * No localStorage at all (access throws, PLAN 1.7k review): the value goes straight to its
 * IndexedDB row, which startup hands to hydrateExtraSets. Never throws.
 */
function storeWithoutLocalStorage(value: string | null): void {
  try {
    void db.kv.put(durableRow(KEY, value)).catch(() => undefined);
  } catch {
    /* memory keeps it for this run */
  }
}

/** Memory copy: a blocked storage still keeps the rows while the app is open. */
let memory: Stored | null = null;

/** A hydrated removal: what localStorage still holds is older than it (PLAN 1.7k). */
let cleared = false;

/**
 * The raw value this tab last saw in (or wrote to) localStorage. Another tab writing the same key
 * makes the stored value differ from it; the next read or change then starts from the stored one
 * (PLAN 3.2a), so a stale tab never writes its old table over a newer one. Every change is one
 * synchronous read, merge and write, so nothing slips between them. undefined: not read yet.
 */
let seen: string | null | undefined;

const rawOf = (kv: KV | null): string | null => {
  try {
    return kv?.getItem(KEY) ?? null;
  } catch {
    return null;
  }
};

function parse(raw: string | null): Stored | null {
  try {
    const v = JSON.parse(raw ?? 'null') as Stored | null;
    return v && typeof v.sessionId === 'string' && v.extra && typeof v.extra === 'object' ? v : null;
  } catch {
    return null; // corrupt: none
  }
}

function read(kv: KV | null): Stored | null {
  if (kv) {
    const raw = rawOf(kv);
    if (seen === undefined || raw !== seen) {
      const first = seen === undefined;
      seen = raw;
      // First look: a hydrated or cleared copy in memory stays; later: the other tab's value wins.
      if (!first || (!memory && !cleared)) {
        memory = parse(raw);
        cleared = memory === null && raw === null;
      }
    }
  }
  return memory;
}

/**
 * Rows added (positive) or removed (negative, PLAN 2.2d: "Remove set" on a row) beyond the plan's
 * sets, for this workout. Never past MAX_EXTRA_SETS either way.
 */
export function extraSets(sessionId: string, exerciseId: string, kv: KV | null = storage()): number {
  const s = read(kv);
  const n = s?.sessionId === sessionId ? s.extra[exerciseId] : undefined;
  return typeof n === 'number' && Number.isInteger(n) && n !== 0 ? Math.max(-MAX_EXTRA_SETS, Math.min(n, MAX_EXTRA_SETS)) : 0;
}

/** One more row (+ Add set, or the Undo of a removed row). Returns the new count. */
export function addExtraSet(sessionId: string, exerciseId: string, kv: KV | null = storage()): number {
  return changeExtraSets(sessionId, exerciseId, 1, kv);
}

/** One row fewer (PLAN 2.2d "Remove set"). Returns the new count (negative: planned rows removed). */
export function removeExtraSet(sessionId: string, exerciseId: string, kv: KV | null = storage()): number {
  return changeExtraSets(sessionId, exerciseId, -1, kv);
}

function changeExtraSets(sessionId: string, exerciseId: string, by: 1 | -1, kv: KV | null): number {
  const s = read(kv);
  const extra = s?.sessionId === sessionId ? { ...s.extra } : {};
  const n = Math.max(-MAX_EXTRA_SETS, Math.min(MAX_EXTRA_SETS, extraSets(sessionId, exerciseId, kv) + by));
  if (n === 0) delete extra[exerciseId];
  else extra[exerciseId] = n;
  store({ sessionId, extra, ...(s?.sessionId === sessionId && s.dropped ? { dropped: s.dropped } : {}) }, kv);
  return n;
}

function store(next: Stored, kv: KV | null): void {
  if (next.dropped && Object.keys(next.dropped).length === 0) delete next.dropped;
  memory = next;
  cleared = false;
  const value = JSON.stringify(memory);
  if (!kv) {
    storeWithoutLocalStorage(value);
    return;
  }
  try {
    kv?.setItem(KEY, value);
    seen = value;
    void mirror(kv, KEY);
  } catch {
    // Memory keeps it for this run; IndexedDB keeps it for the next one.
    void mirrorValue(kv, KEY, value);
  }
}

/**
 * The latest delete of a logged set (PLAN 2.2d round 2): `exerciseId` when its row goes with it (a
 * swipe or Remove set), null when only the set goes (Edit set → Delete). Every delete rewrites it, so
 * the record is always about the set's current deletion.
 */
export function markDeleted(sessionId: string, setId: string, exerciseId: string | null, kv: KV | null = storage()): void {
  const s = read(kv);
  const same = s?.sessionId === sessionId;
  const dropped = { ...(same ? s.dropped : undefined) };
  if (exerciseId === null && !(setId in dropped)) return;
  if (exerciseId === null) delete dropped[setId];
  else dropped[setId] = exerciseId;
  store({ sessionId, extra: same ? { ...s.extra } : {}, dropped }, kv);
}

/**
 * Rows added or removed per exercise for this workout, from a stored value (anygym-extra-sets):
 * the + Add set and Remove set count, less one for each removed logged set that is still deleted
 * (`present`: the ids of the workout's sets as they are now). Used live and by Finish.
 */
export function rowAdjustments(value: string | null, sessionId: string, present: ReadonlySet<string>): Record<string, number> {
  let v: Stored | null = null;
  try {
    v = JSON.parse(value ?? 'null') as Stored | null;
  } catch {
    v = null;
  }
  const out: Record<string, number> = {};
  if (!v || v.sessionId !== sessionId || !v.extra || typeof v.extra !== 'object') return out;
  for (const [id, n] of Object.entries(v.extra)) if (Number.isInteger(n) && n !== 0) out[id] = Math.max(-MAX_EXTRA_SETS, Math.min(MAX_EXTRA_SETS, n));
  for (const [setId, ex] of Object.entries(v.dropped ?? {})) {
    if (typeof ex !== 'string' || present.has(setId)) continue;
    out[ex] = (out[ex] ?? 0) - 1;
  }
  for (const k of Object.keys(out)) if (out[k] === 0) delete out[k];
  return out;
}

/** This workout's row adjustments right now (see rowAdjustments). */
export function liveRowAdjustments(sessionId: string, present: ReadonlySet<string>, kv: KV | null = storage()): Record<string, number> {
  const s = read(kv);
  return s ? rowAdjustments(JSON.stringify(s), sessionId, present) : {};
}

export function clearExtraSets(kv: KV | null = storage()): void {
  memory = null;
  cleared = true;
  if (!kv) {
    storeWithoutLocalStorage(null);
    return;
  }
  try {
    kv?.removeItem(KEY);
    seen = null;
    void mirror(kv, KEY);
  } catch {
    // A removal localStorage refused is stored as a null mirror, so a restart never brings the
    // finished workout's rows back.
    void mirrorValue(kv, KEY, null);
  }
}

/**
 * Startup (lib/durable.ts restoreMirrors): the IndexedDB copy, when localStorage cannot hold it.
 * A null value is a stored removal.
 */
export function hydrateExtraSets(value: string | null): void {
  memory = null;
  if (value === null) {
    cleared = true;
    return;
  }
  try {
    const v = JSON.parse(value) as Stored | null;
    if (v && typeof v.sessionId === 'string' && v.extra && typeof v.extra === 'object') memory = v;
  } catch {
    /* corrupt: none */
  }
}

/** This workout's added rows as stored (the anygym-extra-sets value), or null when it has none (PLAN 2.0c). */
export function extraSetsValue(sessionId: string, kv: KV | null = storage()): string | null {
  const s = read(kv);
  return s && s.sessionId === sessionId && (Object.keys(s.extra).length || Object.keys(s.dropped ?? {}).length) ? JSON.stringify(s) : null;
}

/** Puts back added rows kept by a Finish that was undone (PLAN 2.0c, lib/finishPending.ts). */
export function restoreExtraSets(value: string, kv: KV | null = storage()): void {
  hydrateExtraSets(value);
  if (!memory) return;
  cleared = false;
  if (!kv) {
    storeWithoutLocalStorage(value);
    return;
  }
  try {
    kv.setItem(KEY, value);
    seen = value;
    void mirror(kv, KEY);
  } catch {
    void mirrorValue(kv, KEY, value);
  }
}

/** Tests only. */
export function resetExtraSetsMemory(): void {
  memory = null;
  cleared = false;
  seen = undefined;
}
