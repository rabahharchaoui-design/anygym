import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnyGymDB } from '../../db/schema';
import { logSet, setsOf, startWorkout } from '../../db/workouts';
import type { Load } from '../../db/types';
import { createLogQueue, logKey } from '../logQueue';

// PLAN 1.10d fix 1, reshaped in 1.7h: pending Log set writes live outside the mounted card, so
// switching cards in the middle of a write can never drop or duplicate a set. The id a set is
// logged with now belongs to its pending row (rowLog.ts); the queue keeps one write per exercise.

let db: AnyGymDB;
let n = 0;
beforeEach(async () => {
  db = new AnyGymDB(`anygym-logqueue-${n++}`);
  await db.open();
});
afterEach(async () => {
  await db.delete();
});

const load: Load = { kind: 'barbell', unit: 'lb', total: 135, barWeight: 45, perSide: [45] };

/** A write that waits for release(); the real logSet behind it. */
function delayed(sessionId: string, reps: number[]) {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  let calls = 0;
  const write = async (id: string) => {
    calls++;
    await gate;
    await logSet({ id, sessionId, exerciseId: 'squat', reps: reps.shift() ?? 10, load }, db);
    return true;
  };
  return { write, release, calls: () => calls };
}

describe('logQueue', () => {
  it('two submits during a slow write save one set', async () => {
    const s = await startWorkout('g', db);
    const q = createLogQueue();
    const key = logKey(s.id, 'squat');
    const w = delayed(s.id, [10, 12]);
    const a = q.submit(key, 'id-1', w.write);
    const b = q.submit(key, 'id-1', w.write);
    expect(b).toBe(a);
    expect(q.pending(key)).toBe(true);
    w.release();
    expect(await Promise.all([a, b])).toEqual([true, true]);
    expect(w.calls()).toBe(1);
    expect(q.pending(key)).toBe(false);
    expect((await setsOf(s.id, db)).map((x) => x.id)).toEqual(['id-1']);
  });

  it('a card closed and opened again during the write waits for the same write; the next row is a new set', async () => {
    const s = await startWorkout('g', db);
    const q = createLogQueue();
    const key = logKey(s.id, 'squat');
    const heard: string[] = [];
    const off = q.subscribe(key, (id) => heard.push(`first:${id}`));
    const w = delayed(s.id, [10, 8]);
    const pending = q.submit(key, 'row-1', w.write);
    off(); // switched to another exercise mid write
    const off2 = q.subscribe(key, (id) => heard.push(`again:${id}`)); // and back, before it lands
    expect(q.submit(key, 'row-1', w.write)).toBe(pending);
    w.release();
    await pending;
    expect(heard).toEqual(['again:row-1']);
    const w2 = delayed(s.id, [8]);
    const next = q.submit(key, 'row-2', w2.write);
    w2.release();
    await next;
    expect((await setsOf(s.id, db)).map((x) => [x.id, x.reps])).toEqual([
      ['row-1', 10],
      ['row-2', 8],
    ]);
    off2();
  });

  it('a failed or thrown write resolves false; the same row id is used on the retry (one set)', async () => {
    const q = createLogQueue();
    const seen: string[] = [];
    expect(await q.submit('w:x', 'a', async (id) => (seen.push(id), false))).toBe(false);
    expect(
      await q.submit('w:x', 'a', async (id) => {
        seen.push(id);
        throw new Error('disk full');
      }),
    ).toBe(false);
    expect(await q.submit('w:x', 'a', async (id) => (seen.push(id), true))).toBe(true);
    expect(seen).toEqual(['a', 'a', 'a']);
  });

  it('landed runs once before the subscribers, with the logged id', async () => {
    const q = createLogQueue();
    const order: string[] = [];
    const off = q.subscribe('w:x', (id) => order.push(`sub:${id}`));
    await q.submit('w:x', 'r1', async () => true, (id) => order.push(`landed:${id}`));
    await q.submit('w:x', 'r2', async () => false, (id) => order.push(`landed:${id}`));
    expect(order).toEqual(['landed:r1', 'sub:r1']);
    off();
  });

  it('Finish waits for the writes of its workout only', async () => {
    const q = createLogQueue();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let landed = false;
    void q.submit('w1:a', 'x', async () => {
      await gate;
      landed = true;
      return true;
    });
    void q.submit('w2:a', 'y', () => new Promise<boolean>(() => {})); // another workout, never settles
    const settled = q.settle('w1');
    await Promise.resolve();
    expect(landed).toBe(false);
    release();
    await settled;
    expect(landed).toBe(true);
    await q.settle('w3');
  });

  it('PLAN 1.7h (1): once Finish closes the workout, a new Log set never starts, synchronously', async () => {
    const q = createLogQueue();
    let calls = 0;
    q.close('w1');
    expect(q.closed('w1')).toBe(true);
    expect(await q.submit('w1:a', 'x', async () => (calls++, true))).toBe(false);
    expect(await q.submit('w2:a', 'y', async () => (calls++, true))).toBe(true); // other workouts unaffected
    q.reopen('w1');
    expect(await q.submit('w1:a', 'x', async () => (calls++, true))).toBe(true);
    expect(calls).toBe(2);
  });
});

