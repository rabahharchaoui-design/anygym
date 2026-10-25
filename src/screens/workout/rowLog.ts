// Logging a pending row, durable across an app kill (PLAN 1.7h, SPEC 13.3).
//
// A pending row's draft (lib/drafts.ts, slot keyed: lib/setTable.ts rowKey) goes through:
//
//   IDLE { id, values, rev }               the user's edits; `id` is the row's stable identity
//     --✓ tapped--> SUBMITTED { submitted: rev }   stored BEFORE the write starts, with the values
//                                                   logged and (rows above) what they showed
//     --logSet commits--> COMMITTED                  the set AND its submission { id, rev } commit
//                                                   in one IndexedDB transaction
//     --reconcile--> used up (slot removed, rows below move up)   when rev === submitted rev
//                 or kept under a fresh id (IDLE)                   when edited during the write
//   SUBMITTED --write failed--> FAILED (still SUBMITTED, no write running)
//     --✓ again / Try again--> SUBMITTED (same id: one set at most)
//     --Finish without it--> IDLE (the mark is discarded explicitly)
//
// The pending write journal (PLAN 1.7i, db.journal): before logSet starts, the submitted row (id,
// draft key, version, every value) is put in IndexedDB; logSet's own transaction removes it when
// the set commits. A journal entry that is not committed is a FAILED row even when localStorage
// lost the draft or its mark: it is put back into the drafts (adoptJournal) before rows are shown
// and before Finish counts, so the row is visible again, Finish refuses, and a retry logs it once.
// Submission receipts (db.submissions) stay for the workout's lifetime (PLAN 1.7i): drafts that
// come back after an undone Finish are reconciled against them before any retry is offered.
//
// localStorage is only a mirror: reconciliation reads the committed submissions from IndexedDB,
// runs after every landed write and again before pending rows are shown (every render of the
// exercise view, so on startup too). A kill between the commit and the draft cleanup therefore
// shows the row as logged once, never as a pending row that could be logged again.
// Finish refuses while a FAILED row remains (failedRows), so a failed write is never discarded.
import { newId } from '../../db/ids';
import { db as defaultDb, type AnyGymDB } from '../../db/schema';
import { AlreadyLoggedError, logSet } from '../../db/workouts';
import { isDraft, saveDraft, sessionDrafts, writeDrafts, type Draft } from '../../lib/drafts';
import type { JournalEntry } from '../../db/types';
import { logKey, logQueue as defaultQueue, type LogQueue } from '../../lib/logQueue';
import { legacyRowKey, reconcileRows, rowKey, slotChanges, slotsOf, storedType, type Committed } from '../../lib/setTable';

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Seams for tests: another database, storage (null = none), queue or id maker. */
export type Deps = { db?: AnyGymDB; storage?: StorageLike | null; queue?: LogQueue; makeId?: () => string };

const parts = (d: Deps) => ({ db: d.db ?? defaultDb, queue: d.queue ?? defaultQueue, makeId: d.makeId ?? newId, s: d.storage });

/** Every committed Log set write of a workout: its submissions, and any set logged without one. */
export async function committedOf(sessionId: string, db: AnyGymDB = defaultDb): Promise<Map<string, number | undefined>> {
  return db.transaction('r', db.sets, db.submissions, async () => {
    const out = new Map<string, number | undefined>();
    for (const s of await db.sets.where('sessionId').equals(sessionId).primaryKeys()) out.set(String(s), undefined);
    for (const sub of await db.submissions.where('sessionId').equals(sessionId).toArray()) out.set(sub.id, sub.rev);
    return out;
  });
}

/** The pending write journal of a workout (entries whose write has not committed yet). */
export async function journalOf(sessionId: string, db: AnyGymDB = defaultDb): Promise<JournalEntry[]> {
  return db.journal.where('sessionId').equals(sessionId).toArray();
}

