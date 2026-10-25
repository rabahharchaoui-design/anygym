import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnyGymDB } from '../../../db/schema';
import type { Load } from '../../../db/types';
import { deleteSet, finishWorkout, getActiveSession, logSet, restoreSet, setsOf, startWorkout } from '../../../db/workouts';
import { loadDraft, saveDraft, writeDrafts, type Draft } from '../../../lib/drafts';
import { createLogQueue } from '../../../lib/logQueue';
import { markSubmitted, pendingRows, rowKey, slotChanges } from '../../../lib/setTable';
import { committedOf, discardFailed, failedRows, migrateLegacyRows, prepareFinish, reconcileSession, retryFailed, rowsOf, submitRow, type Deps } from '../rowLog';

// PLAN 1.7h (1), (2), (3), (9): pending rows with stable ids, persisted before the write, the set
// and its submission committed together, startup reconciliation, Finish never dropping a failed set.

const bar = (total: number): Load => ({ kind: 'barbell', unit: 'lb', total, barWeight: 45, perSide: [(total - 45) / 2] });
const b135 = bar(135);

let name: string;
let db: AnyGymDB;
let n = 0;
beforeEach(async () => {
  name = `anygym-rowlog-${n++}`;
  db = new AnyGymDB(name);
  await db.open();
});
afterEach(async () => {
  db.close();
  await new AnyGymDB(name).delete();
});

/** localStorage over a Map that outlives the "process": a new object = drafts memory lost (a kill). */
function phone() {
  const disk = new Map<string, string>();
  const storage = () => ({
    getItem: (k: string) => disk.get(k) ?? null,
    setItem: (k: string, v: string) => void disk.set(k, v),
    removeItem: (k: string) => void disk.delete(k),
  });
  return { disk, storage };
}

let ids = 0;
const makeId = () => `row-${++ids}`;

/** The app after a kill: storage memory dropped, the database reopened, a fresh queue. */
async function relaunch(p: ReturnType<typeof phone>): Promise<Deps> {
  db.close();
  db = new AnyGymDB(name);
  await db.open();
  return { db, storage: p.storage(), queue: createLogQueue(), makeId };
}

const draft = (id: string, reps: number, more: Partial<Draft> = {}): Draft => ({ id, load: b135, plates: [45], reps, rev: 1, ...more });

/** Stores the drafts of an exercise by slot. */
function seedRows(sessionId: string, exerciseId: string, rows: Array<Draft | null>, deps: Deps) {
  writeDrafts(sessionId, slotChanges(exerciseId, [], rows), deps.storage);
}

/** What the exercise view does on ✓: mark the row (and rows above) before the write. */
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

const repsOf = (rows: Array<Draft | null>) => rows.map((r) => r?.reps ?? null);

