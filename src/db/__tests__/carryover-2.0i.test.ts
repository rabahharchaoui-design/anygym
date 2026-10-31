// PLAN 2.0i: cross tab and legacy variants of the Finish, Undo, fallback and backup findings
// (reports/codex/bughunt-1101-0403-saving, 0504-weights, 0535-tests). Each test failed on the code
// before 2.0i. Two tabs are two database objects on one IndexedDB name plus one shared storage.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnyGymDB } from '../schema';
import { makeGym } from '../gyms';
import { exportBackup, restoreMerge, restoreReplace } from '../backup';
import { UnresolvedDeletesError, UnsavedWritesError, deleteSetToken, finishWorkout, logSet, reopenWorkout, startWorkout, updateSet } from '../workouts';
import { pendingMutations, retryMutations, saveMutation } from '../mutations';
import { undoDelete } from '../tombstones';
import { rememberUndo } from '../undoIntents';
import { deletesFor, disposeDeletes, recoverSession } from '../../screens/workout/sessionRecovery';
import { parseBackup, serializeBackup, type Backup } from '../../lib/backup';
import type { Load, MutationIntent } from '../types';

const kb: Load = { kind: 'single', unit: 'lb', total: 53 };
const edit = (reps: number): MutationIntent => ({
  kind: 'edit',
  setId: 'a',
  change: { reps, load: kb },
});
const store = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    raw: m,
  };
};
const refusing = () => ({
  getItem: () => null,
  setItem: () => {
    throw new Error('quota');
  },
  removeItem: () => {
    throw new Error('quota');
  },
});

let n = 0;
let name = '';
let db: AnyGymDB;
const opened: AnyGymDB[] = [];
const tab = async (suffix = '') => {
  const d = new AnyGymDB(name + suffix);
  await d.open();
  opened.push(d);
  return d;
};
beforeEach(async () => {
  name = `anygym-2.0i-${n++}`;
  db = await tab();
});
afterEach(async () => {
  for (const d of opened.splice(0)) d.close();
  for (const s of ['', '-b']) await new AnyGymDB(name + s).delete();
});

async function oneSet() {
  if (!(await db.gyms.count()))
    await db.gyms.add({
      ...makeGym({ name: 'G', type: 'full', unit: 'lb', isActive: true }, 1),
      id: 'g',
    });
  const s = await startWorkout('g', db, 1000);
  await logSet({ id: 'a', sessionId: s.id, exerciseId: 'goblet', reps: 10, load: kb }, db);
  return s;
}
const failJournal = (d: AnyGymDB) => {
  const put = d.journal.put.bind(d.journal);
  (d.journal as unknown as { put: unknown }).put = () => Promise.reject(new Error('journal'));
  return () => void ((d.journal as unknown as { put: unknown }).put = put);
};
const parsed = (b: Backup): Backup => (parseBackup(serializeBackup(b)) as { ok: true; backup: Backup }).backup;
const repsOf = (list: { mutation?: MutationIntent }[]) => list.map((e) => (e.mutation as { change: { reps: number } }).change.reps);

describe('group 1: backup and recovery honor the deletion identity', () => {
  it('an obsolete Undo intent never marks a newer deletion as accepted in a backup', async () => {
    const s = await oneSet();
    await logSet({ id: 'b', sessionId: s.id, exerciseId: 'goblet', reps: 5, load: kb }, db);
    const d1 = (await deleteSetToken('a', db))!;
    await rememberUndo(s.id, 'a', db, null, d1.token);
    await undoDelete('a', db, d1.token);
    await updateSet('a', { reps: 17, load: kb }, db);
    const d2 = (await deleteSetToken('a', db))!;
    await rememberUndo(s.id, 'a', db, null, d1.token); // the obsolete intent is back (cleanup failed)
    const backup = parsed(await exportBackup(db, 1));
    expect(backup.tables.tombstones.map((t) => [t.token, !!t.undo])).toEqual([[d2.token, false]]);
    const other = await tab('-b');
    await restoreReplace(backup, other, store());
    await finishWorkout(s.id, other, 5000);
    expect((await other.sets.toArray()).map((x) => x.id)).toEqual(['b']);
  });

  it('a tokenless (legacy) intent never authorizes a tokenized deletion: backup, recovery and Finish', async () => {
    const s = await oneSet();
    await logSet({ id: 'b', sessionId: s.id, exerciseId: 'goblet', reps: 5, load: kb }, db);
    await deleteSetToken('a', db);
    await rememberUndo(s.id, 'a', db, null); // from an older app version, no token
    const backup = parsed(await exportBackup(db, 1));
    expect(backup.tables.tombstones.map((t) => !!t.undo)).toEqual([false]);
    disposeDeletes(s.id);
    await recoverSession(s.id, db);
    expect(await db.sets.get('a')).toBeUndefined();
    expect((await db.tombstones.get('a'))?.undo).toBeFalsy();
    await finishWorkout(s.id, db, 5000);
    expect(await db.sets.get('a')).toBeUndefined();
    disposeDeletes(s.id);
  });

  it.each(['replace', 'merge'] as const)('a restored correction is durable in IndexedDB (%s): localStorage refusing, fresh runtime after', async (how) => {
    {
      const src = store();
      const s = await oneSet();
      const fix = failJournal(db);
      await expect(saveMutation(s.id, 'goblet', edit(19), db, 2000, src)).rejects.toThrow('journal');
      fix();
      const backup = parsed(await exportBackup(db, 5, src));
      expect(backup.pendingChanges).toHaveLength(1);
      const dest = await tab('-b');
      await dest.sessions.clear();
      await dest.sets.clear();
      await dest.kv.clear();
      await (how === 'replace' ? restoreReplace : restoreMerge)(backup, dest, refusing());
      // A restart: a new database object (empty memory) and a localStorage that holds nothing.
      const fresh = await tab('-b');
      expect(repsOf(await pendingMutations(s.id, fresh, store()))).toEqual([19]);
      expect(await retryMutations(s.id, fresh, store())).toBe(true);
      expect((await fresh.sets.get('a'))!.reps).toBe(19);
      // saved: not offered again, on yet another restart
      const again = await tab('-b');
      expect(await pendingMutations(s.id, again, store())).toEqual([]);
    }
  });
});

