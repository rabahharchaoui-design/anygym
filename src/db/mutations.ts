// Changes to logged sets, durable like Log set (PLAN 2.0c, SPEC 13.3): an Edit set save or a set
// type change is journaled (db.journal, `mutation`) with the values it writes BEFORE the write
// starts, and the write's own transaction removes it. One that failed, or was cut off by an app
// kill, stays: Finish refuses until it is retried (with the same values) or explicitly given up.
//
// PLAN 2.0e: one journal entry per operation, never one shared per set:
//   - its id is `mut:<kind>:<setId>:<rev>`; `rev` is allocated in the journal write's own
//     transaction (a per workout, set and kind counter in db.kv, above every entry still stored), so
//     two tabs never get the same one. An entry from before 2.0e (`mut:<kind>:<setId>`) is rev 0;
//   - the journal write checks the workout is in progress in the same transaction, so nothing is
//     journaled after Finish committed (and Finish refuses while an entry is stored, workouts.ts);
//   - applying reads its own entry inside the write's transaction: gone (a newer change of the same
//     set and kind landed, or the user discarded it), or a newer entry of the same set and kind
//     stored, means superseded: nothing is written. A change that lands removes its own entry and
//     every older one of the same set and kind, never a newer one, so an older completion can never
//     erase (or overwrite) a newer change that failed;
//   - when the journal write itself fails, the change is kept in session memory and, as a durable
//     fallback, in localStorage and (PLAN 2.0j) IndexedDB kv: Finish still sees it and offers Try again
//     (which saves it once) or Finish without it. A later change that journals supersedes the held
//     copies registered before it, by receipt written in its own transaction (never by comparing
//     clocks); registering and Finish share one lock per workout (sessionLock.ts).
//   - PLAN 2.0k: a held copy is made inside that lock, so a save covers only copies registered
//     before it; the ids it covers are stored on its journal entry (`covers`), so every apply, Retry
//     or discard writes their receipts, also after a failed apply or a restart; held ids are UUIDs;
//     Retry of a held copy rechecks under the lock that it is still the newest of its set and kind.
import { db as defaultDb, type AnyGymDB } from './schema';
import type { JournalEntry, MutationIntent } from './types';
import { withSessionLock } from './sessionLock';
import { MUTATION_DONE_PREFIX, MUTATION_HELD_PREFIX, MUTATION_REV_PREFIX, MUTATION_SUP_PREFIX, WorkoutFinishedError, updateSet, updateSetType } from './workouts';
import { MEMORY_PREFIX, MUTATION_FALLBACK_KEY, isEntry, phone, readFallback, writeFallback, type KV } from './mutationFallback';

export { MUTATION_FALLBACK_KEY };

/**
 * The set is deleted (its tombstone is stored) while a change to it is applied (PLAN 2.0f): the
 * change is not consumed. It stays journaled as a retryable conflict, so Undo of the deletion
 * brings the set back and Try again still writes the correction.
 */
export class MutationConflictError extends Error {
  constructor() {
    super('That set was deleted before the change landed');
    this.name = 'MutationConflictError';
  }
}

/** The logical change an entry belongs to: one set and one kind (edit or type), never both. */
export const mutationKey = (m: MutationIntent): string => `${m.kind}:${m.setId}`;

/** Before PLAN 2.0e: one entry per set and kind (read as revision 0). */
export const legacyMutationId = (m: MutationIntent): string => `mut:${m.kind}:${m.setId}`;

/** One entry per operation (PLAN 2.0e). */
export const mutationId = (m: MutationIntent, rev: number): string => `${legacyMutationId(m)}:${rev}`;

/** The kv row holding the highest revision handed out for this workout, set and kind. */
export { MUTATION_REV_PREFIX };
const revKey = (sessionId: string, m: MutationIntent) => `${MUTATION_REV_PREFIX}${sessionId}:${mutationKey(m)}`;
/**
 * The supersession marker (PLAN 2.0f): the `at` of the newest change of this set and kind that
 * landed, written in that change's own transaction. A held or fallback copy made at or before it is
 * superseded, whether or not removing the copy itself succeeded, so a stale one is never shown or replayed.
 */
const doneKey = (sessionId: string, key: string) => `${MUTATION_DONE_PREFIX}${sessionId}:${key}`;

/** Operation times are strictly increasing per database, so two changes never share an order (PLAN 2.0f). */
const lastAts = new WeakMap<AnyGymDB, number>();
function nextAt(db: AnyGymDB, now: number): number {
  const at = Math.max(now, (lastAts.get(db) ?? -Infinity) + 1);
  lastAts.set(db, at);
  return at;
}

