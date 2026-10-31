// PLAN 2.0e: the edit journal and the editors (Codex bughunt 1030 1756, 1827, 1858 and 1031 1610).
// Reproductions with fake-indexeddb; a cross-tab race uses two connections to the same database.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnyGymDB } from '../schema';
import type { Load, MutationIntent } from '../types';
import { UnsavedWritesError, WorkoutFinishedError, addExercise, deleteSet, finishWorkout, logSet, restoreSet, setsOf, startWorkout, updateSet, updateSetType } from '../workouts';
import { MUTATION_FALLBACK_KEY, changeCount, dropMutations, pendingMutations, retryMutations, saveMutation } from '../mutations';
import { acceptUndo, recoverDeletes, undoDelete } from '../tombstones';
import { RECORD_CHECKS } from '../../lib/backup';
import { deletesFor, disposeDeletes, isLeftOver, recoverSession } from '../../screens/workout/sessionRecovery';
import { UndoUnresolvedError } from '../../lib/deleteUndo';

const kb: Load = { kind: 'single', unit: 'lb', total: 53 };
const kb70: Load = { kind: 'single', unit: 'lb', total: 70 };
const edit = (reps: number, load: Load = kb): MutationIntent => ({ kind: 'edit', setId: 'a', change: { reps, load } });

let n = 0;
let name = '';
let db: AnyGymDB;
const open = async () => {
  const d = new AnyGymDB(name);
  await d.open();
  return d;
};
beforeEach(async () => {
  name = `anygym-2.0e-${n++}`;
  db = await open();
});
afterEach(async () => {
  db.close();
  await new AnyGymDB(name).delete();
});

/** A workout with one logged 10 rep set 'a'. */
async function oneSet(d = db) {
  const s = await startWorkout('g', d, 1000);
  await logSet({ id: 'a', sessionId: s.id, exerciseId: 'goblet', reps: 10, load: kb }, d);
  return s;
}

/** Every set write on this connection fails (synthetic) until the returned function puts it back. */
function breakSets(d: AnyGymDB) {
  const put = d.sets.put.bind(d.sets);
  (d.sets as unknown as { put: unknown }).put = () => Promise.reject(new Error('synthetic set write failure'));
  return () => void ((d.sets as unknown as { put: unknown }).put = put);
}

/** Counts set writes on this connection. */
function countPuts(d: AnyGymDB) {
  const put = d.sets.put.bind(d.sets);
  const seen = { n: 0 };
  (d.sets as unknown as { put: unknown }).put = (...a: Parameters<typeof put>) => {
    seen.n++;
    return put(...a);
  };
  return seen;
}

/**
 * Holds this connection's next change write (the transaction over sessions, sets and journal that
 * applies a journaled change) until released: the change is journaled, its write has not started.
 */
function gateApply(d: AnyGymDB) {
  const real = d.transaction.bind(d) as (...a: unknown[]) => Promise<unknown>;
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  let reached!: () => void;
  const atGate = new Promise<void>((r) => (reached = r));
  let armed = true;
  (d as unknown as { transaction: unknown }).transaction = (...a: unknown[]) => {
    const tables = a.slice(1, -1).flat() as Array<{ name: string }>;
    const names = tables.map((t) => t?.name);
    if (armed && a[0] === 'rw' && names.includes('sets') && names.includes('journal') && !names.includes('kv')) {
      armed = false;
      reached();
      return gate.then(() => real(...a));
    }
    return real(...a);
  };
  return { release, atGate };
}

