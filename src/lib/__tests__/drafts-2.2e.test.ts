// Codex 2.0k review #1 (fixed in 2.2e): an already open tab that never hydrated (its localStorage
// view is stale) never overwrites a row IndexedDB alone holds, neither by a plain draft write nor
// by the Log set transaction. Two tabs are two module instances on one IndexedDB and one phone.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Draft } from '../drafts';
import type { Load } from '../../db/types';

const lb = (total: number): Load => ({ kind: 'single', unit: 'lb', total });
const row = (id: string, total: number, rev: number): Draft => ({ id, load: lb(total), reps: 8, rev });

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

async function setup() {
  const A = await tab();
  const B = await tab(); // open before A's failure: never hydrated
  A.drafts.saveDraft('s', 'ex@1', row('y', 20, 1));
  await vi.waitFor(async () => expect((await idb(A.db)).s?.['ex@1']?.load?.total).toBe(20));
  expect(B.drafts.loadDraft('s', 'ex@1')!.load!.total).toBe(20);
  p.refuse();
  A.drafts.saveDraft('s', 'ex@0', row('x', 73, 1)); // only IndexedDB takes it
  await vi.waitFor(async () => expect((await idb(A.db)).s?.['ex@0']?.load?.total).toBe(73));
  expect(local(p.disk).s!['ex@0']).toBeUndefined();
  p.refuse(false);
  return { A, B };
}

describe('Codex 2.0k #1: an unhydrated tab never overwrites a row only IndexedDB holds', () => {
  it('a plain draft write in tab B of another row keeps A\'s 73 lb in both stores', async () => {
    const { B } = await setup();
    B.drafts.saveDraft('s', 'ex@2', row('z', 40, 1));
    await vi.waitFor(async () => expect((await idb(B.db)).s?.['ex@2']?.load?.total).toBe(40));
    expect((await idb(B.db)).s!['ex@0']!.load!.total).toBe(73);
    // The merged snapshot reaches localStorage too, so a restart has every row.
    await vi.waitFor(() => expect(local(p.disk).s?.['ex@0']?.load?.total).toBe(73));
    expect(local(p.disk).s!['ex@2']!.load!.total).toBe(40);
    expect(local(p.disk).s!['ex@1']!.load!.total).toBe(20);
  });

  it('the Log set transaction (draftsDurableMerge) of tab B keeps it as well', async () => {
    const { B } = await setup();
    B.drafts.sessionDrafts('s');
    const merge = B.drafts.draftsDurableMerge()!;
    expect(merge).not.toBeNull();
    await B.db.transaction('rw', B.db.kv, () => merge(B.db.kv));
    const stored = await idb(B.db);
    expect(stored.s!['ex@0']!.load!.total).toBe(73);
    expect(stored.s!['ex@1']!.load!.total).toBe(20);
  });

  it('a newer revision IndexedDB holds is never replaced by an older one of this tab', async () => {
    const { A, B } = await setup();
    p.refuse();
    A.drafts.saveDraft('s', 'ex@1', row('y', 25, 2));
    await vi.waitFor(async () => expect((await idb(A.db)).s?.['ex@1']?.load?.total).toBe(25));
    p.refuse(false);
    B.drafts.sessionDrafts('s');
    await B.db.transaction('rw', B.db.kv, () => B.drafts.draftsDurableMerge()!(B.db.kv));
    expect((await idb(B.db)).s!['ex@1']!.load!.total).toBe(25);
  });
});
