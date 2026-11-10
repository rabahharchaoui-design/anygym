// PLAN 2.0k: Codex carry over. Group 6: reports/codex/2.0j.md (P1 1, 3, 4); drafts (6)/(3):
// src/lib/__tests__/drafts-2.0k.test.ts; UI (1), (4), (5): tests/codex-2.0k.spec.ts.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnyGymDB } from '../schema';
import { makeGym } from '../gyms';
import { finishWorkout, logSet, startWorkout, UnsavedWritesError } from '../workouts';
import { operationId, pendingMutations, retryMutations, saveMutation } from '../mutations';
import { MEMORY_PREFIX } from '../mutationFallback';
import { withSessionLock } from '../sessionLock';
import type { JournalEntry, Load, MutationIntent, WorkoutSet } from '../types';
import { writeDrafts } from '../../lib/drafts';
import { createLogQueue } from '../../lib/logQueue';
import { barbellLoad, singleLoad } from '../../lib/load';
import { blockedReason, pendingRows } from '../../lib/setTable';
import { confirmablePick, currentLoad } from '../../screens/workout/exerciseLoad';
import type { Draft } from '../../lib/drafts';
import type { Gym } from '../types';
import { rowKey } from '../../lib/setTable';
import { createDeleteUndo } from '../../lib/deleteUndo';
import { discardFailed, failedRows, rowsOf, shownRows, submitRow, type Deps } from '../../screens/workout/rowLog';
import { deletesFor, disposeDeletes } from '../../screens/workout/sessionRecovery';

const kb: Load = { kind: 'single', unit: 'lb', total: 53 };
const edit = (reps: number): MutationIntent => ({ kind: 'edit', setId: 'a', change: { reps, load: kb } });
const store = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), raw: m };
};
/** A localStorage whose reads work but whose writes are refused from now on. */
const stuck = (s: ReturnType<typeof store>) => ({
  getItem: s.getItem,
  setItem: () => {
    throw new Error('quota');
  },
  removeItem: () => {
    throw new Error('quota');
  },
});
/** The journal write fails for the calls `which` says (all by default). */
const failJournal = (d: AnyGymDB, which: (n: number) => boolean = () => true) => {
  const put = d.journal.put.bind(d.journal);
  let n = 0;
  (d.journal as unknown as { put: unknown }).put = (...a: Parameters<typeof put>) => (which(n++) ? Promise.reject(new Error('journal')) : put(...a));
  return () => void ((d.journal as unknown as { put: unknown }).put = put);
};
const repsOf = (list: { mutation?: MutationIntent }[]) => list.map((e) => (e.mutation as { change: { reps: number } }).change.reps);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

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
  name = `anygym-2.0k-${n++}`;
  db = await tab();
});
afterEach(async () => {
  vi.unstubAllGlobals();
  for (const d of opened.splice(0)) d.close();
  await new AnyGymDB(name).delete();
});
async function oneSet() {
  await db.gyms.add({ ...makeGym({ name: 'G', type: 'full', unit: 'lb', isActive: true }, 1), id: 'g' });
  const s = await startWorkout('g', db, 1000);
  await logSet({ id: 'a', sessionId: s.id, exerciseId: 'goblet', reps: 10, load: kb }, db);
  return s;
}

describe('group 6a: a held operation covers only operations registered before it', () => {
  it('two overlapping saves: the first lands, the second fails to journal: the second stays pending and Finish refuses', async () => {
    const s = await oneSet();
    const ls = store();
    const fix = failJournal(db, (i) => i === 1); // the first journal write works, the second fails
    const first = saveMutation(s.id, 'goblet', edit(17), db, 2000, ls);
    const second = saveMutation(s.id, 'goblet', edit(19), db, 2001, ls);
    await first;
    await expect(second).rejects.toThrow('journal');
    fix();
    expect((await db.sets.get('a'))!.reps).toBe(17);
    expect(repsOf(await pendingMutations(s.id, db, ls))).toEqual([19]);
    await expect(finishWorkout(s.id, db, 5000, undefined, undefined, ls)).rejects.toBeInstanceOf(UnsavedWritesError);
    expect(await retryMutations(s.id, db, ls)).toBe(true);
    expect((await db.sets.get('a'))!.reps).toBe(19);
  });
});

