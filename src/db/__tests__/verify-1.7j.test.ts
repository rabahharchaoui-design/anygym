// PLAN 1.7j: the Codex 1025 findings that touch the database, each reproduced first.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnyGymDB } from '../schema';
import type { Load } from '../types';
import { choosePlan, getPlanState, setNextDay } from '../planState';
import { deleteSet, finishWorkout, logSet, setsOf, startPlanDay, startWorkout, updateSetType, WorkoutFinishedError } from '../workouts';
import { createLogQueue } from '../../lib/logQueue';
import { saveDraft, writeDrafts, type Draft } from '../../lib/drafts';
import { UndoUnresolvedError } from '../../lib/deleteUndo';
import { markSubmitted, pendingRows, rowKey, slotChanges } from '../../lib/setTable';
import { dayWorkout } from '../../lib/planWorkout';
import { planById } from '../../data/plans';
import { failedRows, prepareFinish, reconcileSession, rowsOf, submitRow, type Deps } from '../../screens/workout/rowLog';
import { deletesFor, disposeDeletes, recoverSession } from '../../screens/workout/sessionRecovery';

let name: string;
let db: AnyGymDB;
let n = 0;
beforeEach(async () => {
  name = `anygym-1-7j-${n++}`;
  db = new AnyGymDB(name);
  await db.open();
});
afterEach(async () => {
  db.close();
  await new AnyGymDB(name).delete();
});

const bar = (total: number): Load => ({ kind: 'barbell', unit: 'lb', total, barWeight: 45, perSide: [(total - 45) / 2], collars: 0 });
const b135 = bar(135);

describe('(2) choosing the plan already in use changes nothing', () => {
  it('Codex 0635 #5: week, next day, done marks and partial rings stay byte for byte', async () => {
    await choosePlan('six-week-volume', db, 1000);
    await setNextDay(2, db);
    const progressed = { ...(await getPlanState(db))!, weekIndex: 3, doneDays: [0, 1], partial: { 2: 0.5 } };
    await db.planState.put(progressed);
    expect(await choosePlan('six-week-volume', db, 9000)).toEqual(progressed);
    expect(await getPlanState(db)).toEqual(progressed);
    // Two at once (a double tap, two stale screens): still nothing reset.
    await Promise.all([choosePlan('six-week-volume', db, 9100), choosePlan('six-week-volume', db, 9200)]);
    expect(await getPlanState(db)).toEqual(progressed);
    // Another plan still starts over.
    expect(await choosePlan('five-day-split', db, 9300)).toEqual({ id: 'active', planId: 'five-day-split', startedAt: 9300, weekIndex: 0, nextDayIndex: 0, doneDays: [] });
  });
});

describe('(3) warm ups never complete a plan day', () => {
  it('a lift done only as warm ups leaves the day partial; its working sets complete it', async () => {
    await choosePlan('five-day-split', db, 1);
    const s = await startPlanDay('g', 'five-day-split', 0, db, 10);
    const lifts = dayWorkout(planById('five-day-split')!, 0, 0).filter((e) => !e.warmup && !e.finisher);
    let k = 0;
    for (const e of lifts) for (let i = 0; i < e.sets; i++) await logSet({ id: `s${k++}`, sessionId: s.id, exerciseId: e.exerciseId, reps: 8, load: b135, kind: e === lifts[0] ? 'warmup' : 'work' }, db);
    const r = await finishWorkout(s.id, db, 20);
    expect(r.saved && r.progress?.complete).toBe(false);
    expect(r.saved && r.progress?.done).toBe(lifts.length - 1);
  });
});

