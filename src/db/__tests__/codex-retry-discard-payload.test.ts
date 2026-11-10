import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnyGymDB } from '../schema';
import { pendingMutations, retryMutations, saveMutation } from '../mutations';
import { finishWorkout, logSet, setsOf, startWorkout, UnsavedWritesError } from '../workouts';
import { singleLoad } from '../../lib/load';
import { writeDrafts, type Draft } from '../../lib/drafts';
import { createLogQueue } from '../../lib/logQueue';
import { discardFailed, failedRows, shownRows, type Deps } from '../../screens/workout/rowLog';

let db: AnyGymDB;
let seq = 0;
beforeEach(async () => { db = new AnyGymDB(`codex-retry-discard-payload-${seq++}`); await db.open(); });
afterEach(async () => { await db.delete(); });
async function reopen() {
  const name = db.name;
  db.close();
  db = new AnyGymDB(name);
  await db.open();
}

// SPEC 0/2/13, completed PLAN 2.0j/2.0k/3.2c. These fail at different
// boundaries from a failed set write: Retry registration and stale discard.
describe('recovery preserves the exact lifting payload', () => {
  // CODEX FOUND BUG: Failed Retry deletes the last durable correction when replacement journaling and fallback persistence both fail.
  it('a Retry whose journal and fallback both fail retains the previous durable correction across restart', async () => {
    const s = await startWorkout('g', db, 1000);
    const original = await logSet({ id: 'a', sessionId: s.id, exerciseId: 'curl', reps: 10, load: singleLoad(53, 'lb') }, db);
    const mutation = { kind: 'edit' as const, setId: original.id, change: { reps: 19, load: singleLoad(73, 'lb') } };
    const failJournal = () => { throw new Error('synthetic journal unavailable'); };
    db.journal.hook('creating', failJournal);
    try {
      await expect(saveMutation(s.id, 'curl', mutation, db, 2000, null)).rejects.toThrow('synthetic journal unavailable');
    } finally { db.journal.hook('creating').unsubscribe(failJournal); }
    await reopen(); // Only IndexedDB can supply this correction; no localStorage or old memory.
    expect((await pendingMutations(s.id, db, null)).map((j) => j.mutation)).toEqual([mutation]);
    const failFallback = () => { throw new Error('synthetic fallback unavailable'); };
    db.journal.hook('creating', failJournal);
    db.kv.hook('creating', failFallback);
    try { expect(await retryMutations(s.id, db, null)).toBe(false); }
    finally {
      db.journal.hook('creating').unsubscribe(failJournal);
      db.kv.hook('creating').unsubscribe(failFallback);
    }
    await reopen();
    expect(await setsOf(s.id, db)).toEqual([original]);
    expect((await pendingMutations(s.id, db, null)).map((j) => j.mutation)).toContainEqual(mutation);
    await expect(finishWorkout(s.id, db, 3000, undefined, undefined, null)).rejects.toBeInstanceOf(UnsavedWritesError);
    expect(await retryMutations(s.id, db, null)).toBe(true);
    expect(await retryMutations(s.id, db, null)).toBe(true);
    await finishWorkout(s.id, db, 4000, undefined, undefined, null);
    await reopen();
    expect(await setsOf(s.id, db)).toEqual([{ ...original, ...mutation.change }]);
  });

  // CODEX FOUND BUG: Finish without it deletes an unseen weight and reps when the journal shares the shown id, revision and operation.
  it('Finish without it cannot discard a different weight and reps sharing the shown identity, revision and operation', async () => {
    const s = await startWorkout('g', db, 1000);
    const disk = new Map<string, string>();
    const storage = { getItem: (k: string) => disk.get(k) ?? null,
      setItem: (k: string, v: string) => void disk.set(k, v), removeItem: (k: string) => void disk.delete(k) };
    const deps: Deps = { db, storage, queue: createLogQueue(), makeId: () => 'new-row' };
    const shownDraft: Draft = { id: 'pending', rev: 1, submitted: 1, op: 'retry-op', load: singleLoad(53, 'lb'), reps: 17 };
    writeDrafts(s.id, new Map([['curl@0', shownDraft]]), storage);
    const entry = { id: 'pending', sessionId: s.id, exerciseId: 'curl', key: 'curl@0', rev: 1, draft: { ...shownDraft }, at: 2000 };
    await db.journal.put(entry);
    const shown = shownRows(await failedRows(s.id, deps));
    expect(shown).toHaveLength(1);
    // Retry can reuse its operation id. The sheet still represents 53 x 17.
    const later = { ...entry, draft: { ...shownDraft, load: singleLoad(73, 'lb'), reps: 19 }, at: 2100 };
    await db.journal.put(later);
    await discardFailed(s.id, deps, shown);
    await reopen();
    expect(await db.journal.get('pending')).toEqual(later);
    expect(await db.kv.where('key').startsWith('anygym-logcancel:').count()).toBe(0);
    await expect(finishWorkout(s.id, db, 3000, undefined, undefined, null)).rejects.toBeInstanceOf(UnsavedWritesError);
    expect(await setsOf(s.id, db)).toEqual([]);
  });
});
