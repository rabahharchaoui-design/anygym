// PLAN 2.0f: Codex bughunt fixes (1031 1657 and 1031 1727). Reproductions with fake-indexeddb.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnyGymDB } from '../schema';
import { makeGym } from '../gyms';
import type { Load } from '../types';
import { UnresolvedDeletesError, deleteSetToken, finishWorkout, logSet, restoreSet, startWorkout, updateSet } from '../workouts';
import { cancelUndo, undoDelete } from '../tombstones';
import { hasUndoIntent, rememberUndo } from '../undoIntents';
import { deletesFor, disposeDeletes, ownedDeletes, recoverSession } from '../../screens/workout/sessionRecovery';

const kb: Load = { kind: 'single', unit: 'lb', total: 53 };
let n = 0;
let name = '';
let db: AnyGymDB;
beforeEach(async () => {
  name = `anygym-2.0f-${n++}`;
  db = new AnyGymDB(name);
  await db.open();
});
afterEach(async () => {
  db.close();
  await new AnyGymDB(name).delete();
});

async function oneSet() {
  const s = await startWorkout('g', db, 1000);
  await logSet({ id: 'a', sessionId: s.id, exerciseId: 'goblet', reps: 10, load: kb }, db);
  return s;
}

describe('group 1: deletion tokens everywhere', () => {
  it('a stale Keep deleted never removes a newer tombstone', async () => {
    const s = await oneSet();
    const d1 = (await deleteSetToken('a', db))!;
    await undoDelete('a', db, d1.token);
    await updateSet('a', { reps: 17, load: kb }, db);
    const d2 = (await deleteSetToken('a', db))!;
    await cancelUndo('a', db, s.id, d1.token);
    expect((await db.tombstones.get('a'))?.token).toBe(d2.token);
    expect(await db.sets.get('a')).toBeUndefined();
  });

  it('a stale Keep deleted removes only a copy restored from its own deletion', async () => {
    const s = await oneSet();
    const d1 = (await deleteSetToken('a', db))!;
    await undoDelete('a', db, d1.token);
    const d2 = (await deleteSetToken('a', db))!;
    await undoDelete('a', db, d2.token);
    await cancelUndo('a', db, s.id, d1.token);
    expect((await db.sets.get('a'))?.reps).toBe(10);
    await cancelUndo('a', db, s.id, d2.token);
    expect(await db.sets.get('a')).toBeUndefined();
  });

  it('Keep deleted of the matching deletion still works', async () => {
    const s = await oneSet();
    const d1 = (await deleteSetToken('a', db))!;
    await cancelUndo('a', db, s.id, d1.token);
    expect(await db.tombstones.get('a')).toBeUndefined();
    expect(await db.sets.get('a')).toBeUndefined();
  });

  it('Finish rejects an unknown unfinalized tombstone and keeps it', async () => {
    const s = await oneSet();
    await logSet({ id: 'b', sessionId: s.id, exerciseId: 'goblet', reps: 5, load: kb }, db);
    const mine = (await deleteSetToken('b', db))!;
    const theirs = (await deleteSetToken('a', db))!;
    const owned = new Map([['b', mine.token]]);
    await expect(finishWorkout(s.id, db, 5000, undefined, owned)).rejects.toBeInstanceOf(UnresolvedDeletesError);
    expect((await db.tombstones.get('a'))?.token).toBe(theirs.token);
    expect((await db.sessions.get(s.id))?.endedAt).toBeUndefined();
    owned.set('a', theirs.token);
    expect((await finishWorkout(s.id, db, 5000, undefined, owned)).saved).toBe(false);
  });

  it('an old Undo intent does not resurrect a later deletion at Finish', async () => {
    const s = await oneSet();
    await logSet({ id: 'b', sessionId: s.id, exerciseId: 'goblet', reps: 5, load: kb }, db);
    const d1 = (await deleteSetToken('a', db))!;
    await rememberUndo(s.id, 'a', db, null, d1.token);
    await undoDelete('a', db, d1.token);
    // the old intent is back (cleanup failed), then the set is edited and deleted again
    await rememberUndo(s.id, 'a', db, null, d1.token);
    await updateSet('a', { reps: 17, load: kb }, db);
    const d2 = (await deleteSetToken('a', db))!;
    expect(await hasUndoIntent(s.id, 'a', db, null, d2.token)).toBe(false);
    await finishWorkout(s.id, db, 5000);
    expect(await db.sets.get('a')).toBeUndefined();
  });

  it('a recovered Undo carries its deletion token: it cannot reverse a newer deletion', async () => {
    const s = await oneSet();
    const d1 = (await deleteSetToken('a', db))!;
    disposeDeletes(s.id);
    await recoverSession(s.id, db);
    expect(ownedDeletes(s.id).get('a')).toBe(d1.token);
    const m = deletesFor(s.id, db);
    // another tab restores, edits and deletes the set again
    await restoreSet(d1.set, db, { ifTombstone: true, token: d1.token });
    await updateSet('a', { reps: 17, load: kb }, db);
    const d2 = (await deleteSetToken('a', db))!;
    await m.undo('a').catch(() => undefined);
    expect((await db.tombstones.get('a'))?.token).toBe(d2.token);
    expect(await db.sets.get('a')).toBeUndefined();
    disposeDeletes(s.id);
  });
});