/** Changes whose journal write failed, per database, while the app runs. */
const memories = new WeakMap<AnyGymDB, Map<string, JournalEntry>>();
const memoryOf = (db: AnyGymDB) => {
  let m = memories.get(db);
  if (!m) memories.set(db, (m = new Map()));
  return m;
};

/**
 * A globally unique operation id (PLAN 2.0k): crypto.randomUUID(), else a version 4 UUID from
 * crypto.getRandomValues, else from Math.random. Never a clock plus a per tab counter, which two
 * tabs can share.
 */
export function operationId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  try {
    if (typeof c?.randomUUID === 'function') return c.randomUUID();
  } catch {
    /* insecure context: below */
  }
  const b = new Uint8Array(16);
  try {
    if (typeof c?.getRandomValues === 'function') c.getRandomValues(b);
    else throw new Error('no crypto');
  } catch {
    for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  }
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Forgets memory and fallback copies matching `drop` (a fallback that cannot be written is left). */
function forgetLocal(db: AnyGymDB, ls: KV | null, drop: (e: JournalEntry) => boolean): void {
  const mem = memoryOf(db);
  for (const [id, e] of mem) if (drop(e)) mem.delete(id);
  try {
    const list = readFallback(ls);
    const next = list.filter((e) => !drop(e));
    if (next.length !== list.length) writeFallback(ls, next);
  } catch {
    /* the copy stays; a later journaled change of the same set replaces it */
  }
}

const supKey = (sessionId: string, heldId: string) => `${MUTATION_SUP_PREFIX}${sessionId}:${heldId}`;

const heldKey = (e: JournalEntry) => `${MUTATION_HELD_PREFIX}${e.sessionId}:${e.id}`;

/** The corrections a restore stored durably in IndexedDB (PLAN 2.0i), readable after a restart. */
async function storedHeld(sessionId: string, db: AnyGymDB): Promise<JournalEntry[]> {
  const out: JournalEntry[] = [];
  try {
    for (const row of await db.kv.where('key').startsWith(`${MUTATION_HELD_PREFIX}${sessionId}:`).toArray()) {
      try {
        const e = JSON.parse(row.value ?? '') as unknown;
        if (isEntry(e)) out.push(e);
      } catch {
        /* an unreadable row holds nothing */
      }
    }
  } catch {
    /* IndexedDB unreadable: memory and the fallback still answer */
  }
  return out;
}

/** The rows a restore writes inside its own transaction, so a restored correction survives a restart (PLAN 2.0i). */
export const heldRows = (entries: readonly JournalEntry[]) => entries.map((e) => ({ key: heldKey(e), value: JSON.stringify(e), at: e.at }));

/** forgetLocal, and the durable copies of a restore too. */
async function forget(db: AnyGymDB, ls: KV | null, drop: (e: JournalEntry) => boolean): Promise<void> {
  forgetLocal(db, ls, drop);
  try {
    for (const e of await allStoredHeld(db)) if (drop(e)) await db.kv.delete(heldKey(e));
  } catch {
    /* the superseded copy is filtered by the markers; Finish clears the rest */
  }
}

async function allStoredHeld(db: AnyGymDB): Promise<JournalEntry[]> {
  const out: JournalEntry[] = [];
  for (const row of await db.kv.where('key').startsWith(MUTATION_HELD_PREFIX).toArray()) {
    try {
      const e = JSON.parse(row.value ?? '') as unknown;
      if (isEntry(e)) out.push(e);
    } catch {
      /* skipped */
    }
  }
  return out;
}

/**
 * This workout's changes that have not landed (failed, cut off by a kill, or never journaled),
 * oldest first: every stored entry, so an explicit discard covers exactly what was shown.
 */
export async function pendingMutations(sessionId: string, db: AnyGymDB = defaultDb, ls: KV | null = phone()): Promise<JournalEntry[]> {
  const stored = (await db.journal.where('sessionId').equals(sessionId).toArray()).filter((j) => !!j.mutation);
  // Held copies a save that landed has superseded (PLAN 2.0j): by receipt, never by comparing clocks,
  // which two tabs can share or run backwards. The receipt was written in that save's transaction.
  const sup = new Set((await db.kv.where('key').startsWith(supKey(sessionId, '')).primaryKeys()).map((k) => String(k).slice(supKey(sessionId, '').length)));
  // A stored change supersedes the held copies registered before it (PLAN 2.0k, `covers`), also
  // before it landed: its receipts are written when it is applied, Retried or discarded.
  for (const j of stored) for (const c of j.covers ?? []) sup.add(c);
  const held = new Map<string, JournalEntry>();
  for (const e of [...(await storedHeld(sessionId, db)), ...readFallback(ls), ...memoryOf(db).values()]) {
    if (e.sessionId === sessionId && !sup.has(e.id)) held.set(e.id, e);
  }
  // Operations are ordered by when they were made; a held copy made in the same instant as a stored
  // one is the later (it only exists because the journal write after it failed).
  const order = (e: JournalEntry) => (e.rev < 0 ? 1 : 0);
  return [...stored, ...held.values()].sort((a, b) => a.at - b.at || order(a) - order(b) || a.rev - b.rev);
}

