// Durable Undo intent (PLAN 1.7k, SPEC 13.3). An Undo the user asked for whose acceptance write
// failed (the tombstone could not be marked `undo: true`) must survive an app restart: otherwise
// recovery sees an ordinary delete whose window is over and drops the record, losing the set.
//
// The intent is kept outside the tombstone, one row per deleted set (no read-modify-write races):
//   1. IndexedDB kv: { key: 'anygym-undo:<sessionId>:<setId>', value: JSON { sessionId, setId } }
//   2. when that write fails too, localStorage 'anygym-undo-intents' (a list) as the last fallback.
// Reading merges both. The tombstone stays the one copy of the deleted set: the intent only says
// "the user wants this one back". It is consumed in the same transaction as the restore or the
// cancellation (db/workouts.ts restoreSet, db/tombstones.ts cancelUndo), so a crash in between
// never leaves a stale intent that could bring a cancelled set back.
import { db as defaultDb, type AnyGymDB } from './schema';

export const UNDO_PREFIX = 'anygym-undo:';
export const UNDO_LS_KEY = 'anygym-undo-intents';

type KV = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type Intent = { sessionId: string; setId: string };

export const undoKey = (sessionId: string, setId: string) => `${UNDO_PREFIX}${sessionId}:${setId}`;

const phone = (): KV | null => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

function readLs(ls: KV | null): Intent[] {
  try {
    const v = JSON.parse(ls?.getItem(UNDO_LS_KEY) ?? '[]') as unknown;
    return Array.isArray(v) ? v.filter((x): x is Intent => !!x && typeof x.sessionId === 'string' && typeof x.setId === 'string') : [];
  } catch {
    return [];
  }
}

function writeLs(ls: KV | null, list: Intent[]): void {
  if (!ls) throw new Error('No storage');
  if (list.length) ls.setItem(UNDO_LS_KEY, JSON.stringify(list));
  else ls.removeItem(UNDO_LS_KEY);
}

/**
 * Stores that the user asked for this Undo. IndexedDB first, localStorage when that fails.
 * Rejects only when neither could hold it (the caller keeps the Undo unresolved in memory).
 */
export async function rememberUndo(sessionId: string, setId: string, db: AnyGymDB = defaultDb, ls: KV | null = phone()): Promise<void> {
  try {
    await db.transaction('rw', db.kv, () => db.kv.put({ key: undoKey(sessionId, setId), value: JSON.stringify({ sessionId, setId }), at: Date.now() }));
    return;
  } catch {
    /* falls back to localStorage */
  }
  const list = readLs(ls).filter((x) => !(x.sessionId === sessionId && x.setId === setId));
  writeLs(ls, [...list, { sessionId, setId }]);
}

/** The set ids of this workout with a stored Undo intent. Rejects when IndexedDB cannot be read. */
export async function readUndoIntents(sessionId: string, db: AnyGymDB = defaultDb, ls: KV | null = phone()): Promise<string[]> {
  const prefix = `${UNDO_PREFIX}${sessionId}:`;
  const rows = await db.kv.where('key').startsWith(prefix).primaryKeys();
  const ids = new Set(rows.map((k) => String(k).slice(prefix.length)));
  for (const x of readLs(ls)) if (x.sessionId === sessionId) ids.add(x.setId);
  return [...ids];
}

/** True when this set has a stored intent. Call inside a transaction that includes db.kv. */
export async function hasUndoIntent(sessionId: string, setId: string, db: AnyGymDB = defaultDb, ls: KV | null = phone()): Promise<boolean> {
  if (await db.kv.get(undoKey(sessionId, setId))) return true;
  return readLs(ls).some((x) => x.sessionId === sessionId && x.setId === setId);
}

/** Removes the IndexedDB intent. Call inside the caller's transaction (it must include db.kv). */
export async function dropUndoIntent(sessionId: string, setId: string, db: AnyGymDB = defaultDb): Promise<void> {
  await db.kv.delete(undoKey(sessionId, setId));
}

/** Removes the localStorage fallback copy, after the transaction that consumed the intent committed. */
export function forgetUndoFallback(sessionId: string, setId: string, ls: KV | null = phone()): void {
  try {
    const list = readLs(ls);
    const next = list.filter((x) => !(x.sessionId === sessionId && x.setId === setId));
    if (next.length !== list.length) writeLs(ls, next);
  } catch {
    /* a stale fallback without its tombstone is cleared by the next recovery */
  }
}

/** Every intent of every workout (Replace and Finish clear their own). */
export async function dropSessionIntents(sessionId: string, db: AnyGymDB = defaultDb): Promise<void> {
  await db.kv.where('key').startsWith(`${UNDO_PREFIX}${sessionId}:`).delete();
}
