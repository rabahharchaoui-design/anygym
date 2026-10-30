// Changes to logged sets, durable like Log set (PLAN 2.0c, SPEC 13.3): an Edit set save or a set
// type change is journaled (db.journal, `mutation`) with the values it writes BEFORE the write
// starts, and the write's own transaction removes it. One that failed, or was cut off by an app
// kill, stays: Finish refuses until it is retried (with the same values) or explicitly given up.
import { db as defaultDb, type AnyGymDB } from './schema';
import type { JournalEntry, MutationIntent } from './types';
import { WorkoutFinishedError, updateSet, updateSetType } from './workouts';

/** One entry per set and kind: a newer change of the same set replaces the older one. */
export const mutationId = (m: MutationIntent): string => `mut:${m.kind}:${m.setId}`;

/** This workout's changes that have not landed (failed, or cut off by a kill). */
export async function pendingMutations(sessionId: string, db: AnyGymDB = defaultDb): Promise<JournalEntry[]> {
  return (await db.journal.where('sessionId').equals(sessionId).toArray()).filter((j) => !!j.mutation);
}

/**
 * Writes one change in the same transaction that removes its journal entry. A set that is gone
 * (deleted) needs nothing any more: its entry is dropped. A finished workout is never changed
 * (WorkoutFinishedError), and its entry goes too (Finish already cleared the journal).
 */
async function apply(m: MutationIntent, db: AnyGymDB): Promise<void> {
  const id = mutationId(m);
  const finished = await db.transaction('rw', db.sessions, db.sets, db.journal, async () => {
    const set = await db.sets.get(m.setId);
    const session = set ? await db.sessions.get(set.sessionId) : undefined;
    if (!set || !session) {
      await db.journal.delete(id);
      return false;
    }
    if (session.endedAt !== undefined) {
      await db.journal.delete(id);
      return true;
    }
    if (m.kind === 'edit') await updateSet(m.setId, m.change, db);
    else await updateSetType(m.setId, m.setKind, m.failure, db);
    await db.journal.delete(id);
    return false;
  });
  if (finished) throw new WorkoutFinishedError();
}

/**
 * Journals the change, then writes it. Rejects when either fails: when the journal write failed
 * nothing was written; when the set write failed the entry stays for Finish to ask about.
 */
export async function saveMutation(sessionId: string, exerciseId: string, m: MutationIntent, db: AnyGymDB = defaultDb, now = Date.now()): Promise<void> {
  const id = mutationId(m);
  await db.journal.put({ id, sessionId, exerciseId, key: `${m.kind}:${m.setId}`, rev: 0, draft: { id, load: null }, at: now, mutation: m });
  await apply(m, db);
}

/** "Try again": every pending change of the workout once more, with its stored values. True when none is left. */
export async function retryMutations(sessionId: string, db: AnyGymDB = defaultDb): Promise<boolean> {
  try {
    for (const j of await pendingMutations(sessionId, db)) {
      await apply(j.mutation!, db).catch(() => undefined);
    }
    return (await pendingMutations(sessionId, db)).length === 0;
  } catch {
    return false;
  }
}

/** "Finish without it": the pending changes are given up (the sets keep their saved values). */
export async function dropMutations(sessionId: string, db: AnyGymDB = defaultDb): Promise<void> {
  const ids = (await pendingMutations(sessionId, db)).map((j) => j.id);
  if (ids.length) await db.journal.bulkDelete(ids);
}