describe('(1) overlapping edits of one set: an older completion never erases a newer failed edit', () => {
  it('reproduction (two tabs): journal 17, journal 19, 17 completes, 19 fails → 19 stays pending after a restart and Try again saves it once', async () => {
    const s = await oneSet();
    const tab2 = await open();
    const gate = gateApply(db);
    const older = saveMutation(s.id, 'goblet', edit(17), db, 2000);
    await gate.atGate;
    const fix = breakSets(tab2);
    await expect(saveMutation(s.id, 'goblet', edit(19), tab2, 3000)).rejects.toThrow('synthetic');
    fix();
    gate.release();
    await older; // superseded: resolves, writes nothing
    expect((await setsOf(s.id, db))[0]!.reps).toBe(10);
    // Restart: new connections, nothing in memory.
    db.close();
    tab2.close();
    db = await open();
    const pending = await pendingMutations(s.id, db);
    expect(pending.map((j) => j.mutation)).toEqual([edit(19)]);
    expect(changeCount(pending)).toBe(1);
    const writes = countPuts(db);
    expect(await retryMutations(s.id, db)).toBe(true);
    expect(writes.n).toBe(1);
    expect((await setsOf(s.id, db))[0]!.reps).toBe(19);
    expect(await pendingMutations(s.id, db)).toEqual([]);
  });

  it('reverse completion: the newer save lands first, the delayed older one changes nothing and leaves nothing', async () => {
    const s = await oneSet();
    const tab2 = await open();
    const gate = gateApply(db);
    const older = saveMutation(s.id, 'goblet', edit(17), db, 2000);
    await gate.atGate;
    await saveMutation(s.id, 'goblet', edit(19), tab2, 3000);
    gate.release();
    await older;
    expect((await setsOf(s.id, db))[0]!.reps).toBe(19);
    expect(await pendingMutations(s.id, db)).toEqual([]);
    tab2.close();
  });

  it('one entry per operation with a revision; a newer failed one survives the older one landing in the same tab', async () => {
    const s = await oneSet();
    const fix = breakSets(db);
    await expect(saveMutation(s.id, 'goblet', edit(17), db, 2000)).rejects.toThrow('synthetic');
    await expect(saveMutation(s.id, 'goblet', edit(19), db, 3000)).rejects.toThrow('synthetic');
    fix();
    const ids = (await db.journal.toArray()).map((j) => [j.id, j.rev]);
    expect(ids).toEqual([
      ['mut:edit:a:1', 1],
      ['mut:edit:a:2', 2],
    ]);
    // Both are shown (an explicit discard covers exactly them), as one change.
    expect(changeCount(await pendingMutations(s.id, db))).toBe(1);
    const writes = countPuts(db);
    expect(await retryMutations(s.id, db)).toBe(true);
    expect(writes.n).toBe(1);
    expect((await setsOf(s.id, db))[0]!.reps).toBe(19);
  });

  it('an edit and a set type change of one set are separate: both land', async () => {
    const s = await oneSet();
    const tab2 = await open();
    const gate = gateApply(db);
    const a = saveMutation(s.id, 'goblet', edit(12), db, 2000);
    await gate.atGate;
    await saveMutation(s.id, 'goblet', { kind: 'type', setId: 'a', setKind: 'warmup', failure: false }, tab2, 3000);
    gate.release();
    await a;
    const [set] = await setsOf(s.id, db);
    expect([set!.reps, set!.kind]).toEqual([12, 'warmup']);
    expect(await db.journal.count()).toBe(0);
    tab2.close();
  });

  it('a legacy entry (mut:edit:a, before 2.0e) reads as revision 0 and retries; a newer change supersedes it', async () => {
    const s = await oneSet();
    await db.journal.put({ id: 'mut:edit:a', sessionId: s.id, exerciseId: 'goblet', key: 'edit:a', rev: 0, draft: { id: 'mut:edit:a', load: null }, at: 1, mutation: edit(15) });
    expect(changeCount(await pendingMutations(s.id, db))).toBe(1);
    await saveMutation(s.id, 'goblet', edit(16), db, 2000);
    expect(await db.journal.count()).toBe(0);
    expect((await setsOf(s.id, db))[0]!.reps).toBe(16);
    await db.journal.put({ id: 'mut:edit:a', sessionId: s.id, exerciseId: 'goblet', key: 'edit:a', rev: 0, draft: { id: 'mut:edit:a', load: null }, at: 1, mutation: edit(15) });
    expect(await retryMutations(s.id, db)).toBe(true);
    expect((await setsOf(s.id, db))[0]!.reps).toBe(15);
  });

  it('Finish without it drops only the changes it was shown, never one made after', async () => {
    const s = await oneSet();
    const fix = breakSets(db);
    await saveMutation(s.id, 'goblet', edit(17), db, 2000).catch(() => undefined);
    const shown = (await pendingMutations(s.id, db)).map((j) => j.id);
    await saveMutation(s.id, 'goblet', { kind: 'type', setId: 'a', setKind: 'drop', failure: false }, db, 3000).catch(() => undefined);
    fix();
    await dropMutations(s.id, db, shown);
    expect((await pendingMutations(s.id, db)).map((j) => j.mutation!.kind)).toEqual(['type']);
  });

  it('backup: revision ids validate, mismatched ones do not; tombstone tokens validate', () => {
    const j = { id: 'mut:edit:a:3', sessionId: 's', exerciseId: 'goblet', key: 'edit:a', rev: 3, draft: { id: 'mut:edit:a:3', load: null }, at: 1, mutation: edit(17) };
    expect(RECORD_CHECKS.journal(j)).toBe(true);
    expect(RECORD_CHECKS.journal({ ...j, rev: 2 })).toBe(false);
    expect(RECORD_CHECKS.journal({ ...j, id: 'mut:edit:a:0', rev: 0, draft: { id: 'mut:edit:a:0', load: null } })).toBe(false);
    expect(RECORD_CHECKS.journal({ ...j, id: 'mut:edit:b:3', draft: { id: 'mut:edit:b:3', load: null } })).toBe(false);
    expect(RECORD_CHECKS.journal({ ...j, id: 'mut:type:a:3', draft: { id: 'mut:type:a:3', load: null } })).toBe(false);
    // Before 2.0e: no revision in the id, revision 0.
    expect(RECORD_CHECKS.journal({ ...j, id: 'mut:edit:a', rev: 0, draft: { id: 'mut:edit:a', load: null } })).toBe(true);
    expect(RECORD_CHECKS.journal({ ...j, id: 'mut:edit:a', rev: 1, draft: { id: 'mut:edit:a', load: null } })).toBe(false);
    const set = { id: 'a', sessionId: 's', exerciseId: 'goblet', order: 0, kind: 'work', reps: 10, load: kb, uncertain: false };
    expect(RECORD_CHECKS.tombstones({ id: 'a', sessionId: 's', set, expiresAt: 1, token: 't1' })).toBe(true);
    expect(RECORD_CHECKS.tombstones({ id: 'a', sessionId: 's', set, expiresAt: 1, token: 5 })).toBe(false);
  });
});