/**
 * Ids whose write landed or that the user discarded while the app runs: a journal read from before
 * that (a live query a moment behind) is never adopted again.
 */
const landedIds = new Set<string>();

/**
 * Puts journal entries back into the drafts (PLAN 1.7i): an entry that did not commit is a failed
 * submission. Missing from the drafts (localStorage lost it), it comes back at its key (the rows
 * from that slot down move one place, nothing is overwritten); present without its submitted mark
 * (an older copy), it gets the mark back, with the newer of the two versions. Committed ids and
 * writes that landed meanwhile are skipped. `exerciseId` limits it to one exercise. True when
 * something changed.
 */
export function adoptJournal(
  sessionId: string,
  entries: readonly JournalEntry[],
  committed: Committed,
  deps: Deps = {},
  exerciseId?: string,
): boolean {
  const all = sessionDrafts(sessionId, ...storageArg(deps));
  const byExercise = new Map<string, Array<Draft | null>>();
  const slotsFor = (ex: string) => {
    let slots = byExercise.get(ex);
    if (!slots) byExercise.set(ex, (slots = slotsOf(all, ex)));
    return slots;
  };
  const before = new Map<string, Array<Draft | null>>();
  for (const e of entries) {
    if (e.sessionId !== sessionId || (exerciseId !== undefined && e.exerciseId !== exerciseId)) continue;
    if (committed.has(e.id) || landedIds.has(`${sessionId}:${e.id}`) || !isDraft(e.draft)) continue;
    const slots = slotsFor(e.exerciseId);
    if (!before.has(e.exerciseId)) before.set(e.exerciseId, [...slots]);
    const at = slots.findIndex((d) => d?.id === e.id);
    const kept = e.draft as Draft;
    if (at >= 0) {
      const now = slots[at]!;
      if (now.submitted !== undefined) continue;
      const base = (now.rev ?? 0) >= e.rev ? now : kept;
      slots[at] = { ...base, submitted: e.rev };
      continue;
    }
    const slot = Number(e.key.slice(e.key.lastIndexOf('@') + 1));
    const where = Number.isInteger(slot) && slot >= 0 ? slot : slots.length;
    while (slots.length < where) slots.push(null);
    if (slots[where] === null || slots[where] === undefined) slots[where] = { ...kept, submitted: e.rev };
    else slots.splice(where, 0, { ...kept, submitted: e.rev });
  }
  const changes = new Map<string, Draft | null>();
  for (const [ex, was] of before) for (const [k, d] of slotChanges(ex, was, byExercise.get(ex)!)) changes.set(k, d);
  if (!changes.size) return false;
  writeDrafts(sessionId, changes, ...storageArg(deps));
  return true;
}

/** The exercise's pending row drafts by slot. */
export function rowsOf(sessionId: string, exerciseId: string, deps: Deps = {}): Array<Draft | null> {
  return slotsOf(sessionDrafts(sessionId, ...storageArg(deps)), exerciseId);
}

/** drafts.ts takes storage as its last argument; undefined means the phone's own. */
const storageArg = (deps: Deps): [] | [StorageLike | null] => (deps.storage === undefined ? [] : [deps.storage]);

/** Uses up the drafts of rows whose write committed (see the top of this file). True when something changed. */
export function reconcileExercise(sessionId: string, exerciseId: string, committed: Committed, deps: Deps = {}): boolean {
  const { makeId } = parts(deps);
  const before = rowsOf(sessionId, exerciseId, deps);
  const after = reconcileRows(before, committed, makeId);
  if (!after) return false;
  writeDrafts(sessionId, slotChanges(exerciseId, before, after), ...storageArg(deps));
  return true;
}

/** Every exercise of the workout that has row drafts. */
export function draftedExercises(sessionId: string, deps: Deps = {}): string[] {
  const out = new Set<string>();
  for (const k of sessionDrafts(sessionId, ...storageArg(deps)).keys()) {
    const at = k.lastIndexOf('@');
    if (at > 0) out.add(k.slice(0, at));
  }
  return [...out];
}

