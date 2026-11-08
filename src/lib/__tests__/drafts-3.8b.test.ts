// PLAN 3.8b (bughunt 1108-0142 #2): the draft mirror clears `dirty` only after the IndexedDB commit.
// localStorage takes 19 reps, the IndexedDB commit fails: the row must stay dirty, so the next
// durable merge (a Log) writes 19 and not the older 10 already stored there.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Draft } from '../drafts';
import type { Load } from '../../db/types';

const lb = (total: number): Load => ({ kind: 'single', unit: 'lb', total });
const row = (reps: number, rev: number): Draft => ({ id: 'x', load: lb(53), reps, rev });

function phone() {
  const disk = new Map<string, string>();
  return {
    disk,
    ls: { getItem: (k: string) => disk.get(k) ?? null, setItem: (k: string, v: string) => void disk.set(k, v), removeItem: (k: string) => void disk.delete(k) },
  };
}

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());

describe('PLAN 3.8b: dirty is cleared by the IndexedDB commit, not by localStorage', () => {
  it('a failed IndexedDB commit keeps 19 reps: the next durable merge writes 19, never the stored 10', async () => {
    const p = phone();
    vi.stubGlobal('localStorage', p.ls);
    const drafts = await import('../drafts');
    const { db } = await import('../../db/schema');
    await db.kv.clear();
    drafts.saveDraft('s', 'ex@0', row(10, 1));
    await vi.waitFor(async () => expect(JSON.parse((await db.kv.get('anygym-drafts'))!.value!).s['ex@0'].reps).toBe(10));
    // Let the first write settle, then make the next IndexedDB commit fail.
    await new Promise((r) => setTimeout(r, 20));
    const fail = () => {
      throw new Error('synthetic kv failure');
    };
    db.kv.hook('updating', fail);
    expect(drafts.saveDraft('s', 'ex@0', row(19, 2))).toBe(true); // localStorage took it
    await new Promise((r) => setTimeout(r, 50));
    db.kv.hook('updating').unsubscribe(fail);
    expect(JSON.parse(p.disk.get('anygym-drafts')!).s['ex@0'].reps).toBe(19);
    expect(JSON.parse((await db.kv.get('anygym-drafts'))!.value!).s['ex@0'].reps).toBe(10);
    // The Log that follows merges this tab's rows into IndexedDB: 19 is still this tab's changed row.
    const merge = drafts.draftsDurableMerge()!;
    await db.transaction('rw', db.kv, () => merge(db.kv));
    expect(JSON.parse((await db.kv.get('anygym-drafts'))!.value!).s['ex@0'].reps).toBe(19);
  });
});
