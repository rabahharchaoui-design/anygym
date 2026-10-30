import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnyGymDB } from '../../../db/schema';
import { makeGym } from '../../../db/gyms';
import type { Gym, Load, WorkoutSet } from '../../../db/types';
import { deleteSet, finishWorkout, logSet, reopenWorkout, setsOf, startWorkout } from '../../../db/workouts';
import { cancelUndo, expireDelete, undoDelete } from '../../../db/tombstones';
import { exportBackup, restoreMerge, restoreReplace } from '../../../db/backup';
import { parseBackup, serializeBackup } from '../../../lib/backup';
import { UndoUnresolvedError, createDeleteUndo } from '../../../lib/deleteUndo';
import { DRAFTS_KEY, hydrateDrafts, loadDraft, sessionDrafts, writeDrafts, type Draft } from '../../../lib/drafts';
import { restoreMirrors } from '../../../lib/durable';
import { createLogQueue } from '../../../lib/logQueue';
import { sameResistance, MAX_DUMBBELLS, barbellLoad, bodyweightLoad, dumbbellLoad, dumbbellsInRange, nearestLoadable, singleLoad, stackLoad, timedLoad, validDumbbellRange } from '../../../lib/load';
import { progress, type PastSession, type PastSet } from '../../../lib/progression';
import { recordsFor } from '../../../lib/records';
import { blockedReason, keptCell, markSubmitted, pendingRows, reconcileRows, rowKey, savedCells, slotChanges, type BuildInput } from '../../../lib/setTable';
import { currentLoad, pickProblem } from '../exerciseLoad';
import { adoptJournal, failedRows, prepareFinish, reconcileSession, retryFailed, rowsOf, submitRow, type Deps } from '../rowLog';

// PLAN 1.7i: the Codex saving and units fixes (reports/codex/bughunt-1025-*), one block per fix.

const b135 = barbellLoad(45, [45], 'none', 'lb')!;

let name: string;
let db: AnyGymDB;
let n = 0;
beforeEach(async () => {
  name = `anygym-17i-${n++}`;
  db = new AnyGymDB(name);
  await db.open();
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  db.close();
  await new AnyGymDB(name).delete();
});

/** localStorage over a Map that outlives the "process"; `broken` makes every write throw (full or blocked). */
function phone() {
  const disk = new Map<string, string>();
  let broken = false;
  const storage = () => ({
    getItem: (k: string) => disk.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (broken) throw new Error('QuotaExceededError');
      disk.set(k, v);
    },
    removeItem: (k: string) => {
      if (broken) throw new Error('QuotaExceededError');
      disk.delete(k);
    },
  });
  return { disk, storage, break: (b = true) => void (broken = b) };
}

let ids = 0;
const makeId = () => `i17-${++ids}`;

async function relaunch(p: ReturnType<typeof phone>): Promise<Deps> {
  db.close();
  db = new AnyGymDB(name);
  await db.open();
  return { db, storage: p.storage(), queue: createLogQueue(), makeId };
}

/** What the exercise view does on ✓ of slot `slot`: the row marked and stored before the write. */
function tap(sessionId: string, exerciseId: string, slot: number, deps: Deps): Draft {
  const before = rowsOf(sessionId, exerciseId, deps);
  const rows = pendingRows({
    count: Math.max(3, before.length),
    logged: [],
    progression: undefined,
    draftOf: (i) => before[i] ?? null,
    rebuild: (picked) => picked,
    carry: () => null,
    certain: null,
    defaultType: 'normal',
  });
  const r = rows[slot]!;
  const marked = markSubmitted(before, rows, slot, { load: r.load!, reps: r.reps, type: r.type }, makeId);
  writeDrafts(sessionId, slotChanges(exerciseId, before, marked.slots), deps.storage);
  return marked.draft;
}

