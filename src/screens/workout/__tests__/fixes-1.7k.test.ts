import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnyGymDB, db as appDb } from '../../../db/schema';
import { WorkoutFinishedError, finishWorkout, logSet, setsOf, startWorkout, updateSet } from '../../../db/workouts';
import { expireDelete } from '../../../db/tombstones';
import { UNDO_LS_KEY, readUndoIntents, rememberUndo, undoKey } from '../../../db/undoIntents';
import { exportBackup } from '../../../db/backup';
import { UndoUnresolvedError } from '../../../lib/deleteUndo';
import { restoreMirrors } from '../../../lib/durable';
import { EXTRA_SETS_KEY, addExtraSet, clearExtraSets, extraSets, hydrateExtraSets, resetExtraSetsMemory } from '../../../lib/extraSets';
import { barbellLoad } from '../../../lib/load';
import { reloadWhenIdle, setUpdateReady, isUpdateReady } from '../../../lib/pwaUpdate';
import { deletesFor, disposeDeletes, recoverSession, recoveryReady } from '../sessionRecovery';

// PLAN 1.7k: the Codex carry over fixes (reports/codex/bughunt-1025-1146/1247/1348/1400).

const b135 = barbellLoad(45, [45], 'none', 'lb')!;

let name: string;
let db: AnyGymDB;
let n = 0;
beforeEach(async () => {
  name = `anygym-17k-${n++}`;
  db = new AnyGymDB(name);
  await db.open();
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  db.close();
  await new AnyGymDB(name).delete();
});

/** An app restart: memory (the managers) is gone, the database is opened again. */
async function restart(sessionId: string): Promise<void> {
  disposeDeletes(sessionId);
  db.close();
  db = new AnyGymDB(name);
  await db.open();
}

const failUpdates = (d: AnyGymDB) => {
  const fail = () => {
    throw new Error('synthetic accept failure');
  };
  d.tombstones.hook('updating', fail);
  return () => d.tombstones.hook('updating').unsubscribe(fail);
};

async function twoSets() {
  const s = await startWorkout('g', db, 1);
  await logSet({ id: 'a', sessionId: s.id, exerciseId: 'squat', reps: 8, load: b135 }, db);
  await logSet({ id: 'b', sessionId: s.id, exerciseId: 'squat', reps: 9, load: b135 }, db);
  return s;
}

