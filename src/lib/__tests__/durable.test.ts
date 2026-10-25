import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnyGymDB } from '../../db/schema';
import { DURABLE_KEYS, STAMPS_KEY, mirror, restoreMirrors } from '../durable';

// PLAN 1.12: Chromium writes localStorage to disk seconds late, so live workout state is mirrored
// to IndexedDB and put back at startup when localStorage lost the newest write.

class Mem implements Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  m = new Map<string, string>();
  getItem = (k: string) => this.m.get(k) ?? null;
  setItem = (k: string, v: string) => void this.m.set(k, v);
  removeItem = (k: string) => void this.m.delete(k);
  snapshot() {
    const s = new Mem();
    s.m = new Map(this.m);
    return s;
  }
}

let db: AnyGymDB;
let n = 0;
beforeEach(async () => {
  db = new AnyGymDB(`anygym-durable-${n++}`);
  await db.open();
});
afterEach(async () => {
  await db.delete();
});

describe('durable mirror', () => {
  it('mirrors only the phone storage and only the live keys', async () => {
    const ls = new Mem();
    ls.setItem('anygym-drafts', 'x');
    await mirror(new Mem(), 'anygym-drafts', ls, db); // another storage: not the phone's
    await mirror(ls, 'anygym-hints', ls, db); // not a live workout key
    await mirror(ls, 'anygym-drafts', null, db); // no phone storage at all
    expect(await db.kv.count()).toBe(0);
    await mirror(ls, 'anygym-drafts', ls, db);
    expect(await db.kv.get('anygym-drafts')).toMatchObject({ value: 'x' });
    expect(JSON.parse(ls.getItem(STAMPS_KEY)!)['anygym-drafts']).toEqual(expect.any(Number));
    expect([...DURABLE_KEYS].sort()).toEqual(['anygym-drafts', 'anygym-extra-sets', 'anygym-rest']);
  });

  it('a write lost from localStorage (stale snapshot on disk) comes back from IndexedDB', async () => {
    const ls = new Mem();
    ls.setItem('anygym-rest', 'old');
    await mirror(ls, 'anygym-rest', ls, db);
    const onDisk = ls.snapshot(); // what Chromium had flushed
    ls.setItem('anygym-rest', 'new');
    await mirror(ls, 'anygym-rest', ls, db);
    ls.setItem('anygym-drafts', 'draft');
    await mirror(ls, 'anygym-drafts', ls, db);
    // Kill: localStorage is back to the old snapshot.
    expect((await restoreMirrors(onDisk, db)).sort()).toEqual(['anygym-drafts', 'anygym-rest']);
    expect(onDisk.getItem('anygym-rest')).toBe('new');
    expect(onDisk.getItem('anygym-drafts')).toBe('draft');
    // Nothing newer the second time.
    expect(await restoreMirrors(onDisk, db)).toEqual([]);
  });

  it('a lost removal is replayed; an up to date localStorage is left alone', async () => {
    const ls = new Mem();
    ls.setItem('anygym-extra-sets', '{"a":1}');
    await mirror(ls, 'anygym-extra-sets', ls, db);
    const onDisk = ls.snapshot();
    ls.removeItem('anygym-extra-sets');
    await mirror(ls, 'anygym-extra-sets', ls, db);
    expect(await restoreMirrors(onDisk, db)).toEqual(['anygym-extra-sets']);
    expect(onDisk.getItem('anygym-extra-sets')).toBeNull();
    expect(await restoreMirrors(ls, db)).toEqual([]);
    expect(await restoreMirrors(null, db)).toEqual([]);
  });

  it('ignores corrupt stamps and unknown mirrored keys, and never throws on a broken storage', async () => {
    const ls = new Mem();
    ls.setItem(STAMPS_KEY, '[not json');
    await db.kv.put({ key: 'other', value: 'x', at: Date.now() });
    await db.kv.put({ key: 'anygym-rest', value: 'r', at: Date.now() });
    expect(await restoreMirrors(ls, db)).toEqual(['anygym-rest']);
    expect(ls.getItem('other')).toBeNull();
    const broken = { getItem: () => null, setItem: () => { throw new Error('full'); }, removeItem: () => {} };
    await expect(mirror(broken, 'anygym-rest', broken, db)).resolves.toBeUndefined();
  });
});