describe('(1) a failed submission is journaled in IndexedDB before Log', () => {
  it('storage and logSet both fail: after a restart the row is back, Finish refuses, one retry saves its exact values once', async () => {
    const p = phone();
    let deps: Deps = { db, storage: p.storage(), queue: createLogQueue(), makeId };
    const s = await startWorkout('g', db);
    writeDrafts(s.id, new Map([[rowKey('squat', 0), { id: 'j1', load: b135, plates: [45], reps: 7, rev: 3, unit: 'lb' }]]), deps.storage);
    // The marker write fails (storage full) and the set write fails too.
    p.break();
    const submitted = tap(s.id, 'squat', 0, deps);
    const add = vi.spyOn(db.sets, 'add').mockRejectedValueOnce(new Error('disk'));
    expect(await submitRow(s.id, 'squat', submitted, deps)).toBe(false);
    add.mockRestore();
    expect(await db.journal.get('j1')).toMatchObject({ sessionId: s.id, exerciseId: 'squat', key: 'squat@0', rev: 3, draft: { id: 'j1', reps: 7, load: b135 } });

    // Restart: the drafts in memory are gone and localStorage never got the mark (nor the draft).
    p.break(false);
    p.disk.clear();
    deps = await relaunch(p);
    expect(rowsOf(s.id, 'squat', deps)).toEqual([]);
    const failed = await prepareFinish(s.id, deps);
    expect(failed.map((f) => [f.draft.id, f.draft.reps, f.draft.submitted])).toEqual([['j1', 7, 3]]);
    // The row is visible again with its exact values.
    expect(rowsOf(s.id, 'squat', deps)[0]).toMatchObject({ id: 'j1', reps: 7, load: b135, submitted: 3 });

    expect(await retryFailed(s.id, deps)).toBe(true);
    expect((await setsOf(s.id, db)).map((x) => [x.id, x.reps, x.load?.total])).toEqual([['j1', 7, 135]]);
    expect(await db.journal.count()).toBe(0);
    expect(await retryFailed(s.id, deps)).toBe(true); // nothing left: never a second copy
    expect(await setsOf(s.id, db)).toHaveLength(1);
    expect(await prepareFinish(s.id, deps)).toEqual([]);
  });

  it('a journal write that fails is reported (the row stays marked), and logSet uses the entry up in its own transaction', async () => {
    const p = phone();
    const deps: Deps = { db, storage: p.storage(), queue: createLogQueue(), makeId };
    const s = await startWorkout('g', db);
    writeDrafts(s.id, new Map([[rowKey('squat', 0), { id: 'j2', load: b135, plates: [45], reps: 5, rev: 1 }]]), deps.storage);
    const submitted = tap(s.id, 'squat', 0, deps);
    const put = vi.spyOn(db.journal, 'put').mockRejectedValueOnce(new Error('disk'));
    expect(await submitRow(s.id, 'squat', submitted, deps)).toBe(false);
    put.mockRestore();
    expect(await setsOf(s.id, db)).toEqual([]);
    expect((await failedRows(s.id, deps)).map((f) => f.draft.id)).toEqual(['j2']);
    expect(await submitRow(s.id, 'squat', { ...submitted }, deps)).toBe(true);
    expect(await db.journal.count()).toBe(0);
  });

  it('adoptJournal puts a lost entry back at its slot without overwriting, and gives an older copy its mark back', () => {
    const p = phone();
    const deps: Deps = { storage: p.storage(), makeId };
    const other: Draft = { id: 'o', load: b135, reps: 12, rev: 1 };
    const stale: Draft = { id: 'k', load: b135, reps: 6, rev: 1 };
    writeDrafts('S', new Map([[rowKey('squat', 0), other], [rowKey('bench', 0), stale]]), deps.storage);
    const entry = (id: string, ex: string, rev: number, reps: number) => ({ id, sessionId: 'S', exerciseId: ex, key: rowKey(ex, 0), rev, draft: { id, load: b135, reps, rev }, at: 1 });
    expect(adoptJournal('S', [entry('lost', 'squat', 2, 9), entry('k', 'bench', 2, 8), entry('done', 'squat', 1, 4)], new Map([['done', 1]]), deps)).toBe(true);
    expect(rowsOf('S', 'squat', deps).map((d) => [d?.id, d?.reps, d?.submitted])).toEqual([['lost', 9, 2], ['o', 12, undefined]]);
    expect(rowsOf('S', 'bench', deps).map((d) => [d?.id, d?.reps, d?.submitted])).toEqual([['k', 8, 2]]);
    // Nothing more to do the second time.
    expect(adoptJournal('S', [entry('lost', 'squat', 2, 9)], new Map(), deps)).toBe(false);
  });
});