describe('group 4: startDb retries after a transient failure', () => {
  it('a rejected start is not cached', async () => {
    const { startDb, resetStartDb } = await import('../bootstrap');
    resetStartDb();
    const broken = new AnyGymDB(`${name}-broken`);
    broken.close();
    // Closed and never reopened: the transaction cannot start, so the first attempt rejects.
    const bad = { ...broken, transaction: () => Promise.reject(new Error('storage busy')), gyms: broken.gyms } as unknown as AnyGymDB;
    await expect(startDb(bad)).rejects.toThrow('storage busy');
    const gym = await startDb(db);
    expect(gym.name).toBe('My Gym');
    expect(await startDb(db)).toEqual(gym);
    resetStartDb();
  });
});

describe('group 3: restore validates plan positions and bounds', () => {
  it('refuses a negative day, a day past the plan, and absurd added sets or draft slots', async () => {
    const { exportBackup } = await import('../backup');
    const { parseBackup, serializeBackup } = await import('../../lib/backup');
    await db.gyms.add({ ...makeGym({ name: 'G', type: 'full', unit: 'lb', isActive: true }, 1), id: 'g' });
    await db.planState.add({ id: 'active', planId: 'five-day-split', startedAt: 10, weekIndex: 0, nextDayIndex: 1, doneDays: [0] });
    await db.sessions.add({ id: 'live', gymId: 'g', startedAt: 5, imported: false });
    const good = await exportBackup(db, 1);
    // A workout in progress is not part of a restore into a quiet phone, so test the parser alone.
    const ps = good.tables.planState[0]!;
    const withPlan = (p: object) => parseBackup(serializeBackup({ ...good, tables: { ...good.tables, planState: [{ ...ps, ...p }] } })).ok;
    expect(withPlan({})).toBe(true);
    expect(withPlan({ nextDayIndex: -1 })).toBe(false);
    expect(withPlan({ nextDayIndex: 999 })).toBe(false);
    expect(withPlan({ doneDays: [-2] })).toBe(false);
    expect(withPlan({ nextDayIndex: 1.5 })).toBe(false);
    const withExtra = (n: number) => parseBackup(serializeBackup({ ...good, extraSets: { sessionId: 'live', extra: { goblet: n } } })).ok;
    expect(withExtra(3)).toBe(true);
    expect(withExtra(1_000_000_000)).toBe(false);
    const withSlot = (k: string) => parseBackup(serializeBackup({ ...good, drafts: { live: { [k]: { id: 'x', load: null } } } })).ok;
    expect(withSlot('goblet@2')).toBe(true);
    expect(withSlot('goblet@1000000')).toBe(false);
  });

  it('rendering consumers are bounded: extraSets caps a stored count', async () => {
    const { extraSets, MAX_EXTRA_SETS } = await import('../../lib/extraSets');
    const kv = { getItem: () => JSON.stringify({ sessionId: 's', extra: { a: 1_000_000_000 } }), setItem: () => undefined, removeItem: () => undefined };
    expect(extraSets('s', 'a', kv)).toBeLessThanOrEqual(MAX_EXTRA_SETS);
  });
});

describe('group 7: Delete and unresolved mutations', () => {
  const edit = (reps: number) => ({ kind: 'edit' as const, setId: 'a', change: { reps, load: kb } });

  it('Delete refuses while the set has a journaled change', async () => {
    const { saveMutation } = await import('../mutations');
    const { SetHasPendingChangesError } = await import('../workouts');
    const s = await oneSet();
    const put = db.sets.put.bind(db.sets);
    (db.sets as unknown as { put: unknown }).put = () => Promise.reject(new Error('disk'));
    await expect(saveMutation(s.id, 'goblet', edit(17), db, 2000, null)).rejects.toThrow('disk');
    (db.sets as unknown as { put: unknown }).put = put;
    await expect(deleteSetToken('a', db)).rejects.toBeInstanceOf(SetHasPendingChangesError);
    expect((await db.sets.get('a'))?.reps).toBe(10);
  });

  it('applying a change to a tombstoned set keeps it as a retryable conflict; Undo then Try again lands it', async () => {
    const { saveMutation, pendingMutations, retryMutations, MutationConflictError } = await import('../mutations');
    const s = await oneSet();
    // The journal entry exists, then the set is deleted by another path (no guard), then apply runs.
    const real = db.sets.put.bind(db.sets);
    (db.sets as unknown as { put: unknown }).put = () => Promise.reject(new Error('disk'));
    await expect(saveMutation(s.id, 'goblet', edit(17), db, 2000, null)).rejects.toThrow('disk');
    (db.sets as unknown as { put: unknown }).put = real;
    const entries = await db.journal.toArray();
    await db.journal.clear(); // let the delete through, as the other tab raced the journal
    const d = (await deleteSetToken('a', db))!;
    await db.journal.bulkAdd(entries);
    expect(await retryMutations(s.id, db, null)).toBe(false);
    expect((await pendingMutations(s.id, db, null)).length).toBe(1);
    void MutationConflictError;
    await undoDelete('a', db, d.token);
    expect(await retryMutations(s.id, db, null)).toBe(true);
    expect((await db.sets.get('a'))?.reps).toBe(17);
  });
});

