import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnyGymDB } from '../../db/schema';
import type { Draft } from '../drafts';

const opened: AnyGymDB[] = [];
let restoreStorage: () => void;
let blocked: boolean;
let disk: Map<string, string>;
const draft = (id: string, weight: number, rev: number): Draft => ({ id, reps: 8, rev,
  load: { kind: 'single', unit: 'lb', total: weight } });

async function tab() {
  vi.resetModules();
  const drafts = await import('../drafts');
  const { db } = await import('../../db/schema');
  await db.open();
  opened.push(db);
  return { drafts, db };
}
async function stored(db: AnyGymDB) {
  const row = await db.kv.get('anygym-drafts');
  return JSON.parse(row?.value ?? '{}') as Record<string, Record<string, Draft>>;
}

beforeEach(() => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  blocked = true;
  disk = new Map();
  const storage = { getItem: (k: string) => disk.get(k) ?? null,
    setItem: (k: string, value: string) => {
      if (blocked) throw new DOMException('Synthetic storage full', 'QuotaExceededError');
      disk.set(k, value);
    }, removeItem: (k: string) => {
      if (blocked) throw new DOMException('Synthetic storage full', 'QuotaExceededError');
      disk.delete(k);
    } };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  restoreStorage = () => {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else delete (globalThis as { localStorage?: unknown }).localStorage;
  };
});
afterEach(async () => {
  for (const db of opened) db.close();
  const last = opened.pop();
  opened.length = 0;
  if (last) await last.delete();
  restoreStorage();
  vi.resetModules();
});

describe('PLAN 2.0j draft durability when localStorage recovers', () => {
  // CODEX FOUND BUG: Once localStorage recovers, editing another row deletes a draft already committed to IndexedDB.
  it('retains an IndexedDB-only draft when storage recovers and a different row is edited', async () => {
    const A = await tab();
    const first = draft('first', 73, 2);
    A.drafts.saveDraft('session', 'goblet@0', first);
    await vi.waitFor(async () => expect((await stored(A.db)).session?.['goblet@0']).toEqual(first));
    blocked = false;
    const second = draft('second', 35, 1);
    A.drafts.saveDraft('session', 'goblet@1', second);
    await vi.waitFor(async () => expect((await stored(A.db)).session?.['goblet@1']).toEqual(second));
    expect.soft((await stored(A.db)).session?.['goblet@0']).toEqual(first);
    const restarted = await tab();
    restarted.drafts.hydrateDrafts((await restarted.db.kv.get('anygym-drafts'))?.value ?? null);
    expect(restarted.drafts.loadDraft('session', 'goblet@0')).toEqual(first);
    expect(restarted.drafts.loadDraft('session', 'goblet@1')).toEqual(second);
  });

  // CODEX FOUND BUG: Storage recovery mirrors a stale hydrated snapshot over another tab's newer durable weight.
  it('merges another tab’s newer durable weight before mirroring a hydrated stale snapshot after recovery', async () => {
    const A = await tab();
    const B = await tab();
    const old = draft('first', 53, 1);
    const initial = JSON.stringify({ session: { 'goblet@0': old } });
    await A.db.kv.put({ key: 'anygym-drafts', value: initial, at: 1 });
    A.drafts.hydrateDrafts(initial);
    B.drafts.hydrateDrafts(initial);
    const newer = draft('first', 73, 2);
    A.drafts.saveDraft('session', 'goblet@0', newer);
    await vi.waitFor(async () => expect((await stored(A.db)).session?.['goblet@0']).toEqual(newer));
    blocked = false;
    const second = draft('second', 35, 1);
    B.drafts.saveDraft('session', 'goblet@1', second);
    await vi.waitFor(async () => expect((await stored(A.db)).session?.['goblet@1']).toEqual(second));
    expect.soft((await stored(A.db)).session?.['goblet@0']).toEqual(newer);
    const restarted = await tab();
    restarted.drafts.hydrateDrafts((await restarted.db.kv.get('anygym-drafts'))?.value ?? null);
    expect(restarted.drafts.loadDraft('session', 'goblet@0')).toEqual(newer);
    expect(restarted.drafts.loadDraft('session', 'goblet@1')).toEqual(second);
  });
});
