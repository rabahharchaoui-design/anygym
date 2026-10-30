// PLAN 2.0c group 4 (Codex 1025 1651 #5 #6, 1722 #2 #3, 1814 #3 #7 #8): drafts, their clears and
// the rest reach IndexedDB when localStorage access throws, a failed timestamp write never
// suppresses the durable copy, and a rest read failure never crashes opening a workout.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnyGymDB } from '../../db/schema';
import { STAMPS_KEY, mirror, restoreMirrors } from '../durable';

const KEY = 'anygym-drafts';
const lb53 = { kind: 'single' as const, unit: 'lb' as const, total: 53 };

/** localStorage whose very access throws (Safari private mode, blocked storage). */
function blockLocalStorage() {
  const before = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() {
      throw new DOMException('Synthetic blocked storage', 'SecurityError');
    },
  });
  return () => {
    if (before) Object.defineProperty(globalThis, 'localStorage', before);
    else delete (globalThis as { localStorage?: unknown }).localStorage;
  };
}

/** Fresh app modules (module memory discarded, like a restart); IndexedDB stays. */
async function fresh() {
  vi.resetModules();
  const drafts = await import('../drafts');
  const durable = await import('../durable');
  const rest = await import('../rest');
  const schema = await import('../../db/schema');
  return { drafts, durable, rest, db: schema.db };
}