describe('group 6b: the covered held copies are stored with the journal entry', () => {
  it('apply fails after journaling 19 (covering a held 17 the fallback cannot drop); after a restart Retry writes the receipt: 19 stays', async () => {
    const s = await oneSet();
    const ls = store();
    const tabB = await tab();
    const fixB = failJournal(tabB);
    await expect(saveMutation(s.id, 'goblet', edit(17), tabB, 2000, ls)).rejects.toThrow('journal');
    fixB();
    // Tab A journals 19, but its set write fails, and its cleanup of the fallback is refused.
    const put = db.sets.put.bind(db.sets);
    (db.sets as unknown as { put: unknown }).put = () => Promise.reject(new Error('disk'));
    await expect(saveMutation(s.id, 'goblet', edit(19), db, 3000, stuck(ls))).rejects.toThrow();
    (db.sets as unknown as { put: unknown }).put = put;
    const stored = (await db.journal.toArray()).filter((j) => j.mutation) as JournalEntry[];
    expect(stored).toHaveLength(1);
    expect(stored[0]!.covers).toHaveLength(1);
    expect(stored[0]!.covers![0]!.startsWith(MEMORY_PREFIX)).toBe(true);
    // The held 17 is superseded already (covered by the stored entry): one pending change, 19.
    expect(repsOf(await pendingMutations(s.id, db, ls))).toEqual([19]);
    // Restart: fresh runtime, empty memory, the fallback still holds the 17.
    const fresh = await tab();
    expect(repsOf(await pendingMutations(s.id, fresh, stuck(ls)))).toEqual([19]);
    expect(await retryMutations(s.id, fresh, stuck(ls))).toBe(true);
    expect((await fresh.sets.get('a'))!.reps).toBe(19);
    // The 17 left in the fallback is superseded by receipt: never shown, never replayed.
    expect(ls.raw.get('anygym-pending-changes')).toContain('"reps":17');
    expect(await pendingMutations(s.id, fresh, ls)).toEqual([]);
    expect(await retryMutations(s.id, fresh, ls)).toBe(true);
    expect((await fresh.sets.get('a'))!.reps).toBe(19);
    await expect(finishWorkout(s.id, fresh, 5000, undefined, undefined, ls)).resolves.toMatchObject({ saved: true });
  });
});

describe('group 6d: Retry rechecks under the lock (bughunt 1659 #2, 1730 #4)', () => {
  it('Retry read a held 17, then a newer 19 lands before Retry gets the lock: 19 stays', async () => {
    const s = await oneSet();
    const ls = store();
    const fix = failJournal(db);
    await expect(saveMutation(s.id, 'goblet', edit(17), db, 2000, ls)).rejects.toThrow('journal');
    fix();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const held = withSessionLock(s.id, () => gate);
    const tabB = await tab();
    const newer = saveMutation(s.id, 'goblet', edit(19), tabB, 3000, ls); // another tab: waits for the lock first
    const retry = retryMutations(s.id, db, ls); // reads the 17 now, then waits for the lock
    await new Promise((r) => setTimeout(r, 30));
    release();
    await held;
    await newer;
    expect(await retry).toBe(true);
    expect((await db.sets.get('a'))!.reps).toBe(19);
    expect(await pendingMutations(s.id, db, ls)).toEqual([]);
  });
});

describe('2.2e (Codex 2.0k review #2): held corrections are ordered by predecessors, never by clocks', () => {
  it('both journal writes fail and the later tab has an earlier clock: Retry saves the later correction', async () => {
    const s = await oneSet();
    const ls = store();
    const tabB = await tab();
    const fixA = failJournal(db);
    const fixB = failJournal(tabB);
    await expect(saveMutation(s.id, 'goblet', edit(17), db, 5000, ls)).rejects.toThrow('journal'); // tab A, clock ahead
    await expect(saveMutation(s.id, 'goblet', edit(19), tabB, 1500, ls)).rejects.toThrow('journal'); // later, clock behind
    fixA();
    fixB();
    const held = await pendingMutations(s.id, db, ls);
    expect(repsOf(held)).toEqual([19, 17]); // by time 19 looks older
    const later = held.find((e) => repsOf([e])[0] === 19)!;
    const earlier = held.find((e) => repsOf([e])[0] === 17)!;
    // The later one stored its predecessor, also in the fallback (it survives a restart).
    expect(later.covers).toEqual([earlier.id]);
    expect(JSON.parse(ls.raw.get('anygym-pending-changes')!).find((e: JournalEntry) => e.id === later.id).covers).toEqual([earlier.id]);
    expect(await retryMutations(s.id, db, ls)).toBe(true);
    expect((await db.sets.get('a'))!.reps).toBe(19);
    expect(await pendingMutations(s.id, db, ls)).toEqual([]);
  });
});