/**
 * This workout's changes held only in memory or the fallback (their journal write failed), not
 * superseded, oldest first: what a backup carries so they stay retryable after a restore (PLAN 2.0h).
 */
export async function heldMutations(sessionId: string, db: AnyGymDB = defaultDb, ls: KV | null = phone()): Promise<JournalEntry[]> {
  return (await pendingMutations(sessionId, db, ls)).filter((e) => e.id.startsWith(MEMORY_PREFIX));
}

/**
 * Restore (PLAN 2.0h): a backup's held changes are put back, with their ids, times and values, in
 * memory and (when it takes them) the fallback, before Try again or Finish can run. `replace`: the
 * held copies of the replaced data go (no workout was in progress, so none is the user's word).
 * Changes made here after the restore are ordered after them.
 */
export function restoreHeldMutations(entries: readonly JournalEntry[], db: AnyGymDB = defaultDb, ls: KV | null = phone(), replace = false): void {
  const mem = memoryOf(db);
  if (replace) mem.clear();
  for (const e of entries) mem.set(e.id, structuredClone(e));
  lastAts.set(db, Math.max(lastAts.get(db) ?? -Infinity, ...entries.map((e) => e.at)));
  try {
    const ids = new Set(entries.map((e) => e.id));
    const keep = replace ? [] : readFallback(ls).filter((e) => !ids.has(e.id));
    if (replace || entries.length) writeFallback(ls, [...keep, ...entries]);
  } catch {
    /* memory alone holds them for this app run */
  }
}

/** How many changes the user made that did not land: one per set and kind, however many tries. */
export function changeCount(entries: readonly JournalEntry[]): number {
  return new Set(entries.filter((e) => e.mutation).map((e) => mutationKey(e.mutation!))).size;
}

/**
 * Writes the change of journal entry `id`, in the same transaction that removes it and every
 * older entry of the same set and kind. Its entry gone means superseded (or discarded): nothing is
 * written. A set that is gone needs nothing any more. A finished workout is never changed
 * (WorkoutFinishedError), and the entry goes too.
 */
async function apply(id: string, db: AnyGymDB): Promise<void> {
  const finished = await db.transaction('rw', [db.sessions, db.sets, db.journal, db.tombstones, db.kv], async () => {
    const entry = await db.journal.get(id);
    const m = entry?.mutation;
    if (!entry || !m) return false;
    const same = (await db.journal.where('sessionId').equals(entry.sessionId).toArray()).filter((j) => j.mutation && mutationKey(j.mutation) === mutationKey(m));
    const older = same.filter((j) => j.rev < entry.rev);
    // The receipts of every held copy these entries cover (PLAN 2.0k), read from the stored entries
    // themselves, so a Retry after a failed apply or a restart writes them too.
    const done = async () => {
      await db.journal.bulkDelete([id, ...older.map((j) => j.id)]);
      await receipts(db, entry.sessionId, entry.id, entry.at, [entry, ...older]);
    };
    // A newer change of the same set and kind is journaled: this one is superseded, and the newer
    // one (landing, or failed and kept for Finish to ask about) is the user's word.
    if (same.some((j) => j.rev > entry.rev)) {
      await done();
      return false;
    }
    const set = await db.sets.get(m.setId);
    // Deleted and still within Undo (or Keep deleted pending): the change is kept, not consumed.
    if (!set && (await db.tombstones.get(m.setId))) throw new MutationConflictError();
    const session = set ? await db.sessions.get(set.sessionId) : undefined;
    if (!set || !session) {
      await done();
      return false;
    }
    if (session.endedAt !== undefined) {
      await done();
      return true;
    }
    if (m.kind === 'edit') await updateSet(m.setId, m.change, db);
    else await updateSetType(m.setId, m.setKind, m.failure, db);
    await done();
    // Landed: the marker that supersedes every copy of this set and kind made up to now.
    const marker = await db.kv.get(doneKey(entry.sessionId, mutationKey(m)));
    if (Number(marker?.value ?? -Infinity) < entry.at) await db.kv.put({ key: doneKey(entry.sessionId, mutationKey(m)), value: String(entry.at), at: entry.at });
    return false;
  });
  if (finished) throw new WorkoutFinishedError();
}

