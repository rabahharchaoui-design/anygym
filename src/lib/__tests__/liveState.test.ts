import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnyGymDB } from '../../db/schema';
import { listFinished, type FinishedWorkout } from '../../db/history';
import { finishWorkout, logSet, startWorkout } from '../../db/workouts';
import { LIVE_START, readsFailing, retrying, subscribeLive, type LiveState } from '../liveState';

// PLAN 1.7f: a failed read is an error with a retry, never a false "No workouts yet".

let db: AnyGymDB;
let n = 0;
beforeEach(async () => {
  db = new AnyGymDB(`anygym-live-${n++}`);
  await db.open();
});
afterEach(async () => {
  delete (globalThis as { __anygymFailReads?: unknown }).__anygymFailReads;
  await db.delete();
});

/** Holds the state the hook would hold, and resolves when it changes. */
function holder<T>() {
  let state: LiveState<T> = LIVE_START;
  let wake: (() => void) | null = null;
  return {
    get: () => state,
    update: (next: (prev: LiveState<T>) => LiveState<T>) => {
      state = next(state);
      wake?.();
    },
    retry: () => (state = retrying(state)),
    until: async (ok: (s: LiveState<T>) => boolean) => {
      for (let i = 0; i < 100 && !ok(state); i++) await new Promise<void>((r) => ((wake = r), setTimeout(r, 20)));
      expect(ok(state)).toBe(true);
      return state;
    },
  };
}

async function seedWorkout(at = 1000) {
  const s = await startWorkout('gym-1', db, at);
  await logSet({ id: `set-${at}`, sessionId: s.id, exerciseId: 'squat', reps: 5, load: { kind: 'barbell', unit: 'kg', total: 65, barWeight: 20, perSide: [20] } }, db);
  await finishWorkout(s.id, db, at + 1);
  return s;
}

describe('subscribeLive (useLive)', () => {
  it('a failing table read is an error, not an empty list; retry recreates the subscription and finds the workout', async () => {
    const session = await seedWorkout();
    let broken = true;
    // db.table on a table that does not exist throws: the read fails like a broken IndexedDB.
    const query = () => (broken ? (db.table('broken').toArray() as unknown as Promise<FinishedWorkout[]>) : listFinished(db));
    const h = holder<FinishedWorkout[]>();
    let stop = subscribeLive(query, h.update);
    const failed = await h.until((s) => s.ready);
    expect(failed.error).not.toBeNull();
    expect(failed.data).toBeUndefined();
    stop();

    broken = false;
    h.retry();
    // With no data yet, a retry is loading again (skeleton), never ready-and-empty.
    expect(h.get()).toEqual({ data: undefined, ready: false, error: null });
    stop = subscribeLive(query, h.update);
    const ok = await h.until((s) => s.ready && s.data !== undefined);
    expect(ok.error).toBeNull();
    expect(ok.data).toEqual([{ session: expect.objectContaining({ id: session.id }), sets: 1 }]);
    stop();
  });

  it('keeps the last good result when a later read fails, and stays live after a retry', async () => {
    await seedWorkout();
    let broken = false;
    const query = () => (broken ? Promise.reject(new Error('disk')) : listFinished(db));
    const h = holder<FinishedWorkout[]>();
    let stop = subscribeLive(query, h.update);
    await h.until((s) => s.data?.length === 1);

    broken = true;
    await seedWorkout(3000); // a change re-runs the query
    const failed = await h.until((s) => s.error !== null);
    expect(failed.data).toHaveLength(1);
    expect(failed.ready).toBe(true);
    stop();

    broken = false;
    h.retry();
    expect(h.get()).toMatchObject({ ready: true, error: null });
    expect(h.get().data).toHaveLength(1);
    stop = subscribeLive(query, h.update);
    await h.until((s) => s.data?.length === 2);
    await seedWorkout(5000);
    await h.until((s) => s.data?.length === 3);
    stop();
  });

  it('an error without a reason still counts as an error', async () => {
    const h = holder<number>();
    const stop = subscribeLive(() => Promise.reject(undefined), h.update);
    expect((await h.until((s) => s.ready)).error).toBeInstanceOf(Error);
    stop();
  });

  it('the test only seam fails every read while set', async () => {
    expect(readsFailing()).toBe(false);
    (globalThis as { __anygymFailReads?: unknown }).__anygymFailReads = true;
    expect(readsFailing()).toBe(true);
    const h = holder<FinishedWorkout[]>();
    const stop = subscribeLive(() => listFinished(db), h.update);
    expect((await h.until((s) => s.ready)).error).not.toBeNull();
    stop();
  });
});