describe('(2) a failed Undo acceptance is an unresolved Undo', () => {
  it('the acceptance put rejects: Finish refuses, the tombstone stays, a retry restores the exact record', async () => {
    const s = await startWorkout('g', db, 1);
    for (const id of ['u1', 'u2']) await logSet({ id, sessionId: s.id, exerciseId: 'squat', reps: 10, load: b135 }, db);
    const saved = (await db.sets.get('u2'))!;
    const d = createDeleteUndo<WorkoutSet>({
      remove: (x) => deleteSet(x.id, db),
      restore: (x) => undoDelete(x.id, db),
      expire: (x) => expireDelete(x.id, db),
      cancel: (x) => cancelUndo(x.id, db),
    });
    await d.remove(saved);
    const put = vi.spyOn(db.tombstones, 'put').mockRejectedValueOnce(new Error('disk'));
    await expect(d.undo('u2')).rejects.toThrow('disk');
    put.mockRestore();
    expect((await db.tombstones.get('u2'))?.undo).toBeUndefined();
    // Finish (deletes.close in WorkoutScreen.finishNow) refuses while the Undo is unresolved.
    await expect(d.close()).rejects.toBeInstanceOf(UndoUnresolvedError);
    expect(await db.tombstones.get('u2')).toMatchObject({ set: saved });
    d.reopen();
    expect(await d.undo('u2')).toEqual(saved);
    expect(await db.sets.get('u2')).toEqual(saved);
    expect(await db.tombstones.count()).toBe(0);
    await expect(d.close()).resolves.toBeUndefined();
  });

  it('cancel keeps the set deleted: the tombstone goes, Finish does not put it back', async () => {
    const s = await startWorkout('g', db, 1);
    await logSet({ id: 'c1', sessionId: s.id, exerciseId: 'squat', reps: 10, load: b135 }, db);
    await logSet({ id: 'c2', sessionId: s.id, exerciseId: 'squat', reps: 9, load: b135 }, db);
    const d = createDeleteUndo<WorkoutSet>({ remove: (x) => deleteSet(x.id, db), restore: () => Promise.reject(new Error('disk')), cancel: (x) => cancelUndo(x.id, db) });
    await d.remove((await db.sets.get('c2'))!);
    await expect(d.undo('c2')).rejects.toThrow();
    await expect(d.close()).rejects.toBeInstanceOf(UndoUnresolvedError);
    d.reopen();
    await d.cancel('c2');
    await expect(d.close()).resolves.toBeUndefined();
    expect(await db.tombstones.count()).toBe(0);
    expect(await finishWorkout(s.id, db)).toMatchObject({ saved: true, sets: 1 });
  });

  it('accepted Undo, failed restore, failed cancellation: Finish stays blocked; a cancellation that lands finishes with only the kept set', async () => {
    const s = await startWorkout('g', db, 1);
    await logSet({ id: 'k1', sessionId: s.id, exerciseId: 'squat', reps: 10, load: b135 }, db);
    await logSet({ id: 'k2', sessionId: s.id, exerciseId: 'squat', reps: 9, load: b135 }, db);
    const d = createDeleteUndo<WorkoutSet>({
      remove: (x) => deleteSet(x.id, db),
      restore: (x) => undoDelete(x.id, db),
      cancel: (x) => cancelUndo(x.id, db),
    });
    await d.remove((await db.sets.get('k2'))!);
    // Acceptance is stored, then the restore write fails.
    const put = vi.spyOn(db.sets, 'put').mockRejectedValueOnce(new Error('disk'));
    await expect(d.undo('k2')).rejects.toThrow('disk');
    put.mockRestore();
    expect((await db.tombstones.get('k2'))?.undo).toBe(true);
    // "Keep it deleted" fails to store: still unresolved, Finish refuses, the record is kept.
    const del = vi.spyOn(db.tombstones, 'delete').mockRejectedValueOnce(new Error('disk'));
    await expect(d.cancel('k2')).rejects.toThrow('disk');
    del.mockRestore();
    expect(d.unresolved()).toEqual(['k2']);
    await expect(d.close()).rejects.toBeInstanceOf(UndoUnresolvedError);
    expect(await db.tombstones.get('k2')).toMatchObject({ undo: true });
    // Retried and stored: Finish goes on and the cancelled set stays deleted.
    d.reopen();
    await d.cancel('k2');
    await expect(d.close()).resolves.toBeUndefined();
    expect(await finishWorkout(s.id, db)).toMatchObject({ saved: true, sets: 1 });
    expect((await setsOf(s.id, db)).map((x) => x.id)).toEqual(['k1']);
  });
});