/**
 * The supersession receipts of the held copies `entries` cover (PLAN 2.0j, 2.0k), inside the caller's
 * transaction: a copy left in another tab's memory or a fallback that refused cleanup stays superseded.
 */
async function receipts(db: AnyGymDB, sessionId: string, by: string, at: number, entries: readonly JournalEntry[]): Promise<void> {
  for (const heldId of new Set(entries.flatMap((e) => e.covers ?? []))) {
    await db.kv.put({ key: supKey(sessionId, heldId), value: by, at });
    await db.kv.delete(`${MUTATION_HELD_PREFIX}${sessionId}:${heldId}`);
  }
}

/**
 * Journals one operation with a new revision and the held copies it covers (PLAN 2.0k, atomically
 * with it); refused (WorkoutFinishedError) once the workout ended.
 */
async function journal(sessionId: string, exerciseId: string, m: MutationIntent, db: AnyGymDB, now: number, covers: readonly string[]): Promise<string> {
  return db.transaction('rw', [db.sessions, db.journal, db.kv], async () => {
    const session = await db.sessions.get(sessionId);
    if (!session || session.endedAt !== undefined) throw new WorkoutFinishedError();
    const key = mutationKey(m);
    const counter = await db.kv.get(revKey(sessionId, m));
    const used = (await db.journal.where('sessionId').equals(sessionId).toArray()).filter((j) => j.mutation && mutationKey(j.mutation) === key).map((j) => j.rev);
    const rev = Math.max(Number(counter?.value ?? 0) || 0, ...used, 0) + 1;
    const id = mutationId(m, rev);
    await db.kv.put({ key: revKey(sessionId, m), value: String(rev), at: now });
    await db.journal.put({ id, sessionId, exerciseId, key, rev, draft: { id, load: null }, at: now, mutation: m, ...(covers.length ? { covers: [...covers] } : {}) });
    return id;
  });
}

/**
 * The newest change of each set and kind among `list` (pendingMutations' result): a held copy no
 * stored change covers was registered after every stored one it could see (PLAN 2.0k), so it is the
 * newest; otherwise the stored one with the highest revision. Never decided by comparing clocks
 * across kinds of copies.
 */
function newestPerKey(list: readonly JournalEntry[]): Map<string, JournalEntry> {
  const out = new Map<string, JournalEntry>();
  for (const e of list) {
    const key = mutationKey(e.mutation!);
    const cur = out.get(key);
    const held = e.id.startsWith(MEMORY_PREFIX);
    if (!cur) out.set(key, e);
    else if (held && !cur.id.startsWith(MEMORY_PREFIX)) out.set(key, e);
    else if (held === cur.id.startsWith(MEMORY_PREFIX) && (held ? e.at >= cur.at : e.rev >= cur.rev)) out.set(key, e);
  }
  return out;
}

/**
 * Registers and journals one change under the workout's lock (PLAN 2.0j, 2.0k): its held copy is
 * made inside the lock, so it covers exactly the held copies of the same set and kind registered
 * before it. `replaces` (Retry): the held change being tried again; when it is no longer the newest
 * pending change of its set and kind (superseded meanwhile), nothing is registered (null).
 */
async function register(sessionId: string, exerciseId: string, m: MutationIntent, db: AnyGymDB, requested: number, ls: KV | null, replaces?: string): Promise<{ id: string; covered: string[] } | null> {
  const key = mutationKey(m);
  const mem = memoryOf(db);
  return withSessionLock(sessionId, async () => {
    const pending = await pendingMutations(sessionId, db, ls).catch(() => null);
    if (replaces !== undefined && newestPerKey(pending ?? []).get(key)?.id !== replaces) return null;
    const now = nextAt(db, requested);
    // Held in memory before the journal write starts (PLAN 2.0e): a failure there never loses it.
    const memId = `${MEMORY_PREFIX}${key}:${now}:${operationId()}`;
    const held: JournalEntry = { id: memId, sessionId, exerciseId, key, rev: -1, draft: { id: memId, load: null }, at: now, mutation: m };
    // Every held copy of this set and kind visible now was registered before this one: this save
    // supersedes it, whatever the clocks say.
    const covered = (pending ?? []).filter((e) => e.id.startsWith(MEMORY_PREFIX) && mutationKey(e.mutation!) === key).map((e) => e.id);
    mem.set(memId, held);
    try {
      const id = await journal(sessionId, exerciseId, m, db, now, covered);
      mem.delete(memId);
      return { id, covered };
    } catch (err) {
      let ended = err instanceof WorkoutFinishedError;
      if (!ended) ended = (await db.sessions.get(sessionId).catch(() => undefined))?.endedAt !== undefined;
      if (ended) {
        mem.delete(memId);
        throw err instanceof WorkoutFinishedError ? err : new WorkoutFinishedError();
      }
      try {
        writeFallback(ls, [...readFallback(ls).filter((e) => e.id !== memId), held]);
      } catch {
        /* memory (and IndexedDB, below) hold it */
      }
      // localStorage may refuse it too: IndexedDB keeps it across a kill when it can (PLAN 2.0j).
      await db.kv.bulkPut(heldRows([held])).catch(() => undefined);
      throw err;
    }
  });
}