describe('group 6c: held operation ids are globally unique, never clock plus counter', () => {
  it('two tabs failing at the same instant get distinct UUID ids; both stay pending and Retry saves one of them and covers the other', async () => {
    const s = await oneSet();
    const ls = store();
    const tabB = await tab();
    const fixA = failJournal(db);
    const fixB = failJournal(tabB);
    await expect(saveMutation(s.id, 'goblet', edit(17), db, 2000, ls)).rejects.toThrow('journal');
    await expect(saveMutation(s.id, 'goblet', edit(19), tabB, 2000, ls)).rejects.toThrow('journal');
    fixA();
    fixB();
    const held = await pendingMutations(s.id, db, ls);
    expect(held).toHaveLength(2);
    expect(new Set(held.map((e) => e.id)).size).toBe(2);
    for (const e of held) expect(e.id.split(':').pop()).toMatch(UUID);
    expect(await retryMutations(s.id, db, ls)).toBe(true);
    expect([17, 19]).toContain((await db.sets.get('a'))!.reps);
    expect(await pendingMutations(s.id, db, ls)).toEqual([]);
  });

  it('without crypto.randomUUID the fallback still makes valid distinct UUIDs', () => {
    vi.stubGlobal('crypto', { getRandomValues: (b: Uint8Array) => globalThis.Math && b.map((_, i) => (b[i] = Math.floor(Math.random() * 256))) });
    const a = operationId();
    const b = operationId();
    expect(a).toMatch(UUID);
    expect(b).toMatch(UUID);
    expect(a).not.toBe(b);
    vi.stubGlobal('crypto', undefined);
    expect(operationId()).toMatch(UUID);
  });
});

// ---------------------------------------------------------------------------------------------
// Group 7: reports/codex/bughunt-1102-1730-saving.md #1 to #3 (and bughunt-1102-1659-general.md #1).

const b135 = barbellLoad(45, [45], 'none', 'lb')!;
let idn = 0;
const makeId = () => `k-${++idn}`;
const rowDeps = (): Deps => ({ db, storage: store(), queue: createLogQueue(), makeId });
/** A row whose Log write fails: the draft is stored with its mark, then the set write is refused. */
async function failedLog(sessionId: string, exerciseId: string, id: string, reps: number, rev: number, deps: Deps) {
  const d = { id, load: b135, plates: [45], unit: 'lb' as const, reps, rev, submitted: rev };
  writeDrafts(sessionId, new Map([[rowKey(exerciseId, 0), d]]), deps.storage);
  const add = vi.spyOn(db.sets, 'add').mockRejectedValueOnce(new Error('disk'));
  expect(await submitRow(sessionId, exerciseId, d, deps)).toBe(false);
  add.mockRestore();
  return d;
}

describe('group 7a: "Finish without it" discards only the failed Logs the user was shown', () => {
  it('a failed Log made after the sheet opened stays failed, with its journal entry', async () => {
    const s = await oneSet();
    const deps = rowDeps();
    await failedLog(s.id, 'squat', 'r1', 5, 1, deps);
    const shown = shownRows(await failedRows(s.id, deps));
    expect(shown).toEqual([{ id: 'r1', submitted: 1, body: expect.any(String) }]);
    await failedLog(s.id, 'bench', 'r2', 8, 1, deps); // another tab, while the sheet is open
    await discardFailed(s.id, deps, shown);
    expect((await failedRows(s.id, deps)).map((f) => f.draft.id)).toEqual(['r2']);
    expect(await db.journal.get('r1')).toBeUndefined();
    expect(await db.journal.get('r2')).toMatchObject({ rev: 1 });
  });

  it('the same row submitted again at a newer revision after the sheet opened is not discarded', async () => {
    const s = await oneSet();
    const deps = rowDeps();
    await failedLog(s.id, 'squat', 'r1', 5, 1, deps);
    const shown = shownRows(await failedRows(s.id, deps));
    await failedLog(s.id, 'squat', 'r1', 6, 2, deps); // edited to 6 reps and tapped again: failed again
    await discardFailed(s.id, deps, shown);
    expect((await failedRows(s.id, deps)).map((f) => [f.draft.id, f.draft.reps, f.draft.submitted])).toEqual([['r1', 6, 2]]);
    expect(await db.journal.get('r1')).toMatchObject({ rev: 2 });
  });
});