describe('(3) draft recovery against committed revision 2', () => {
  const id = () => makeId();
  const at = (rev: number): Draft => ({ id: 'r', load: b135, reps: 8, rev, submitted: Math.min(rev, 2) });
  it('older and equal revisions are used up; only a strictly newer one survives, once, under a fresh id', () => {
    const next: Draft = { id: 'x', load: b135, reps: 5, rev: 1 };
    expect(reconcileRows([at(1), next], new Map([['r', 2]]), id)).toEqual([next]);
    expect(reconcileRows([at(2), next], new Map([['r', 2]]), id)).toEqual([next]);
    const kept = reconcileRows([at(3), next], new Map([['r', 2]]), id)!;
    expect(kept.map((d) => [d?.reps, d?.rev])).toEqual([[8, 3], [5, 1]]);
    expect(kept[0]!.id).not.toBe('r');
    // Rebuilding visible rows again cannot expose the committed lift a second time.
    expect(reconcileRows(kept, new Map([['r', 2]]), id)).toBeNull();
  });
});

const lbGym = (): Gym => makeGym({ name: 'Club', type: 'full', unit: 'lb', isActive: true }, 1);
const asKg = (g: Gym): Gym => ({ ...g, unit: 'kg' });

describe('(4) switching units never turns a pending load into another loggable weight', () => {
  it('a 135 lb bar draft and a +25 lb dip draft are not loggable in a kg gym; Just you stays Just you', () => {
    const kg = asKg(lbGym());
    expect(currentLoad(b135, [45], 'barbell', kg, 'barbell-back-squat', 'Barbell back squat')).toBeNull();
    expect(pickProblem(b135, [45], undefined, 'barbell', kg)).toBe('unit');
    expect(pickProblem(null, [45], 'lb', 'barbell', kg)).toBe('unit'); // plates on a bar of unknown weight
    expect(currentLoad(bodyweightLoad('lb', 25), [], 'bodyweight', kg, 'dips', 'Dips')).toBeNull();
    expect(currentLoad(bodyweightLoad('lb'), [], 'bodyweight', kg, 'dips', 'Dips')).toEqual(bodyweightLoad('kg'));
    expect(currentLoad(stackLoad(100, 'lb', 25), [], 'stack', kg, 'lat', 'Lat pulldown')).toBeNull();
    expect(currentLoad(dumbbellLoad(30, 'lb'), [], 'dumbbell_each', kg, 'curl', 'Dumbbell curl')).toBeNull();
  });

  it('a disabled plate makes the pending bar wait for a new pick', () => {
    const g = lbGym();
    const off = { ...g, plateInventory: g.plateInventory.map((p) => (p.weight === 25 ? { ...p, enabled: false } : p)) };
    const b185 = barbellLoad(45, [45, 25], 'none', 'lb')!;
    expect(currentLoad(b185, [45, 25], 'barbell', g, 'barbell-back-squat', 'Barbell back squat')).toMatchObject({ total: 185, perSide: [45, 25] });
    expect(currentLoad(b185, [45, 25], 'barbell', off, 'barbell-back-squat', 'Barbell back squat')).toBeNull();
    expect(pickProblem(b185, [45, 25], 'lb', 'barbell', off)).toBe('plate');
  });

  it('the row keeps the draft as picked, shows it with its unit and blocks ✓ until a new pick', () => {
    const kg = asKg(lbGym());
    const drafts: Draft[] = [
      { id: 'a', load: b135, plates: [45], reps: 5, unit: 'lb' },
      { id: 'b', load: null, plates: [45], reps: 5, unit: 'lb' },
    ];
    const input: BuildInput = {
      count: 2,
      logged: [],
      progression: undefined,
      draftOf: (i) => drafts[i] ?? null,
      rebuild: (picked, plates) => currentLoad(picked, plates, 'barbell', kg, 'barbell-back-squat', 'Barbell back squat'),
      carry: () => null,
      certain: null,
      defaultType: 'normal',
      unit: 'kg',
      stale: (d) => pickProblem(d.load, d.plates ?? [], d.unit, 'barbell', kg),
    };
    const rows = pendingRows(input);
    expect(rows.map((r) => r.load)).toEqual([null, null]);
    expect(rows.map((r) => keptCell(r.kept!, 'barbell', 'kg'))).toEqual(['135 lb', '90 lb + bar']);
    expect(blockedReason('barbell', rows[0]!)).toBe('Picked in lb. Pick again');
    // The draft itself is untouched.
    expect(drafts[0]).toEqual({ id: 'a', load: b135, plates: [45], reps: 5, unit: 'lb' });
    const dip = pendingRows({ ...input, count: 1, draftOf: () => ({ id: 'd', load: bodyweightLoad('lb', 25), reps: 8 }), stale: (d) => pickProblem(d.load, [], d.unit, 'bodyweight', kg) });
    expect(dip[0]!.load).toBeNull();
    expect(keptCell(dip[0]!.kept!, 'bodyweight', 'kg')).toBe('+25 lb');
  });
});