/**
 * Startup and Finish: puts failed journal entries back into the drafts, then reconciles every
 * exercise of the workout against the committed writes (receipts first, then any retry).
 */
export async function reconcileSession(sessionId: string, deps: Deps = {}): Promise<void> {
  const { db } = parts(deps);
  const { committed, journal } = await db.transaction('r', db.sets, db.submissions, db.journal, async () => ({
    committed: await committedOf(sessionId, db),
    journal: await journalOf(sessionId, db),
  }));
  adoptJournal(sessionId, journal, committed, deps);
  for (const ex of draftedExercises(sessionId, deps)) reconcileExercise(sessionId, ex, committed, deps);
}

/**
 * Drafts from before 1.7h move to their slot: a draft under the exercise id (before 1.7c) goes
 * to the first row still to do; one keyed by set number (`#i`) goes to slot i - logged. A draft of
 * a row that is logged already is dropped. Runs once per exercise view.
 */
export function migrateLegacyRows(sessionId: string, exerciseId: string, logged: ReadonlyArray<{ id: string }>, deps: Deps = {}): void {
  const all = sessionDrafts(sessionId, ...storageArg(deps));
  const slots = slotsOf(all, exerciseId);
  const changes = new Map<string, Draft | null>();
  const take = (slot: number, d: Draft) => {
    if (slot >= 0 && !slots[slot] && !logged.some((s) => s.id === d.id)) {
      while (slots.length <= slot) slots.push(null);
      slots[slot] = d;
      changes.set(rowKey(exerciseId, slot), d);
    }
  };
  for (const [k, d] of all) {
    if (k === exerciseId) {
      take(0, d);
      changes.set(k, null);
    } else if (k.startsWith(`${exerciseId}#`)) {
      const i = Number(k.slice(exerciseId.length + 1));
      if (Number.isInteger(i) && k === legacyRowKey(exerciseId, i)) take(i - logged.length, d);
      changes.set(k, null);
    }
  }
  if (changes.size) writeDrafts(sessionId, changes, ...storageArg(deps));
}

/** The set a submitted draft writes, or null when it cannot be logged (no load or no count). */
function setOf(sessionId: string, exerciseId: string, d: Draft, id: string) {
  if (!d.load) return null;
  const timed = d.load.kind === 'timed';
  const count = timed ? d.seconds : d.reps;
  if (!count) return null;
  const t = storedType(d.type ?? 'normal');
  return { id, sessionId, exerciseId, ...(timed ? { seconds: count } : { reps: count }), load: d.load, kind: t.kind, failure: t.failure, rev: d.submitted ?? d.rev ?? 0 };
}

/**
 * Writes a SUBMITTED draft (already stored with its mark) through the log queue. When it lands,
 * the exercise's drafts are reconciled with it, mounted or not. `onLanded` runs right after the
 * set committed (rest timer, what comes next). Resolves false when it failed (the mark stays).
 */
export function submitRow(sessionId: string, exerciseId: string, draft: Draft, deps: Deps & { onLanded?: () => void } = {}): Promise<boolean> {
  const { db, queue } = parts(deps);
  const set = setOf(sessionId, exerciseId, draft, draft.id);
  if (!set) return Promise.resolve(false);
  return queue.submit(
    logKey(sessionId, exerciseId),
    draft.id,
    async () => {
      // Journaled in IndexedDB before the write (PLAN 1.7i). If this fails, nothing is written and
      // the row reports the failure (its mark stays, Finish refuses), never a silent acceptance.
      const key = [...sessionDrafts(sessionId, ...storageArg(deps))].find(([, d]) => d.id === draft.id)?.[0] ?? rowKey(exerciseId, 0);
      const { submitted: _mark, ...values } = draft;
      landedIds.delete(`${sessionId}:${draft.id}`); // submitted again (after a discard): journaled again
      await db.journal.put({ id: draft.id, sessionId, exerciseId, key, rev: set.rev, draft: values as Record<string, unknown>, at: Date.now() });
      try {
        await logSet(set, db);
      } catch (err) {
        // Logged before and deleted since: committed, so the row is used up, never logged again.
        if (!(err instanceof AlreadyLoggedError)) throw err;
        landedIds.add(`${sessionId}:${draft.id}`);
        await db.journal.delete(draft.id).catch(() => undefined);
        return true;
      }
      landedIds.add(`${sessionId}:${draft.id}`);
      deps.onLanded?.();
      return true;
    },
    (id) => reconcileExercise(sessionId, exerciseId, new Map([[id, set.rev]]), deps),
  );
}

