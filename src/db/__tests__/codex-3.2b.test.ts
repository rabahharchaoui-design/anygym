// PLAN 3.2b: Codex carry over (reports/codex/bughunt-1105-1756-saving.md). Each case failed before
// its fix. Synthetic data only. Cross tab cases use two connections (and, for drafts, two module
// instances) on one fake IndexedDB, as in codex-2.0l.test.ts and drafts-2.0l.test.ts.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnyGymDB } from '../schema';
import { makeGym } from '../gyms';
import { finishWorkout, logSet, removeExercise, reopenWorkout, setsOf, startWorkout, addExercise } from '../workouts';
import { dropMutations, pendingMutations, saveMutation } from '../mutations';
import { exportBackup } from '../backup';
import { deletesFor, disposeDeletes } from '../../screens/workout/sessionRecovery';
import { barbellLoad } from '../../lib/load';
import { writeDrafts, type Draft } from '../../lib/drafts';
import { createLogQueue } from '../../lib/logQueue';
import { slotChanges } from '../../lib/setTable';
import { discardFailed, failedRows, retryFailed, rowsOf, submitRow, type Deps } from '../../screens/workout/rowLog';
import type { Load } from '../types';

const olympic135 = barbellLoad(45, [45], 'none', 'lb', 'olympic')!;
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
  name = `anygym-3.2b-${n++}`;
  db = await tab();
});
afterEach(async () => {
  for (const d of opened.splice(0)) d.close();
  await new AnyGymDB(name).delete();
});

const ls = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};
let ids = 0;
const makeId = () => `r-${++ids}`;
async function workout() {
  await db.gyms.add({ ...makeGym({ name: 'G', type: 'full', unit: 'lb', isActive: true }, 1), id: 'g' });
  return startWorkout('g', db, 1000);
}
const fail = (table: object, method: string, when: (...a: unknown[]) => boolean = () => true) => {
  const t = table as Record<string, (...a: unknown[]) => Promise<unknown>>;
  const real = t[method]!.bind(table);
  t[method] = (...a: unknown[]) => (when(...a) ? Promise.reject(new Error(`${method} failed`)) : real(...a));
  return () => void (t[method] = real);
};

describe('3.2b (1): Finish never interrupts an exercise removal', () => {
  it('Finish during a removal waits for it: every set and the exercise go, nothing is lost', async () => {
    const s = await workout();
    await addExercise(s.id, 'bench', db);
    for (const [i, id] of ['q1', 'q2', 'q3'].entries()) await logSet({ id, sessionId: s.id, exerciseId: 'squat', reps: 5 + i, load: bar155 }, db);
    await logSet({ id: 'b1', sessionId: s.id, exerciseId: 'bench', reps: 8, load: olympic135 }, db);
    const own = (await setsOf(s.id, db)).filter((x) => x.exerciseId === 'squat');
    const m = deletesFor(s.id, db);
    const removal = m.removeAll(own, () => removeExercise(s.id, 'squat', db));
    await m.close(); // Finish, in the same moment
    expect(await removal).toHaveLength(3);
    expect((await setsOf(s.id, db)).map((x) => x.id)).toEqual(['b1']);
    disposeDeletes(s.id);
  });

  it('a removal that fails after Finish closed the manager is rolled back: every set is back', async () => {
    const s = await workout();
    for (const [i, id] of ['q1', 'q2', 'q3'].entries()) await logSet({ id, sessionId: s.id, exerciseId: 'squat', reps: 5 + i, load: bar155 }, db);
    const before = await setsOf(s.id, db);
    const m = deletesFor(s.id, db);
    let calls = 0;
    const undo = fail(db.tombstones, 'put', () => ++calls === 3);
    const removal = m.removeAll(before, () => removeExercise(s.id, 'squat', db));
    const closing = m.close().catch(() => undefined);
    await expect(removal).rejects.toThrow();
    await closing;
    undo();
    expect((await setsOf(s.id, db)).map((x) => [x.id, x.order, x.reps])).toEqual(before.map((x) => [x.id, x.order, x.reps]));
    disposeDeletes(s.id);
  });
});

