// PLAN 3.6d (audit A7, SPEC 9.1 "Export everything"): every table on the phone is either carried by
// a backup or left out on purpose (NOT_BACKED_UP). A new table in neither list fails here. And one
// row in every carried table comes back exactly through serialize → parse on a fresh phone → Replace.
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Backup, TableName } from '../../lib/backup';

const names: string[] = [];
afterEach(async () => {
  for (const n of names.splice(0)) await Dexie.delete(n);
});

async function phone() {
  vi.resetModules();
  const schema = await import('../schema');
  const name = `b36d-t-${Math.random()}`;
  names.push(name);
  const db = new schema.AnyGymDB(name);
  await db.open();
  return { db, backup: await import('../backup'), lib: await import('../../lib/backup') };
}

const load = { kind: 'barbell', unit: 'kg', total: 105, barWeight: 20, barId: 'olympic', perSide: [25, 15, 2.5], collars: 0 } as const;
const set = { id: 'set1', sessionId: 's1', exerciseId: 'bench', order: 0, kind: 'work', uncertain: false, reps: 5, load };

/** One valid row for every table a backup carries (a workout in progress, so the transient tables travel). */
const ROWS: Record<TableName, Record<string, unknown>> = {
  profile: { id: 'me', defaultUnit: 'kg', createdAt: 1 },
  gyms: { id: 'g1', name: 'Club', type: 'full', unit: 'kg', equipment: ['barbell'], dumbbellRange: null, bars: { olympic: 20, womens: 15, ez_curl: null, trap: null, smith: null }, stackStep: 5, equipmentWeights: {}, plateInventory: [{ weight: 25, enabled: true }], collars: 'none', plateColors: 'black', isActive: true, createdAt: 1 },
  plans: { id: 'p1', name: 'Old', source: 'curated', createdAt: 1 },
  planDays: { id: 'pd1', planId: 'p1', order: 0, name: 'Day 1' },
  sessions: { id: 's1', gymId: 'g1', startedAt: 10, imported: false },
  sets: set,
  runs: { id: 'r1', startedAt: 1, type: 'easy', movingSec: 1, elapsedSec: 2, distanceM: 3, points: [[1, 2, 3, 4]], gaps: [], splits: [] },
  exerciseSettings: { exerciseId: 'bench', gymId: 'g1', restSec: 90 },
  planState: { id: 'active', planId: 'five-day-split', startedAt: 1, weekIndex: 0, nextDayIndex: 1, doneDays: [0] },
  orderCounters: { sessionId: 's1', next: 2 },
  submissions: { id: 'set1', sessionId: 's1', exerciseId: 'bench', rev: 1 },
  tombstones: { id: 'set0', sessionId: 's1', set: { ...set, id: 'set0' }, expiresAt: 99 },
  journal: { id: 'j1', sessionId: 's1', exerciseId: 'bench', key: 'bench@1', rev: 1, draft: { id: 'j1', load: null, reps: 5 }, at: 11 },
  candidateReviews: { id: 'Incline_Dumbbell_Press', decision: 'fix', reason: 'photo', note: 'grip', at: 3 },
  coachLifts: { key: 'bench|barbell', exerciseId: 'bench', updatedAt: 4, target: { value: 107.5, unit: 'kg', loadKind: 'barbell', reason: 'All reps last time', source: 'level_up', setAt: 4 } },
  coachChanges: { id: 'c1', cardId: 'levelup:2026-11-02', weekKey: '2026-11-02', appliedAt: 4, key: 'bench|barbell', exerciseId: 'bench', name: 'Bench press', loadKind: 'barbell', unit: 'kg', from: 105, to: 107.5, reason: 'All reps last time', source: 'level_up', prevTarget: null },
  coachCards: { id: 'levelup:2026-11-02', state: 'used', at: 4 },
  efforts: { sessionId: 's1', exerciseId: 'bench', effort: 'good', at: 12 },
};

describe('every table is backed up or left out on purpose', () => {
  it('the database has no table outside the two lists, and both lists name real tables', async () => {
    const { db, lib } = await phone();
    const tables = db.tables.map((t) => t.name).sort();
    expect([...lib.TABLE_NAMES, ...lib.NOT_BACKED_UP].sort()).toEqual(tables);
  });

  it('one row in every carried table comes back exactly on a fresh phone', async () => {
    const old = await phone();
    for (const t of old.lib.TABLE_NAMES) await old.db.table(t).add(structuredClone(ROWS[t]));
    const text = old.lib.serializeBackup(await old.backup.exportBackup(old.db, 1, { getItem: () => null, setItem: () => {}, removeItem: () => {} }));

    const fresh = await phone();
    const parsed = fresh.lib.parseBackup(text);
    if (!parsed.ok) throw new Error(parsed.error);
    for (const t of fresh.lib.TABLE_NAMES) expect(parsed.backup.tables[t], t).toEqual([ROWS[t]]);
    await fresh.backup.restoreReplace(parsed.backup, fresh.db, { getItem: () => null, setItem: () => {}, removeItem: () => {} });
    for (const t of fresh.lib.TABLE_NAMES) expect(await fresh.db.table(t).toArray(), t).toEqual([ROWS[t]]);
  });
});

describe('A7: old backup files', () => {
  /** A file as 3.6c wrote it: schema 11, no coach tables. */
  async function olderFile() {
    const old = await phone();
    for (const t of ['profile', 'gyms', 'sessions', 'sets'] as const) await old.db.table(t).add(structuredClone(t === 'sessions' ? { ...ROWS.sessions, endedAt: 20 } : ROWS[t]));
    const b = JSON.parse(old.lib.serializeBackup(await old.backup.exportBackup(old.db, 1))) as Backup;
    for (const t of old.lib.LATER_TABLES) delete b.tables[t];
    return JSON.stringify(b);
  }

  it('still opens, and Replace keeps the phone\'s Level up targets and effort taps', async () => {
    const text = await olderFile();
    const m = await phone();
    for (const t of m.lib.LATER_TABLES) await m.db.table(t).add(structuredClone(ROWS[t]));
    const parsed = m.lib.parseBackup(text);
    if (!parsed.ok) throw new Error(parsed.error);
    for (const t of m.lib.LATER_TABLES) expect(parsed.backup.tables[t], t).toBeUndefined();
    await m.backup.restoreReplace(parsed.backup, m.db);
    for (const t of m.lib.LATER_TABLES) expect(await m.db.table(t).toArray(), t).toEqual([ROWS[t]]);
    expect(await m.db.sets.count()).toBe(1);
  });

  it('a file of schema 11 missing a table it always carried is still refused', async () => {
    const b = JSON.parse(await olderFile()) as Backup;
    delete (b.tables as Partial<Backup['tables']>).runs;
    const m = await phone();
    expect(m.lib.parseBackup(JSON.stringify(b))).toEqual({ ok: false, error: m.lib.DAMAGED });
  });
});