describe('group 2: Finish never discards what it cannot see', () => {
  it('an unknown tokenless tombstone blocks Finish, also when it is the last set', async () => {
    const s = await oneSet();
    const t = (await deleteSetToken('a', db))!;
    await db.tombstones.put({
      id: 'a',
      sessionId: s.id,
      set: t.set,
      expiresAt: 1,
    }); // legacy: no token
    await expect(finishWorkout(s.id, db, 5000, undefined, new Map())).rejects.toBeInstanceOf(UnresolvedDeletesError);
    expect(await db.tombstones.get('a')).toBeDefined();
    expect((await db.sessions.get(s.id))?.endedAt).toBeUndefined();
  });

  it("another tab's failed correction held in the shared fallback refuses Finish and stays retryable", async () => {
    const s = await oneSet();
    const ls = store();
    const tabB = await tab('');
    const fix = failJournal(tabB);
    await expect(saveMutation(s.id, 'goblet', edit(19), tabB, 2000, ls)).rejects.toThrow('journal');
    fix();
    // tab A's own check ran before; its memory knows nothing of B's change
    await expect(finishWorkout(s.id, db, 5000, undefined, undefined, ls)).rejects.toBeInstanceOf(UnsavedWritesError);
    expect((await db.sessions.get(s.id))?.endedAt).toBeUndefined();
    expect(await retryMutations(s.id, db, ls)).toBe(true);
    expect((await db.sets.get('a'))!.reps).toBe(19);
    expect((await finishWorkout(s.id, db, 6000, undefined, undefined, ls)).saved).toBe(true);
  });

  it('Finish then Undo does not bring back a correction a later save superseded', async () => {
    const s = await oneSet();
    const ls = store();
    const fix = failJournal(db);
    await expect(saveMutation(s.id, 'goblet', edit(17), db, 2000, ls)).rejects.toThrow('journal');
    fix();
    const stuck = {
      ...ls,
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {
        throw new Error('quota');
      },
    };
    await saveMutation(s.id, 'goblet', edit(19), db, 3000, stuck); // lands; the held 17 cannot be removed
    expect((await finishWorkout(s.id, db, 4000, undefined, undefined, ls)).saved).toBe(true);
    expect(await reopenWorkout(s.id, undefined, db)).toBe(true);
    expect(await pendingMutations(s.id, db, ls)).toEqual([]);
    expect(await retryMutations(s.id, db, ls)).toBe(true);
    expect((await db.sets.get('a'))!.reps).toBe(19);
  });

  it('equal timestamps in two tabs: the later failed correction is not hidden by the earlier save', async () => {
    const s = await oneSet();
    const ls = store();
    const tabB = await tab('');
    await saveMutation(s.id, 'goblet', edit(17), db, 2000, ls);
    const fix = failJournal(tabB);
    await expect(saveMutation(s.id, 'goblet', edit(19), tabB, 2000, ls)).rejects.toThrow('journal');
    fix();
    expect(repsOf(await pendingMutations(s.id, db, ls))).toEqual([19]);
    expect(await retryMutations(s.id, db, ls)).toBe(true);
    expect((await db.sets.get('a'))!.reps).toBe(19);
  });
});

describe("group 4: a stale Delete never makes an Undo for another tab's deletion", () => {
  it("Delete from a stale editor finds nothing, offers no Undo, and leaves the other tab's tombstone alone", async () => {
    const s = await oneSet();
    const set = (await db.sets.get('a'))!;
    const m = deletesFor(s.id, db);
    const theirs = (await deleteSetToken('a', db))!; // another tab deleted it first
    await m.remove(set);
    expect(m.canUndo('a')).toBe(false);
    expect(await m.undo('a')).toBeUndefined();
    const t = await db.tombstones.get('a');
    expect(t?.token).toBe(theirs.token);
    expect(t?.undo).toBeFalsy();
    expect(await db.sets.get('a')).toBeUndefined();
    disposeDeletes(s.id);
  });
});