describe('(2) a stale editor open before Finish never changes the finished workout', () => {
  it('reproduction: Delete, Save, type change and Add exercise after Finish are refused; sets, counters, tombstones, journal and plan state unchanged', async () => {
    const s = await oneSet();
    const tabB = await open();
    await finishWorkout(s.id, tabB, 5000);
    const snapshot = async () => ({
      sets: await db.sets.toArray(),
      counters: await db.orderCounters.toArray(),
      tombstones: await db.tombstones.toArray(),
      journal: await db.journal.toArray(),
      session: await db.sessions.get(s.id),
      plan: await db.planState.toArray(),
    });
    const before = await snapshot();
    await expect(deleteSet('a', db)).rejects.toBeInstanceOf(WorkoutFinishedError);
    await expect(updateSet('a', { reps: 17, load: kb }, db)).rejects.toBeInstanceOf(WorkoutFinishedError);
    await expect(updateSetType('a', 'drop', false, db)).rejects.toBeInstanceOf(WorkoutFinishedError);
    await expect(saveMutation(s.id, 'goblet', edit(17), db)).rejects.toBeInstanceOf(WorkoutFinishedError);
    await expect(addExercise(s.id, 'squat', db)).rejects.toBeInstanceOf(WorkoutFinishedError);
    expect(await snapshot()).toEqual(before);
    // Nothing held for Finish to ask about: the workout is over.
    expect(await pendingMutations(s.id, db)).toEqual([]);
    // A set that is gone is still fine to delete again (nothing to do).
    expect(await deleteSet('gone', db)).toBeUndefined();
    tabB.close();
  });
});

describe('(6) Finish never erases a change journaled after its checks', () => {
  it('reproduction (two tabs): the checks pass, another tab journals a failed edit, Finish refuses in its transaction and keeps it', async () => {
    const s = await oneSet();
    const tabB = await open();
    // Tab A's preliminary checks: nothing pending.
    expect(await pendingMutations(s.id, db)).toEqual([]);
    const fix = breakSets(tabB);
    await expect(saveMutation(s.id, 'goblet', edit(19), tabB, 3000)).rejects.toThrow('synthetic');
    fix();
    await expect(finishWorkout(s.id, db, 4000)).rejects.toBeInstanceOf(UnsavedWritesError);
    expect((await db.sessions.get(s.id))!.endedAt).toBeUndefined();
    expect((await pendingMutations(s.id, db)).map((j) => j.mutation)).toEqual([edit(19)]);
    expect(await retryMutations(s.id, db)).toBe(true);
    expect(await finishWorkout(s.id, db, 5000)).toMatchObject({ saved: true, sets: 1 });
    expect((await setsOf(s.id, db))[0]!.reps).toBe(19);
    tabB.close();
  });

  it('reverse order: Finish commits first, then the other tab cannot journal a change any more', async () => {
    const s = await oneSet();
    const tabB = await open();
    await finishWorkout(s.id, db, 4000);
    await expect(saveMutation(s.id, 'goblet', edit(19), tabB, 5000)).rejects.toBeInstanceOf(WorkoutFinishedError);
    expect(await db.journal.count()).toBe(0);
    expect((await setsOf(s.id, db))[0]!.reps).toBe(10);
    tabB.close();
  });

  it('a Log set journal entry that never committed refuses Finish too; one whose set committed does not', async () => {
    const s = await oneSet();
    await db.journal.put({ id: 'a', sessionId: s.id, exerciseId: 'goblet', key: 'goblet@0', rev: 0, draft: { id: 'a', load: kb, reps: 10 }, at: 1 });
    await db.journal.put({ id: 'x', sessionId: s.id, exerciseId: 'goblet', key: 'goblet@1', rev: 0, draft: { id: 'x', load: kb, reps: 8 }, at: 1 });
    await expect(finishWorkout(s.id, db, 4000)).rejects.toBeInstanceOf(UnsavedWritesError);
    await db.journal.delete('x');
    expect(await finishWorkout(s.id, db, 4000)).toMatchObject({ saved: true });
  });
});