describe('(5) set type changes and Finish', () => {
  it('Codex 0705 #3: a type change after Finish is refused by the database; the saved workout keeps what Finish counted', async () => {
    const s = await startWorkout('g', db, 1);
    await logSet({ id: 'a', sessionId: s.id, exerciseId: 'squat', reps: 8, load: b135 }, db);
    await finishWorkout(s.id, db, 2);
    await expect(updateSetType('a', 'warmup', false, db)).rejects.toBeInstanceOf(WorkoutFinishedError);
    expect((await setsOf(s.id, db))[0]!.kind).toBe('work');
  });

  it('a type change already running when Finish starts lands before the sets are counted; one tried after is refused', async () => {
    const s = await startWorkout('g', db, 1);
    await logSet({ id: 'a', sessionId: s.id, exerciseId: 'squat', reps: 8, load: b135 }, db);
    const queue = createLogQueue();
    let open!: () => void;
    const gate = new Promise<void>((r) => (open = r));
    const change = queue.mutate(s.id, () => gate.then(() => updateSetType('a', 'warmup', false, db)))!;
    let prepared = false;
    const finish = prepareFinish(s.id, { db, storage: null, queue }).then((f) => ((prepared = true), f));
    await new Promise((r) => setTimeout(r, 20));
    expect(prepared).toBe(false); // waits for the running change
    expect(queue.mutate(s.id, () => updateSetType('a', 'drop', false, db))).toBeNull(); // closed
    open();
    await change;
    expect(await finish).toEqual([]);
    expect((await setsOf(s.id, db))[0]!.kind).toBe('warmup');
  });
});

/** localStorage over a Map that outlives the "process"; `fail` makes every write throw (full). */
function phone() {
  const disk = new Map<string, string>();
  const state = { fail: false };
  const storage = () => ({
    getItem: (k: string) => disk.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (state.fail) throw new DOMException('full', 'QuotaExceededError');
      disk.set(k, v);
    },
    removeItem: (k: string) => {
      if (state.fail) throw new DOMException('full', 'QuotaExceededError');
      disk.delete(k);
    },
  });
  return { disk, state, storage };
}

let ids = 0;
const makeId = () => `j-${++ids}`;

function tap(sessionId: string, exerciseId: string, slot: number, deps: Deps): Draft {
  const before = rowsOf(sessionId, exerciseId, deps);
  const rows = pendingRows({ count: Math.max(1, before.length), logged: [], progression: undefined, draftOf: (i) => before[i] ?? null, rebuild: (p) => p, carry: () => null, certain: null, defaultType: 'normal' });
  const r = rows[slot]!;
  const marked = markSubmitted(before, rows, slot, { load: r.load!, reps: r.reps, type: r.type }, makeId);
  writeDrafts(sessionId, slotChanges(exerciseId, before, marked.slots), deps.storage);
  return marked.draft;
}

describe('(4) the successor of a row edited during its write', () => {
  it('Codex 0705 #2: edit 10 → 12 during the write, mirrors fail, the successor saves, restart: exactly [10, 12], nothing to log again', async () => {
    const p = phone();
    let deps: Deps = { db, storage: p.storage(), queue: createLogQueue(), makeId };
    const s = await startWorkout('g', db);
    writeDrafts(s.id, slotChanges('squat', [], [{ id: 'a', load: b135, plates: [45], reps: 10, rev: 1 }]), deps.storage);
    const submitted = tap(s.id, 'squat', 0, deps);
    // Edited while the write runs (this edit reaches storage) ...
    saveDraft(s.id, rowKey('squat', 0), { ...submitted, reps: 12, rev: 2 }, deps.storage);
    // ... then storage starts refusing every write: the successor lives in memory only.
    p.state.fail = true;
    expect(await submitRow(s.id, 'squat', submitted, deps)).toBe(true);
    const kept = rowsOf(s.id, 'squat', deps);
    expect(kept.map((d) => [d?.reps, d?.submitted])).toEqual([[12, undefined]]);
    expect(await submitRow(s.id, 'squat', tap(s.id, 'squat', 0, deps), deps)).toBe(true);
    expect((await setsOf(s.id, db)).map((x) => x.reps)).toEqual([10, 12]);

    // Restart: memory gone, storage still holds the stale { a, rev 2, submitted 1 }.
    db.close();
    db = new AnyGymDB(name);
    await db.open();
    p.state.fail = false;
    deps = { db, storage: p.storage(), queue: createLogQueue(), makeId };
    await reconcileSession(s.id, deps);
    expect(rowsOf(s.id, 'squat', deps)).toEqual([]);
    expect(await failedRows(s.id, deps)).toEqual([]);
    expect((await setsOf(s.id, db)).map((x) => x.reps)).toEqual([10, 12]);
  });
});

