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