describe('(1) an unresolved Undo survives a restart', () => {
  it('Codex 1146 #1: acceptance fails, restart after the window while it still fails: the tombstone stays, Finish refuses, Try again restores it', async () => {
    const s = await twoSets();
    const original = (await setsOf(s.id, db))[1]!;
    const m = deletesFor(s.id, db);
    await m.remove(original);
    const unhook = failUpdates(db);
    await expect(m.undo('b')).rejects.toThrow('synthetic accept failure');
    unhook();
    // The intent is durable (IndexedDB kv), one row per set.
    expect(await db.kv.get(undoKey(s.id, 'b'))).toBeDefined();

    await restart(s.id);
    const unhook2 = failUpdates(db);
    // Long after the five second window, acceptance still failing.
    await recoverSession(s.id, db, Date.now() + 10 * 60_000);
    expect(await db.tombstones.get('b')).toBeDefined();
    // A plain expiry can never take it either.
    await expireDelete('b', db, Date.now() + 10 * 60_000);
    expect(await db.tombstones.get('b')).toBeDefined();
    const again = deletesFor(s.id, db);
    expect(again.unresolved()).toEqual(['b']);
    await expect(again.close()).rejects.toBeInstanceOf(UndoUnresolvedError);
    again.reopen();
    // A second restart keeps it too.
    unhook2();
    await restart(s.id);
    const unhook3 = failUpdates(db);
    await recoverSession(s.id, db, Date.now() + 20 * 60_000);
    expect(await db.tombstones.get('b')).toBeDefined();
    unhook3();
    // Try again from the Undo sheet: the exact record comes back once (same id, order, load).
    const third = deletesFor(s.id, db);
    expect(await third.undo('b')).toMatchObject({ id: 'b' });
    await expect(third.close()).resolves.toBeUndefined();
    expect(await setsOf(s.id, db)).toEqual([expect.objectContaining({ id: 'a' }), original]);
    expect(await db.kv.get(undoKey(s.id, 'b'))).toBeUndefined();
    expect((await finishWorkout(s.id, db, 5)).saved).toBe(true);
    expect((await setsOf(s.id, db)).map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('Finish straight from the database honours a stored intent: the set is put back, never dropped', async () => {
    const s = await twoSets();
    const m = deletesFor(s.id, db);
    await m.remove((await setsOf(s.id, db))[1]!);
    const unhook = failUpdates(db);
    await expect(m.undo('b')).rejects.toThrow();
    unhook();
    await restart(s.id);
    expect((await finishWorkout(s.id, db, 5)).saved).toBe(true);
    expect((await setsOf(s.id, db)).map((x) => x.id)).toEqual(['a', 'b']);
    expect(await readUndoIntents(s.id, db)).toEqual([]);
    expect(await db.tombstones.count()).toBe(0);
  });

  it('IndexedDB refuses the intent too: localStorage holds it, recovery keeps the tombstone', async () => {
    const disk = new Map<string, string>();
    const ls = { getItem: (k: string) => disk.get(k) ?? null, setItem: (k: string, v: string) => void disk.set(k, v), removeItem: (k: string) => void disk.delete(k) };
    vi.stubGlobal('localStorage', ls);
    const s = await twoSets();
    const m = deletesFor(s.id, db);
    await m.remove((await setsOf(s.id, db))[1]!);
    const failKv = () => {
      throw new Error('kv refused');
    };
    db.kv.hook('creating', failKv);
    const unhook = failUpdates(db);
    await expect(m.undo('b')).rejects.toThrow();
    unhook();
    db.kv.hook('creating').unsubscribe(failKv);
    expect(JSON.parse(disk.get(UNDO_LS_KEY)!)).toEqual([{ sessionId: s.id, setId: 'b' }]);
    await restart(s.id);
    const unhook2 = failUpdates(db);
    await recoverSession(s.id, db, Date.now() + 60_000);
    unhook2();
    expect(await db.tombstones.get('b')).toBeDefined();
    expect(deletesFor(s.id, db).unresolved()).toEqual(['b']);
    // Once it lands, the fallback copy goes too.
    expect(await deletesFor(s.id, db).undo('b')).toMatchObject({ id: 'b' });
    expect(disk.get(UNDO_LS_KEY)).toBeUndefined();
  });

  it('both stores refusing: rememberUndo rejects (the Undo stays unresolved in memory)', async () => {
    const ls = { getItem: () => null, setItem: () => { throw new Error('full'); }, removeItem: () => undefined };
    const failKv = () => {
      throw new Error('kv refused');
    };
    db.kv.hook('creating', failKv);
    await expect(rememberUndo('s', 'x', db, ls)).rejects.toThrow();
    db.kv.hook('creating').unsubscribe(failKv);
  });

  it('a backup of the workout carries the intent as an accepted Undo', async () => {
    const s = await twoSets();
    const m = deletesFor(s.id, db);
    await m.remove((await setsOf(s.id, db))[1]!);
    const unhook = failUpdates(db);
    await expect(m.undo('b')).rejects.toThrow();
    unhook();
    const backup = await exportBackup(db, 10, null);
    expect(backup.tables.tombstones).toEqual([expect.objectContaining({ id: 'b', undo: true })]);
  });
});

describe('(8) "Keep it deleted" after an automatic recovery', () => {
  it('Codex 1247 #2: accepted, restore failed, recovery puts it back: the manager resolves it', async () => {
    const s = await twoSets();
    const m = deletesFor(s.id, db);
    await m.remove((await setsOf(s.id, db))[1]!);
    const fail = () => {
      throw new Error('synthetic restore failure');
    };
    db.sets.hook('creating', fail);
    await expect(m.undo('b')).rejects.toThrow('synthetic restore failure');
    db.sets.hook('creating').unsubscribe(fail);
    expect(m.unresolved()).toEqual(['b']);
    // Minimize and resume: recovery restores it, so nothing is left to cancel.
    const r = await recoverSession(s.id, db);
    expect(r.restored).toEqual(['b']);
    expect(m.unresolved()).toEqual([]);
    await expect(m.close()).resolves.toBeUndefined();
  });

  it('a cancellation racing a restore: whichever lands first, the set ends up deleted', async () => {
    const s = await twoSets();
    const m = deletesFor(s.id, db);
    await m.remove((await setsOf(s.id, db))[1]!);
    const fail = () => {
      throw new Error('synthetic restore failure');
    };
    db.sets.hook('creating', fail);
    await expect(m.undo('b')).rejects.toThrow();
    db.sets.hook('creating').unsubscribe(fail);
    // Keep it deleted and recovery at the same time.
    await Promise.all([m.cancel('b'), recoverSession(s.id, db)]);
    expect(m.unresolved()).toEqual([]);
    expect((await finishWorkout(s.id, db, 5)).saved).toBe(true);
    expect((await setsOf(s.id, db)).map((x) => x.id)).toEqual(['a']);
  });

  it('a cancellation after the set came back still keeps it deleted', async () => {
    const s = await twoSets();
    const m = deletesFor(s.id, db);
    await m.remove((await setsOf(s.id, db))[1]!);
    const fail = () => {
      throw new Error('synthetic restore failure');
    };
    db.sets.hook('creating', fail);
    await expect(m.undo('b')).rejects.toThrow();
    db.sets.hook('creating').unsubscribe(fail);
    // Recovery from another path (the database alone) put it back; the sheet still offers Keep it deleted.
    const { recoverDeletes, cancelUndo } = await import('../../../db/tombstones');
    await recoverDeletes(s.id, db);
    expect((await setsOf(s.id, db)).map((x) => x.id)).toEqual(['a', 'b']);
    await cancelUndo('b', db, s.id);
    expect((await finishWorkout(s.id, db, 5)).saved).toBe(true);
    expect((await setsOf(s.id, db)).map((x) => x.id)).toEqual(['a']);
  });

  it('recoveryReady: Finish waits for the recovery; a failed one runs again', async () => {
    const s = await twoSets();
    const spy = vi.spyOn(db.kv, 'where').mockImplementationOnce(() => {
      throw new Error('kv unreadable');
    });
    await expect(recoverSession(s.id, db)).rejects.toThrow('kv unreadable');
    await Promise.resolve();
    spy.mockRestore();
    await expect(recoveryReady(s.id, db)).resolves.toMatchObject({ restored: [] });
    disposeDeletes(s.id);
  });
});

describe('(8) Edit set Save after Finish', () => {
  it('Codex 1247 #5: updateSet refuses a finished workout; the saved values stay', async () => {
    const s = await twoSets();
    expect((await finishWorkout(s.id, db, 5)).saved).toBe(true);
    const heavy = barbellLoad(45, [45, 10], 'none', 'lb')!;
    await expect(updateSet('a', { reps: 17, load: heavy }, db)).rejects.toBeInstanceOf(WorkoutFinishedError);
    expect((await setsOf(s.id, db))[0]).toMatchObject({ reps: 8, load: { total: 135 } });
  });
});

describe('(6) "+ Add set" rows when localStorage is full', () => {
  it('Codex 1146 #8: the row is mirrored to IndexedDB and comes back after a restart while localStorage still refuses', async () => {
    const disk = new Map<string, string>();
    const full = { getItem: (k: string) => disk.get(k) ?? null, setItem: () => { throw new Error('QuotaExceededError'); }, removeItem: () => { throw new Error('QuotaExceededError'); } };
    vi.stubGlobal('localStorage', full);
    await appDb.kv.clear();
    resetExtraSetsMemory();
    expect(addExtraSet('s1', 'squat')).toBe(1);
    await vi.waitFor(async () => expect((await appDb.kv.get(EXTRA_SETS_KEY))?.value).toBe(JSON.stringify({ sessionId: 's1', extra: { squat: 1 } })));
    // Restart: memory gone, localStorage still full.
    resetExtraSetsMemory();
    expect(extraSets('s1', 'squat')).toBe(0);
    await restoreMirrors(full, appDb, { [EXTRA_SETS_KEY]: hydrateExtraSets });
    expect(extraSets('s1', 'squat')).toBe(1);
    // Finish clears it durably too: a restart never brings the finished workout's row back.
    clearExtraSets();
    await vi.waitFor(async () => expect((await appDb.kv.get(EXTRA_SETS_KEY))?.value).toBeNull());
    resetExtraSetsMemory();
    await restoreMirrors(full, appDb, { [EXTRA_SETS_KEY]: hydrateExtraSets });
    expect(extraSets('s1', 'squat')).toBe(0);
    await appDb.kv.clear();
  });
});

describe('(8) a service worker update never reloads a workout that just started', () => {
  it('rechecks at the reload boundary: active now means wait behind Update ready', async () => {
    const reload = vi.fn();
    let active = { workout: true, run: false };
    expect(await reloadWhenIdle(async () => active, reload)).toBe(false);
    expect(reload).not.toHaveBeenCalled();
    expect(isUpdateReady()).toBe(true);
    setUpdateReady(null);
    active = { workout: false, run: false };
    expect(await reloadWhenIdle(async () => active, reload)).toBe(true);
    expect(reload).toHaveBeenCalledOnce();
    // Unreadable state counts as active.
    expect(await reloadWhenIdle(() => Promise.reject(new Error('db')), reload)).toBe(false);
    expect(reload).toHaveBeenCalledOnce();
    setUpdateReady(null);
  });
});

describe('(1) the manager takes stored Undos back after a restart', () => {
  it('hydrate: a new record is unresolved with no timer; an existing one stops expiring; a running restore is left alone', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { createDeleteUndo } = await import('../../../lib/deleteUndo');
    let release: () => void = () => undefined;
    const expire = vi.fn(async () => undefined);
    const restore = vi.fn((item: { id: string }) => (item.id === 'slow' ? new Promise<void>((r) => (release = r)) : Promise.resolve()));
    const m = createDeleteUndo<{ id: string }>({ remove: async () => undefined, restore, expire, cancel: async () => undefined }, 1000);
    m.hydrate({ id: 'x' });
    expect(m.unresolved()).toEqual(['x']);
    await expect(m.close()).rejects.toBeInstanceOf(UndoUnresolvedError);
    m.reopen();
    // An existing delete inside its window: hydrated, it never expires.
    await m.remove({ id: 'y' });
    m.hydrate({ id: 'y' });
    vi.advanceTimersByTime(5000);
    expect(expire).not.toHaveBeenCalled();
    expect(m.unresolved()).toEqual(['x', 'y']);
    // A restore on its way is not turned into an unresolved one, and resolve leaves it too.
    await m.remove({ id: 'slow' });
    const back = m.undo('slow');
    m.hydrate({ id: 'slow' });
    m.resolve('slow');
    expect(m.unresolved()).toEqual(['x', 'y']);
    expect(m.canUndo('slow')).toBe(true);
    for (let i = 0; i < 10 && !restore.mock.calls.some(([x]) => x.id === 'slow'); i++) await Promise.resolve();
    release();
    await back;
    // resolve: recovery put it back, nothing is left to cancel; unknown ids are a no op.
    m.resolve('x');
    m.resolve('nope');
    expect(m.unresolved()).toEqual(['y']);
    await m.cancel('y');
    await expect(m.close()).resolves.toBeUndefined();
  });

  it('restoreSet only while its tombstone is stored: a cancelled one is never put back', async () => {
    const { restoreSet } = await import('../../../db/workouts');
    const { cancelUndo } = await import('../../../db/tombstones');
    const s = await twoSets();
    const m = deletesFor(s.id, db);
    const b = (await setsOf(s.id, db))[1]!;
    await m.remove(b);
    await cancelUndo('b', db);
    expect(await restoreSet(b, db, { ifTombstone: true })).toBe(false);
    expect((await setsOf(s.id, db)).map((x) => x.id)).toEqual(['a']);
    // Already back (no tombstone, the set is there): true, nothing written twice.
    const a = (await setsOf(s.id, db))[0]!;
    expect(await restoreSet(a, db, { ifTombstone: true })).toBe(true);
    expect((await setsOf(s.id, db)).map((x) => x.id)).toEqual(['a']);
  });
});

describe('(6) review: localStorage access itself throws', () => {
  it('the added row goes to IndexedDB and comes back after a restart; Finish stores a null row', async () => {
    const had = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: () => { throw new Error('SecurityError'); } });
    try {
      await appDb.kv.clear();
      resetExtraSetsMemory();
      expect(addExtraSet('s9', 'bench')).toBe(1);
      await vi.waitFor(async () => expect((await appDb.kv.get(EXTRA_SETS_KEY))?.value).toBe(JSON.stringify({ sessionId: 's9', extra: { bench: 1 } })));
      resetExtraSetsMemory();
      await restoreMirrors(null, appDb, { [EXTRA_SETS_KEY]: hydrateExtraSets });
      expect(extraSets('s9', 'bench')).toBe(1);
      clearExtraSets();
      await vi.waitFor(async () => expect((await appDb.kv.get(EXTRA_SETS_KEY))?.value).toBeNull());
      resetExtraSetsMemory();
      await restoreMirrors(null, appDb, { [EXTRA_SETS_KEY]: hydrateExtraSets });
      expect(extraSets('s9', 'bench')).toBe(0);
    } finally {
      if (had) Object.defineProperty(globalThis, 'localStorage', had);
      else delete (globalThis as { localStorage?: unknown }).localStorage;
      await appDb.kv.clear();
    }
  });
});
