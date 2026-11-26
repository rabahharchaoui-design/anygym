// PLAN M18a: earned badges stored on the phone (schema 12), never awarded twice, and carried by backups.
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { awardBadges, badgesOfSession, listBadges } from '../badges';
import { exportBackup, restoreMerge, restoreReplace } from '../backup';
import { AnyGymDB, SCHEMA_V1, SCHEMA_V10, SCHEMA_V11, SCHEMA_V2, SCHEMA_V3, SCHEMA_V4, SCHEMA_V5, SCHEMA_V6, SCHEMA_V7, SCHEMA_V8, SCHEMA_V9, SCHEMA_VERSION } from '../schema';
import { parseBackup } from '../../lib/backup';

let db: AnyGymDB;
let name = '';
let n = 0;
beforeEach(async () => {
  name = `anygym-badges-${n++}`;
  db = new AnyGymDB(name);
  await db.open();
});
afterEach(async () => {
  db.close();
  await Dexie.delete(name);
});

describe('schema 12: badges (additive)', () => {
  it('a phone on schema 11 upgrades with every row kept and no badge yet', async () => {
    db.close();
    await Dexie.delete(name);
    const v11 = new Dexie(name);
    [SCHEMA_V1, SCHEMA_V2, SCHEMA_V3, SCHEMA_V4, SCHEMA_V5, SCHEMA_V6, SCHEMA_V7, SCHEMA_V8, SCHEMA_V9, SCHEMA_V10, SCHEMA_V11].forEach((s, i) => v11.version(i + 1).stores(s));
    await v11.open();
    await v11.table('sessions').put({ id: 's1', gymId: 'g1', startedAt: 1000, endedAt: 2000, imported: false });
    await v11.table('kv').put({ key: 'anygym-celebrated:s1', value: 'first:s1', at: 3 });
    const before: Record<string, string> = {};
    for (const t of v11.tables) before[t.name] = JSON.stringify(await t.toArray());
    v11.close();
    db = new AnyGymDB(name);
    await db.open();
    expect(db.verno).toBe(SCHEMA_VERSION);
    expect(SCHEMA_VERSION).toBe(12);
    for (const t of Object.keys(before)) expect(JSON.stringify(await db.table(t).toArray()), t).toBe(before[t]);
    expect(await db.badges.count()).toBe(0);
  });
});

describe('awardBadges: never twice', () => {
  it('stores each new badge with the date earned and the workout, and returns only the new ones', async () => {
    expect(await awardBadges(['first-workout', 'new-pr'], 's1', 1000, db)).toEqual([
      { id: 'first-workout', earnedAt: 1000, sessionId: 's1' },
      { id: 'new-pr', earnedAt: 1000, sessionId: 's1' },
    ]);
    expect(await awardBadges(['new-pr', 'workouts-t1'], 's2', 2000, db)).toEqual([{ id: 'workouts-t1', earnedAt: 2000, sessionId: 's2' }]);
    expect((await db.badges.get('new-pr'))!.earnedAt).toBe(1000); // the first date stays
    expect((await listBadges(db)).map((b) => b.id)).toEqual(['first-workout', 'new-pr', 'workouts-t1']);
    expect(await awardBadges([], 's3', 3000, db)).toEqual([]);
  });
  it('a double Finish (two awards at once) stores each badge once', async () => {
    const [a, b] = await Promise.all([awardBadges(['first-workout', 'early-bird'], 's1', 1000, db), awardBadges(['first-workout', 'early-bird'], 's1', 1001, db)]);
    expect([...a, ...b].map((x) => x.id).sort()).toEqual(['early-bird', 'first-workout']);
    expect(await db.badges.count()).toBe(2);
  });
  it('a reload during Finish: the badges written before it are there and are not awarded again', async () => {
    await awardBadges(['first-workout'], 's1', 1000, db);
    db.close();
    db = new AnyGymDB(name);
    await db.open();
    expect(await awardBadges(['first-workout'], 's1', 5000, db)).toEqual([]);
    expect(await badgesOfSession('s1', db)).toEqual([{ id: 'first-workout', earnedAt: 1000, sessionId: 's1' }]);
  });
  it('badgesOfSession: that workout’s badges in catalog order', async () => {
    await awardBadges(['lifted-t1', 'first-workout'], 's1', 1000, db);
    await awardBadges(['comeback'], 's2', 2000, db);
    expect((await badgesOfSession('s1', db)).map((b) => b.id)).toEqual(['first-workout', 'lifted-t1']);
  });
});

describe('backup and restore carry the badges', () => {
  it('a backup carries them, Replace puts them back exactly, and they are not awarded again', async () => {
    await awardBadges(['first-workout', 'streak-3'], 's1', 1000, db);
    const file = JSON.stringify(await exportBackup(db, 9000));
    const parsed = parseBackup(file);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.backup.tables.badges).toHaveLength(2);
    await db.badges.clear();
    await awardBadges(['night-owl'], 'other', 500, db);
    await restoreReplace(parsed.backup, db);
    expect(await listBadges(db)).toEqual([
      { id: 'first-workout', earnedAt: 1000, sessionId: 's1' },
      { id: 'streak-3', earnedAt: 1000, sessionId: 's1' },
    ]);
    expect(await awardBadges(['first-workout'], 's9', 9999, db)).toEqual([]);
  });
  it('an older file without badges keeps the phone’s on Replace; Merge adds only the missing ones', async () => {
    await awardBadges(['comeback'], 's1', 1000, db);
    const b = await exportBackup(db, 9000);
    const { badges: _gone, ...older } = b.tables;
    await restoreReplace({ ...b, tables: older as typeof b.tables }, db);
    expect((await listBadges(db)).map((x) => x.id)).toEqual(['comeback']);
    await restoreMerge({ ...b, tables: { ...b.tables, badges: [{ id: 'comeback', earnedAt: 1, sessionId: 'x' }, { id: 'new-city', earnedAt: 2, sessionId: 'x' }] } }, db);
    expect(await listBadges(db)).toEqual([
      { id: 'new-city', earnedAt: 2, sessionId: 'x' },
      { id: 'comeback', earnedAt: 1000, sessionId: 's1' },
    ]);
  });
  it('a file with an unknown badge id, a repeated one or no date is refused', async () => {
    const b = await exportBackup(db, 9000);
    const withRows = (rows: unknown[]) => parseBackup(JSON.stringify({ ...b, tables: { ...b.tables, badges: rows } })).ok;
    expect(withRows([{ id: 'first-workout', earnedAt: 1, sessionId: 's' }])).toBe(true);
    expect(withRows([{ id: 'hotel-hero', earnedAt: 1, sessionId: 's' }])).toBe(false);
    expect(withRows([{ id: 'first-workout', earnedAt: 1, sessionId: 's' }, { id: 'first-workout', earnedAt: 2, sessionId: 's' }])).toBe(false);
    expect(withRows([{ id: 'first-workout', sessionId: 's' }])).toBe(false);
  });
});