describe('PLAN 1.7h (2): a kill between the commit and the draft cleanup', () => {
  it('Codex 1219 (2): rows 7, 8, 19; row 3 committed, then killed: no draft lost, no duplicate set', async () => {
    const p = phone();
    let deps: Deps = { db, storage: p.storage(), queue: createLogQueue(), makeId };
    const s = await startWorkout('g', db);
    seedRows(s.id, 'squat', [draft('a', 7), draft('b', 8), draft('c', 19)], deps);
    const submitted = tap(s.id, 'squat', 2, deps);
    expect(loadDraft(s.id, rowKey('squat', 2), deps.storage)).toMatchObject({ id: 'c', submitted: 1 });
    // The write commits (set + submission in one transaction), then iOS kills the app before the
    // drafts are reconciled.
    await logSet({ id: submitted.id, sessionId: s.id, exerciseId: 'squat', reps: 19, load: b135, rev: submitted.submitted }, db);

    deps = await relaunch(p);
    expect(await db.submissions.get('c')).toEqual({ id: 'c', sessionId: s.id, exerciseId: 'squat', rev: 1 });
    await reconcileSession(s.id, deps);
    expect(repsOf(rowsOf(s.id, 'squat', deps))).toEqual([7, 8]); // the 7 rep draft is still the first row
    // Checking the next rows logs new sets; the 19 rep row can never be logged twice.
    expect(await submitRow(s.id, 'squat', tap(s.id, 'squat', 0, deps), deps)).toBe(true);
    expect(await submitRow(s.id, 'squat', submitted, deps)).toBe(true); // a stale retry of the same id
    expect((await setsOf(s.id, db)).map((x) => x.reps)).toEqual([19, 7]);
    expect(repsOf(rowsOf(s.id, 'squat', deps))).toEqual([8]);
    expect(await failedRows(s.id, deps)).toEqual([]);
  });

  it('edited after the tap and killed after the commit: the newer values stay as the next row', async () => {
    const p = phone();
    let deps: Deps = { db, storage: p.storage(), queue: createLogQueue(), makeId };
    const s = await startWorkout('g', db);
    seedRows(s.id, 'squat', [draft('a', 10), draft('b', 12)], deps);
    const submitted = tap(s.id, 'squat', 0, deps);
    saveDraft(s.id, rowKey('squat', 0), { ...submitted, reps: 11, rev: 2 }, deps.storage); // edited while the write runs
    await logSet({ id: 'a', sessionId: s.id, exerciseId: 'squat', reps: 10, load: b135, rev: 1 }, db);
    deps = await relaunch(p);
    await reconcileSession(s.id, deps);
    const rows = rowsOf(s.id, 'squat', deps);
    expect(repsOf(rows)).toEqual([11, 12]);
    expect(rows[0]!.id).not.toBe('a');
    expect(rows[0]!.submitted).toBeUndefined();
  });

  it('killed before the write committed: the row is still there, marked, and Finish refuses until it is saved', async () => {
    const p = phone();
    let deps: Deps = { db, storage: p.storage(), queue: createLogQueue(), makeId };
    const s = await startWorkout('g', db);
    seedRows(s.id, 'squat', [draft('a', 9)], deps);
    tap(s.id, 'squat', 0, deps);
    deps = await relaunch(p);
    const failed = await prepareFinish(s.id, deps);
    expect(failed.map((f) => [f.exerciseId, f.draft.id, f.draft.reps])).toEqual([['squat', 'a', 9]]);
    expect(await retryFailed(s.id, deps)).toBe(true);
    expect((await setsOf(s.id, db)).map((x) => [x.id, x.reps])).toEqual([['a', 9]]);
    expect(await prepareFinish(s.id, deps)).toEqual([]);
  });

  it('committedOf lists submissions and sets logged without one; legacy drafts move to their slot', async () => {
    const p = phone();
    const deps: Deps = { db, storage: p.storage(), queue: createLogQueue(), makeId };
    const s = await startWorkout('g', db);
    await logSet({ id: 'x', sessionId: s.id, exerciseId: 'squat', reps: 5, load: b135, rev: 3 }, db);
    await db.sets.put({ id: 'old', sessionId: s.id, exerciseId: 'squat', order: 9, kind: 'work', reps: 5, load: b135, uncertain: false });
    expect([...(await committedOf(s.id, db))].sort()).toEqual([
      ['old', undefined],
      ['x', 3],
    ]);
    // Before 1.7h: one draft under the exercise id, one keyed by set number (2 sets logged).
    writeDrafts(
      s.id,
      new Map([
        ['bench', draft('legacy', 11)],
        ['squat#3', draft('third', 6)],
        ['squat#0', draft('gone', 1)],
      ]),
      deps.storage,
    );
    migrateLegacyRows(s.id, 'bench', [], deps);
    migrateLegacyRows(s.id, 'squat', [{ id: 'x' }, { id: 'old' }], deps);
    expect(repsOf(rowsOf(s.id, 'bench', deps))).toEqual([11]);
    expect(repsOf(rowsOf(s.id, 'squat', deps))).toEqual([null, 6]);
    expect(loadDraft(s.id, 'bench', deps.storage)).toBeNull();
    expect(loadDraft(s.id, 'squat#0', deps.storage)).toBeNull();
  });
});

