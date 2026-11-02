// PLAN 2.0k (6) and (3): after localStorage refused a write, the committed IndexedDB snapshot is the
// authority until localStorage has taken the merged result, so an edit of another row (in this tab
// or another one) never deletes or replaces a row IndexedDB alone holds. Two tabs are two module
// instances (own memory, own database object) on one IndexedDB and one phone localStorage.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Draft } from '../drafts';
import type { Load } from '../../db/types';

const lb = (total: number): Load => ({ kind: 'single', unit: 'lb', total });
const row = (id: string, total: number, rev: number): Draft => ({ id, load: lb(total), reps: 8, rev });

/** The phone's localStorage, which can be made to refuse writes. */
function phone() {
  const disk = new Map<string, string>();
  let refusing = false;
  const ls = {
    getItem: (k: string) => disk.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (refusing) throw new DOMException('full', 'QuotaExceededError');
      disk.set(k, v);
    },
    removeItem: (k: string) => {
      if (refusing) throw new DOMException('full', 'QuotaExceededError');
      disk.delete(k);
    },
  };
  return { ls, disk, refuse: (on = true) => void (refusing = on) };
}

async function tab() {
  vi.resetModules();
  const drafts = await import('../drafts');
  const { db } = await import('../../db/schema');
  return { drafts, db };
}
const idb = async (db: { kv: { get: (k: string) => Promise<{ value: string | null } | undefined> } }) => {
  const r = await db.kv.get('anygym-drafts');
  return r?.value ? (JSON.parse(r.value) as Record<string, Record<string, Draft>>) : {};
};
const local = (disk: Map<string, string>) => JSON.parse(disk.get('anygym-drafts') ?? '{}') as Record<string, Record<string, Draft>>;

let p: ReturnType<typeof phone>;
beforeEach(async () => {
  p = phone();
  vi.stubGlobal('localStorage', p.ls);
  const { db } = await tab();
  await db.kv.clear();
});
afterEach(() => vi.unstubAllGlobals());

describe('PLAN 2.0k (6): a row stored only in IndexedDB is never merged away', () => {
  it('one tab: localStorage refuses row X, recovers, an edit of row Y keeps X in both stores', async () => {
    const A = await tab();
    A.drafts.saveDraft('s', 'ex@1', row('y', 20, 1));
    expect(local(p.disk).s!['ex@1']!.load!.total).toBe(20);
    p.refuse();
    A.drafts.saveDraft('s', 'ex@0', row('x', 73, 1)); // localStorage refuses: IndexedDB alone holds it
    await vi.waitFor(async () => expect((await idb(A.db)).s?.['ex@0']?.load?.total).toBe(73));
    expect(local(p.disk).s!['ex@0']).toBeUndefined();
    p.refuse(false);
    A.drafts.saveDraft('s', 'ex@1', row('y', 25, 2));
    await vi.waitFor(() => expect(local(p.disk).s?.['ex@1']?.load?.total).toBe(25));
    expect(local(p.disk).s!['ex@0']!.load!.total).toBe(73);
    expect((await idb(A.db)).s!['ex@0']!.load!.total).toBe(73);
    // And the tab's own copy kept it.
    expect(A.drafts.loadDraft('s', 'ex@0')!.load!.total).toBe(73);
    // From now on localStorage is current again: a plain write lands at once.
    expect(A.drafts.saveDraft('s', 'ex@1', row('y', 30, 3))).toBe(true);
    expect(local(p.disk).s!['ex@0']!.load!.total).toBe(73);
  });
});

describe('PLAN 2.0k (3): after storage recovers, an unrelated edit in one tab never replaces another tab\'s pending weight', () => {
  it('two hydrated tabs: A saves 73 lb into IndexedDB, storage recovers, B edits another row: 73 survives a restart', async () => {
    const A = await tab();
    const seed = { s: { 'ex@0': row('x', 53, 1), 'ex@1': row('y', 7, 1) } };
    await A.db.kv.put({ key: 'anygym-drafts', value: JSON.stringify(seed), at: 1 });
    p.refuse();
    const B = await tab();
    // Both tabs start while localStorage refuses: each takes the IndexedDB copy (main.tsx).
    A.drafts.hydrateDrafts(JSON.stringify(seed));
    B.drafts.hydrateDrafts(JSON.stringify(seed));
    expect(B.drafts.loadDraft('s', 'ex@0')!.load!.total).toBe(53);
    A.drafts.saveDraft('s', 'ex@0', row('x', 73, 2));
    await vi.waitFor(async () => expect((await idb(A.db)).s!['ex@0']!.load!.total).toBe(73));
    p.refuse(false);
    B.drafts.saveDraft('s', 'ex@1', row('y', 9, 2)); // B still shows 53 on ex@0
    await vi.waitFor(() => expect(local(p.disk).s?.['ex@1']?.load?.total).toBe(9));
    await vi.waitFor(async () => expect((await idb(A.db)).s!['ex@1']!.load!.total).toBe(9));
    expect((await idb(A.db)).s!['ex@0']!.load!.total).toBe(73);
    expect(local(p.disk).s!['ex@0']!.load!.total).toBe(73);
    // B's own copy took A's committed row.
    expect(B.drafts.loadDraft('s', 'ex@0')!.load!.total).toBe(73);
    // A restart reads localStorage (current again): both edits are there.
    const C = await tab();
    expect(C.drafts.loadDraft('s', 'ex@0')!.load!.total).toBe(73);
    expect(C.drafts.loadDraft('s', 'ex@1')!.load!.total).toBe(9);
  });
});