describe('group 6: operation ordering', () => {
  const edit = (reps: number) => ({ kind: 'edit' as const, setId: 'a', change: { reps, load: kb } });
  const mem = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
  };

  it('a stale fallback copy never replays over a newer save, even when removing it failed', async () => {
    const { saveMutation, pendingMutations, retryMutations } = await import('../mutations');
    const s = await oneSet();
    const ls = mem();
    const realSet = ls.setItem;
    const real = db.sets.put.bind(db.sets);
    const realJ = db.journal.put.bind(db.journal);
    // 17 fails everywhere: set write and journal write, so it lives in the fallback.
    (db.journal as unknown as { put: unknown }).put = () => Promise.reject(new Error('journal'));
    await expect(saveMutation(s.id, 'goblet', edit(17), db, 2000, ls)).rejects.toThrow('journal');
    (db.journal as unknown as { put: unknown }).put = realJ;
    void real;
    // 19 saves; removing the fallback fails.
    ls.setItem = () => {
      throw new Error('quota');
    };
    ls.removeItem = () => {
      throw new Error('quota');
    };
    await saveMutation(s.id, 'goblet', edit(19), db, 3000, ls);
    ls.setItem = realSet;
    expect((await db.sets.get('a'))?.reps).toBe(19);
    expect(await pendingMutations(s.id, db, ls)).toEqual([]);
    expect(await retryMutations(s.id, db, ls)).toBe(true);
    expect((await db.sets.get('a'))?.reps).toBe(19);
  });

  it('equal timestamps: Retry applies the newer correction, not the older journaled edit', async () => {
    const { saveMutation, pendingMutations, retryMutations } = await import('../mutations');
    const s = await oneSet();
    const ls = mem();
    const put = db.sets.put.bind(db.sets);
    (db.sets as unknown as { put: unknown }).put = () => Promise.reject(new Error('disk'));
    await expect(saveMutation(s.id, 'goblet', edit(17), db, 2000, ls)).rejects.toThrow('disk');
    const realJ = db.journal.put.bind(db.journal);
    (db.journal as unknown as { put: unknown }).put = () => Promise.reject(new Error('journal'));
    await expect(saveMutation(s.id, 'goblet', edit(19), db, 2000, ls)).rejects.toThrow('journal');
    (db.journal as unknown as { put: unknown }).put = realJ;
    (db.sets as unknown as { put: unknown }).put = put;
    const list = await pendingMutations(s.id, db, ls);
    expect(list.map((e) => (e.mutation as { change: { reps: number } }).change.reps)).toEqual([17, 19]);
    expect(await retryMutations(s.id, db, ls)).toBe(true);
    expect((await db.sets.get('a'))?.reps).toBe(19);
  });
});

describe('group 5: drafts of two tabs merge by row and revision', () => {
  it('another tab never overwrites newer pending edits, and a row logged elsewhere is not resurrected', async () => {
    const { saveDraft, loadDraft, clearDraft, sessionDrafts } = await import('../../lib/drafts');
    const data = new Map<string, string>();
    const tab = () => ({ getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) });
    const a = tab();
    const b = tab();
    const row = (id: string, reps: number, rev: number) => ({ id, load: null, reps, rev });
    saveDraft('s', 'ex@0', row('r0', 7, 1), a);
    saveDraft('s', 'ex@1', row('r1', 7, 1), a);
    // Tab B opens the workout and edits row 1; tab A edits row 0 afterwards.
    expect(loadDraft('s', 'ex@1', b)?.reps).toBe(7);
    saveDraft('s', 'ex@1', row('r1', 12, 2), b);
    saveDraft('s', 'ex@0', row('r0', 17, 2), a);
    const fresh = JSON.parse(data.get('anygym-drafts')!).s as Record<string, { reps: number }>;
    expect(fresh['ex@0']!.reps).toBe(17);
    expect(fresh['ex@1']!.reps).toBe(12);
    expect(sessionDrafts('s', a).get('ex@1')?.reps).toBe(12);
    // B logs row 1 (clears it); A's later write must not bring it back.
    clearDraft('s', 'ex@1', b);
    saveDraft('s', 'ex@0', row('r0', 18, 3), a);
    const after = JSON.parse(data.get('anygym-drafts')!).s as Record<string, { reps: number }>;
    expect(Object.keys(after)).toEqual(['ex@0']);
    expect(after['ex@0']!.reps).toBe(18);
  });
});
