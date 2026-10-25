import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { AnyGymDB, SCHEMA_V1, SCHEMA_V2, SCHEMA_V3, SCHEMA_V4, SCHEMA_V5, SCHEMA_V6, SCHEMA_V7, SCHEMA_VERSION } from '../schema';

const names: string[] = [];
afterEach(async () => {
  while (names.length) await Dexie.delete(names.pop()!);
});

describe('verify 1.7i: a v7 database opens at v8 with every record byte identical', () => {
  it('sessions, sets, tombstones, submissions, kv, counters unchanged; journal added empty', async () => {
    const name = `verify-17i-${Math.random().toString(36).slice(2)}`;
    names.push(name);
    const v7 = new Dexie(name);
    [SCHEMA_V1, SCHEMA_V2, SCHEMA_V3, SCHEMA_V4, SCHEMA_V5, SCHEMA_V6, SCHEMA_V7].forEach((s, i) => v7.version(i + 1).stores(s));
    await v7.open();
    const load = { kind: 'barbell', unit: 'lb', total: 135, barWeight: 45, perSide: [45], barId: 'olympic' };
    await v7.table('sessions').bulkAdd([
      { id: 's1', gymId: 'g', startedAt: 1, endedAt: 9, imported: false },
      { id: 's2', gymId: 'g', startedAt: 10, imported: false, exerciseIds: ['squat'] },
    ]);
    await v7.table('sets').bulkAdd(
      Array.from({ length: 40 }, (_, i) => ({
        id: `set-${i}`, sessionId: i < 20 ? 's1' : 's2', exerciseId: 'squat', order: i % 20, kind: 'work', reps: 3 + (i % 7),
        load: { ...load, total: 100 + i * 5 }, uncertain: i === 3, note: i === 4 ? 'héllo' : undefined,
      })),
    );
    await v7.table('submissions').bulkAdd([
      { id: 'set-21', sessionId: 's2', exerciseId: 'squat', rev: 1 },
      { id: 'set-22', sessionId: 's2', exerciseId: 'squat', rev: 3 },
    ]);
    await v7.table('tombstones').bulkAdd([
      { id: 'set-gone', sessionId: 's2', set: { id: 'set-gone', sessionId: 's2', exerciseId: 'squat', order: 9, kind: 'work', reps: 5, load }, expiresAt: 9e12 },
      { id: 'set-acc', sessionId: 's2', set: { id: 'set-acc', sessionId: 's2', exerciseId: 'squat', order: 8, kind: 'work', reps: 6, load }, expiresAt: 9e12, undo: true },
    ]);
    await v7.table('orderCounters').bulkAdd([{ sessionId: 's1', next: 20 }, { sessionId: 's2', next: 20 }]);
    await v7.table('kv').put({ key: 'anygym-drafts', value: '{"s2":{}}', at: 5 });
    const before: Record<string, string> = {};
    for (const t of v7.tables) before[t.name] = JSON.stringify(await t.toArray());
    expect(Object.keys(before)).not.toContain('journal');
    v7.close();

    const db = new AnyGymDB(name);
    await db.open();
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(8);
    expect(db.verno).toBe(SCHEMA_VERSION);
    for (const t of Object.keys(before)) expect(JSON.stringify(await db.table(t).toArray()), t).toBe(before[t]);
    expect(await db.journal.count()).toBe(0);
    expect(db.tables.map((t) => t.name).sort()).toEqual([...Object.keys(before), 'journal', 'reportQueue', 'crashSignatures', 'reportPreferences'].sort());
    db.close();
    // Reopening again changes nothing.
    const again = new AnyGymDB(name);
    await again.open();
    for (const t of Object.keys(before)) expect(JSON.stringify(await again.table(t).toArray()), t).toBe(before[t]);
    again.close();
  });
});