describe('group 7b: a duplicate Log never acknowledges a revision it did not save', () => {
  it('another tab logged 17 reps under the same id first: the 19 reps tap keeps 19 as the next row, no landed callback', async () => {
    const s = await oneSet();
    const deps = rowDeps();
    await logSet({ id: 'd1', sessionId: s.id, exerciseId: 'squat', reps: 17, load: b135, rev: 2 }, db);
    const d = { id: 'd1', load: b135, plates: [45], unit: 'lb' as const, reps: 19, rev: 3, submitted: 3 };
    writeDrafts(s.id, new Map([[rowKey('squat', 0), d]]), deps.storage);
    let landed = 0;
    expect(await submitRow(s.id, 'squat', d, { ...deps, onLanded: () => landed++ })).toBe(true);
    expect((await db.sets.get('d1'))!.reps).toBe(17);
    const rows = rowsOf(s.id, 'squat', deps);
    expect(rows[0]).toMatchObject({ reps: 19, rev: 3 });
    expect(rows[0]!.id).not.toBe('d1');
    expect(rows[0]!.submitted).toBeUndefined();
    expect(landed).toBe(0);
  });

  it('the same revision committed (a plain double tap) is used up as before', async () => {
    const s = await oneSet();
    const deps = rowDeps();
    const d = { id: 'd2', load: b135, plates: [45], unit: 'lb' as const, reps: 9, rev: 1, submitted: 1 };
    writeDrafts(s.id, new Map([[rowKey('squat', 0), d]]), deps.storage);
    await logSet({ id: 'd2', sessionId: s.id, exerciseId: 'squat', reps: 9, load: b135, rev: 1 }, db);
    expect(await submitRow(s.id, 'squat', d, deps)).toBe(true);
    expect(rowsOf(s.id, 'squat', deps)).toEqual([]);
  });
});

describe('group 7c: removing an exercise is one undoable operation', () => {
  type Item = { id: string };
  const manager = (log: string[], ms = 100) =>
    createDeleteUndo<Item>(
      {
        remove: async (x) => void log.push(`remove ${x.id}`),
        accept: async (x) => void log.push(`accept ${x.id}`),
        restore: async (x) => void log.push(`restore ${x.id}`),
        expire: async (x) => void log.push(`expire ${x.id}`),
      },
      ms,
    );
  afterEach(() => vi.useRealTimers());

  it('held sets never expire while they are being deleted; the shared window starts when Undo shows; all accepted before any restore', async () => {
    vi.useFakeTimers();
    const log: string[] = [];
    const m = manager(log);
    await m.remove({ id: 'a' }, { hold: true });
    await vi.advanceTimersByTimeAsync(500); // a slow delete of the next set: far past one window
    await m.remove({ id: 'b' }, { hold: true });
    expect(m.canUndoAll(['a', 'b'])).toBe(true);
    m.release(['a', 'b']);
    await vi.advanceTimersByTimeAsync(90);
    expect(await m.undoAll(['a', 'b'])).toEqual([{ id: 'a' }, { id: 'b' }]);
    expect(log).toEqual(['remove a', 'remove b', 'accept a', 'accept b', 'restore a', 'restore b']);
  });

  it('once a member can no longer come back, Undo is not offered and nothing is restored (never a partial Undo)', async () => {
    vi.useFakeTimers();
    const log: string[] = [];
    const m = manager(log);
    await m.remove({ id: 'a' }, { hold: true });
    await m.remove({ id: 'b' }, { hold: true });
    m.release(['a']);
    m.release(['b'], 1000);
    await vi.advanceTimersByTimeAsync(150);
    expect(m.canUndoAll(['a', 'b'])).toBe(false);
    expect(await m.undoAll(['a', 'b'])).toBeUndefined();
    expect(log.filter((l) => l.startsWith('restore'))).toEqual([]);
  });

  it('a member that fails to come back leaves every member not back unresolved (Finish refuses), none expires', async () => {
    vi.useFakeTimers();
    const m = createDeleteUndo<Item>(
      {
        remove: async () => undefined,
        restore: async (x) => {
          if (x.id === 'b') throw new Error('disk');
        },
        expire: async () => undefined,
      },
      100,
    );
    await m.remove({ id: 'a' }, { hold: true });
    await m.remove({ id: 'b' }, { hold: true });
    await m.remove({ id: 'c' }, { hold: true });
    m.release(['a', 'b', 'c']);
    await expect(m.undoAll(['a', 'b', 'c'])).rejects.toThrow('disk');
    await vi.advanceTimersByTimeAsync(1000);
    expect(m.unresolved().sort()).toEqual(['b', 'c']);
    await expect(m.close()).rejects.toThrow();
  });

  it('with the workout manager: the sets of a removed exercise come back exactly, also after their old 5 s windows', async () => {
    const s = await oneSet();
    await logSet({ id: 'b2', sessionId: s.id, exerciseId: 'goblet', reps: 12, load: kb }, db);
    const before = (await db.sets.where('sessionId').equals(s.id).toArray()) as WorkoutSet[];
    const m = deletesFor(s.id, db);
    try {
      for (const x of before) await m.remove(x, { hold: true });
      expect(await db.sets.count()).toBe(0);
      // Accepted durably for both before either is written back.
      expect(await m.undoAll(before.map((x) => x.id))).toHaveLength(2);
      const after = await db.sets.where('sessionId').equals(s.id).toArray();
      expect(after).toEqual(before);
      expect(await db.tombstones.count()).toBe(0);
    } finally {
      disposeDeletes(s.id);
    }
  });
});

