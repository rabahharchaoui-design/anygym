// PLAN 3.5g: an abandoned workout with nothing in it never takes over Today. Discard beside Resume
// deletes it, only while it is still active with no set logged, no deleted set waiting for its Undo
// and no write pending; Undo puts it back exactly as it was (no confirm dialog, SPEC 13.1).
import { db as defaultDb, type AnyGymDB } from './schema';
import type { OrderCounter, Session } from './types';

export type Discarded = { session: Session; counter: OrderCounter | undefined };

/** Deletes the empty workout and returns what Undo needs, or null when it is not empty (or gone). */
export async function discardEmptyWorkout(sessionId: string, db: AnyGymDB = defaultDb): Promise<Discarded | null> {
  return db.transaction('rw', [db.sessions, db.sets, db.tombstones, db.journal, db.submissions, db.orderCounters], async () => {
    const session = await db.sessions.get(sessionId);
    if (!session || session.endedAt !== undefined || session.imported) return null;
    const busy = [db.sets, db.tombstones, db.journal, db.submissions].map((t) => t.where('sessionId').equals(sessionId).count());
    if ((await Promise.all(busy)).some((n) => n > 0)) return null;
    const counter = await db.orderCounters.get(sessionId);
    await db.sessions.delete(sessionId);
    await db.orderCounters.delete(sessionId);
    return { session, counter };
  });
}

/** Undo: the workout comes back, unless another one was started meanwhile (then false). */
export async function undoDiscard(d: Discarded, db: AnyGymDB = defaultDb): Promise<boolean> {
  return db.transaction('rw', db.sessions, db.orderCounters, async () => {
    const other = await db.sessions.filter((s) => s.endedAt === undefined && !s.imported).count();
    if (other > 0) return false;
    await db.sessions.put(d.session);
    if (d.counter) await db.orderCounters.put(d.counter);
    return true;
  });
}
