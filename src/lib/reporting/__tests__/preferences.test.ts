import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnyGymDB } from '../../../db/schema';
import { enqueueCrash, enqueueFeedback } from '../../../db/reports';
import { createCrashPreference } from '../preferences';

const device = { model: 'iPhone', os: 'iOS 18.2', viewport: '393x852', dpr: 3, standalone: false };
let n = 0;
const dbs: AnyGymDB[] = [];
const fresh = async () => {
  const db = new AnyGymDB(`anygym-prefs-${n++}`);
  dbs.push(db);
  await db.open();
  return db;
};
afterEach(async () => {
  for (const db of dbs.splice(0)) {
    db.close();
    await Dexie.delete(db.name);
  }
});

describe('Send crash reports', () => {
  it('is on by default', async () => {
    const p = createCrashPreference(await fresh());
    expect(p.enabled()).toBe(true);
    expect(await p.ready()).toBe(true);
  });

  it('off persists across a reload and deletes the crashes still waiting, not the feedback', async () => {
    const db = await fresh();
    await enqueueCrash({ requestId: 'c-1', signature: 's', message: 'm', stack: '', route: '/', appVersion: '0.1.0+dev', device }, 1, db);
    await enqueueFeedback({ requestId: 'f-1', message: 'hi', appVersion: '0.1.0+dev', route: '/', device, unit: null, gymType: null, errors: [] }, 2, db);
    const p = createCrashPreference(db);
    let heard = 0;
    p.subscribe(() => heard++);
    await p.setEnabled(false);
    expect(p.enabled()).toBe(false);
    expect(heard).toBeGreaterThan(0);
    expect((await db.reportQueue.toArray()).map((r) => r.id)).toEqual(['f-1']);
    const reloaded = createCrashPreference(db);
    expect(await reloaded.ready()).toBe(false);
    await reloaded.setEnabled(true);
    expect(await createCrashPreference(db).ready()).toBe(true);
  });

  it('the switch moves only once the write is saved (slow write); a failed write leaves it as it was', async () => {
    const db = await fresh();
    const p = createCrashPreference(db);
    await p.ready();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const put = db.reportPreferences.put.bind(db.reportPreferences);
    db.reportPreferences.put = (async (row: Parameters<typeof put>[0]) => {
      await gate;
      return put(row);
    }) as typeof db.reportPreferences.put;
    const saving = p.setEnabled(false);
    await new Promise((r) => setTimeout(r, 30));
    expect(p.enabled()).toBe(true);
    release();
    await saving;
    expect(p.enabled()).toBe(false);
    // A reload right after shows the saved state.
    expect(await createCrashPreference(db).ready()).toBe(false);

    db.reportPreferences.put = (async () => Promise.reject(new Error('disk full'))) as unknown as typeof db.reportPreferences.put;
    await expect(p.setEnabled(true)).rejects.toThrow('disk full');
    expect(p.enabled()).toBe(false);
    expect(await p.fresh()).toBe(false);
  });

  it('another tab hears the change, and fresh() always reads what is saved', async () => {
    const db = await fresh();
    const tabA = createCrashPreference(db);
    const tabB = createCrashPreference(db);
    expect(await tabB.ready()).toBe(true);
    let heard = 0;
    tabB.subscribe(() => heard++);
    await tabA.setEnabled(false);
    expect(await tabB.fresh()).toBe(false);
    await vi.waitFor(() => expect(tabB.enabled()).toBe(false));
    expect(heard).toBeGreaterThan(0);
  });

  it('cannot be read: nothing is sent automatically', async () => {
    const db = await fresh();
    db.close();
    const broken = Object.create(db) as AnyGymDB;
    Object.defineProperty(broken, 'reportPreferences', { get: () => ({ get: () => Promise.reject(new Error('gone')) }) });
    expect(await createCrashPreference(broken).ready()).toBe(false);
  });
});
