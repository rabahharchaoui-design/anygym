// PLAN 2.0l: Codex carry over (reports/codex/bughunt-1103-1811-weights.md, ui-2.2e.md). Each case
// failed before its fix. Synthetic data only. Also: drafts-2.0l, backup-2.0l, deleteUndo tests and
// tests/codex-2.0l.spec.ts (7, 8).
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnyGymDB } from '../schema';
import { makeGym } from '../gyms';
import { finishWorkout, logSet, removeExercise, reopenWorkout, restoreExercise, setsOf, startWorkout } from '../workouts';
import { dropMutations, pendingMutations, retryMutations, saveMutation } from '../mutations';
import { deletesFor, disposeDeletes, ownedDeletes } from '../../screens/workout/sessionRecovery';
import type { Load } from '../types';
import { barbellLoad } from '../../lib/load';
import { saveDraft, writeDrafts, type Draft } from '../../lib/drafts';
import { createLogQueue } from '../../lib/logQueue';
import { pendingRows, rowKey, slotChanges } from '../../lib/setTable';
import { committedOf, reconcileSession, retryFailed, rowsOf, submitRow, type Deps } from '../../screens/workout/rowLog';

const olympic135 = barbellLoad(45, [45], 'none', 'lb', 'olympic')!;
const womens125 = barbellLoad(35, [45], 'none', 'lb', 'womens')!;
const bar155 = barbellLoad(45, [55], 'none', 'lb', 'olympic')!;

let n = 0;
let name = '';
const opened: AnyGymDB[] = [];
const tab = async () => {
  const d = new AnyGymDB(name);
  await d.open();
  opened.push(d);
  return d;
};
let db: AnyGymDB;
beforeEach(async () => {
  name = `anygym-2.0l-${n++}`;
  db = await tab();
});
afterEach(async () => {
  for (const d of opened.splice(0)) d.close();
  await new AnyGymDB(name).delete();
});

function phone() {
  const disk = new Map<string, string>();
  return {
    disk,
    storage: () => ({ getItem: (k: string) => disk.get(k) ?? null, setItem: (k: string, v: string) => void disk.set(k, v), removeItem: (k: string) => void disk.delete(k) }),
  };
}
let ids = 0;
const makeId = () => `r-${++ids}`;
async function workout() {
  await db.gyms.add({ ...makeGym({ name: 'G', type: 'full', unit: 'lb', isActive: true }, 1), id: 'g' });
  return startWorkout('g', db, 1000);
}
/** The exercise view's rows for these drafts, rebuilt on "today's" bar by `rebuild`. */
const rowsFor = (slots: Array<Draft | null>, rebuild: (l: Load | null) => Load | null) =>
  pendingRows({ count: Math.max(1, slots.length), logged: [], progression: undefined, draftOf: (i) => slots[i] ?? null, rebuild: (l) => rebuild(l), carry: () => null, certain: null, defaultType: 'normal' });

describe('2.0l (1): Retry saves exactly the load the failed row shows, bar included', () => {
  it('failed 135 lb Olympic Log, the bar changes to the women\'s bar: the row shows and Retry saves 135 Olympic', async () => {
    const s = await workout();
    const p = phone();
    const deps: Deps = { db, storage: p.storage(), queue: createLogQueue(), makeId };
    const failed: Draft = { id: 'A', load: olympic135, plates: [45], reps: 5, rev: 1, submitted: 1 };
    writeDrafts(s.id, slotChanges('squat', [], [failed]), deps.storage);
    // Today's equipment says women's bar: an ordinary row would be rebuilt as 125.
    const today = (l: Load | null) => (l ? womens125 : null);
    const shown = rowsFor(rowsOf(s.id, 'squat', deps), today)[0]!;
    expect(shown.load).toEqual(olympic135);
    expect(await retryFailed(s.id, deps)).toBe(true);
    const [saved] = await setsOf(s.id, db);
    expect(saved!.load).toEqual(shown.load);
    expect(saved!.load!.barId).toBe('olympic');
  });

  it('an explicit correction replaces what the row shows and what Retry saves', async () => {
    const s = await workout();
    const deps: Deps = { db, storage: phone().storage(), queue: createLogQueue(), makeId };
    const corrected: Draft = { id: 'A', load: womens125, plates: [45], reps: 5, rev: 2, submitted: 1 };
    writeDrafts(s.id, slotChanges('squat', [], [corrected]), deps.storage);
    const shown = rowsFor(rowsOf(s.id, 'squat', deps), (l) => l)[0]!;
    expect(shown.load).toEqual(womens125);
    expect(await retryFailed(s.id, deps)).toBe(true);
    expect((await setsOf(s.id, db))[0]!.load).toEqual(womens125);
  });

  it('a row that is not submitted is still filled on today\'s equipment', () => {
    const idle: Draft = { id: 'A', load: olympic135, plates: [45], reps: 5, rev: 1 };
    expect(rowsFor([idle], (l) => (l ? womens125 : null))[0]!.load).toEqual(womens125);
  });
});

