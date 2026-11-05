// PLAN 3.2c: Codex carry over (reports/codex/bughunt-1105-2007-general.md). Each case failed before
// its fix. Synthetic data only. Cross tab cases use two connections (and, for drafts and added
// rows, two module instances) on one fake IndexedDB, as in codex-3.2b.test.ts.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnyGymDB } from '../schema';
import { makeGym } from '../gyms';
import { deleteSet, logSet, setsOf, startWorkout } from '../workouts';
import { exportBackup, restoreReplace } from '../backup';
import { barbellLoad } from '../../lib/load';
import { writeDrafts, type Draft } from '../../lib/drafts';
import { createLogQueue } from '../../lib/logQueue';
import { slotChanges } from '../../lib/setTable';
import { discardFailed, failedRows, reconcileSession, retryFailed, rowsOf, shownRows, submitRow, type Deps } from '../../screens/workout/rowLog';
import type { Load } from '../types';

const olympic135 = barbellLoad(45, [45], 'none', 'lb', 'olympic')!;

let n = 0;
let name = '';
const opened: AnyGymDB[] = [];
const tab = async (nm = name) => {
  const d = new AnyGymDB(nm);
  await d.open();
  opened.push(d);
  return d;
};
let db: AnyGymDB;
beforeEach(async () => {
  name = `anygym-3.2c-${n++}`;
  db = await tab();
});
afterEach(async () => {
  for (const d of opened.splice(0)) d.close();
  await new AnyGymDB(name).delete();
});

const ls = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};
let ids = 0;
const makeId = () => `r-${++ids}`;
async function workout() {
  await db.gyms.add({ ...makeGym({ name: 'G', type: 'full', unit: 'lb', isActive: true }, 1), id: 'g' });
  return startWorkout('g', db, 1000);
}
const draftA = (reps: number, op?: string): Draft => ({ id: 'A', load: olympic135, plates: [45], reps, rev: 1, submitted: 1, ...(op ? { op } : {}) });

describe('3.2c (1): Finish without it never discards input the user never saw', () => {
  it('the sheet showed 19 reps (operation A); another tab journaled 23 reps at the same id and revision: the 23 stays', async () => {
    const s = await workout();
    const sA = ls();
    writeDrafts(s.id, slotChanges('squat', [], [draftA(19, 'op-A')]), sA);
    await db.journal.put({ id: 'A', sessionId: s.id, exerciseId: 'squat', key: 'squat@0', rev: 1, draft: { ...draftA(19, 'op-A'), submitted: undefined } as Record<string, unknown>, at: 1 });
    const deps: Deps = { db, storage: sA, queue: createLogQueue(), makeId };
    const shown = shownRows(await failedRows(s.id, deps));
    expect(shown).toHaveLength(1);
    // The other tab's own submission of the same row, same revision, other input.
    await db.journal.put({ id: 'A', sessionId: s.id, exerciseId: 'squat', key: 'squat@0', rev: 1, draft: { ...draftA(23, 'op-B'), submitted: undefined } as Record<string, unknown>, at: 2 });
    await discardFailed(s.id, deps, shown);
    expect(((await db.journal.get('A'))!.draft as Draft).reps).toBe(23);
    expect(await db.kv.where('key').startsWith('anygym-logcancel:').count()).toBe(0);
  });

  it('the very operation shown is still discarded, and its values stay as an ordinary row', async () => {
    const s = await workout();
    const sA = ls();
    writeDrafts(s.id, slotChanges('squat', [], [draftA(19, 'op-A')]), sA);
    await db.journal.put({ id: 'A', sessionId: s.id, exerciseId: 'squat', key: 'squat@0', rev: 1, draft: { ...draftA(19, 'op-A'), submitted: undefined } as Record<string, unknown>, at: 1 });
    const deps: Deps = { db, storage: sA, queue: createLogQueue(), makeId };
    await discardFailed(s.id, deps, shownRows(await failedRows(s.id, deps)));
    expect(await db.journal.get('A')).toBeUndefined();
    expect(await failedRows(s.id, deps)).toHaveLength(0);
    expect(rowsOf(s.id, 'squat', deps).map((d) => d?.reps)).toEqual([19]);
  });
});

