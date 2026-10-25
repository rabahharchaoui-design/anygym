// Live workout state that must survive an app kill (SPEC 13.3, PLAN 1.12). Row drafts, the rest
// deadline and added rows live in localStorage (sync reads while rendering), but Chromium writes
// localStorage to disk a few seconds late: a hard kill right after an edit lost it (WebKit kept it).
// Every write of these keys to the phone's localStorage is therefore:
//   1. stamped in localStorage (STAMPS, in the same synchronous step, so a stale snapshot on disk
//      carries its own stale stamps), and
//   2. mirrored to IndexedDB (db.kv: { key, value, at }), whose writes survive a kill.
// At startup, before the first render, `restoreMirrors` puts back every mirror that is newer than
// what localStorage has (a lost write, or a lost removal).
import { db as defaultDb, type AnyGymDB } from '../db/schema';

type KV = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export const DURABLE_KEYS: ReadonlySet<string> = new Set(['anygym-drafts', 'anygym-rest', 'anygym-extra-sets']);
export const STAMPS_KEY = 'anygym-durable-at';

let last = 0;
/** Strictly increasing write stamps (Date.now based, so they also order across launches). */
const nextStamp = (now = Date.now()) => (last = Math.max(last + 1, now));

function readStamps(ls: KV): Record<string, number> {
  try {
    const v = JSON.parse(ls.getItem(STAMPS_KEY) ?? '{}') as unknown;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, number>) : {};
  } catch {
    return {};
  }
}

const phone = (): KV | null => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

/**
 * Call right after writing (or removing) `key` in storage `s`. Only the phone's own localStorage is
 * mirrored (tests pass their own storage, or none). Never throws; the IndexedDB write runs behind.
 */
export function mirror(s: unknown, key: string, ls: KV | null = phone(), db: AnyGymDB = defaultDb): Promise<void> {
  if (!ls || s !== ls || !DURABLE_KEYS.has(key)) return Promise.resolve();
  try {
    const at = nextStamp();
    const stamps = readStamps(ls);
    stamps[key] = at;
    ls.setItem(STAMPS_KEY, JSON.stringify(stamps));
    return db.kv.put({ key, value: ls.getItem(key), at }).then(
      () => undefined,
      () => undefined,
    );
  } catch {
    return Promise.resolve();
  }
}

/** Startup: every mirror newer than localStorage's stamp goes back into localStorage. Returns the keys restored. */
export async function restoreMirrors(ls: KV | null = phone(), db: AnyGymDB = defaultDb): Promise<string[]> {
  if (!ls) return [];
  const rows = await db.kv.toArray();
  const stamps = readStamps(ls);
  const restored: string[] = [];
  for (const r of rows) {
    last = Math.max(last, r.at);
    if (!DURABLE_KEYS.has(r.key) || r.at <= (stamps[r.key] ?? 0)) continue;
    if (r.value === null) ls.removeItem(r.key);
    else ls.setItem(r.key, r.value);
    stamps[r.key] = r.at;
    restored.push(r.key);
  }
  if (restored.length) ls.setItem(STAMPS_KEY, JSON.stringify(stamps));
  return restored;
}