describe('2.0l (3): a duplicate Log never acknowledges and clears a weight it did not save', () => {
  it('135 lb saved at rev 1; this tab submits 155 lb at the same id and rev: 135 stays, 155 stays pending, no landed callback', async () => {
    const s = await workout();
    // Another tab logged its own input under the shared row id at the same revision.
    await logSet({ id: 'A', sessionId: s.id, exerciseId: 'squat', reps: 5, load: olympic135, rev: 1 }, db);
    const deps: Deps = { db, storage: phone().storage(), queue: createLogQueue(), makeId };
    const mine: Draft = { id: 'A', load: bar155, plates: [55], reps: 5, rev: 1, submitted: 1 };
    writeDrafts(s.id, slotChanges('squat', [], [mine]), deps.storage);
    let landed = 0;
    expect(await submitRow(s.id, 'squat', mine, { ...deps, onLanded: () => landed++ })).toBe(true);
    expect(landed).toBe(0);
    const sets = await setsOf(s.id, db);
    expect(sets).toHaveLength(1);
    expect(sets[0]!.load!.total).toBe(135);
    // The 155 lb input is kept as the next row (a new identity), no longer marked as submitted.
    const rows = rowsOf(s.id, 'squat', deps);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.load!.total).toBe(155);
    expect(rows[0]!.id).not.toBe('A');
    expect(rows[0]!.submitted).toBeUndefined();
    // Startup reconciliation agrees (the receipt says what was saved).
    await reconcileSession(s.id, deps);
    expect(rowsOf(s.id, 'squat', deps).map((d) => d?.load?.total)).toEqual([155]);
  });

  it('a stale copy of the conflicting input at the same revision is kept by the view\'s reconcile too', async () => {
    const s = await workout();
    await logSet({ id: 'A', sessionId: s.id, exerciseId: 'squat', reps: 5, load: olympic135, rev: 1 }, db);
    const deps: Deps = { db, storage: phone().storage(), queue: createLogQueue(), makeId };
    saveDraft(s.id, rowKey('squat', 0), { id: 'A', load: bar155, plates: [55], reps: 5, rev: 1 }, deps.storage);
    await reconcileSession(s.id, deps);
    expect(rowsOf(s.id, 'squat', deps).map((d) => d?.load?.total)).toEqual([155]);
  });

  it('the same input again (a real duplicate) is one set, used up, acknowledged once', async () => {
    const s = await workout();
    const deps: Deps = { db, storage: phone().storage(), queue: createLogQueue(), makeId };
    const mine: Draft = { id: 'A', load: olympic135, plates: [45], reps: 5, rev: 1, submitted: 1 };
    writeDrafts(s.id, slotChanges('squat', [], [mine]), deps.storage);
    let landed = 0;
    expect(await submitRow(s.id, 'squat', mine, { ...deps, onLanded: () => landed++ })).toBe(true);
    writeDrafts(s.id, slotChanges('squat', [], [mine]), deps.storage);
    expect(await submitRow(s.id, 'squat', mine, { ...deps, onLanded: () => landed++ })).toBe(true);
    expect(await setsOf(s.id, db)).toHaveLength(1);
    expect(rowsOf(s.id, 'squat', deps)).toEqual([]);
    expect(landed).toBe(2);
    expect((await committedOf(s.id, db)).get('A')).toBe(1);
  });

  it('the same total on another bar is a conflict, not the same set', async () => {
    const s = await workout();
    const womens135 = barbellLoad(35, [50], 'none', 'lb', 'womens')!;
    expect(womens135.total).toBe(135);
    await logSet({ id: 'A', sessionId: s.id, exerciseId: 'squat', reps: 5, load: olympic135, rev: 1 }, db);
    const deps: Deps = { db, storage: phone().storage(), queue: createLogQueue(), makeId };
    const mine: Draft = { id: 'A', load: womens135, plates: [50], reps: 5, rev: 1, submitted: 1 };
    writeDrafts(s.id, slotChanges('squat', [], [mine]), deps.storage);
    let landed = 0;
    await submitRow(s.id, 'squat', mine, { ...deps, onLanded: () => landed++ });
    expect(landed).toBe(0);
    expect(rowsOf(s.id, 'squat', deps).map((d) => d?.load?.barId)).toEqual(['womens']);
  });

  it('an unreadable receipt never clears the row or acknowledges it', async () => {
    const s = await workout();
    const deps: Deps = { db, storage: phone().storage(), queue: createLogQueue(), makeId };
    const mine: Draft = { id: 'A', load: olympic135, plates: [45], reps: 5, rev: 1, submitted: 1 };
    writeDrafts(s.id, slotChanges('squat', [], [mine]), deps.storage);
    const get = db.submissions.get.bind(db.submissions);
    let calls = 0;
    // logSet's own read (inside its transaction) works; the receipt read after it fails.
    (db.submissions as unknown as { get: unknown }).get = (k: string) => (calls++ === 0 ? get(k) : Promise.reject(new Error('read')));
    let landed = 0;
    await submitRow(s.id, 'squat', mine, { ...deps, onLanded: () => landed++ });
    (db.submissions as unknown as { get: unknown }).get = get;
    expect(landed).toBe(0);
    // Still there, still marked: the next reconcile against the committed receipts uses it up.
    expect(rowsOf(s.id, 'squat', deps)[0]!.submitted).toBe(1);
    await reconcileSession(s.id, deps);
    expect(rowsOf(s.id, 'squat', deps)).toEqual([]);
    expect(await setsOf(s.id, db)).toHaveLength(1);
  });
});