/** Waits until the default database's kv row for `key` satisfies `ok`. */
async function kvRow(db: AnyGymDB, key: string, ok: (v: string | null | undefined) => boolean) {
  for (let i = 0; i < 100; i++) {
    const row = await db.kv.get(key);
    if (row && ok(row.value)) return row;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error(`kv ${key} never matched`);
}

describe('localStorage access throws: drafts and clears persist straight to IndexedDB', () => {
  let restore: () => void;
  beforeEach(() => {
    restore = blockLocalStorage();
  });
  afterEach(async () => {
    restore();
    const { db } = await fresh();
    await db.kv.clear();
  });

  it('a 53 lb / 17 rep draft survives a restart with storage still unavailable, exactly', async () => {
    const a = await fresh();
    a.drafts.saveDraft('S1', 'goblet@0', { id: 'd1', load: lb53, reps: 17, unit: 'lb', rev: 3 });
    await kvRow(a.db, KEY, (v) => !!v && v.includes('"reps":17'));
    // Restart: module memory gone, storage still blocked.
    const b = await fresh();
    await b.durable.restoreMirrors(undefined, undefined, { [KEY]: (v) => b.drafts.hydrateDrafts(v) });
    expect(b.drafts.loadDraft('S1', 'goblet@0')).toEqual({ id: 'd1', load: lb53, reps: 17, unit: 'lb', rev: 3 });
  });

  it('clearDraft and clearSessionDrafts reach IndexedDB too: nothing comes back after a restart', async () => {
    const a = await fresh();
    a.drafts.saveDraft('S1', 'goblet@0', { id: 'd1', load: lb53, reps: 17 });
    a.drafts.saveDraft('S1', 'goblet@1', { id: 'd2', load: lb53, reps: 15 });
    await kvRow(a.db, KEY, (v) => !!v && v.includes('d2'));
    a.drafts.clearDraft('S1', 'goblet@0');
    await kvRow(a.db, KEY, (v) => !!v && !v.includes('d1'));
    a.drafts.clearSessionDrafts('S1');
    await kvRow(a.db, KEY, (v) => v === null);
    const b = await fresh();
    await b.durable.restoreMirrors(undefined, undefined, { [KEY]: (v) => b.drafts.hydrateDrafts(v) });
    expect(b.drafts.loadDraft('S1', 'goblet@1')).toBeNull();
    expect(b.drafts.sessionDrafts('S1').size).toBe(0);
  });

  it('rapid saves then a clear: the latest wins and stamps keep increasing across a restart', async () => {
    const a = await fresh();
    for (let r = 1; r <= 5; r++) a.drafts.saveDraft('S1', 'goblet@0', { id: 'd1', load: lb53, reps: r });
    a.drafts.clearDraft('S1', 'goblet@0');
    const row = await kvRow(a.db, KEY, (v) => v === null);
    const b = await fresh();
    await b.durable.restoreMirrors();
    b.drafts.saveDraft('S1', 'goblet@0', { id: 'd9', load: lb53, reps: 9 });
    const next = await kvRow(b.db, KEY, (v) => !!v && v.includes('d9'));
    expect(next.at).toBeGreaterThan(row.at);
  });

  it('the rest and its clear reach IndexedDB; loadRest never throws', async () => {
    const a = await fresh();
    const r = { sessionId: 'S1', endsAt: 123_456, totalSec: 90 };
    a.rest.saveRest(r);
    await kvRow(a.db, 'anygym-rest', (v) => v === JSON.stringify(r));
    const b = await fresh();
    await b.durable.restoreMirrors(undefined, undefined, { 'anygym-rest': (v) => b.rest.hydrateRest(v) });
    expect(b.rest.loadRest('S1')).toEqual(r);
    b.rest.saveRest(null);
    await kvRow(b.db, 'anygym-rest', (v) => v === null);
    const c = await fresh();
    await c.durable.restoreMirrors(undefined, undefined, { 'anygym-rest': (v) => c.rest.hydrateRest(v) });
    expect(c.rest.loadRest('S1')).toBeNull();
  });
});

class Mem {
  m = new Map<string, string>();
  getItem = (k: string) => this.m.get(k) ?? null;
  setItem = (k: string, v: string) => void this.m.set(k, v);
  removeItem = (k: string) => void this.m.delete(k);
}

describe('a failed timestamp write never suppresses the durable copy', () => {
  let db: AnyGymDB;
  let n = 0;
  beforeEach(async () => {
    db = new AnyGymDB(`anygym-durable-2.0c-${n++}`);
    await db.open();
  });
  afterEach(async () => {
    await db.delete();
  });

  it('storage takes the draft but refuses the stamp: IndexedDB still gets the exact value and wins over an older disk snapshot', async () => {
    const ls = new Mem();
    ls.setItem(KEY, 'old');
    await mirror(ls, KEY, ls, db);
    const onDisk = new Mem();
    onDisk.m = new Map(ls.m);
    const stampless = { getItem: ls.getItem, removeItem: ls.removeItem, setItem: (k: string, v: string) => {
      if (k === STAMPS_KEY) throw new DOMException('Synthetic stamp failure', 'QuotaExceededError');
      ls.setItem(k, v);
    } };
    stampless.setItem(KEY, '{"S1":{"goblet@0":{"id":"d1","reps":17}}}');
    await mirror(stampless, KEY, stampless, db);
    expect((await db.kv.get(KEY))!.value).toBe('{"S1":{"goblet@0":{"id":"d1","reps":17}}}');
    // Kill: the disk has the old value and old stamp; the mirror is newer and comes back.
    expect(await restoreMirrors(onDisk, db)).toEqual([KEY]);
    expect(onDisk.getItem(KEY)).toBe('{"S1":{"goblet@0":{"id":"d1","reps":17}}}');
  });

  it('the same for the rest: a refused stamp still stores the rest copy', async () => {
    const ls = new Mem();
    const stampless = { getItem: ls.getItem, removeItem: ls.removeItem, setItem: (k: string, v: string) => {
      if (k === STAMPS_KEY) throw new Error('stamp');
      ls.setItem(k, v);
    } };
    await mirror(stampless, 'anygym-rest', stampless, db, '{"sessionId":"S1","endsAt":5,"totalSec":90}');
    expect((await db.kv.get('anygym-rest'))!.value).toBe('{"sessionId":"S1","endsAt":5,"totalSec":90}');
  });
});

describe('a rest storage read failure never crashes opening a workout', () => {
  it('getItem throws: loadRest returns no rest and says the durable copy should be asked', async () => {
    const { rest, db } = await fresh();
    const broken = { getItem: () => { throw new DOMException('Synthetic read failure', 'SecurityError'); }, setItem: () => {}, removeItem: () => {} };
    expect(() => rest.loadRest('S1', broken)).not.toThrow();
    expect(rest.loadRest('S1', broken)).toBeNull();
    expect(rest.restUnreadable(broken)).toBe(true);
    // The IndexedDB copy is the fallback.
    await db.kv.put({ key: 'anygym-rest', value: JSON.stringify({ sessionId: 'S1', endsAt: 99, totalSec: 60 }), at: 1 });
    expect(await rest.durableRest('S1')).toEqual({ sessionId: 'S1', endsAt: 99, totalSec: 60 });
    expect(await rest.durableRest('other')).toBeNull();
    await db.kv.clear();
    expect(await rest.durableRest('S1')).toBeNull();
    // An IndexedDB failure too: no rest, never a rejection.
    const failingDb = { kv: { get: () => Promise.reject(new Error('synthetic')) } } as unknown as AnyGymDB;
    expect(await rest.durableRest('S1', failingDb)).toBeNull();
  });
});