describe('(8) an unresolved Undo lives at workout level', () => {
  it('Codex 0635 #1: failed Undo → minimize → resume: still unresolved, never expired, Finish refused until restored', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const s = await startWorkout('g', db, 1);
      await logSet({ id: 'a', sessionId: s.id, exerciseId: 'squat', reps: 8, load: b135 }, db);
      await logSet({ id: 'b', sessionId: s.id, exerciseId: 'squat', reps: 8, load: b135 }, db);
      const set = (await setsOf(s.id, db))[1]!;
      const first = deletesFor(s.id, db);
      await first.remove(set);
      // Accepting the Undo fails (IndexedDB refuses the tombstone update).
      const fail = () => {
        throw new Error('synthetic accept failure');
      };
      db.tombstones.hook('updating', fail);
      await expect(first.undo('b')).rejects.toThrow('synthetic accept failure');
      db.tombstones.hook('updating').unsubscribe(fail);
      // Minimize and resume: the screen asks for the workout's manager again.
      const again = deletesFor(s.id, db);
      expect(again).toBe(first);
      expect(again.unresolved()).toEqual(['b']);
      // Opening the workout after the window: the unaccepted tombstone is kept for the retry.
      await recoverSession(s.id, db, Date.now() + 60_000);
      expect(await db.tombstones.get('b')).toBeDefined();
      await expect(again.close()).rejects.toBeInstanceOf(UndoUnresolvedError);
      again.reopen();
      // Try again puts it back; then Finish can go on.
      expect(await again.undo('b')).toMatchObject({ id: 'b' });
      await expect(again.close()).resolves.toBeUndefined();
      expect((await finishWorkout(s.id, db, 2)).saved).toBe(true);
      expect((await setsOf(s.id, db)).map((x) => x.id)).toEqual(['a', 'b']);
      disposeDeletes(s.id);
      expect(deletesFor(s.id, db)).not.toBe(first);
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancelling stores the cancellation; a failed cancellation keeps Finish blocked', async () => {
    const s = await startWorkout('g', db, 1);
    await logSet({ id: 'a', sessionId: s.id, exerciseId: 'squat', reps: 8, load: b135 }, db);
    const set = (await setsOf(s.id, db))[0]!;
    const d = deletesFor(s.id, db);
    await d.remove(set);
    const fail = () => {
      throw new Error('synthetic');
    };
    db.tombstones.hook('updating', fail);
    await expect(d.undo('a')).rejects.toThrow();
    db.tombstones.hook('updating').unsubscribe(fail);
    const failDelete = () => {
      throw new Error('synthetic delete');
    };
    db.tombstones.hook('deleting', failDelete);
    await expect(d.cancel('a')).rejects.toThrow();
    db.tombstones.hook('deleting').unsubscribe(failDelete);
    expect(deletesFor(s.id, db).unresolved()).toEqual(['a']);
    await d.cancel('a');
    await expect(d.close()).resolves.toBeUndefined();
    expect(await db.tombstones.get('a')).toBeUndefined();
    disposeDeletes(s.id);
  });

  it('deleteSet still writes its tombstone in one transaction (unchanged)', async () => {
    const s = await startWorkout('g', db, 1);
    await logSet({ id: 'x', sessionId: s.id, exerciseId: 'squat', reps: 8, load: b135 }, db);
    await deleteSet('x', db, 5);
    expect(await db.tombstones.get('x')).toMatchObject({ id: 'x', expiresAt: 5 + 5000 });
  });
});