describe('2.0l (2): Remove exercise, Undo, then Finish at once keeps every set', () => {
  it('three squat sets removed with the exercise; Undo then Finish: all four sets saved, same ids, order and loads', async () => {
    const s = await workout();
    await logSet({ id: 'b1', sessionId: s.id, exerciseId: 'bench', reps: 8, load: olympic135 }, db);
    for (const [i, id] of ['q1', 'q2', 'q3'].entries()) await logSet({ id, sessionId: s.id, exerciseId: 'squat', reps: 5 + i, load: bar155 }, db);
    const before = await setsOf(s.id, db);
    const m = deletesFor(s.id, db);
    const squat = before.filter((x) => x.exerciseId === 'squat');
    for (const x of squat) await m.remove(x, { hold: true });
    const at = await removeExercise(s.id, 'squat', db);
    m.release(squat.map((x) => x.id));
    // Undo, and Finish in the same moment (the screen's finishNow: close, then finish).
    const undo = m.undoAll(
      squat.map((x) => x.id),
      () => restoreExercise(s.id, 'squat', at, db),
    );
    await m.close();
    const result = await finishWorkout(s.id, db, 9000, undefined, ownedDeletes(s.id));
    await undo;
    disposeDeletes(s.id);
    expect(result).toMatchObject({ saved: true, sets: 4 });
    const after = await setsOf(s.id, db);
    expect(after.map((x) => [x.id, x.order, x.reps, x.load?.total])).toEqual(before.map((x) => [x.id, x.order, x.reps, x.load?.total]));
    expect((await db.sessions.get(s.id))!.exerciseIds).toContain('squat');
    expect(await db.tombstones.count()).toBe(0);
  });
});

describe('2.0l (6): a discarded correction never returns after Finish then Undo', () => {
  const ls = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
  };
  it('tab B holds a 155 lb correction in memory; tab A discards it, finishes, undoes: B shows nothing and Retry keeps 135', async () => {
    const s = await workout();
    await logSet({ id: 'a', sessionId: s.id, exerciseId: 'squat', reps: 5, load: olympic135 }, db);
    const phoneLs = ls();
    const B = await tab();
    // B's journal write fails: the correction is held in B's memory, the fallback and IndexedDB kv.
    const put = B.journal.put.bind(B.journal);
    (B.journal as unknown as { put: unknown }).put = () => Promise.reject(new Error('journal'));
    await expect(saveMutation(s.id, 'squat', { kind: 'edit', setId: 'a', change: { reps: 5, load: bar155 } }, B, 2000, phoneLs)).rejects.toThrow('journal');
    (B.journal as unknown as { put: unknown }).put = put;
    const shown = await pendingMutations(s.id, db, phoneLs);
    expect(shown).toHaveLength(1);
    // A: "Finish without it" for exactly what was shown, then Finish, then Undo on Today.
    await dropMutations(s.id, db, shown.map((e) => e.id), phoneLs);
    await expect(finishWorkout(s.id, db, 5000, undefined, undefined, phoneLs)).resolves.toMatchObject({ saved: true });
    expect(await reopenWorkout(s.id, undefined, db)).toBe(true);
    // B still has its memory copy, but the discard receipt hides it.
    expect(await pendingMutations(s.id, B, phoneLs)).toEqual([]);
    expect(await retryMutations(s.id, B, phoneLs)).toBe(true);
    expect((await db.sets.get('a'))!.load!.total).toBe(135);
  });
});
