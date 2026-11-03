// PLAN 2.0l (4), Codex bughunt 1811 #3: logging in a tab with a stale clean copy of a row never
// overwrites the durable (IndexedDB) pending weight another tab stored at the same revision. Two
// tabs are two module instances (own memory, own database object) on one IndexedDB and one phone
// localStorage, as in drafts-2.0k.test.ts.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Draft } from '../drafts';
import type { Load } from '../../db/types';

const lb = (total: number): Load => ({ kind: 'single', unit: 'lb', total });
const row = (id: string, total: number, rev: number): Draft => ({ id, load: lb(total), reps: 8, rev });

function phone() {
  const disk = new Map<string, string>();
  const ls = { getItem: (k: string) => disk.get(k) ?? null, setItem: (k: string, v: string) => void disk.set(k, v), removeItem: (k: string) => void disk.delete(k) };
  return { ls, disk };
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

let p: ReturnType<typeof phone>;
beforeEach(async () => {
  p = phone();
  vi.stubGlobal('localStorage', p.ls);
  const { db } = await tab();
  await db.kv.clear();
});
afterEach(() => vi.unstubAllGlobals());

describe('2.0l (4): a Log in a stale tab keeps another tab\'s durable pending weight', () => {
  it('IndexedDB holds 73 lb at rev 2, the stale tab shows 63 lb at rev 2 and logs another row: 73 stays', async () => {
    const B = await tab();
    // The stale tab read 63 lb (rev 2) from localStorage; another tab then stored 73 lb at the same
    // revision durably (its localStorage write was refused).
    p.disk.set('anygym-drafts', JSON.stringify({ s: { 'ex@0': row('x', 63, 2), 'ex@1': row('y', 20, 1) } }));
    expect(B.drafts.loadDraft('s', 'ex@0')!.load!.total).toBe(63);
    expect(B.drafts.sessionDrafts('s').size).toBe(2);
    await B.db.kv.put({ key: 'anygym-drafts', value: JSON.stringify({ s: { 'ex@0': row('x', 73, 2), 'ex@1': row('y', 20, 1) } }), at: 1 });
    // B logs row y: its pending rows are made durable in the Log's own transaction (rowLog.submitRow).
    const merge = B.drafts.draftsDurableMerge()!;
    expect(merge).not.toBeNull();
    await B.db.transaction('rw', B.db.kv, () => merge(B.db.kv));
    expect((await idb(B.db)).s!['ex@0']!.load!.total).toBe(73);
  });

  it('a row only IndexedDB has stays; this tab\'s rows stay as they are', async () => {
    const B = await tab();
    B.drafts.saveDraft('s', 'ex@0', row('x', 50, 1));
    B.drafts.saveDraft('s', 'ex@1', row('y', 20, 1));
    await vi.waitFor(async () => expect((await idb(B.db)).s?.['ex@1']?.load?.total).toBe(20));
    await B.db.kv.put({ key: 'anygym-drafts', value: JSON.stringify({ s: { 'ex@0': row('x', 50, 1), 'ex@1': row('y', 20, 1), 'ex@2': row('z', 99, 1) } }), at: 2 });
    const merge = B.drafts.draftsDurableMerge()!;
    await B.db.transaction('rw', B.db.kv, () => merge(B.db.kv));
    const after = (await idb(B.db)).s!;
    expect(after['ex@2']!.load!.total).toBe(99);
    expect(after['ex@0']!.load!.total).toBe(50);
  });

  it('a newer revision of this tab\'s own row is still written (its own write was in flight)', async () => {
    const B = await tab();
    B.drafts.saveDraft('s', 'ex@0', row('x', 50, 3));
    await B.db.kv.put({ key: 'anygym-drafts', value: JSON.stringify({ s: { 'ex@0': row('x', 40, 2) } }), at: 3 });
    const merge = B.drafts.draftsDurableMerge()!;
    await B.db.transaction('rw', B.db.kv, () => merge(B.db.kv));
    expect((await idb(B.db)).s!['ex@0']!.load!.total).toBe(50);
  });
});
