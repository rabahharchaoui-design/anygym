// "+ Add set" (PLAN 1.7c): rows added to an exercise beyond the plan's sets, per workout, so a
// reload shows the same table (SPEC 13.3). Only one workout is in progress, so only one is kept.
// When localStorage refuses the write (full or blocked, PLAN 1.7k) the value goes to its IndexedDB
// mirror alone (lib/durable.ts mirrorValue) and startup hydrates it back (hydrateExtraSets).
import { db } from '../db/schema';
import { durableRow, mirror, mirrorValue } from './durable';
export const EXTRA_SETS_KEY = 'anygym-extra-sets';
const KEY = EXTRA_SETS_KEY;

type KV = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type Stored = { sessionId: string; extra: Record<string, number> };

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

function read(kv: KV | null): Stored | null {
  if (memory || cleared) return memory;
  try {
    const v = JSON.parse(kv?.getItem(KEY) ?? 'null') as Stored | null;
    if (v && typeof v.sessionId === 'string' && v.extra && typeof v.extra === 'object') memory = v;
  } catch {
    /* corrupt: none */
  }
  return memory;
}

export function extraSets(sessionId: string, exerciseId: string, kv: KV | null = storage()): number {
  const s = read(kv);
  const n = s?.sessionId === sessionId ? s.extra[exerciseId] : undefined;
  return typeof n === 'number' && Number.isInteger(n) && n > 0 ? n : 0;
}

export function addExtraSet(sessionId: string, exerciseId: string, kv: KV | null = storage()): number {
  const s = read(kv);
  const extra = s?.sessionId === sessionId ? { ...s.extra } : {};
  extra[exerciseId] = (extra[exerciseId] ?? 0) + 1;
  memory = { sessionId, extra };
  cleared = false;
  const value = JSON.stringify(memory);
  if (!kv) {
    storeWithoutLocalStorage(value);
    return extra[exerciseId]!;
  }
  try {
    kv?.setItem(KEY, value);
    void mirror(kv, KEY);
  } catch {
    // Memory keeps it for this run; IndexedDB keeps it for the next one.
    void mirrorValue(kv, KEY, value);
  }
  return extra[exerciseId]!;
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

/** Tests only. */
export function resetExtraSetsMemory(): void {
  memory = null;
  cleared = false;
}