describe('(6) a delayed Undo recovery never restores an obsolete value over a newer deletion', () => {
  it('reproduction: recovery read the old tombstone; the set is put back, edited to 70 × 17 and deleted again; the delayed recovery changes nothing', async () => {
    const s = await oneSet();
    await deleteSet('a', db, 10_000);
    await acceptUndo('a', db);
    // Recovery pauses right after reading the tombstones.
    const realGet = db.sessions.get.bind(db.sessions);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let paused!: () => void;
    const atGate = new Promise<void>((r) => (paused = r));
    let once = true;
    (db.sessions as unknown as { get: unknown }).get = (...a: Parameters<typeof realGet>) => {
      if (!once) return realGet(...a);
      once = false;
      paused();
      return gate.then(() => realGet(...a));
    };
    const recovery = recoverDeletes(s.id, db, 99_999);
    await atGate;
    const tabB = await open();
    expect(await undoDelete('a', tabB)).toMatchObject({ reps: 10 });
    await updateSet('a', { reps: 17, load: kb70 }, tabB);
    await deleteSet('a', tabB, 20_000);
    release();
    expect(await recovery).toEqual({ restored: [], expired: [], failed: [] });
    expect(await db.sets.get('a')).toBeUndefined();
    const t = (await db.tombstones.get('a'))!;
    expect([t.set.reps, t.set.load!.total, t.undo]).toEqual([17, 70, undefined]);
    // A stale restore of the old record is refused by token too.
    expect(await restoreSet({ ...t.set, reps: 10, load: kb }, db, { ifTombstone: true, token: 'old' })).toBe(false);
    expect(await db.tombstones.get('a')).toEqual(t);
    tabB.close();
  });
});

describe('(10) a failed Undo whose every store failed is never lost to the 5 s expiry after a restart', () => {
  it('reproduction: acceptance, intent store and fallback fail; restart after the window; the record stays, Finish refuses, Restore brings back exactly it', async () => {
    const s = await oneSet();
    const m = deletesFor(s.id, db);
    const [set] = await setsOf(s.id, db);
    await m.remove(set!);
    // Every store of the Undo fails: the tombstone's acceptance and the kv intent (no localStorage here).
    const tPut = db.tombstones.put.bind(db.tombstones);
    const kPut = db.kv.put.bind(db.kv);
    (db.tombstones as unknown as { put: unknown }).put = () => Promise.reject(new Error('synthetic'));
    (db.kv as unknown as { put: unknown }).put = () => Promise.reject(new Error('synthetic'));
    await expect(m.undo('a')).rejects.toThrow();
    (db.tombstones as unknown as { put: unknown }).put = tPut;
    (db.kv as unknown as { put: unknown }).put = kPut;
    // Restart: the runtime is gone, a new connection, well after the window.
    disposeDeletes(s.id);
    db.close();
    db = await open();
    await recoverSession(s.id, db, Date.now() + 10 * 60_000);
    expect(await db.tombstones.get('a')).toMatchObject({ set: { id: 'a', reps: 10 } });
    const again = deletesFor(s.id, db);
    expect(again.unresolved()).toEqual(['a']);
    expect(isLeftOver(s.id, 'a')).toBe(true);
    await expect(again.close()).rejects.toBeInstanceOf(UndoUnresolvedError);
    again.reopen();
    expect(await again.undo('a')).toMatchObject({ id: 'a', reps: 10 });
    expect(await setsOf(s.id, db)).toEqual([set]);
    await expect(again.close()).resolves.toBeUndefined();
    disposeDeletes(s.id);
  });

  it('Keep it deleted ends it; a delete still in its window in this app run is left to its timer', async () => {
    const s = await oneSet();
    await logSet({ id: 'b', sessionId: s.id, exerciseId: 'goblet', reps: 8, load: kb }, db);
    await deleteSet('a', db, 1000);
    disposeDeletes(s.id);
    const m = deletesFor(s.id, db);
    const b = (await db.sets.get('b'))!;
    await m.remove(b);
    await recoverSession(s.id, db, Date.now() + 60_000);
    expect(m.unresolved()).toEqual(['a']);
    await m.cancel('a');
    expect(await db.tombstones.get('a')).toBeUndefined();
    expect(await db.sets.get('a')).toBeUndefined();
    // 'b' is in this run's own window: not asked about, Finish goes on.
    await expect(m.close()).resolves.toBeUndefined();
    disposeDeletes(s.id);
  });
});