// ---------------------------------------------------------------------------------------------
// Group 1: bughunt-1102-1628-tests.md #7, 1659 #4: changing "Loaded with" never invents a selected weight.

describe('group 1: a weight picked under another "Loaded with" is never rebuilt into a loggable weight', () => {
  const gym = (): Gym => ({ ...makeGym({ name: 'G', type: 'full', unit: 'lb', isActive: true }, 1), id: 'g' });
  const single60 = singleLoad(60, 'lb');
  const rebuildAs = (kind: Load['kind'], g: Gym) => (picked: Load | null, plates: readonly number[], pickKind?: Load['kind']) => currentLoad(picked, plates, kind, g, 'squat', 'Barbell back squat', undefined, undefined, pickKind);

  it('a single 60 lb pick under barbell or plate machine is null (never a 45 lb bare bar), and is not confirmable', () => {
    const g = gym();
    expect(g.bars.olympic).toBe(45); // the bare bar it used to turn into
    for (const kind of ['barbell', 'plate_machine', 'dumbbell_each', 'stack'] as const) {
      expect(currentLoad(single60, [], kind, g, 'squat', 'Barbell back squat')).toBeNull();
      expect(confirmablePick({ load: single60, plates: [], unit: 'lb' }, kind, g, 'squat', 'Barbell back squat')).toBeNull();
    }
    // Back under "One weight" it is the user's own pick again.
    expect(currentLoad(single60, [], 'single', g, 'goblet', 'Goblet squat')?.total).toBe(60);
  });

  it('bar plates are never moved onto a machine, also while the base is unknown (plates only)', () => {
    const g = gym();
    const bar = barbellLoad(45, [45], 'none', 'lb')!;
    expect(currentLoad(bar, [45], 'plate_machine', g, 'leg_press', 'Leg press')).toBeNull();
    expect(confirmablePick({ load: null, plates: [45], unit: 'lb', kind: 'barbell' }, 'plate_machine', g, 'leg_press', 'Leg press')).toBeNull();
    expect(currentLoad(null, [45], 'plate_machine', g, 'leg_press', 'Leg press', undefined, 'lb', 'barbell')).toBeNull();
  });

  it('the row stays Pick and its check is blocked until the user picks under the new kind', () => {
    const g = gym();
    const drafted: Draft = { id: 'r', load: single60, plates: [], unit: 'lb', reps: 8, rev: 2, own: { load: true }, pickKind: 'single' };
    const rows = pendingRows({ count: 1, logged: [], progression: undefined, draftOf: () => drafted, rebuild: rebuildAs('barbell', g), carry: () => null, certain: null, defaultType: 'normal', unit: 'lb' });
    expect(rows[0]!.load).toBeNull();
    expect(blockedReason('barbell', rows[0]!)).toBe('Pick a weight');
    // A pick made under barbell is loggable at once.
    const picked: Draft = { ...drafted, load: barbellLoad(45, [25], 'none', 'lb'), plates: [25], pickKind: 'barbell', rev: 3 };
    const again = pendingRows({ count: 1, logged: [], progression: undefined, draftOf: () => picked, rebuild: rebuildAs('barbell', g), carry: () => null, certain: null, defaultType: 'normal', unit: 'lb' });
    expect(again[0]!.load?.total).toBe(95);
    expect(blockedReason('barbell', again[0]!)).toBeNull();
  });
});
