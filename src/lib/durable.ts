// Live workout state that must survive an app kill (SPEC 13.3, PLAN 1.12). Row drafts, the rest
// deadline and added rows live in localStorage (sync reads while rendering), but Chromium writes
// localStorage to disk a few seconds late: a hard kill right after an edit lost it (WebKit kept it).
// Every write of these keys to the phone's localStorage is therefore:
//   1. stamped in localStorage (STAMPS, in the same synchronous step, so a stale snapshot on disk
//      carries its own stale stamps), and
//   2. mirrored to IndexedDB (db.kv: { key, value, at }), whose writes survive a kill.
// At startup, before the first render, `restoreMirrors` puts back every mirror that is newer than
// what localStorage has (a lost write, or a lost removal).
import { db as defaultDb, type AnyGymDB, type KvRow } from '../db/schema';

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
 * `value`: what was just written (null: removed); read back from storage when not given. The stamp
 * and the IndexedDB copy are attempted separately (PLAN 2.0c): a stamp localStorage refuses never
 * keeps the durable copy from being written.
 */
export function mirror(s: unknown, key: string, ls: KV | null = phone(), db: AnyGymDB = defaultDb, value?: string | null): Promise<void> {
  if (!ls || s !== ls || !DURABLE_KEYS.has(key)) return Promise.resolve();
  const at = nextStamp();
  let v: string | null;
  try {
    v = value !== undefined ? value : ls.getItem(key);
  } catch {
    return Promise.resolve();
  }
  try {
    const stamps = readStamps(ls);
    stamps[key] = at;
    ls.setItem(STAMPS_KEY, JSON.stringify(stamps));
  } catch {
    // The stamp is lost: localStorage looks older than the copy below, which only puts the same value back.
  }
  return putRow(db, { key, value: v, at });
}

function putRow(db: AnyGymDB, row: KvRow): Promise<void> {
  try {
    return db.kv.put(row).then(
      () => undefined,
      () => undefined,
    );
  } catch {
    return Promise.resolve();
  }
}

/**
 * True when `s` is the storage whose writes are mirrored: the phone's localStorage, or no storage
 * at all when the phone has none (localStorage access throws, PLAN 2.0c). A test's own storage, or
 * none passed while the phone has one, is never mirrored.
 */
const mirrored = (s: unknown, ls: KV | null): boolean => (s === null || s === undefined ? ls === null : s === ls);

/**
 * A mirror row for `key` with a fresh stamp, for a caller that writes it inside its own IndexedDB
 * transaction (Restore, PLAN 1.7i: the restored drafts are durable once the restore commits, even
 * if localStorage then refuses them; `restoreMirrors` puts them back at the next start).
 */
export function durableRow(key: string, value: string | null): KvRow {
  return { key, value, at: nextStamp() };
}

/**
 * localStorage refused a write of `key` (full or blocked, PLAN 1.7i), or there is no localStorage
 * at all (access throws, PLAN 2.0c: `s` and the phone's storage are both null): the value goes to
 * its IndexedDB mirror alone, with a fresh stamp, so the next start finds it newer than what
 * localStorage holds and puts it back (or hydrates the runtime store from it). Never throws.
 */
export function mirrorValue(s: unknown, key: string, value: string | null, ls: KV | null = phone(), db: AnyGymDB = defaultDb): Promise<void> {
  if (!mirrored(s, ls) || !DURABLE_KEYS.has(key)) return Promise.resolve();
  return putRow(db, { key, value, at: nextStamp() });
}

/**
 * The mirror row for a caller's own IndexedDB transaction (PLAN 2.0c, Log set), or null when `s`
 * is not mirrored storage (see `mirrored`).
 */
export function mirrorRow(s: unknown, key: string, value: string | null, ls: KV | null = phone()): KvRow | null {
  return mirrored(s, ls) && DURABLE_KEYS.has(key) ? durableRow(key, value) : null;
}

/** Takes a mirrored value straight into a runtime store when localStorage cannot hold it. */
export type Hydrators = Partial<Record<string, (value: string | null) => void>>;

/**
 * Startup: every mirror newer than localStorage's stamp goes back into localStorage. Returns the
 * keys restored. When localStorage refuses it (still full or blocked after a restart), or there is
 * no localStorage at all, the IndexedDB copy is authoritative (PLAN 1.7i): it is handed to that
 * key's hydrator, so the runtime store (drafts.ts) shows it and Finish inspects it.
 */
export async function restoreMirrors(ls: KV | null = phone(), db: AnyGymDB = defaultDb, hydrate: Hydrators = {}): Promise<string[]> {
  const rows = await db.kv.toArray();
  // Stamps keep increasing across launches, also without localStorage (PLAN 2.0c).
  for (const r of rows) last = Math.max(last, r.at);
  if (!ls) {
    for (const r of rows) if (DURABLE_KEYS.has(r.key)) hydrate[r.key]?.(r.value);
    return [];
  }
  let stamps: Record<string, number> = {};
  try {
    stamps = readStamps(ls);
  } catch {
    stamps = {};
  }
  const restored: string[] = [];
  for (const r of rows) {
    if (!DURABLE_KEYS.has(r.key) || r.at <= (stamps[r.key] ?? 0)) continue;
    try {
      if (r.value === null) ls.removeItem(r.key);
      else ls.setItem(r.key, r.value);
      stamps[r.key] = r.at;
      restored.push(r.key);
    } catch {
      hydrate[r.key]?.(r.value);
    }
  }
  try {
    if (restored.length) ls.setItem(STAMPS_KEY, JSON.stringify(stamps));
  } catch {
    /* the values are back; their stamps are written again next time */
  }
  return restored;
}
