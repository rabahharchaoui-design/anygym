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
//     fallback, in localStorage: Finish still sees it and offers Try again (which saves it once) or
//     Finish without it. A later change of the same set and kind that journals replaces it.
import { db as defaultDb, type AnyGymDB } from './schema';
import type { JournalEntry, MutationIntent } from './types';
import { MUTATION_REV_PREFIX, WorkoutFinishedError, updateSet, updateSetType } from './workouts';

/** The logical change an entry belongs to: one set and one kind (edit or type), never both. */
export const mutationKey = (m: MutationIntent): string => `${m.kind}:${m.setId}`;

/** Before PLAN 2.0e: one entry per set and kind (read as revision 0). */
export const legacyMutationId = (m: MutationIntent): string => `mut:${m.kind}:${m.setId}`;

/** One entry per operation (PLAN 2.0e). */
export const mutationId = (m: MutationIntent, rev: number): string => `${legacyMutationId(m)}:${rev}`;

/** The kv row holding the highest revision handed out for this workout, set and kind. */
export { MUTATION_REV_PREFIX };
const revKey = (sessionId: string, m: MutationIntent) => `${MUTATION_REV_PREFIX}${sessionId}:${mutationKey(m)}`;

/** localStorage key of the changes whose journal write failed (the durable fallback). */
export const MUTATION_FALLBACK_KEY = 'anygym-pending-changes';
/** Ids of changes held only in memory or the fallback (never a journal id). */
const MEMORY_PREFIX = 'mem:';

type KV = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const phone = (): KV | null => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

/** Changes whose journal write failed, per database, while the app runs. */
const memories = new WeakMap<AnyGymDB, Map<string, JournalEntry>>();
const memoryOf = (db: AnyGymDB) => {
  let m = memories.get(db);
  if (!m) memories.set(db, (m = new Map()));
  return m;
};
let seq = 0;
/** Held copies are ordered by when the user made them: their time, then this app run's sequence. */
const seqOf = (e: JournalEntry) => Number(e.id.slice(e.id.lastIndexOf(':') + 1)) || 0;
const notNewer = (e: JournalEntry, at: number, n: number) => e.at < at || (e.at === at && seqOf(e) <= n);

const isEntry = (v: unknown): v is JournalEntry => {
  const e = v as JournalEntry;
  return !!e && typeof e.id === 'string' && e.id.startsWith(MEMORY_PREFIX) && typeof e.sessionId === 'string' && typeof e.exerciseId === 'string' && !!e.mutation && typeof e.at === 'number';
};

function readFallback(ls: KV | null): JournalEntry[] {
  try {
    const v = JSON.parse(ls?.getItem(MUTATION_FALLBACK_KEY) ?? '[]') as unknown;
    return Array.isArray(v) ? v.filter(isEntry) : [];
  } catch {
    return [];
  }
}

function writeFallback(ls: KV | null, list: JournalEntry[]): void {
  if (!ls) throw new Error('No storage');
  if (list.length) ls.setItem(MUTATION_FALLBACK_KEY, JSON.stringify(list));
  else ls.removeItem(MUTATION_FALLBACK_KEY);
}

