import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnyGymDB } from '../../db/schema';
import { logSet, setsOf, startWorkout } from '../../db/workouts';
import type { Load } from '../../db/types';
import { createLogQueue, logKey } from '../logQueue';
import { loadDraft, saveDraft, settleDraft, type Draft } from '../drafts';

// PLAN 1.10d fix 1: pending Log set writes live outside the mounted card, so switching cards in
// the middle of a write can never drop or duplicate a set.

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

function ids() {
  let i = 0;
  return () => `id-${++i}`;
}

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

/** A mounted card, as far as the queue is concerned: its id and its subscription. */
function mount(q: ReturnType<typeof createLogQueue>, key: string) {
  const card = { id: q.current(key), unmount: () => {} };
  card.unmount = q.subscribe(key, (next) => (card.id = next));
  return card;
}

describe('logQueue', () => {
  it('two submits during a slow write save one set', async () => {
    const s = await startWorkout('g', db);
    const q = createLogQueue(ids());
    const key = logKey(s.id, 'squat');
    const w = delayed(s.id, [10, 12]);
    const a = q.submit(key, w.write);
    const b = q.submit(key, w.write);
    expect(b).toBe(a);
    expect(q.pending(key)).toBe(true);
    w.release();
    expect(await Promise.all([a, b])).toEqual([true, true]);
    expect(w.calls()).toBe(1);
    expect(q.pending(key)).toBe(false);
    expect((await setsOf(s.id, db)).map((x) => x.id)).toEqual(['id-1']);
  });

  it('a card closed and opened again during the write gets the new id: still one set, and the next Log is a new set', async () => {
    const s = await startWorkout('g', db);
    const q = createLogQueue(ids());
    const key = logKey(s.id, 'squat');
    const first = mount(q, key);
    expect(first.id).toBe('id-1');
    const w = delayed(s.id, [10, 8]);
    const pending = q.submit(key, w.write);
    first.unmount(); // switched to another exercise mid write
    const again = mount(q, key); // and back, before the write lands
    expect(again.id).toBe('id-1'); // the same set, never a second one
    expect(q.submit(key, w.write)).toBe(pending); // a tap on the remounted card waits for the same write
    w.release();
    await pending;
    expect(first.id).toBe('id-1'); // the closed card heard nothing
    expect(again.id).toBe('id-2'); // the visible one got the fresh id
    expect(q.current(key)).toBe('id-2');
    // The next Log on the visible card is a new set with a new id.
    const w2 = delayed(s.id, [8]);
    const next = q.submit(key, w2.write);
    w2.release();
    await next;
    const saved = await setsOf(s.id, db);
    expect(saved.map((x) => [x.id, x.reps])).toEqual([
      ['id-1', 10],
      ['id-2', 8],
    ]);
    again.unmount();
  });

  it('a failed write keeps the id (a retry is still one set); a thrown write counts as failed', async () => {
    const q = createLogQueue(ids());
    const seen: string[] = [];
    expect(await q.submit('w:x', async (id) => (seen.push(id), false))).toBe(false);
    expect(
      await q.submit('w:x', async (id) => {
        seen.push(id);
        throw new Error('disk full');
      }),
    ).toBe(false);
    expect(await q.submit('w:x', async (id) => (seen.push(id), true))).toBe(true);
    expect(seen).toEqual(['id-1', 'id-1', 'id-1']);
    expect(q.current('w:x')).toBe('id-2');
  });

  it('seeds the id from a saved draft only when the key has none yet', () => {
    const q = createLogQueue(ids());
    expect(q.current('w:x', 'draft-id')).toBe('draft-id');
    expect(q.current('w:x', 'other')).toBe('draft-id');
    expect(q.current('w:y')).toBe('id-1');
  });

  it('tells every mounted card, with the id that was logged', async () => {
    const q = createLogQueue(ids());
    const heard: string[][] = [];
    const off1 = q.subscribe('w:x', (a, b) => heard.push(['one', a, b]));
    const off2 = q.subscribe('w:x', (a, b) => heard.push(['two', a, b]));
    await q.submit('w:x', async () => true);
    expect(heard).toEqual([
      ['one', 'id-2', 'id-1'],
      ['two', 'id-2', 'id-1'],
    ]);
    off1();
    off2();
    await q.submit('w:x', async () => true);
    expect(heard).toHaveLength(2);
  });

  it('Finish waits for the writes of its workout only, then forgets its ids', async () => {
    const q = createLogQueue(ids());
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let landed = false;
    void q.submit('w1:a', async () => {
      await gate;
      landed = true;
      return true;
    });
    void q.submit('w2:a', () => new Promise<boolean>(() => {})); // another workout, never settles
    const settled = q.settle('w1');
    await Promise.resolve();
    expect(landed).toBe(false);
    release();
    await settled;
    expect(landed).toBe(true);
    await q.settle('w3');
    q.current('w1:b');
    q.clearSession('w1');
    expect(q.current('w1:a')).toBe('id-5'); // a fresh id, not the forgotten id-3
    expect(q.current('w2:a')).toBe('id-2');
  });

  it('Codex 1.10d (2): edits made during a slow write survive it, under the next set\'s id', async () => {
    const s = await startWorkout('g', db);
    const q = createLogQueue(ids());
    const key = logKey(s.id, 'squat');
    const store = new Map<string, string>();
    const ls = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
    const card = mount(q, key);
    const draft: Draft = { id: card.id, load, plates: [45], reps: 10, rev: 1 };
    saveDraft(s.id, 'squat', draft, ls);
    const w = delayed(s.id, [10]);
    const order: string[] = [];
    q.subscribe(key, () => order.push('subscriber'));
    const pending = q.submit(key, w.write, (next) => {
      order.push('landed');
      settleDraft(s.id, 'squat', 1, next, ls);
    });
    // While the write runs, the user adds a 25 and one more rep.
    saveDraft(s.id, 'squat', { ...draft, plates: [45, 25], reps: 11, rev: 2 }, ls);
    w.release();
    await pending;
    expect(order).toEqual(['landed', 'subscriber']);
    expect(loadDraft(s.id, 'squat', ls)).toMatchObject({ id: 'id-2', plates: [45, 25], reps: 11 });
    expect((await setsOf(s.id, db)).map((x) => [x.id, x.reps])).toEqual([['id-1', 10]]);
    card.unmount();
  });
});