describe('(11) a change whose journal write fails is kept, and Finish still offers Try again or Finish without it', () => {
  const failJournal = (d: AnyGymDB) => {
    const put = d.journal.put.bind(d.journal);
    (d.journal as unknown as { put: unknown }).put = () => Promise.reject(new Error('synthetic journal failure'));
    return () => void ((d.journal as unknown as { put: unknown }).put = put);
  };
  /** A localStorage stand in. */
  const memoryStorage = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
  };

  it('reproduction: journal write fails → pending in memory → Try again saves exactly 17 once', async () => {
    const s = await oneSet();
    const fix = failJournal(db);
    await expect(saveMutation(s.id, 'goblet', edit(17), db, 2000, null)).rejects.toThrow('journal');
    fix();
    expect((await setsOf(s.id, db))[0]!.reps).toBe(10);
    const pending = await pendingMutations(s.id, db, null);
    expect(pending.map((j) => j.mutation)).toEqual([edit(17)]);
    expect(changeCount(pending)).toBe(1);
    const writes = countPuts(db);
    expect(await retryMutations(s.id, db, null)).toBe(true);
    expect(writes.n).toBe(1);
    expect((await setsOf(s.id, db))[0]!.reps).toBe(17);
    expect(await pendingMutations(s.id, db, null)).toEqual([]);
    expect(await retryMutations(s.id, db, null)).toBe(true);
    expect(writes.n).toBe(1);
  });

  it('the durable fallback survives a restart; a failing retry keeps one copy; Finish without it drops it', async () => {
    const s = await oneSet();
    const ls = memoryStorage();
    const fix = failJournal(db);
    await saveMutation(s.id, 'goblet', edit(17), db, 2000, ls).catch(() => undefined);
    expect(await retryMutations(s.id, db, ls)).toBe(false);
    fix();
    expect(JSON.parse(ls.m.get(MUTATION_FALLBACK_KEY)!)).toHaveLength(1);
    // Restart: a new connection (nothing in memory), the fallback still there.
    db.close();
    db = await open();
    const pending = await pendingMutations(s.id, db, ls);
    expect(pending.map((j) => j.mutation)).toEqual([edit(17)]);
    await dropMutations(s.id, db, pending.map((j) => j.id), ls);
    expect(await pendingMutations(s.id, db, ls)).toEqual([]);
    expect(ls.m.has(MUTATION_FALLBACK_KEY)).toBe(false);
    expect((await setsOf(s.id, db))[0]!.reps).toBe(10);
  });

  it('a newer change of the same set that journals replaces the held copy', async () => {
    const s = await oneSet();
    const fix = failJournal(db);
    await saveMutation(s.id, 'goblet', edit(17), db, 2000, null).catch(() => undefined);
    fix();
    await saveMutation(s.id, 'goblet', edit(18), db, 3000, null);
    expect(await pendingMutations(s.id, db, null)).toEqual([]);
    expect((await setsOf(s.id, db))[0]!.reps).toBe(18);
  });

  it('a type change whose journal write fails is kept the same way', async () => {
    const s = await oneSet();
    const fix = failJournal(db);
    await saveMutation(s.id, 'goblet', { kind: 'type', setId: 'a', setKind: 'drop', failure: false }, db, 2000, null).catch(() => undefined);
    fix();
    expect(changeCount(await pendingMutations(s.id, db, null))).toBe(1);
    expect(await retryMutations(s.id, db, null)).toBe(true);
    expect((await setsOf(s.id, db))[0]!.kind).toBe('drop');
  });
});