describe('(6) stack progression uses total resistance (pin + added)', () => {
  const setup = { base: null, plates: [], collars: 'none' as const, dumbbellRange: null };
  const history = (sets: Load[]): PastSession[] => [{ date: 1, gymId: 'g', unit: 'lb', sets: sets.map((load) => ({ kind: 'work' as const, reps: 8, load })) }];
  it('100 + 25 lb outranks 110 + 0, and only the pin steps', () => {
    const p = progress({ exerciseId: 'lat', loadKind: 'stack', unit: 'lb', gym: { ...setup, stackStep: 10 }, repRange: [8, 12], history: history([stackLoad(110, 'lb'), stackLoad(100, 'lb', 25)]) });
    expect(p.next.load).toEqual(stackLoad(100, 'lb', 25));
    const top = progress({ exerciseId: 'lat', loadKind: 'stack', unit: 'lb', gym: { ...setup, stackStep: 10 }, repRange: [8, 8], history: history([stackLoad(100, 'lb', 25)]) });
    expect(top.next.load).toEqual(stackLoad(110, 'lb', 25));
  });
  it('a reset takes 10% off the total: 100 pin + 100 added → 180 total (80 pin + 100), on a 10 or a 5 lb step', () => {
    const two: PastSession[] = [1, 2].map((date) => ({ date, gymId: 'g', unit: 'lb', sets: [{ kind: 'work' as const, reps: 6, load: stackLoad(100, 'lb', 100) }] }));
    for (const stackStep of [10, 5]) {
      const p = progress({ exerciseId: 'lat', loadKind: 'stack', unit: 'lb', gym: { ...setup, stackStep }, repRange: [8, 12], history: two });
      expect(p.next.kind).toBe('reset');
      expect(p.next.load).toEqual({ kind: 'stack', unit: 'lb', stackValue: 80, added: 100, total: 180 });
    }
  });
  it('125 lb (100 pin + 25 added) on a 2.5 kg stack is 57.5 kg, and the reason quotes 125 lb', () => {
    const p = progress({ exerciseId: 'lat', loadKind: 'stack', unit: 'kg', gym: { ...setup, stackStep: 2.5 }, repRange: [8, 12], history: history([stackLoad(100, 'lb', 25)]) });
    expect(p.next.load).toEqual(stackLoad(57.5, 'kg'));
    expect(p.next.kind).toBe('converted');
    expect(p.next.reason).toBe('≈ 57.5 kg, last time 125 lb');
  });
});

describe('(7) saved rows render from their own unit, load kind and count', () => {
  it('labels every difference from the current heading', () => {
    expect(savedCells({ reps: 5, load: b135 }, 'barbell', 'kg')).toEqual({ weight: '135 lb', amount: '5' });
    expect(savedCells({ reps: 5, load: b135 }, 'barbell', 'lb')).toEqual({ weight: '135', amount: '5' });
    expect(savedCells({ reps: 10, load: singleLoad(30, 'lb') }, 'dumbbell_each', 'lb')).toEqual({ weight: '30 total', amount: '10' });
    expect(savedCells({ reps: 10, load: dumbbellLoad(30, 'lb') }, 'single', 'lb')).toEqual({ weight: '30 each', amount: '10' });
    expect(savedCells({ reps: 10, load: dumbbellLoad(30, 'lb') }, 'dumbbell_each', 'kg')).toEqual({ weight: '30 lb', amount: '10' });
    expect(savedCells({ reps: 8, load: bodyweightLoad('lb', 25) }, 'bodyweight', 'kg')).toEqual({ weight: '+25 lb', amount: '8' });
    expect(savedCells({ reps: 12, load: b135 }, 'timed', 'lb')).toEqual({ weight: '', amount: '12 × 135 lb' });
    expect(savedCells({ seconds: 45, load: timedLoad('lb') }, 'barbell', 'lb')).toEqual({ weight: '', amount: '45 s' });
    expect(savedCells({ seconds: 45, load: timedLoad('lb') }, 'timed', 'kg')).toEqual({ weight: '', amount: '45 s' });
  });
});