describe('3.2b (2): logging never overwrites another tab\'s pending set with a higher revision', () => {
  const lb = (total: number): Load => ({ kind: 'single', unit: 'lb', total });
  const row = (id: string, total: number, reps: number, rev: number): Draft => ({ id, load: lb(total), reps, rev });
  it('IndexedDB holds pending Y (73 x 19, rev 1); a stale clean X (53 x 7, rev 5) in this slot does not replace it', async () => {
    const disk = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => disk.get(k) ?? null, setItem: (k: string, v: string) => void disk.set(k, v), removeItem: (k: string) => void disk.delete(k) });
    try {
      vi.resetModules();
      const drafts = await import('../../lib/drafts');
      const { db: d2 } = await import('../schema');
      await d2.kv.clear();
      disk.set('anygym-drafts', JSON.stringify({ s: { 'ex@0': row('x', 53, 7, 5) } }));
      expect(drafts.loadDraft('s', 'ex@0')!.reps).toBe(7);
      expect(drafts.sessionDrafts('s').size).toBe(1);
      await d2.kv.put({ key: 'anygym-drafts', value: JSON.stringify({ s: { 'ex@0': row('y', 73, 19, 1) } }), at: 1 });
      const merge = drafts.draftsDurableMerge()!;
      await d2.transaction('rw', d2.kv, () => merge(d2.kv));
      const stored = JSON.parse((await d2.kv.get('anygym-drafts'))!.value!) as Record<string, Record<string, Draft>>;
      expect(stored.s!['ex@0']).toMatchObject({ id: 'y', reps: 19 });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('3.2b (3): a legacy receipt never acknowledges values never saved', () => {
  it('10 reps saved under a receipt with no fingerprint; submitting 19 under that id and rev is a conflict, kept as the next row', async () => {
    const s = await workout();
    await logSet({ id: 'A', sessionId: s.id, exerciseId: 'squat', reps: 10, load: olympic135, rev: 1 }, db);
    const sub = (await db.submissions.get('A'))!;
    const { fp: _fp, ...legacy } = sub;
    await db.submissions.put(legacy);
    const deps: Deps = { db, storage: ls(), queue: createLogQueue(), makeId };
    const mine: Draft = { id: 'A', load: olympic135, plates: [45], reps: 19, rev: 1, submitted: 1 };
    writeDrafts(s.id, slotChanges('squat', [], [mine]), deps.storage);
    let landed = 0;
    await submitRow(s.id, 'squat', mine, { ...deps, onLanded: () => landed++ });
    expect(landed).toBe(0);
    expect((await setsOf(s.id, db)).map((x) => x.reps)).toEqual([10]);
    const rows = rowsOf(s.id, 'squat', deps);
    expect(rows.map((d) => d?.reps)).toEqual([19]);
    expect(rows[0]!.submitted).toBeUndefined();
  });

  it('the same values under a legacy receipt are still one set, acknowledged', async () => {
    const s = await workout();
    await logSet({ id: 'A', sessionId: s.id, exerciseId: 'squat', reps: 10, load: olympic135, rev: 1 }, db);
    const { fp: _fp, ...legacy } = (await db.submissions.get('A'))!;
    await db.submissions.put(legacy);
    const deps: Deps = { db, storage: ls(), queue: createLogQueue(), makeId };
    const mine: Draft = { id: 'A', load: olympic135, plates: [45], reps: 10, rev: 1, submitted: 1 };
    writeDrafts(s.id, slotChanges('squat', [], [mine]), deps.storage);
    let landed = 0;
    await submitRow(s.id, 'squat', mine, { ...deps, onLanded: () => landed++ });
    expect(landed).toBe(1);
    expect(rowsOf(s.id, 'squat', deps)).toEqual([]);
  });
});

describe('3.2b (4): Finish keeps mutation identities', () => {
  it('after Finish then Undo a new correction never gets an old operation id', async () => {
    const s = await workout();
    await logSet({ id: 'a', sessionId: s.id, exerciseId: 'squat', reps: 10, load: olympic135 }, db);
    const phoneLs = ls();
    const edit = (reps: number) => saveMutation(s.id, 'squat', { kind: 'edit', setId: 'a', change: { reps, load: olympic135 } }, db, Date.now(), phoneLs).catch(() => undefined);
    const heal = fail(db.sets, 'put');
    await edit(17);
    const first = (await pendingMutations(s.id, db, phoneLs)).map((e) => e.id);
    expect(first).toHaveLength(1);
    heal();
    await dropMutations(s.id, db, first, phoneLs);
    await expect(finishWorkout(s.id, db, 5000, undefined, undefined, phoneLs)).resolves.toMatchObject({ saved: true });
    expect(await reopenWorkout(s.id, undefined, db)).toBe(true);
    const heal2 = fail(db.sets, 'put');
    await edit(19);
    heal2();
    const second = (await pendingMutations(s.id, db, phoneLs)).map((e) => e.id);
    expect(second).toHaveLength(1);
    expect(second[0]).not.toBe(first[0]);
    // The stale discard of the first operation does not remove the newer one.
    await dropMutations(s.id, db, first, phoneLs);
    expect((await pendingMutations(s.id, db, phoneLs)).map((e) => e.id)).toEqual(second);
  });
});

describe('3.2b (5): a discard commits its receipt before any copy goes', () => {
  it('a failed receipt write keeps the held correction and reports the failure; a later discard works', async () => {
    const s = await workout();
    await logSet({ id: 'a', sessionId: s.id, exerciseId: 'squat', reps: 10, load: olympic135 }, db);
    const phoneLs = ls();
    const B = await tab();
    const heal = fail(B.journal, 'put');
    await expect(saveMutation(s.id, 'squat', { kind: 'edit', setId: 'a', change: { reps: 19, load: olympic135 } }, B, 2000, phoneLs)).rejects.toThrow('put failed');
    heal();
    const shown = await pendingMutations(s.id, db, phoneLs);
    expect(shown).toHaveLength(1);
    const unheal = fail(db.kv, 'put', (row) => String((row as { key: string }).key).startsWith('anygym-mutsup:'));
    await expect(dropMutations(s.id, db, shown.map((e) => e.id), phoneLs)).rejects.toThrow();
    unheal();
    expect(await pendingMutations(s.id, db, phoneLs)).toHaveLength(1);
    await dropMutations(s.id, db, shown.map((e) => e.id), phoneLs);
    expect(await pendingMutations(s.id, B, phoneLs)).toEqual([]);
  });
});

describe('3.2b (6): a discarded failed Log never returns through a stale tab', () => {
  it('A discards the failed Log; tab B, hydrated with the old draft, does not report it failed and Retry saves nothing', async () => {
    const s = await workout();
    const failedDraft: Draft = { id: 'A', load: olympic135, plates: [45], reps: 5, rev: 1, submitted: 1 };
    const sA = ls();
    const sB = ls();
    for (const st of [sA, sB]) writeDrafts(s.id, slotChanges('squat', [], [failedDraft]), st);
    await db.journal.put({ id: 'A', sessionId: s.id, exerciseId: 'squat', key: 'squat@0', rev: 1, draft: { ...failedDraft } as Record<string, unknown>, at: 1 });
    const depsA: Deps = { db, storage: sA, queue: createLogQueue(), makeId };
    expect(await failedRows(s.id, depsA)).toHaveLength(1);
    await discardFailed(s.id, depsA);
    expect(await failedRows(s.id, depsA)).toHaveLength(0);
    // Finish then Undo happened meanwhile; B wakes with its stale copy.
    const B = await tab();
    const depsB: Deps = { db: B, storage: sB, queue: createLogQueue(), makeId };
    expect(await failedRows(s.id, depsB)).toHaveLength(0);
    expect(await retryFailed(s.id, depsB)).toBe(true);
    expect(await setsOf(s.id, db)).toEqual([]);
  });
});

describe('3.2b (7): a backup never reactivates a superseded correction', () => {
  it('a newer edit lands between the held read and the table snapshot: the obsolete 17 rep correction is not exported', async () => {
    const s = await workout();
    await logSet({ id: 'a', sessionId: s.id, exerciseId: 'squat', reps: 10, load: olympic135 }, db);
    const phoneLs = ls();
    const heal = fail(db.journal, 'put');
    await expect(saveMutation(s.id, 'squat', { kind: 'edit', setId: 'a', change: { reps: 17, load: olympic135 } }, db, 2000, phoneLs)).rejects.toThrow();
    heal();
    expect(await pendingMutations(s.id, db, phoneLs)).toHaveLength(1);
    const real = db.transaction.bind(db) as (...a: unknown[]) => Promise<unknown>;
    let hooked = false;
    (db as unknown as { transaction: unknown }).transaction = async (...a: unknown[]) => {
      if (!hooked && a[0] === 'r') {
        hooked = true;
        await saveMutation(s.id, 'squat', { kind: 'edit', setId: 'a', change: { reps: 19, load: olympic135 } }, db, 3000, phoneLs);
      }
      return real(...a);
    };
    const backup = await exportBackup(db, 4000, phoneLs);
    (db as unknown as { transaction: unknown }).transaction = real;
    expect(backup.tables.sets.find((x) => x.id === 'a')!.reps).toBe(19);
    expect(backup.pendingChanges ?? []).toEqual([]);
  });
});