/**
 * Journals the change, then writes it. Rejects when either fails: when the set write failed the
 * entry stays for Finish to ask about; when the journal write failed nothing was written and the
 * change is held in memory (and the localStorage fallback when it takes it), so Finish still asks.
 */
export async function saveMutation(sessionId: string, exerciseId: string, m: MutationIntent, db: AnyGymDB = defaultDb, requested = Date.now(), ls: KV | null = phone()): Promise<void> {
  const r = await register(sessionId, exerciseId, m, db, requested, ls);
  await settle(r!, db, ls);
}

/** Journaled: the held copies it covers go (a failed removal is harmless: the stored `covers` and the receipts), then it is written. */
async function settle(r: { id: string; covered: string[] }, db: AnyGymDB, ls: KV | null): Promise<void> {
  await forget(db, ls, (e) => r.covered.includes(e.id));
  await apply(r.id, db);
}

/**
 * "Try again": the newest change of each set and kind once more, with its stored values (older
 * ones of the same set and kind are covered by it). True when none is left. Never rejects.
 */
export async function retryMutations(sessionId: string, db: AnyGymDB = defaultDb, ls: KV | null = phone()): Promise<boolean> {
  try {
    // A round can find a newer change registered meanwhile (it is tried in the next one).
    for (let round = 0; round < 3; round++) {
      const pending = await pendingMutations(sessionId, db, ls);
      if (!pending.length) return true;
      for (const e of newestPerKey(pending).values()) {
        if (e.id.startsWith(MEMORY_PREFIX)) {
          // Never journaled: journaled now (a new revision covering it), then written, but only if it
          // is still the newest of its set and kind under the workout's lock (PLAN 2.0k). If the journal
          // write fails again, the new held copy stands for it (one change).
          const r = await register(sessionId, e.exerciseId, e.mutation!, db, Math.max(Date.now(), e.at + 1), ls, e.id).catch(() => 'failed' as const);
          if (r === 'failed') await forget(db, ls, (x) => x.id === e.id);
          else if (r) await settle(r, db, ls).catch(() => undefined);
        } else {
          const ok = await apply(e.id, db).then(
            () => true,
            (err: unknown) => err instanceof WorkoutFinishedError,
          );
          // Landed: the held copies it covers are gone (their receipts were written with it).
          if (ok) forgetLocal(db, ls, (x) => (e.covers ?? []).includes(x.id));
        }
      }
    }
    return (await pendingMutations(sessionId, db, ls)).length === 0;
  } catch {
    return false;
  }
}

/**
 * "Finish without it": the pending changes are given up (the sets keep their saved values). Only
 * `ids` when given (the ones the user was shown), so a change made after that is never dropped.
 */
export async function dropMutations(sessionId: string, db: AnyGymDB = defaultDb, ids?: readonly string[], ls: KV | null = phone()): Promise<void> {
  const list = await pendingMutations(sessionId, db, ls);
  const covered = new Set(ids ?? list.map((j) => j.id));
  const stored = list.filter((j) => covered.has(j.id) && !j.id.startsWith(MEMORY_PREFIX));
  if (stored.length) {
    // The held copies a given up change covered stay given up (PLAN 2.0k): their receipts go with it.
    await db.transaction('rw', db.journal, db.kv, async () => {
      await db.journal.bulkDelete(stored.map((j) => j.id));
      for (const j of stored) await receipts(db, sessionId, j.id, j.at, [j]);
    });
  }
  const hidden = new Set(stored.flatMap((j) => j.covers ?? []));
  await forget(db, ls, (e) => e.sessionId === sessionId && (covered.has(e.id) || hidden.has(e.id)));
}