describe('(8) Restore stores the drafts durably inside the restore', () => {
  const drafted = async () => {
    const live = { id: 'live', gymId: 'g', startedAt: 5, imported: false, exerciseIds: ['bench'] };
    await db.sessions.add(live);
    const store = phone();
    writeDrafts('live', new Map([[rowKey('bench', 0), { id: 'p', load: b135, plates: [45], reps: 17, rev: 2, watch: { accumulated: 0, startedAt: 9 } }]]), store.storage());
    const backup = await exportBackup(db, 100, store.storage());
    await db.sessions.clear();
    return backup;
  };

  it('a draft write that fails rolls the whole restore back', async () => {
    const backup = await drafted();
    await db.sessions.add({ id: 'mine', gymId: 'g', startedAt: 1, endedAt: 2, imported: false });
    const target = phone();
    vi.spyOn(db.kv, 'put').mockRejectedValue(new Error('disk'));
    await expect(restoreReplace(backup, db, target.storage())).rejects.toThrow();
    await expect(restoreMerge(backup, db, target.storage())).rejects.toThrow();
    expect((await db.sessions.toArray()).map((s) => s.id)).toEqual(['mine']);
    expect(target.disk.size).toBe(0);
  });

  it('localStorage refusing the drafts loses nothing: the durable copy comes back at the next start', async () => {
    const backup = await drafted();
    const target = phone();
    target.break();
    expect(await restoreReplace(backup, db, target.storage())).toMatchObject({ workouts: 1 });
    const fresh = phone();
    // PLAN 2.0c: the restore also stores the rest and added rows (here none: durable removals).
    expect((await restoreMirrors(fresh.storage(), db)).sort()).toEqual(['anygym-drafts', 'anygym-extra-sets', 'anygym-rest']);
    expect(loadDraft('live', rowKey('bench', 0), fresh.storage())).toMatchObject({ id: 'p', reps: 17, watch: { accumulated: 0, startedAt: 9 } });
  });
});

describe('(13) receipts outlive Finish: an undone Finish never brings a deleted set back as not saved', () => {
  it('logged then deleted, finished, reopened with stale drafts: reconciled before any retry is offered', async () => {
    const p = phone();
    const deps: Deps = { db, storage: p.storage(), queue: createLogQueue(), makeId };
    const s = await startWorkout('g', db);
    writeDrafts(s.id, new Map([[rowKey('squat', 0), { id: 'k1', load: b135, plates: [45], reps: 10, rev: 1 }], [rowKey('squat', 1), { id: 'k2', load: b135, plates: [45], reps: 9, rev: 1 }]]), deps.storage);
    const stale = new Map(sessionDrafts(s.id, deps.storage));
    expect(await submitRow(s.id, 'squat', tap(s.id, 'squat', 0, deps), deps)).toBe(true);
    expect(await submitRow(s.id, 'squat', tap(s.id, 'squat', 0, deps), deps)).toBe(true);
    await deleteSet('k2', db);
    expect(await finishWorkout(s.id, db)).toMatchObject({ saved: true, sets: 1 });
    expect(await db.submissions.count()).toBe(2);
    // Draft cleanup failed at Finish: the stale drafts (with marks) are still in storage.
    writeDrafts(s.id, new Map([...stale].map(([k, d]) => [k, { ...d, submitted: 1 }])), deps.storage);
    expect(await reopenWorkout(s.id, undefined, db)).toBe(true);
    await reconcileSession(s.id, deps);
    expect(rowsOf(s.id, 'squat', deps)).toEqual([]);
    expect(await failedRows(s.id, deps)).toEqual([]);
    expect(await retryFailed(s.id, deps)).toBe(true);
    expect((await setsOf(s.id, db)).map((x) => x.id)).toEqual(['k1']);
  });
});