describe('3.2c (2): logging never overwrites a pending weight stored under the same draft id', () => {
  const lb = (total: number): Load => ({ kind: 'single', unit: 'lb', total });
  const row = (id: string, total: number, reps: number, rev: number): Draft => ({ id, load: lb(total), reps, rev });
  it('IndexedDB holds 73 x 19 (rev 1) under id x; this tab\'s clean copy 53 x 7 (rev 5, same id) does not replace it', async () => {
    const disk = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => disk.get(k) ?? null,
      setItem: () => {
        throw new Error('full');
      },
      removeItem: (k: string) => void disk.delete(k),
    });
    try {
      vi.resetModules();
      const drafts = await import('../../lib/drafts');
      const { db: d2 } = await import('../schema');
      await d2.kv.clear();
      disk.set('anygym-drafts', JSON.stringify({ s: { 'ex@0': row('x', 53, 7, 5) } }));
      expect(drafts.loadDraft('s', 'ex@0')!.reps).toBe(7);
      expect(drafts.sessionDrafts('s').size).toBe(1);
      await d2.kv.put({ key: 'anygym-drafts', value: JSON.stringify({ s: { 'ex@0': row('x', 73, 19, 1) } }), at: 1 });
      const merge = drafts.draftsDurableMerge()!;
      await d2.transaction('rw', d2.kv, () => merge(d2.kv));
      const stored = JSON.parse((await d2.kv.get('anygym-drafts'))!.value!) as Record<string, Record<string, Draft>>;
      expect(stored.s!['ex@0']).toMatchObject({ id: 'x', reps: 19 });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('3.2c (3): a deleted set\'s legacy receipt never erases conflicting input', () => {
  async function deletedLegacy(withTombstone: boolean) {
    const s = await workout();
    await logSet({ id: 'A', sessionId: s.id, exerciseId: 'squat', reps: 10, load: olympic135, rev: 1 }, db);
    const { fp: _fp, ...legacy } = (await db.submissions.get('A'))!;
    await db.submissions.put(legacy);
    await deleteSet('A', db);
    if (!withTombstone) await db.tombstones.clear();
    return s;
  }
  const mine = (reps: number): Draft => ({ id: 'A', load: olympic135, plates: [45], reps, rev: 1, submitted: 1 });

  for (const withTombstone of [true, false]) {
    it(`53 x 10 deleted (${withTombstone ? 'tombstone kept' : 'no tombstone'}); submitting 19 under that id and rev saves it as the next row, never clears it`, async () => {
      const s = await deletedLegacy(withTombstone);
      const deps: Deps = { db, storage: ls(), queue: createLogQueue(), makeId };
      writeDrafts(s.id, slotChanges('squat', [], [mine(19)]), deps.storage);
      let landed = 0;
      await submitRow(s.id, 'squat', mine(19), { ...deps, onLanded: () => landed++ });
      expect(landed).toBe(0);
      const rows = rowsOf(s.id, 'squat', deps);
      expect(rows.map((d) => d?.reps)).toEqual([19]);
      expect(rows[0]!.submitted).toBeUndefined();
      expect(rows[0]!.id).not.toBe('A');
    });

    it(`reconciling at startup keeps the 19 too (${withTombstone ? 'tombstone kept' : 'no tombstone'})`, async () => {
      const s = await deletedLegacy(withTombstone);
      const deps: Deps = { db, storage: ls(), queue: createLogQueue(), makeId };
      writeDrafts(s.id, slotChanges('squat', [], [mine(19)]), deps.storage);
      await reconcileSession(s.id, deps);
      expect(rowsOf(s.id, 'squat', deps).map((d) => d?.reps)).toEqual([19]);
    });
  }

  it('the same values as the deleted set (tombstone proves it) are still used up, never logged twice', async () => {
    const s = await deletedLegacy(true);
    const deps: Deps = { db, storage: ls(), queue: createLogQueue(), makeId };
    writeDrafts(s.id, slotChanges('squat', [], [mine(10)]), deps.storage);
    await submitRow(s.id, 'squat', mine(10), deps);
    expect(rowsOf(s.id, 'squat', deps)).toEqual([]);
    expect(await setsOf(s.id, db)).toEqual([]);
  });
});

describe('3.2c (4): a backup never revives an explicitly discarded failed Log', () => {
  it('Discard lands while the export runs: the exported drafts hold no marked copy, and a restore plus Retry saves nothing', async () => {
    const s = await workout();
    const sA = ls();
    const failed = { ...draftA(19, 'op-A'), load: olympic135 };
    writeDrafts(s.id, slotChanges('squat', [], [failed]), sA);
    await db.journal.put({ id: 'A', sessionId: s.id, exerciseId: 'squat', key: 'squat@0', rev: 1, draft: { ...failed, submitted: undefined } as Record<string, unknown>, at: 1 });
    const deps: Deps = { db, storage: sA, queue: createLogQueue(), makeId };
    const shown = shownRows(await failedRows(s.id, deps));
    const real = db.transaction.bind(db) as (...a: unknown[]) => Promise<unknown>;
    let hooked = false;
    (db as unknown as { transaction: unknown }).transaction = async (...a: unknown[]) => {
      if (!hooked && a[0] === 'r' && Array.isArray(a[1])) {
        hooked = true;
        await discardFailed(s.id, deps, shown);
      }
      return real(...a);
    };
    const backup = await exportBackup(db, 4000, sA);
    (db as unknown as { transaction: unknown }).transaction = real;
    expect(hooked).toBe(true);
    const drafts = Object.values(backup.drafts[s.id] ?? {});
    expect(drafts.filter((d) => d.submitted !== undefined)).toEqual([]);
    expect(drafts.map((d) => d.id)).not.toContain('A');
    // Restored on a fresh phone: nothing to retry, nothing saved.
    backup.tables.sessions = backup.tables.sessions.map((x) => ({ ...x, endedAt: 2000 }));
    const fresh = await tab(`${name}-fresh`);
    const sB = ls();
    await restoreReplace(backup, fresh, sB);
    const depsB: Deps = { db: fresh, storage: sB, queue: createLogQueue(), makeId };
    expect(await retryFailed(s.id, depsB)).toBe(true);
    expect(await setsOf(s.id, fresh)).toEqual([]);
    await new AnyGymDB(`${name}-fresh`).delete();
  });
});

describe('3.2c (5): a storage failure never lets a stale tab erase added rows', () => {
  it('tab B adds a bench row; stale tab A removes a squat row: both survive in IndexedDB and A sees the bench row', async () => {
    const failing = {
      getItem: () => null,
      setItem: () => {
        throw new Error('full');
      },
      removeItem: () => undefined,
    };
    vi.stubGlobal('localStorage', failing);
    try {
      vi.resetModules();
      const A = await import('../../lib/extraSets');
      const { db: dbA } = await import('../schema');
      await dbA.kv.clear();
      vi.resetModules();
      const B = await import('../../lib/extraSets');
      A.addExtraSet('s', 'squat');
      A.addExtraSet('s', 'squat');
      await A.settleExtraSets();
      B.hydrateExtraSets((await dbA.kv.get(B.EXTRA_SETS_KEY))!.value);
      B.addExtraSet('s', 'bench');
      await B.settleExtraSets();
      A.removeExtraSet('s', 'squat');
      expect(A.extraSets('s', 'squat')).toBe(1);
      await A.settleExtraSets();
      const stored = JSON.parse((await dbA.kv.get(A.EXTRA_SETS_KEY))!.value!) as { extra: Record<string, number> };
      expect(stored.extra).toEqual({ squat: 1, bench: 1 });
      expect(A.extraSets('s', 'bench')).toBe(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