// PLAN 1.12, 1.7j: the double tap race. A ✓ claims its row's stable identity with one
// submission; never time based, never keyed by the row's displayed position.
describe('row claims', () => {
  const gate = () => {
    let open!: (ok: boolean) => void;
    const p = new Promise<boolean>((r) => (open = r));
    return { p, open };
  };
  const none = () => false;
  const has = (...ids: string[]) => (id: string) => ids.includes(id);

  it('a second ✓ in the same task, during the write, or after it landed (stale view) gets the same submission', async () => {
    const q = createLogQueue();
    const g = gate();
    let starts = 0;
    const start = () => (starts++, g.p);
    const a = q.claim('w:a', 'x', start);
    const b = q.claim('w:a', 'x', start); // same task
    expect(b).toBe(a);
    expect(q.claimed('w:a', 'x')).toBe(true);
    expect(q.stale('w:a')).toBe(false); // running, not landed
    await Promise.resolve();
    expect(q.claim('w:a', 'x', start)).toBe(a); // during the write
    g.open(true);
    expect(await a).toBe(true);
    expect(q.claim('w:a', 'x', start)).toBe(a); // landed, view not caught up yet
    expect(q.stale('w:a')).toBe(true); // every ✓ of the exercise waits for the view
    q.release('w:a', none); // the view does not show it yet: kept
    expect(q.claimed('w:a', 'x')).toBe(true);
    expect(starts).toBe(1);
    q.release('w:a', has('x'));
    expect(q.stale('w:a')).toBe(false);
  });

  it('PLAN 1.7j: checking row 3 first, then the highlighted rows, logs all three (three writers)', async () => {
    // Codex 1025 0635 #3: row 3 claimed index 2; after it landed the last pending row moved to
    // index 2 and its enabled ✓ silently did nothing. Claims are keyed by draft identity now.
    const q = createLogQueue();
    const committed = new Set<string>();
    let writers = 0;
    const write = (id: string) => async () => {
      writers++;
      committed.add(id);
      return true;
    };
    const view = () => q.release('w:a', (id) => committed.has(id));
    // Row 3 (draft c) first.
    expect(await q.claim('w:a', 'c', write('c'))).toBe(true);
    view();
    // Then the highlighted row (a), then the one left (b): rows moved up, identities did not.
    expect(q.stale('w:a')).toBe(false);
    expect(await q.claim('w:a', 'a', write('a'))).toBe(true);
    view();
    expect(q.stale('w:a') || q.claimed('w:a', 'b')).toBe(false);
    expect(await q.claim('w:a', 'b', write('b'))).toBe(true);
    view();
    expect(writers).toBe(3);
    expect([...committed].sort()).toEqual(['a', 'b', 'c']);
  });

  it('a claim the view shows as committed while it still runs is released the moment it lands', async () => {
    const q = createLogQueue();
    const g = gate();
    const first = q.claim('w:a', 'x', () => g.p);
    q.release('w:a', has('x'));
    expect(q.claimed('w:a', 'x')).toBe(true); // a running claim is never released
    g.open(true);
    await first;
    expect(q.claimed('w:a', 'x')).toBe(false);
    expect(q.stale('w:a')).toBe(false);
  });

  it('the next row is its own claim; a running claim is never released', async () => {
    const q = createLogQueue();
    const g = gate();
    const first = q.claim('w:a', 'x', () => g.p);
    let second = 0;
    await q.claim('w:a', 'y', async () => (second++, true));
    expect(second).toBe(1);
    q.release('w:a', has('y'));
    expect(q.claimed('w:a', 'x')).toBe(true); // still running
    g.open(true);
    await first;
    q.release('w:a', has('x', 'y'));
    expect(q.claimed('w:a', 'x')).toBe(false);
  });

  it('a failed or throwing claim is dropped so ✓ again can log the row with the same id', async () => {
    const q = createLogQueue();
    expect(await q.claim('w:a', 'x', async () => false)).toBe(false);
    expect(q.claimed('w:a', 'x')).toBe(false);
    expect(q.stale('w:a')).toBe(false);
    expect(await q.claim('w:a', 'x', async () => {
      throw new Error('boom');
    })).toBe(false);
    expect(q.claimed('w:a', 'x')).toBe(false);
    expect(await q.claim('w:a', 'x', async () => true)).toBe(true);
  });

  it('keys are independent', async () => {
    const q = createLogQueue();
    const g = gate();
    void q.claim('w:a', 'x', () => g.p);
    expect(q.claimed('w:b', 'x')).toBe(false);
    expect(await q.claim('w:b', 'x', async () => true)).toBe(true);
    expect(q.stale('w:a')).toBe(false);
    g.open(true);
  });
});

// PLAN 1.7j: set type changes are writes Finish must count after.
describe('mutate', () => {
  it('runs and tracks a write; settle waits for it; refused once the workout is closed', async () => {
    const q = createLogQueue();
    let open!: () => void;
    let landed = false;
    const p = q.mutate('w1', () => new Promise<void>((r) => (open = r)).then(() => void (landed = true)));
    expect(p).not.toBeNull();
    q.close('w1');
    let settled = false;
    const s = q.settle('w1').then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    let ran = false;
    expect(q.mutate('w1', async () => void (ran = true))).toBeNull();
    expect(ran).toBe(false);
    open();
    await s;
    expect(landed).toBe(true);
    // A failed write never blocks settle.
    q.reopen('w1');
    await expect(q.mutate('w1', async () => Promise.reject(new Error('x')))).rejects.toThrow('x');
    await q.settle('w1');
  });
});