describe('Codex 1.7i review: damaged dumbbell ranges never loop', () => {
  it('dumbbellsInRange lists nothing for a step ≤ 0, a reversed or negative range, or too many weights', () => {
    expect(dumbbellsInRange({ min: 5, max: 15, step: 5 })).toEqual([5, 10, 15]);
    for (const r of [{ min: 5, max: 100, step: 0 }, { min: 5, max: 100, step: -5 }, { min: 50, max: 5, step: 5 }, { min: -5, max: 5, step: 5 }, { min: 0, max: Infinity, step: 5 }, { min: 0, max: MAX_DUMBBELLS * 10, step: 1 }]) {
      expect(validDumbbellRange(r)).toBe(false);
      expect(dumbbellsInRange(r)).toEqual([]);
    }
    const setup = { unit: 'lb' as const, base: null, plates: [], collars: 'none' as const, stackStep: 5, dumbbellRange: { min: 5, max: 100, step: 0 } };
    expect(nearestLoadable('dumbbell_each', 30, setup)).toBeNull();
  });
});

describe('Codex 0534 (2): localStorage still broken after the restart', () => {
  it('restored drafts come from IndexedDB: the 17 rep row is visible, Finish refuses, retry saves it once', async () => {
    // A mid workout backup with a submitted 17 rep row.
    const src = phone();
    await db.gyms.add(lbGym());
    const gym = (await db.gyms.toArray())[0]!;
    await db.sessions.add({ id: 'live', gymId: gym.id, startedAt: 5, imported: false, exerciseIds: ['squat'] });
    writeDrafts('live', new Map([[rowKey('squat', 0), { id: 'r17', load: b135, plates: [45], reps: 17, rev: 2, submitted: 2, unit: 'lb' }]]), src.storage());
    const backup = await exportBackup(db, 100, src.storage());
    await db.sessions.clear();
    await db.gyms.clear();

    const p = phone();
    p.break();
    await restoreReplace(backup, db, p.storage());
    // Restart: memory gone, localStorage still refuses every write.
    const deps = await relaunch(p);
    expect(await restoreMirrors(deps.storage!, db, { [DRAFTS_KEY]: (v) => hydrateDrafts(v, deps.storage) })).toEqual([]);
    expect(rowsOf('live', 'squat', deps)[0]).toMatchObject({ id: 'r17', reps: 17, submitted: 2 });
    expect((await prepareFinish('live', deps)).map((f) => f.draft.reps)).toEqual([17]);
    expect(await retryFailed('live', deps)).toBe(true);
    expect(await retryFailed('live', deps)).toBe(true);
    expect((await setsOf('live', db)).map((x) => [x.id, x.reps])).toEqual([['r17', 17]]);
  });

  it('a draft edited while localStorage refuses it is mirrored to IndexedDB and hydrated at the next start', async () => {
    const p = phone();
    p.break();
    const ls = p.storage();
    // Only the phone's own localStorage is mirrored: stand this one in for it.
    vi.stubGlobal('localStorage', ls);
    try {
      const { mirrorValue } = await import('../../../lib/durable');
      // drafts.ts mirrors to the app's own database; here the same call goes to the test's.
      await mirrorValue(ls, DRAFTS_KEY, JSON.stringify({ S2: { [rowKey('squat', 0)]: { id: 'e1', load: b135, reps: 9, rev: 1 } } }), ls, db);
      const row = await db.kv.get(DRAFTS_KEY);
      expect(row?.value).toContain('"e1"');
      const next = phone();
      next.break();
      const ls2 = next.storage();
      await restoreMirrors(ls2, db, { [DRAFTS_KEY]: (v) => hydrateDrafts(v, ls2) });
      expect(loadDraft('S2', rowKey('squat', 0), ls2)).toMatchObject({ id: 'e1', reps: 9 });
      // The first write localStorage takes ends the hydrated copy (memory carries the session on).
      next.break(false);
      writeDrafts('S2', new Map([[rowKey('squat', 1), { id: 'e2', load: b135, reps: 8, rev: 1 }]]), ls2);
      expect(JSON.parse(next.disk.get(DRAFTS_KEY)!).S2[rowKey('squat', 0)].id).toBe('e1');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('Codex 0534 (3): a failed Log kept only in the journal survives export and restore', () => {
  it('journal only, exported without opening the exercise, restored into a fresh database: Finish blocks, retry saves one set', async () => {
    const p = phone();
    let deps: Deps = { db, storage: p.storage(), queue: createLogQueue(), makeId };
    await db.gyms.add(lbGym());
    const gym = (await db.gyms.toArray())[0]!;
    const s = await startWorkout(gym.id, db);
    writeDrafts(s.id, new Map([[rowKey('squat', 0), { id: 'jx', load: b135, plates: [45], reps: 17, rev: 4, unit: 'lb' }]]), deps.storage);
    const submitted = tap(s.id, 'squat', 0, deps);
    const add = vi.spyOn(db.sets, 'add').mockRejectedValueOnce(new Error('disk'));
    expect(await submitRow(s.id, 'squat', submitted, deps)).toBe(false);
    add.mockRestore();
    // Restart that lost the drafts; the backup is made from Settings, the exercise never opened.
    p.disk.clear();
    deps = await relaunch(p);
    const text = serializeBackup(await exportBackup(db, 100, deps.storage));
    const parsed = parseBackup(text);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.backup.tables.journal.map((j) => [j.id, j.rev, (j.draft as { reps: number }).reps])).toEqual([['jx', 4, 17]]);

    // Another phone: a fresh database and empty storage.
    db.close();
    await new AnyGymDB(name).delete();
    db = new AnyGymDB(name);
    await db.open();
    const other = phone();
    const there: Deps = { db, storage: other.storage(), queue: createLogQueue(), makeId };
    await restoreReplace(parsed.backup, db, there.storage);
    expect((await prepareFinish(s.id, there)).map((f) => [f.draft.id, f.draft.reps])).toEqual([['jx', 17]]);
    expect(await retryFailed(s.id, there)).toBe(true);
    expect((await setsOf(s.id, db)).map((x) => [x.id, x.reps, x.load?.total])).toEqual([['jx', 17, 135]]);
    expect(await db.journal.count()).toBe(0);
    expect(await prepareFinish(s.id, there)).toEqual([]);
  });
});

describe('Codex 0534 (9): records compare resistance across units', () => {
  const w = (load: Load, reps = 5): PastSet => ({ kind: 'work', reps, load });
  it('ten push-ups in lb, then twelve in kg: a rep record (bodyweight is the same in any unit), either way round', () => {
    expect(recordsFor('push-up', 'Push up', [w(bodyweightLoad('kg'), 12)], [w(bodyweightLoad('lb'), 10)])).toEqual([{ exerciseId: 'push-up', kind: 'most_reps', text: 'Push up: most reps at bodyweight, 12' }]);
    expect(recordsFor('push-up', 'Push up', [w(bodyweightLoad('lb'), 12)], [w(bodyweightLoad('kg'), 10)])).toHaveLength(1);
  });
  it('135 lb then 100 kg against a previous 185 lb: the heaviest record is found, in either order', () => {
    const before = [w(barbellLoad(45, [70], 'none', 'lb')!)];
    const lb135 = w(b135);
    const kg100 = w(barbellLoad(20, [40], 'none', 'kg')!);
    for (const today of [[lb135, kg100], [kg100, lb135]]) {
      expect(recordsFor('squat', 'Squat', today, before)).toContainEqual({ exerciseId: 'squat', kind: 'heaviest', text: 'Squat: heaviest ever, 100 kg' });
    }
  });
  it('sameResistance: converted within a small tolerance, never across load kinds', () => {
    expect(sameResistance(dumbbellLoad(22.5, 'kg'), dumbbellLoad(22.5 / 0.45359237, 'lb'))).toBe(true);
    expect(sameResistance(dumbbellLoad(22.5, 'kg'), dumbbellLoad(50, 'lb'))).toBe(false);
    expect(sameResistance(bodyweightLoad('kg', 10), bodyweightLoad('lb'))).toBe(false);
    expect(sameResistance(singleLoad(20, 'kg'), dumbbellLoad(20, 'kg'))).toBe(false);
    expect(sameResistance(b135, b135)).toBe(true);
  });
});