/** Forgets memory and fallback copies matching `drop` (a fallback that cannot be written is left). */
function forget(db: AnyGymDB, ls: KV | null, drop: (e: JournalEntry) => boolean): void {
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

/**
 * This workout's changes that have not landed (failed, cut off by a kill, or never journaled),
 * oldest first: every stored entry, so an explicit discard covers exactly what was shown.
 */
export async function pendingMutations(sessionId: string, db: AnyGymDB = defaultDb, ls: KV | null = phone()): Promise<JournalEntry[]> {
  const stored = (await db.journal.where('sessionId').equals(sessionId).toArray()).filter((j) => !!j.mutation);
  const held = new Map<string, JournalEntry>();
  for (const e of [...readFallback(ls), ...memoryOf(db).values()]) if (e.sessionId === sessionId) held.set(e.id, e);
  return [...stored, ...held.values()].sort((a, b) => a.at - b.at || a.rev - b.rev);
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
  const finished = await db.transaction('rw', db.sessions, db.sets, db.journal, async () => {
    const entry = await db.journal.get(id);
    const m = entry?.mutation;
    if (!entry || !m) return false;
    const same = (await db.journal.where('sessionId').equals(entry.sessionId).toArray()).filter((j) => j.mutation && mutationKey(j.mutation) === mutationKey(m));
    const older = same.filter((j) => j.rev < entry.rev).map((j) => j.id);
    const done = () => db.journal.bulkDelete([id, ...older]);
    // A newer change of the same set and kind is journaled: this one is superseded, and the newer
    // one (landing, or failed and kept for Finish to ask about) is the user's word.
    if (same.some((j) => j.rev > entry.rev)) {
      await done();
      return false;
    }
    const set = await db.sets.get(m.setId);
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
    return false;
  });
  if (finished) throw new WorkoutFinishedError();
}

/** Journals one operation with a new revision; refused (WorkoutFinishedError) once the workout ended. */
async function journal(sessionId: string, exerciseId: string, m: MutationIntent, db: AnyGymDB, now: number): Promise<string> {
  return db.transaction('rw', [db.sessions, db.journal, db.kv], async () => {
    const session = await db.sessions.get(sessionId);
    if (!session || session.endedAt !== undefined) throw new WorkoutFinishedError();
    const key = mutationKey(m);
    const counter = await db.kv.get(revKey(sessionId, m));
    const used = (await db.journal.where('sessionId').equals(sessionId).toArray()).filter((j) => j.mutation && mutationKey(j.mutation) === key).map((j) => j.rev);
    const rev = Math.max(Number(counter?.value ?? 0) || 0, ...used, 0) + 1;
    const id = mutationId(m, rev);
    await db.kv.put({ key: revKey(sessionId, m), value: String(rev), at: now });
    await db.journal.put({ id, sessionId, exerciseId, key, rev, draft: { id, load: null }, at: now, mutation: m });
    return id;
  });
}

/**
 * Journals the change, then writes it. Rejects when either fails: when the set write failed the
 * entry stays for Finish to ask about; when the journal write failed nothing was written and the
 * change is held in memory (and the localStorage fallback when it takes it), so Finish still asks.
 */
export async function saveMutation(sessionId: string, exerciseId: string, m: MutationIntent, db: AnyGymDB = defaultDb, now = Date.now(), ls: KV | null = phone()): Promise<void> {
  const key = mutationKey(m);
  // Held in memory before the journal write starts (PLAN 2.0e): a failure there never loses it.
  const n = ++seq;
  const memId = `${MEMORY_PREFIX}${key}:${now}:${n}`;
  const held: JournalEntry = { id: memId, sessionId, exerciseId, key, rev: -1, draft: { id: memId, load: null }, at: now, mutation: m };
  const mem = memoryOf(db);
  mem.set(memId, held);
  let id: string;
  try {
    id = await journal(sessionId, exerciseId, m, db, now);
  } catch (err) {
    if (err instanceof WorkoutFinishedError) mem.delete(memId);
    else {
      try {
        writeFallback(ls, [...readFallback(ls).filter((e) => e.id !== memId), held]);
      } catch {
        /* memory alone holds it for this app run */
      }
    }
    throw err;
  }
  // Journaled: it and every older held copy of the same set and kind are covered by the journal.
  forget(db, ls, (e) => e.sessionId === sessionId && mutationKey(e.mutation!) === key && notNewer(e, now, n));
  mem.delete(memId);
  await apply(id, db);
}

/**
 * "Try again": the newest change of each set and kind once more, with its stored values (older
 * ones of the same set and kind are covered by it). True when none is left. Never rejects.
 */
export async function retryMutations(sessionId: string, db: AnyGymDB = defaultDb, ls: KV | null = phone()): Promise<boolean> {
  try {
    const newest = new Map<string, JournalEntry>();
    for (const e of await pendingMutations(sessionId, db, ls)) newest.set(mutationKey(e.mutation!), e);
    for (const e of newest.values()) {
      const key = mutationKey(e.mutation!);
      if (e.id.startsWith(MEMORY_PREFIX)) {
        // Never journaled: journaled now (a new revision), then written. Its held copy goes once the
        // new one is journaled; if that fails again, the new held copy replaces it (one change).
        await saveMutation(sessionId, e.exerciseId, e.mutation!, db, Math.max(Date.now(), e.at), ls).catch(() => undefined);
        forget(db, ls, (x) => x.id === e.id);
      } else {
        const ok = await apply(e.id, db).then(
          () => true,
          (err: unknown) => err instanceof WorkoutFinishedError,
        );
        // Landed: the older held copies of the same set and kind are covered by it.
        if (ok) forget(db, ls, (x) => x.sessionId === sessionId && mutationKey(x.mutation!) === key && x.at <= e.at);
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
  const all = (await pendingMutations(sessionId, db, ls)).map((j) => j.id);
  const covered = new Set(ids ?? all);
  const stored = all.filter((id) => covered.has(id) && !id.startsWith(MEMORY_PREFIX));
  if (stored.length) await db.journal.bulkDelete(stored);
  forget(db, ls, (e) => e.sessionId === sessionId && covered.has(e.id));
}