describe('PLAN 1.7h (1): Finish never discards a failed Log write', () => {
  /** A database whose writes fail (closed under the app). */
  async function broken(): Promise<AnyGymDB> {
    const b = new AnyGymDB(name);
    await b.open();
    b.close({ disableAutoOpen: true });
    return b;
  }

  it('Codex 1149 (1): the failed set keeps its draft, Finish refuses and the workout stays active', async () => {
    const p = phone();
    const queue = createLogQueue();
    const deps: Deps = { db, storage: p.storage(), queue, makeId };
    const s = await startWorkout('g', db);
    await logSet({ id: 'done', sessionId: s.id, exerciseId: 'bench', reps: 8, load: b135 }, db);
    seedRows(s.id, 'squat', [draft('a', 10)], deps);
    const marked = tap(s.id, 'squat', 0, deps);
    expect(await submitRow(s.id, 'squat', marked, { ...deps, db: await broken() })).toBe(false);

    const failed = await prepareFinish(s.id, deps);
    expect(failed).toHaveLength(1);
    expect(queue.closed(s.id)).toBe(false); // reopened: the user can log again
    expect(await getActiveSession(db)).toMatchObject({ id: s.id });
    expect(loadDraft(s.id, rowKey('squat', 0), deps.storage)).toMatchObject({ id: 'a', reps: 10, submitted: 1 });

    // Try again lands it; then Finish counts both sets.
    expect(await retryFailed(s.id, deps)).toBe(true);
    expect(await prepareFinish(s.id, deps)).toEqual([]);
    expect(await finishWorkout(s.id, db)).toMatchObject({ saved: true, sets: 2 });
  });

  it('a retry that fails again keeps it; "Finish without it" drops only the mark', async () => {
    const p = phone();
    const deps: Deps = { db, storage: p.storage(), queue: createLogQueue(), makeId };
    const s = await startWorkout('g', db);
    seedRows(s.id, 'squat', [draft('a', 10), { id: 'empty', load: null, reps: 5, submitted: 0 }], deps);
    tap(s.id, 'squat', 0, deps);
    const bad = { ...deps, db: await broken() };
    expect(await retryFailed(s.id, bad)).toBe(false);
    expect(await failedRows(s.id, deps)).toHaveLength(2);
    await discardFailed(s.id, deps);
    expect(await failedRows(s.id, deps)).toEqual([]);
    expect(loadDraft(s.id, rowKey('squat', 0), deps.storage)).toMatchObject({ id: 'a', reps: 10 });
    expect(loadDraft(s.id, rowKey('squat', 0), deps.storage)?.submitted).toBeUndefined();
    await discardFailed(s.id, deps); // nothing left: a no-op
  });

  it('Codex 1.7h review (2): two failed rows of one exercise are both retried by id, though the first landing shifts the slots', async () => {
    const p = phone();
    const deps: Deps = { db, storage: p.storage(), queue: createLogQueue(), makeId };
    const s = await startWorkout('g', db);
    seedRows(s.id, 'squat', [draft('a', 10, { submitted: 1 }), draft('b', 12, { submitted: 1 }), draft('c', 6)], deps);
    expect((await failedRows(s.id, deps)).map((f) => f.draft.id)).toEqual(['a', 'b']);
    expect(await retryFailed(s.id, deps)).toBe(true);
    expect((await setsOf(s.id, db)).map((x) => [x.id, x.reps])).toEqual([
      ['a', 10],
      ['b', 12],
    ]);
    expect(repsOf(rowsOf(s.id, 'squat', deps))).toEqual([6]);
    expect(await failedRows(s.id, deps)).toEqual([]);
  });

  it('retryFailed returns false while a failure remains (a row that cannot be logged)', async () => {
    const deps: Deps = { db, storage: phone().storage(), queue: createLogQueue(), makeId };
    const s = await startWorkout('g', db);
    seedRows(s.id, 'squat', [draft('a', 10, { submitted: 1 }), { id: 'empty', load: null, reps: 5, submitted: 0 }], deps);
    expect(await retryFailed(s.id, deps)).toBe(false);
    expect((await setsOf(s.id, db)).map((x) => x.id)).toEqual(['a']);
    expect((await failedRows(s.id, deps)).map((f) => f.draft.id)).toEqual(['empty']);
  });

  it('new logging is blocked synchronously once Finish starts', async () => {
    const p = phone();
    const deps: Deps = { db, storage: p.storage(), queue: createLogQueue(), makeId };
    const s = await startWorkout('g', db);
    seedRows(s.id, 'squat', [draft('a', 10)], deps);
    const finishing = prepareFinish(s.id, deps);
    expect(await submitRow(s.id, 'squat', tap(s.id, 'squat', 0, deps), deps)).toBe(false);
    expect(await setsOf(s.id, db)).toEqual([]);
    // The tapped row is listed as not saved, so Finish stops instead of dropping it.
    expect(await finishing).toHaveLength(1);
  });

  it('a row that cannot be logged (no load) never writes', async () => {
    const deps: Deps = { db, storage: phone().storage(), queue: createLogQueue(), makeId };
    const s = await startWorkout('g', db);
    expect(await submitRow(s.id, 'squat', { id: 'z', load: null, reps: 5 }, deps)).toBe(false);
    expect(await submitRow(s.id, 'plank', { id: 'y', load: { kind: 'timed', unit: 'lb', total: 0 } }, deps)).toBe(false);
  });

  it('prepareFinish reopens the queue when reading the drafts fails', async () => {
    const queue = createLogQueue();
    const s = await startWorkout('g', db);
    await expect(prepareFinish(s.id, { db: await broken(), storage: phone().storage(), queue, makeId })).rejects.toThrow();
    expect(queue.closed(s.id)).toBe(false);
  });
});

