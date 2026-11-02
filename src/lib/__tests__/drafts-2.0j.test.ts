// PLAN 2.0j (4): with localStorage refusing writes, a tab persists only the rows it changed, merged
// into what IndexedDB holds in one transaction. Two tabs are two module instances (own memory, own
// database object) on one IndexedDB.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Draft } from '../drafts';

const row = (id: string, reps: number, rev: number): Draft => ({ id, load: null, reps, rev });

async function tab() {
  vi.resetModules();
  const drafts = await import('../drafts');
  const { db } = await import('../../db/schema');
  return { drafts, db };
}
const stored = async (db: { kv: { get: (k: string) => Promise<{ value: string | null } | undefined> } }) => {
  const r = await db.kv.get('anygym-drafts');
  return r?.value ? (JSON.parse(r.value) as Record<string, Record<string, Draft>>) : {};
};

let unblock = () => {};
afterEach(() => unblock());
beforeEach(async () => {
  const before = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() {
      throw new DOMException('blocked', 'SecurityError');
    },
  });
  unblock = () => (before ? Object.defineProperty(globalThis, 'localStorage', before) : delete (globalThis as { localStorage?: unknown }).localStorage);
  const { db } = await tab();
  await db.kv.clear();
  await db.kv.put({ key: 'anygym-drafts', value: JSON.stringify({ s: { 'ex@0': row('a', 7, 1), 'ex@1': row('b', 7, 1) } }), at: 1 });
});

describe('drafts of two tabs, localStorage refusing', () => {
  it('editing different rows keeps both in IndexedDB', async () => {
    const A = await tab();
    const B = await tab();
    const seed = JSON.stringify(await stored(A.db));
    A.drafts.hydrateDrafts(seed, null);
    B.drafts.hydrateDrafts(seed, null);
    A.drafts.saveDraft('s', 'ex@0', row('a', 17, 2), null);
    await vi.waitFor(async () => expect((await stored(A.db)).s!['ex@0']!.reps).toBe(17));
    B.drafts.saveDraft('s', 'ex@1', row('b', 9, 2), null);
    await vi.waitFor(async () => expect((await stored(A.db)).s!['ex@1']!.reps).toBe(9));
    const now = (await stored(A.db)).s!;
    expect(now['ex@0']!.reps).toBe(17);
    expect(now['ex@1']!.reps).toBe(9);
  });

  it('a clear in one tab is not undone by a stale edit of another row, and a row cleared stays cleared', async () => {
    const A = await tab();
    const B = await tab();
    const seed = JSON.stringify(await stored(A.db));
    A.drafts.hydrateDrafts(seed, null);
    B.drafts.hydrateDrafts(seed, null);
    A.drafts.clearDraft('s', 'ex@0', null);
    await vi.waitFor(async () => expect((await stored(A.db)).s!['ex@0']).toBeUndefined());
    B.drafts.saveDraft('s', 'ex@1', row('b', 9, 2), null);
    await vi.waitFor(async () => expect((await stored(A.db)).s!['ex@1']!.reps).toBe(9));
    expect((await stored(A.db)).s!['ex@0']).toBeUndefined();
  });

  it('a tab takes the other tab\'s committed rows into its own copy', async () => {
    const A = await tab();
    const B = await tab();
    const seed = JSON.stringify(await stored(A.db));
    A.drafts.hydrateDrafts(seed, null);
    B.drafts.hydrateDrafts(seed, null);
    A.drafts.saveDraft('s', 'ex@0', row('a', 17, 2), null);
    await vi.waitFor(async () => expect((await stored(A.db)).s!['ex@0']!.reps).toBe(17));
    B.drafts.saveDraft('s', 'ex@1', row('b', 9, 2), null);
    await vi.waitFor(() => expect(B.drafts.sessionDrafts('s', null).get('ex@0')?.reps).toBe(17));
    expect(B.drafts.sessionDrafts('s', null).get('ex@1')?.reps).toBe(9);
  });
});