export type FailedRow = { exerciseId: string; key: string; draft: Draft };

/** Rows whose Log set write did not land and is not running (after reconciling with the database). */
export async function failedRows(sessionId: string, deps: Deps = {}): Promise<FailedRow[]> {
  const { queue } = parts(deps);
  await reconcileSession(sessionId, deps);
  const out: FailedRow[] = [];
  for (const [key, draft] of sessionDrafts(sessionId, ...storageArg(deps))) {
    const at = key.lastIndexOf('@');
    if (at <= 0 || draft.submitted === undefined) continue;
    const exerciseId = key.slice(0, at);
    if (!queue.pending(logKey(sessionId, exerciseId))) out.push({ exerciseId, key, draft });
  }
  return out;
}

/**
 * Tries every failed row again, one after another, with its current values. Rows are found by
 * their stable draft id at each step (a landed retry moves the rows below up one slot). True only
 * when no failed row is left. Never rejects.
 */
export async function retryFailed(sessionId: string, deps: Deps = {}): Promise<boolean> {
  try {
    const ids = (await failedRows(sessionId, deps)).map((f) => f.draft.id);
    for (const id of ids) {
      const found = [...sessionDrafts(sessionId, ...storageArg(deps))].find(([, d]) => d.id === id);
      if (!found) continue; // used up meanwhile
      const [key, now] = found;
      const exerciseId = key.slice(0, key.lastIndexOf('@'));
      const again: Draft = { ...now, submitted: now.rev ?? 0 };
      saveDraft(sessionId, key, again, ...storageArg(deps));
      await submitRow(sessionId, exerciseId, again, deps);
    }
    return (await failedRows(sessionId, deps)).length === 0;
  } catch {
    return false;
  }
}

/**
 * "Finish without it": the failed rows lose their mark and their journal entries (their values
 * stay until Finish clears them). The journal goes first: if that fails, nothing is discarded.
 */
export async function discardFailed(sessionId: string, deps: Deps = {}): Promise<void> {
  const { db } = parts(deps);
  const failed = await failedRows(sessionId, deps);
  if (failed.length) await db.journal.bulkDelete(failed.map((f) => f.draft.id));
  for (const f of failed) landedIds.add(`${sessionId}:${f.draft.id}`);
  const changes = new Map<string, Draft | null>();
  for (const f of failed) {
    const { submitted: _gone, ...rest } = f.draft;
    changes.set(f.key, rest);
  }
  if (changes.size) writeDrafts(sessionId, changes, ...storageArg(deps));
}

/**
 * Finish, before anything is counted: no new Log set starts from here (synchronously), every
 * running write lands, then the rows whose write failed are listed. When there are any, the queue
 * is open again and Finish must not go on (the drafts and the workout stay).
 */
export async function prepareFinish(sessionId: string, deps: Deps = {}): Promise<FailedRow[]> {
  const { queue } = parts(deps);
  queue.close(sessionId);
  try {
    await queue.settle(sessionId);
    const failed = await failedRows(sessionId, deps);
    if (failed.length) queue.reopen(sessionId);
    return failed;
  } catch (err) {
    queue.reopen(sessionId);
    throw err;
  }
}