describe('PLAN 1.7h (3): delayed logging', () => {
  it('an edit made during the write is kept, and the next draft is moved, not overwritten', async () => {
    const deps: Deps = { db, storage: phone().storage(), queue: createLogQueue(), makeId };
    const s = await startWorkout('g', db);
    seedRows(s.id, 'squat', [draft('a', 10), draft('b', 12)], deps);
    const marked = tap(s.id, 'squat', 0, deps);
    let landedRan = 0;
    const pending = submitRow(s.id, 'squat', marked, { ...deps, onLanded: () => landedRan++ });
    // While IndexedDB writes, the user changes the submitted row to 17 reps.
    saveDraft(s.id, rowKey('squat', 0), { ...marked, reps: 17, rev: 2 }, deps.storage);
    expect(await pending).toBe(true);
    expect(landedRan).toBe(1);
    expect(repsOf(rowsOf(s.id, 'squat', deps))).toEqual([17, 12]);
    expect((await setsOf(s.id, db)).map((x) => x.reps)).toEqual([10]);
  });
});

describe('PLAN 1.7h (9): drafts stay on their rows through delete and Undo', () => {
  it('Codex 1149 (6): pending set 3 at 17 reps stays the current row when set 1 is deleted and put back', async () => {
    const deps: Deps = { db, storage: phone().storage(), queue: createLogQueue(), makeId };
    const s = await startWorkout('g', db);
    for (const id of ['s1', 's2']) await logSet({ id, sessionId: s.id, exerciseId: 'squat', reps: 10, load: b135 }, db);
    seedRows(s.id, 'squat', [draft('p', 17)], deps);
    const current = async () => {
      const logged = await setsOf(s.id, db);
      const slots = rowsOf(s.id, 'squat', deps);
      return pendingRows({ count: Math.max(3, logged.length + slots.length), logged, progression: undefined, draftOf: (i) => slots[i - logged.length] ?? null, rebuild: (x) => x, carry: () => null, certain: null, defaultReps: 10, defaultType: 'normal' })[0]!;
    };
    expect(await current()).toMatchObject({ index: 2, reps: 17 });
    const removed = (await deleteSet('s1', db))!;
    expect(await current()).toMatchObject({ index: 1, reps: 17 });
    await restoreSet(removed, db);
    expect(await current()).toMatchObject({ index: 2, reps: 17 });
  });
});
